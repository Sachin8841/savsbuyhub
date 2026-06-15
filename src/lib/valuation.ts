export const calculateNetProfit = (
  sales: any[],
  inventory: any[],
  returns: any[],
  expenses: any[]
) => {
  const revenue = sales.filter(s => s.payment_status !== 'Cancelled').reduce((sum, s) => sum + (s.quantity_sold * s.average_selling_price), 0);
  const cogs = sales.filter(s => s.payment_status !== 'Cancelled').reduce((sum, s) => {
    const inv = inventory.find(i => i.id === s.inventory_id);
    const costPrice = s.cost_price ?? inv?.average_cost_price ?? 0;
    return sum + (s.quantity_sold * costPrice);
  }, 0);
  const deliveryFees = sales.filter(s => s.payment_status !== 'Cancelled').reduce((sum, s) => {
    const inv = inventory.find(i => i.id === s.inventory_id);
    const feePerUnit = inv ? (inv.delivery_fee || 0) / (inv.total_bulk_stock_in || 1) : 0;
    return sum + (s.quantity_sold * feePerUnit);
  }, 0);

  const penalties = returns.reduce((sum, r) => sum + (r.penalty_amount || 0), 0);
  const expenseTotal = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  return revenue - cogs - deliveryFees - penalties - expenseTotal;
};

export const calculateSharePrice = (
  sales: any[],
  inventory: any[],
  returns: any[],
  expenses: any[],
  disclosedPeriods: any[] = []
) => {
  const BASE_VALUE = 100;
  // Use a much larger share pool to dilute aggressive jumps and simulate a real corporate structure.
  const TOTAL_ISSUED_SHARES = 100000; 

  // 1. Total Net Assets (Stock Holding Value)
  let stockHoldingValue = 0;
  inventory.forEach(inv => {
    const invSales = sales.filter(s => s.inventory_id === inv.id && s.payment_status !== 'Cancelled').reduce((sum, s) => sum + s.quantity_sold, 0);
    const invReturns = returns.filter(r => r.inventory_id === inv.id && r.delivery_status === 'Received').reduce((sum, r) => sum + r.quantity_returned, 0);
    const currentStock = inv.total_bulk_stock_in - invSales + invReturns;
    stockHoldingValue += Math.max(0, currentStock) * (inv.average_cost_price || 0);
  });

  // 2. Active Ledger Profit
  const activeProfit = calculateNetProfit(sales, inventory, returns, expenses);

  // 3. Historical Retained Earnings
  let historicalProfit = 0;
  disclosedPeriods.forEach(dp => {
    historicalProfit += calculateNetProfit(dp.sales_data || [], dp.inventory_snapshot || [], dp.returns_data || [], dp.ad_expenses_data || []);
  });

  const totalRetainedEarnings = activeProfit + historicalProfit;

  // 4. Formula: Base Value + (Discounted Asset Value) + (P/E Multiplier on Earnings)
  // Assets: We heavily discount unsold inventory (e.g., 50% liquidation value) so buying stock doesn't falsely inflate the company value.
  const discountedBookValue = (stockHoldingValue * 0.5) / TOTAL_ISSUED_SHARES;
  
  // Earnings: The primary driver of real-world stock prices. We apply a 5x P/E multiple.
  const earningsPerShare = (totalRetainedEarnings * 5) / TOTAL_ISSUED_SHARES;
  
  // 5. Time Decay Penalty (Operational Bleed)
  // Real companies bleed money if they don't sell anything.
  let timeDecayMultiplier = 1.0;
  if (sales.length > 0) {
    const sortedSales = [...sales].sort((a, b) => new Date(b.dispatch_date).getTime() - new Date(a.dispatch_date).getTime());
    const lastSaleDate = new Date(sortedSales[0].dispatch_date).getTime();
    const daysSinceLastSale = (Date.now() - lastSaleDate) / (1000 * 60 * 60 * 24);
    
    // If no sales for more than 5 days, start penalizing the stock price (up to 50% max penalty)
    if (daysSinceLastSale > 5) {
      const penalty = Math.min(0.5, (daysSinceLastSale - 5) * 0.01); // 1% drop per day after 5 days
      timeDecayMultiplier = 1.0 - penalty;
    }
  } else if (inventory.length > 0) {
    // If we have inventory but NO sales ever, heavy penalty
    timeDecayMultiplier = 0.5;
  }

  const rawPrice = BASE_VALUE + discountedBookValue + earningsPerShare;
  const price = rawPrice * timeDecayMultiplier;
  
  // Hard floor to ensure the stock doesn't crash to impossible numbers
  return Math.max(10, Number(price.toFixed(2)));
};

