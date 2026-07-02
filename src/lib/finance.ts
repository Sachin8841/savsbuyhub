type AnyRow = Record<string, any>;

const n = (value: any) => Number(value ?? 0) || 0;

export const isCancelledSale = (sale: AnyRow) => sale?.payment_status === 'Cancelled';

export const saleQuantity = (sale: AnyRow) => Math.max(0, n(sale?.quantity_sold));

export const saleListedAmount = (sale: AnyRow) => saleQuantity(sale) * n(sale?.average_selling_price);

export const saleRealizedAmount = (sale: AnyRow) => {
  if (!sale) return 0;
  return sale.settlement_amount !== null && sale.settlement_amount !== undefined
    ? n(sale.settlement_amount)
    : saleListedAmount(sale);
};

export const saleUnitRevenue = (sale: AnyRow) => {
  const qty = saleQuantity(sale);
  return qty > 0 ? saleRealizedAmount(sale) / qty : n(sale?.average_selling_price);
};

export const inventoryUnitFreight = (inventory: AnyRow | undefined | null) => {
  if (!inventory) return 0;
  const baseQty = Math.max(1, n(inventory.total_bulk_stock_in));
  return n(inventory.delivery_fee) / baseQty;
};

export const saleUnitCost = (sale: AnyRow, inventory?: AnyRow | null) => n(sale?.cost_price ?? inventory?.average_cost_price);

export const saleInventory = (sale: AnyRow, inventoryById: Map<string, AnyRow>) => {
  const related = Array.isArray(sale?.inventory) ? sale.inventory[0] : sale?.inventory;
  return inventoryById.get(sale?.inventory_id) ?? related ?? null;
};

export const expenseCategory = (expense: AnyRow) => String(expense?.category || 'Ads');

const dateInRange = (value: any, from?: Date, to?: Date) => {
  if (!from) return true;
  if (!value) return false;
  const d = new Date(value);
  return d >= from && (!to || d <= to);
};

const emptyPlatform = (platform: string) => ({
  platform,
  revenue: 0,
  cost: 0,
  delivery: 0,
  expenses: 0,
  penalty: 0,
  profit: 0,
  units: 0,
  returnedUnits: 0,
  returnRate: 0,
  margin: 0,
});

export interface FinancialSummary {
  sales: AnyRow[];
  returns: AnyRow[];
  expenses: AnyRow[];
  grossSales: number;
  returnedRevenue: number;
  revenue: number;
  realizedRevenue: number;
  pendingRevenue: number;
  salesCogs: number;
  returnedCogs: number;
  cogs: number;
  salesInboundFreight: number;
  returnedInboundFreight: number;
  inboundFreight: number;
  returnPenalties: number;
  adSpend: number;
  freightExpenses: number;
  packagingExpenses: number;
  softwareExpenses: number;
  otherExpenses: number;
  operatingExpenses: number;
  grossProfit: number;
  netProfit: number;
  unitsSold: number;
  returnedUnits: number;
  netUnits: number;
  orders: number;
  averageUnitValue: number;
  profitPerUnit: number;
  margin: number;
  roi: number;
  returnRate: number;
  stockHoldingValue: number;
  platforms: ReturnType<typeof emptyPlatform>[];
}

