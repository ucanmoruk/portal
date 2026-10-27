# Neon → isolated MySQL storage

Scope: the application PostgreSQL database (`UGD_POSTGRESS_URL` / `UGD_POSTGRES_URL`), including Formula Control, UGD details, supplier/product records, portal settings, finance and sample photo blobs. Eurolab uses `lib/db_eurolab.ts`; its connection, tables and data are unchanged.

## Isolation and routing

The migrated tables use `ng_<source-schema>_<source-table>` names in the existing MySQL database. `dbo.rUGDFormül` and `cosmoroot.rUGDFormul` are separate tables. Existing laboratory/customer/user tables and their IDs are never overwritten or merged. `lib/neonMysqlTables.json` contains schema names only, without credentials or row data.

The default and UGD pools consult `NeonMigrationControl.ID=1` at runtime. `Backend=postgres` keeps the current source active while the destination is prepared and tested. `Backend=mysql` selects the isolated copy. A target connection failure never falls back to Neon after activation. Existing `cosmoPool` and `rootPool` routing remains unchanged.

Finance's native MySQL queries map to the preserved PostgreSQL finance table/column names. Photo blobs use a dedicated dual-phase store. The old PostgreSQL environment variables can remain present without routing these flows to Neon. Do not change the Eurolab connection as part of this migration.

## Migration commands

Run from the repository on the authorized migration host with the existing source/target environment configuration:

```text
node scripts/neon-mysql-migration.cjs prepare
node scripts/neon-mysql-migration.cjs resume
node scripts/test-neon-mysql.cjs
node scripts/test-ugd-report.cjs
node scripts/verify-neon-mysql.cjs
node scripts/neon-mysql-migration.cjs sync
node scripts/neon-mysql-migration.cjs activate
```

`prepare` inventories types/defaults, installs change capture, and exports every source table inside one repeatable-read read-only transaction. Row values preserve decimal precision, Unicode, microsecond timestamps, NULLs and binary bytes. Local NDJSON backups, per-table counts/hashes and audit reports live under `outputs/neon-mysql-migration-2026-10-27`; keep them private and out of Git. `resume` fills empty staging tables and verifies counts and content hashes; it does not silently overwrite a populated destination. An explicit `--repair=ng_<schema>_<table>` is allowed only before activation and only for a table in the snapshot manifest.

Before activation, deploy the migration-aware runtime. Its production check-in records `RuntimeVersion=1` and `ProductionSeenAt`; activation refuses to proceed without a recent production check-in. Local verification can use `NEON_MYSQL_VERIFY=1` with `NODE_ENV=development` to exercise the copy without changing the global backend flag.

`activate` fences source writes under an advisory transaction lock shared by capture triggers, reconciles captured changes, validates counts and resets auto-increment high-water marks from the source sequences. Only then does it set the MySQL backend flag. Source data and local backups remain available. Late source writes fail rather than split the data; compatibility queries and formula transactions retry on the destination when the switch is complete. Concurrent formula replacement locks the product row and commits or rolls back the complete formula.

## Recovery

Before activation, source traffic remains authoritative. A failed final sync releases the source fence and leaves routing on PostgreSQL; fix the isolated destination and rerun verification. After activation **do not flip the flag back to PostgreSQL**: new MySQL writes would be absent there. Recovery requires an audited reverse sync or restoring MySQL from a current backup. Keep the source fenced to prevent old application instances from writing a second, divergent copy.

The migration preserves all source PKs, declared unique/FK constraints and identity counters. Existing historical orphan references without declared FKs are retained, never deleted to make validation pass. Verification includes real API handlers against the copy and a transaction-only formula write/rollback test.