// Deterministic pseudo-random generator for graph noise
const pseudoRandom = (seed: number) => {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
};

// Generate historical mock data for the graph
export const generateTradingData = (
  sales: any[],
  inventory: any[],
  returns: any[],
  expenses: any[],
  disclosedPeriods: any[] = []
) => {
  if (sales.length === 0 && disclosedPeriods.length === 0) return [];
  
  const sortedSales = [...sales].sort((a, b) => new Date(a.dispatch_date).getTime() - new Date(b.dispatch_date).getTime());
  const data: { time: string, price: number }[] = [];
  
  // Combine all significant dates to create data points
  let allDates = [
    ...disclosedPeriods.map(d => new Date(d.created_at).getTime()),
    ...sortedSales.map(s => new Date(s.dispatch_date).getTime()),
    new Date().getTime()
  ];
  // Remove duplicates and sort
  allDates = Array.from(new Set(allDates)).sort((a, b) => a - b);

  let seed = 12345;
  const sortedPeriods = [...disclosedPeriods].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  
  allDates.forEach((timestamp, index) => {
    const currentBatchDate = new Date(timestamp);
    
    // Calculate exact fundamental price at this date
    const cumulativePeriods = sortedPeriods.filter(dp => new Date(dp.created_at).getTime() <= timestamp);
    const currentSales = sortedSales.filter(s => new Date(s.dispatch_date).getTime() <= timestamp);
    const currentReturns = returns.filter(r => (r.return_date ? new Date(r.return_date).getTime() <= timestamp : true));
    const currentExpenses = expenses.filter(e => (e.date ? new Date(e.date).getTime() <= timestamp : true));
    
    let fundamentalPrice = calculateSharePrice(
      currentSales,
      inventory,
      currentReturns,
      currentExpenses,
      cumulativePeriods
    );

    // Apply Time Decay specifically for this historical point in time
    let historicalDecay = 1.0;
    if (currentSales.length > 0) {
      const lastSaleDate = new Date(currentSales[currentSales.length - 1].dispatch_date).getTime();
      const daysSinceLastSale = (timestamp - lastSaleDate) / (1000 * 60 * 60 * 24);
      if (daysSinceLastSale > 7) {
        historicalDecay = 1.0 - Math.min(0.5, (daysSinceLastSale - 7) * 0.02);
      }
    } else {
      historicalDecay = 0.6;
    }
    fundamentalPrice = fundamentalPrice * historicalDecay;
    
    // Add market noise (volatility) to make the graph look realistic
    // We keep the last point exact
    const isLastPoint = index === allDates.length - 1;
    let finalPrice = fundamentalPrice;
    
    if (!isLastPoint) {
      const noise = (pseudoRandom(seed++) - 0.5) * 0.03 * fundamentalPrice; // 3% swing
      const macroWave = Math.sin(timestamp / (1000 * 60 * 60 * 24 * 7)) * (fundamentalPrice * 0.01);
      finalPrice = fundamentalPrice + noise + macroWave;
    }
    
    // Add momentum factor based on recent sales
    const recentSalesCount = currentSales.filter(s => new Date(s.dispatch_date).getTime() > timestamp - (3 * 24 * 60 * 60 * 1000)).length;
    finalPrice += (recentSalesCount * 0.5);

    data.push({
      time: currentBatchDate.toISOString().slice(0, 10),
      price: Number(Math.max(10, finalPrice).toFixed(2))
    });
  });

  return data;
};
