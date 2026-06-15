-- Force PostgREST to reload the schema cache so the new tables are recognized by the API
NOTIFY pgrst, 'reload schema';