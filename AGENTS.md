# Project implementation rules

- Keep report calculations on the shared `src/lib/finance.ts` engine and reuse `src/hooks/useFinance.ts` for full-ledger report totals, so Dashboard, P&L, and Sales cannot drift through separate formulas.
- Load complete ledgers in deterministic range pages rather than one uncapped request, so backend response limits cannot silently truncate history.