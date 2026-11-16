# Database failover implementation notes

## Safety boundary

The first implementation step is a pure decision policy in
`app/Support/Database/DatabaseFailoverPolicy.php`. It classifies quota errors,
transient connectivity errors, and unrelated SQL errors, and applies a small
state machine with a failure threshold and recovery cooldown.

**This policy does not switch Laravel's live database connection.** It is
deliberately not wired into request handling yet: the current app writes
directly through Eloquent/DB to many tables, and switching the connection
without a durable change journal would create divergent databases and make
failback unsafe.

## Required phases before enabling production failover

1. Add a durable write journal for every mutable application table, including
   inserts, updates, and deletes. Record stable primary keys, before/after
   values, transaction ordering, and an idempotency key. Ensure journal rows
   are committed atomically with the original write.
2. Add a single-writer routing record with a monotonically increasing epoch.
   Every write path must use the selected database and epoch; never dual-write.
3. Add a low-frequency health probe that does not continuously wake Neon.
   Use quota-specific errors for immediate failover; require repeated transient
   failures for ordinary network/server errors.
4. On failover, verify the Supabase schema and journal are ready before routing
   writes there. Preserve a durable record of the active writer.
5. On recovery, keep Supabase as the writer while replaying its journal into
   Neon in order. Replay must be idempotent and must account for updates,
   deletes, foreign-key ordering, sequence/identity values, and concurrent
   requests. Compare table counts and stable-key/content checksums.
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
- [ ] Persist failover state and writer epoch.
- [ ] Capture all writes/deletes in a transactionally safe journal.
- [ ] Implement idempotent replay and reconciliation in both directions.
- [ ] Integrate connection routing with Laravel requests and background workers.
- [ ] Add isolated database integration tests and exercise auth/post/reply/DM/notification flows.
- [ ] Enable only after staging validation.