export function summarizeFinancials({
  sales = [],
  returns = [],
  inventory = [],
  expenses = [],
  currentStocks,
  from,
  to,
}: {
  sales?: AnyRow[];
  returns?: AnyRow[];
  inventory?: AnyRow[];
  expenses?: AnyRow[];
  currentStocks?: Record<string, number>;
  from?: Date;
  to?: Date;
}): FinancialSummary {
  const inventoryById = new Map((inventory ?? []).map((item) => [item.id, item]));
  const saleById = new Map((sales ?? []).map((sale) => [sale.id, sale]));
  const filteredSales = (sales ?? []).filter((sale) => !isCancelledSale(sale) && dateInRange(sale.dispatch_date, from, to));
  const filteredReturns = (returns ?? []).filter((ret) => dateInRange(ret.return_date ?? ret.created_at, from, to));
  const filteredExpenses = (expenses ?? []).filter((expense) => dateInRange(expense.expense_date ?? expense.created_at, from, to));

  let grossSales = 0;
  let realizedRevenue = 0;
  let pendingRevenue = 0;
  let salesCogs = 0;
  let salesInboundFreight = 0;
  let unitsSold = 0;
  const platformMap = new Map(['Meesho', 'Flipkart', 'Amazon', 'Offline'].map((p) => [p, emptyPlatform(p)]));

  for (const sale of filteredSales) {
    const inv = saleInventory(sale, inventoryById);
    const qty = saleQuantity(sale);
    const revenue = saleRealizedAmount(sale);
    const cost = qty * saleUnitCost(sale, inv);
    const freight = qty * inventoryUnitFreight(inv);
    grossSales += revenue;
    salesCogs += cost;
    salesInboundFreight += freight;
    unitsSold += qty;
    if (sale.payment_status === 'Settled') realizedRevenue += revenue;
    else if (!['Return', 'Order RTO'].includes(String(sale.payment_status))) pendingRevenue += revenue;

    const platform = String(sale.platform || 'Offline');
    const row = platformMap.get(platform) ?? emptyPlatform(platform);
    row.revenue += revenue;
    row.cost += cost;
    row.delivery += freight;
    row.units += qty;
    platformMap.set(platform, row);
  }

  let returnedRevenue = 0;
  let returnedCogs = 0;
  let returnedInboundFreight = 0;
  let returnedUnits = 0;
  let returnPenalties = 0;

  for (const ret of filteredReturns) {
    const sale = saleById.get(ret.sales_id);
    const inv = inventoryById.get(ret.inventory_id || sale?.inventory_id) ?? saleInventory(sale, inventoryById);
    const qty = Math.max(0, n(ret.quantity_returned));
    const unitRevenue = sale ? saleUnitRevenue(sale) : n(inv?.average_selling_price);
    const unitCost = saleUnitCost(sale, inv);
    const unitFreight = inventoryUnitFreight(inv);
    const penalty = n(ret.penalty_amount);
    returnedRevenue += qty * unitRevenue;
    returnedCogs += qty * unitCost;
    returnedInboundFreight += qty * unitFreight;
    returnedUnits += qty;
    returnPenalties += penalty;

    const platform = String(sale?.platform || ret.platform || 'Offline');
    const row = platformMap.get(platform) ?? emptyPlatform(platform);
    row.revenue -= qty * unitRevenue;
    row.cost -= qty * unitCost;
    row.delivery -= qty * unitFreight;
    row.penalty += penalty;
    row.returnedUnits += qty;
    platformMap.set(platform, row);
  }

  let adSpend = 0;
  let freightExpenses = 0;
  let packagingExpenses = 0;
  let softwareExpenses = 0;
  let otherExpenses = 0;

  for (const expense of filteredExpenses) {
    const amount = n(expense.amount);
    const category = expenseCategory(expense).toLowerCase();
    if (category.includes('delivery') || category.includes('freight')) freightExpenses += amount;
    else if (category.includes('packaging')) packagingExpenses += amount;
    else if (category.includes('software')) softwareExpenses += amount;
    else if (category.includes('ad') || category.includes('marketing') || !category) adSpend += amount;
    else otherExpenses += amount;

    const platform = String(expense.platform || '');
    if (platformMap.has(platform)) {
      const row = platformMap.get(platform)!;
      row.expenses += amount;
    }
  }

  const revenue = grossSales - returnedRevenue;
  const cogs = salesCogs - returnedCogs;
  const inboundFreight = salesInboundFreight - returnedInboundFreight;
  const operatingExpenses = inboundFreight + returnPenalties + adSpend + freightExpenses + packagingExpenses + softwareExpenses + otherExpenses;
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - operatingExpenses;
  const netUnits = unitsSold - returnedUnits;
  const costOutlay = Math.max(0, cogs + inboundFreight + adSpend + freightExpenses + packagingExpenses + softwareExpenses + otherExpenses + returnPenalties);

  const stockHoldingValue = (inventory ?? []).reduce((sum, item) => {
    const stock = currentStocks
      ? n(currentStocks[item.id])
      : n(item.total_bulk_stock_in)
        - (sales ?? []).filter((sale) => sale.inventory_id === item.id && !isCancelledSale(sale)).reduce((s, sale) => s + saleQuantity(sale), 0)
        + (returns ?? []).filter((ret) => (ret.inventory_id || saleById.get(ret.sales_id)?.inventory_id) === item.id && ret.delivery_status === 'Received').reduce((s, ret) => s + n(ret.quantity_returned), 0);
    return sum + Math.max(0, stock) * (n(item.average_cost_price) + inventoryUnitFreight(item));
  }, 0);

  const platforms = Array.from(platformMap.values())
    .map((row) => {
      row.profit = row.revenue - row.cost - row.delivery - row.expenses - row.penalty;
      row.returnRate = row.units > 0 ? (row.returnedUnits / row.units) * 100 : 0;
      row.margin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;
      return row;
    })
    .filter((row) => row.units > 0 || row.revenue !== 0 || row.penalty > 0 || row.expenses > 0);

  return {
    sales: filteredSales,
    returns: filteredReturns,
    expenses: filteredExpenses,
    grossSales,
    returnedRevenue,
    revenue,
    realizedRevenue,
    pendingRevenue,
    salesCogs,
    returnedCogs,
    cogs,
    salesInboundFreight,
    returnedInboundFreight,
    inboundFreight,
    returnPenalties,
    adSpend,
    freightExpenses,
    packagingExpenses,
    softwareExpenses,
    otherExpenses,
    operatingExpenses,
    grossProfit,
    netProfit,
    unitsSold,
    returnedUnits,
    netUnits,
    orders: filteredSales.length,
    averageUnitValue: unitsSold > 0 ? grossSales / unitsSold : 0,
    profitPerUnit: netUnits > 0 ? netProfit / netUnits : 0,
    margin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    roi: costOutlay > 0 ? (netProfit / costOutlay) * 100 : 0,
    returnRate: unitsSold > 0 ? (returnedUnits / unitsSold) * 100 : 0,
    stockHoldingValue,
    platforms,
  };
}

export function calculateCurrentStocks(sales: AnyRow[], returns: AnyRow[], inventory: AnyRow[]) {
  const saleById = new Map((sales ?? []).map((sale) => [sale.id, sale]));
  const stock: Record<string, number> = {};
  for (const item of inventory ?? []) stock[item.id] = n(item.total_bulk_stock_in);
  for (const sale of sales ?? []) {
    if (!sale.inventory_id || isCancelledSale(sale)) continue;
    stock[sale.inventory_id] = n(stock[sale.inventory_id]) - saleQuantity(sale);
  }
  for (const ret of returns ?? []) {
    if (ret.delivery_status !== 'Received') continue;
    const invId = ret.inventory_id || saleById.get(ret.sales_id)?.inventory_id;
    if (!invId) continue;
    stock[invId] = n(stock[invId]) + n(ret.quantity_returned);
  }
  return stock;
}