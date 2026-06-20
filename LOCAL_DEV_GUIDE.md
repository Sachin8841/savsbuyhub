# SAVS BuyHub — Local Dev & Supabase SQL Workflow

When you download the project ZIP from Lovable and edit locally, here's how to
keep your changes in sync with the live Supabase backend.

## 1. Run the app locally

```bash
bun install      # or: npm install
bun run dev      # starts Vite on http://localhost:8080
```

The `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_SUPABASE_PROJECT_ID`) is committed by Lovable — local dev hits the same
cloud database as the live preview.

## 2. Editing the database — the rules

The `supabase/migrations/` folder is the **source of truth** for the schema.
Never edit the database by hand in the SQL Editor without also capturing the
change as a migration file, or the next Lovable deploy will overwrite it.

## 3. Workflow A — small schema change (recommended)

If you only need to run one SQL statement (add a column, a policy, an index):

1. Create a new file under `supabase/migrations/` named with a timestamp
   prefix, e.g. `20260620120000_add_invoice_number.sql`.
2. Put the SQL inside. Every `CREATE TABLE public.<name>` MUST be followed by
   `GRANT` statements + `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`.
3. Open your project's **Supabase Dashboard → SQL Editor**, paste the file
   contents, and Run.
4. Commit the migration file when you push the ZIP back into Lovable so the
   migration history stays consistent.

## 4. Workflow B — using the Supabase CLI (advanced)

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>

supabase db pull        # pull remote schema into a migration
supabase db push        # push local migrations to remote
```

The project ref is in `supabase/.temp/project-ref`.

## 5. Regenerating TypeScript types

After any schema change, regenerate `src/integrations/supabase/types.ts`:

```bash
supabase gen types typescript --project-id <your-project-ref> --schema public \
  > src/integrations/supabase/types.ts
```

Skip this and TypeScript will complain that new tables/columns don't exist.

## 6. Edge functions

```bash
supabase functions deploy parse-bill
```

`parse-bill` uses the `LOVABLE_API_KEY` secret.

## 7. Pushing changes back into Lovable

Re-upload the ZIP through the Lovable UI, or push to the linked GitHub repo.
Migration files in `supabase/migrations/` are picked up automatically and
surfaced for approval before they run.

## TL;DR

| Change | Where | How to apply |
|---|---|---|
| Schema (table/column/policy) | `supabase/migrations/*.sql` | Paste into SQL Editor **and** commit the file |
| TS types | `src/integrations/supabase/types.ts` | `supabase gen types ...` |
| Edge function | `supabase/functions/<name>/` | `supabase functions deploy <name>` |
| Data (insert/update) | SQL Editor | Run ad-hoc, no migration needed |
| Frontend code | `src/` | Save — Vite hot-reloads |
