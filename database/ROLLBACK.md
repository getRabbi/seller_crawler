# Database Rollback And Restore Notes

Phase 1 introduces local D1-compatible SQL migrations only. No Cloudflare D1
database is created, migrated, or deployed by these files.

## Rollback

Before production data exists, rollback is file-level: remove the Phase 1
migration files and repository classes, then rerun local validation.

After a D1 database contains data, do not delete canonical or historical data
to roll back a migration. Create a forward migration that preserves existing
rows, marks superseded columns or tables as inactive, and records the retention
or recovery operation in operations notes.

Operations migration `0006_crawl_run_contacts.sql` is additive. Its rows are
run-level idempotency and audit evidence and must not be deleted during an
application rollback. A prior Worker can run with the table present. Any future
retention of these rows requires a documented forward retention migration.

Entity-resolution merges are rolled back with a new forward decision. Use
`entity_resolution_decisions` and `seller_merge_redirects` metadata to restore
source-seller links, mark the redirect rollback status, and write the rollback
reason. Do not delete either seller row, merge decision row, or historical field
history row during rollback.

## Restore Order

Restore partitioned databases in this order:

1. core
2. contacts
3. operations
4. history

The core database owns canonical seller rows and FTS5 search. Contacts,
operations, and history store plain seller/source identifiers and are reconciled
by the Worker; they do not declare cross-database foreign keys.

## FTS5 Rebuild

D1 exports do not preserve virtual FTS5 tables. After importing canonical core
tables, run `database/queries/rebuild_core_fts_after_restore.sql` against the
restored core database. The script recreates the virtual table, rebuilds it from
`sellers`, `seller_aliases`, and `seller_product_links`, and reinstalls the
search maintenance triggers.
