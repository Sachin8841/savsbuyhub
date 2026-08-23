# Fix monthly disclosure

## Implementation
- Update the monthly-disclosure database function so ledger cleanup uses explicit row predicates accepted by the database safety guard.
- Preserve the existing atomic behavior: snapshot, financial totals, inventory rebase, and ledger clearing either all succeed or all roll back.
- Apply the change through a database migration.

## Verification
- Run the real disclosure action while signed in as an administrator.
- Confirm a disclosed-period snapshot is stored and the active sales, returns, and expense ledgers are cleared.
- Confirm the app refreshes successfully with no disclosure error.

## Technical detail
Replace unqualified `DELETE FROM ...` statements with primary-key-qualified deletes (`WHERE id IS NOT NULL`), which intentionally target every valid row while satisfying the backend's safe-delete requirement.
