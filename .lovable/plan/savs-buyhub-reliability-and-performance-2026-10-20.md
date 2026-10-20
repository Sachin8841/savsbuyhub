# SAVS BuyHub reliability and performance

## Confirmed findings

- Sales Ledger calculates its “Total Profit” with an empty expense list, so operating costs are missing from that figure.
- Sales, returns, inventory, and expense reads have no page limit. Several screens download complete ledgers, including joined records, and process them in the browser.
- Returns repeats full-list filtering and totals during renders; Dashboard rebuilds three trend series with separate full-data passes.
- The code check reports 3 errors and 22 warnings. Existing tests pass, but include a placeholder test and no focused checks for import matching or data hooks.
- The theme button occupies the same top-right area as the page’s live indicator. On small screens the page title disappears, the courier summary has no narrow-screen fallback, and some two-column forms remain cramped.
- A placeholder page, an unreferenced valuation helper, and several UI modules appear unused. Confirm their full reference graph before deletion.

## Proposed work

1. **Correct shared money totals.** Make Sales Ledger include the same expenses and return adjustments as the other reports, then route report calculations through the shared finance read model. Add concrete tests proving the totals reconcile.
2. **Reduce data loading without hiding history.** Separate paged ledger rows from full-period totals; preserve all-time figures and date-filter behavior rather than adding arbitrary record caps. Validate role access and database permissions for any server-side aggregate work.
3. **Remove repeat work and stabilize charts.** Memoize Returns’ derived lists and combine Dashboard trend calculations so changing a filter does not rescan the same ledgers unnecessarily. Give chart areas stable dimensions and confirm warnings are gone.
4. **Fix small-screen navigation and tables.** Move the theme control out of the live indicator, retain a compact page title, and make courier and narrow form layouts readable on phones.
5. **Clean up only proven dead code.** Remove unreachable placeholders and unused modules/dependencies only after repository-wide reference checks. Replace the placeholder test with meaningful coverage; retain schema history and generated files.
6. **Verify the repaired app.** Run focused and full tests, resolve the code-check errors, check the build, compare Dashboard/P&L/Sales totals on the same data, and test admin/member access plus phone and desktop views.

## Technical details

- Keep `src/lib/finance.ts` as the money-calculation source of truth; verify whether `useLedgerFinance` can become the common read path without changing report semantics.
- For large ledgers, use paginated detail reads and a separate complete-range aggregate path. Any new database routine must retain admin checks, least-privilege execution, and explicit table grants where applicable.
- Candidate cleanup targets include `src/pages/Index.tsx`, `src/lib/valuation.ts`, the placeholder `src/test/example.test.ts`, and UI modules with no imports. Do not delete based on names alone.
- Confirm each stage independently in tests and the running preview before proceeding to the next structural change.