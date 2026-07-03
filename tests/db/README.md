# Test Database Source Of Truth

`schema.current.sql` is the bootstrap schema for automated Supabase tests.

It intentionally follows the current Supabase database structure instead of replaying `document/migrations/*`, because the migration history is not guaranteed to match the active database. When the live Supabase schema changes intentionally, refresh `schema.current.sql` from the live schema and update `seed.sql` plus `schemaContract.test.ts` in the same change.
