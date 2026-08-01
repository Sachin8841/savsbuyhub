import { describe, expect, it } from 'vitest';
import { summarizeFinancials } from '@/lib/finance';

const inventory = [
  { id: 'inv1', sku: 'A1', average_cost_price: 100, average_selling_price: 200, delivery_fee: 100, total_bulk_stock_in: 10 },
];

const sales = [
  // 2 units, listed 400, actually settled for 380
  { id: 's1', inventory_id: 'inv1', dispatch_date: '2026-01-10', platform: 'Meesho', quantity_sold: 2, average_selling_price: 200, settlement_amount: 380, payment_status: 'Settled', cost_price: 100 },
  // 1 unit still pending
  { id: 's2', inventory_id: 'inv1', dispatch_date: '2026-01-12', platform: 'Meesho', quantity_sold: 1, average_selling_price: 200, settlement_amount: null, payment_status: 'Pending', cost_price: 100 },
  // cancelled: must be excluded everywhere
  { id: 's3', inventory_id: 'inv1', dispatch_date: '2026-01-13', platform: 'Meesho', quantity_sold: 5, average_selling_price: 200, payment_status: 'Cancelled', cost_price: 100 },
];

const returns = [
  { id: 'r1', sales_id: 's1', inventory_id: 'inv1', return_date: '2026-01-20', quantity_returned: 1, penalty_amount: 160, delivery_status: 'Received' },
];

const expenses = [
  { id: 'e1', platform: 'Meesho', amount: 50, expense_date: '2026-01-15', category: 'Ads' },
  { id: 'e2', platform: 'Meesho', amount: 30, expense_date: '2026-01-15', category: 'Delivery' },
];

describe('finance engine', () => {
  const s = summarizeFinancials({ sales, returns, inventory, expenses, currentStocks: { inv1: 8 } });

  it('uses settlement amount as realised revenue and ignores cancelled sales', () => {
    // 380 (settled) + 200 (pending listed) = 580 gross
    expect(s.grossSales).toBe(580);
    // one unit of s1 returned at 190/unit
    expect(s.returnedRevenue).toBe(190);
    expect(s.revenue).toBe(390);
    expect(s.pendingRevenue).toBe(200);
    expect(s.realizedRevenue).toBe(380);
  });

  it('nets COGS and inbound freight against returns', () => {
    expect(s.salesCogs).toBe(300);
    expect(s.cogs).toBe(200);
    // freight per unit = 100 / 10 = 10 → 3 units out, 1 back
    expect(s.inboundFreight).toBe(20);
  });

  it('rolls penalties, ads and freight expenses into operating expenses', () => {
    expect(s.returnPenalties).toBe(160);
    expect(s.adSpend).toBe(50);
    expect(s.freightExpenses).toBe(30);
    expect(s.operatingExpenses).toBe(20 + 160 + 50 + 30);
  });

  it('derives profit, units and margin consistently', () => {
    expect(s.grossProfit).toBe(s.revenue - s.cogs);
    expect(s.netProfit).toBe(s.grossProfit - s.operatingExpenses);
    expect(s.unitsSold).toBe(3);
    expect(s.netUnits).toBe(2);
    expect(s.profitPerUnit).toBeCloseTo(s.netProfit / 2, 6);
    expect(s.margin).toBeCloseTo((s.netProfit / s.revenue) * 100, 6);
  });

  it('values stock at cost using live stock counts', () => {
    expect(s.stockHoldingValue).toBe(800);
  });

  it('respects date filters', () => {
    const jan10 = summarizeFinancials({
      sales, returns, inventory, expenses,
      currentStocks: { inv1: 8 },
      from: new Date('2026-01-10'),
      to: new Date('2026-01-11'),
    });
    expect(jan10.orders).toBe(1);
    expect(jan10.returnPenalties).toBe(0);
  });
});
