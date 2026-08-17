import { useMemo } from 'react';
import { useSales, useReturns, useInventory, useAdExpenses, useCapitalAccounts, useCurrentStocks } from '@/hooks/useData';
import { summarizeFinancials, deriveKpis, type FinancialSummary, type LedgerKpis } from '@/lib/finance';

export interface LedgerFinance {
  summary: FinancialSummary;
  kpis: LedgerKpis;
  sales: any[];
  returns: any[];
  inventory: any[];
  expenses: any[];
  currentStocks: Record<string, number>;
  isLoading: boolean;
}

/**
 * Central financial read model. Dashboard, P&L, Sales and every other report
 * must consume this hook so the same period always yields the same numbers.
 */
export function useLedgerFinance(range?: { from?: Date; to?: Date }): LedgerFinance {
  const { data: sales = [], isLoading: l1 } = useSales();
  const { data: returns = [], isLoading: l2 } = useReturns();
  const { data: inventory = [], isLoading: l3 } = useInventory();
  const { data: expenses = [], isLoading: l4 } = useAdExpenses();
  const { data: capital } = useCapitalAccounts();
  const currentStocks = useCurrentStocks();

  const from = range?.from;
  const to = range?.to;

  const summary = useMemo(
    () => summarizeFinancials({
      sales: sales as any[],
      returns: returns as any[],
      inventory: inventory as any[],
      expenses: expenses as any[],
      currentStocks,
      from,
      to,
    }),
    [sales, returns, inventory, expenses, currentStocks, from, to],
  );

  const kpis = useMemo(() => deriveKpis(summary, capital as any), [summary, capital]);

  return {
    summary,
    kpis,
    sales: sales as any[],
    returns: returns as any[],
    inventory: inventory as any[],
    expenses: expenses as any[],
    currentStocks,
    isLoading: l1 || l2 || l3 || l4,
  };
}
