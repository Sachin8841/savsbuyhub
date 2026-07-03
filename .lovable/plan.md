
## Scope
Rebuild every wrong calculation, unify data sources, and fix the listed UX bugs. Delivered in 4 sequential batches (each verified before moving on) so we don't reintroduce regressions.

---

## Batch 1 — Financial Logic (single source of truth)

Rewrite `src/lib/finance.ts` as the ONLY place formulas live. Every page (Dashboard, P&L, Settings, Corporate Income Statement, Reconciliation) reads from it. No page will do its own math.

Formulas (final, authoritative):

```text
gross_revenue      = Σ sales.qty × sales.selling_price            (excludes Cancelled)
returned_revenue   = Σ returns.qty × sale.unit_realized_price
net_revenue        = gross_revenue − returned_revenue
realized_revenue   = Σ sales.settlement_amount where status=Settled
pending_revenue    = Σ listed_amount where status ∈ (Pending, Packed, Dispatched, In Transit)
cogs               = Σ (sales.qty − returned.qty) × unit_cost
inbound_freight    = Σ net_units × (inventory.delivery_fee / inventory.total_bulk_stock_in)
return_penalties   = Σ returns.penalty_amount
ad_spend           = Σ ad_expenses.amount  (category=Ads or empty)
other_opex         = packaging + software + freight_expense + other
operating_expenses = inbound_freight + return_penalties + ad_spend + other_opex
gross_profit       = net_revenue − cogs
net_profit         = gross_profit − operating_expenses
profit_per_unit    = net_profit / net_units_sold
roi                = net_profit / (cogs + operating_expenses)
stock_value        = Σ max(0, current_stock) × inventory.average_cost_price
net_worth          = hot_cash + account_holding_value + stock_value
total_investment   = cogs + inbound_freight + ad_spend + other_opex + return_penalties
```

Rebuild these UI blocks against the engine:
- Dashboard KPIs (Total Revenue, Net Worth, Total Investment, Net Profit, Profit/Unit, ROI, Pending Payments, Stock Value, Total Expenses)
- P&L: Gross Revenue, Gross Profit, Net Profit/Loss, Profit/Unit, Net Worth
- Corporate Income Statement (rebuilt line-by-line)
- Cash Flow Summary
- Accounting Reconciliation Register
- Return Statement Links (join returns → sales → inventory)
- Per-SKU Profitability
- Payment Status Breakdown
- Settings valuation simulator

---

## Batch 2 — Sales Ledger + Inventory Data Integrity

- **Restocking merge**: adding a restock for an existing SKU updates the existing inventory row: `total_bulk_stock_in += qty`, `average_cost_price = weighted_avg`, `delivery_fee += new_freight`. No duplicate rows. Migration + Inventory UI update.
- **Auto Order IDs**: Offline sales without an order_id auto-generate `SAVS0001`, `SAVS0002`, … (sequence from a DB function).
- **Order ID column**: widen + `whitespace-nowrap` + tooltip on hover for full ID.
- **Action buttons**: always visible on desktop rows (remove `opacity-0 group-hover:opacity-100`), tap-friendly on mobile.
- **Search/filter**: switch to fuzzy match (normalize case, strip spaces/dashes, match across order_id, SKU, product name, customer, platform, status).

---

## Batch 3 — Imports

- **Remove CSV import buttons** from Sales Ledger and Returns pages.
- **Bill upload dedupe**: before inserting parsed rows, look up existing sales by `(order_id, platform)` or `(sku, dispatch_date, qty)` and skip matches. Show "X skipped (already logged)" toast.
- **New products from bill**: when a parsed line has a SKU not in inventory, prompt inline to create the inventory row (name, cost, selling price, freight), then log the sale. This is the "training" flow.
- **Payment import expansion**: same upload also processes return rows and their charges — updates `returns.penalty_amount` and settlement adjustments in the same pass.

---

## Batch 4 — Charts & Polish

- **Revenue & Profit Trend**: rebuild as a stacked composed chart — revenue bars + profit line + gradient fill, month labels, ₹ Indian formatting, proper tooltip, legend, empty-state.
- Final QA pass: cross-check that Dashboard, P&L, Settings, Inventory, Sales, Returns show identical numbers for the same period (they'll all call the same engine).

---

## Technical notes

- New migration: restock merge trigger, `next_offline_order_id()` sequence function, unit-cost/settlement backfill for existing rows.
- `finance.ts` gets `summarizeFinancials(period)` returning every KPI listed above; pages become thin.
- Charts use existing `recharts` (already in project) — no new deps.
- Search uses a lightweight fuzzy scorer inline (no fuse.js dep unless needed).
- Each batch ends with a Playwright verification pass against `/dashboard`, `/pnl`, `/sales`, `/inventory`.

---

## What I need from you

Approve this plan and I'll execute Batch 1 → 2 → 3 → 4 in sequence, pausing only if I hit an ambiguity. Estimated 4 turns of work.
