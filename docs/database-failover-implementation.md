# Database failover implementation notes

## Safety boundary

The implementation branch adds a pure policy in
`app/Support/Database/DatabaseFailoverPolicy.php` and a PostgreSQL migration
that records INSERT, UPDATE, and DELETE events into a local journal. The
journal trigger runs in the same database transaction as the original write,
so rolled-back application transactions do not leave committed journal events.

**This does not switch Laravel's live database connection yet.** It is not
wired into request handling, and the journal is not yet replayed. The current
app writes directly through Eloquent/DB to many tables, so connection switching
without a durable writer fence and tested replay would risk divergent databases.

## Journal details and remaining constraints

- The migration creates `public.type_drift_change_journal` and a trigger for
  each public table that has a primary key, excluding the journal and Laravel's
  migrations metadata.
- Each event stores the table, operation, primary-key JSON, resulting row JSON
  for INSERT/UPDATE (or NULL for DELETE), transaction ID, and local journal ID.
- This is a local journal on each database. It does not yet guarantee a global
  commit order across databases, prevent replay loops, or perform reverse sync.
- Do not run this migration on production until reviewed and applied to isolated
  test databases first. The triggers add write overhead and journal growth needs
  a retention/compaction policy before production rollout.

## Required phases before enabling production failover

1. Add a durable writer-control record with a monotonically increasing epoch,
   stored somewhere available while either application database is down.
   All requests/workers must honor the same writer epoch; never dual-write.
2. Implement an idempotent journal replayer with source-event receipts, explicit
   table/column allowlists, foreign-key ordering, delete handling, and sequence
   reconciliation. It must avoid recording replayed target writes as new source
   events and must not skip late-committing source transactions.
3. Add a low-frequency health probe that does not continuously wake Neon.
   Use explicit quota errors for immediate failover; require repeated transient
   failures for ordinary network/server errors.
4. On failover, validate the target schema and journal before routing writes
   there. Persist the active writer before accepting secondary writes.
5. On recovery, keep Supabase as the writer while replaying its journal into
   Neon. Compare table counts plus stable-key/content checksums and verify that
   the replay watermark is caught up.
6. Only switch the writer back after replay is caught up, integrity checks pass,
   and several spaced Neon probes succeed. If any step fails, remain on Supabase.
7. Run end-to-end tests against isolated test databases for authentication,
   posts, replies, DMs, notifications, deletes, and interrupted sync. Never use
   the production Supabase backup as a disposable test database.

## Low-usage constraint

Do not enable Neon logical replication as the first solution: a live subscriber
can prevent scale-to-zero. Do not schedule the existing one-way full-dump
workflow as a recurring sync; it is not incremental and refuses a non-empty
target. Prefer infrequent, bounded journal batches and only probe Neon after a
cooldown or on an actual failed request.

## Current status

- [x] Add and unit-test pure failure classification/state transition policy.
- [x] Add PostgreSQL row-change journal migration (not applied to production).
- [ ] Persist failover state and writer epoch.
- [ ] Implement idempotent replay and reconciliation in both directions.
- [ ] Integrate connection routing with Laravel requests and background workers.
- [ ] Add isolated database integration tests and exercise auth/post/reply/DM/notification flows.
- [ ] Enable only after staging validation.
