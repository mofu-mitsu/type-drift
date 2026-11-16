# Database failover implementation notes

## Safety boundary

This branch is groundwork only. It does not switch Laravel's live database connection and no migration has been applied to a database. Do not enable automatic failover or run these migrations in production.

## Late-commit-safe replay groundwork

PostgreSQL sequence values are allocated before transaction commit. Advancing a durable cursor to the largest observed journal ID can permanently skip an event from a transaction that commits later with a smaller ID.

Migration `2026_11_16_000003_add_processed_at_to_type_drift_change_journal.php` adds a nullable source-side acknowledgement and a partial index for pending events. The replay service selects pending events rather than treating event IDs as a commit-order watermark. It writes a destination receipt and row mutation in one destination transaction; after that commits, it marks the source event acknowledged. A crash between those commits is safe to retry because the destination receipt is idempotent.

The service reads the current source row by primary key rather than replaying the historical event snapshot. A delayed older event therefore cannot overwrite a newer committed row state. If the current source row no longer exists, replay deletes it from the destination.

This is a bounded replay primitive, not a production-ready sync system. It still needs:
- schema compatibility checks on both sides and an explicit table/column allowlist;
- foreign-key-conflict retry scheduling and sequence reconciliation;
- concurrency fencing so only one replay worker owns a source/destination pair;
- retention/compaction after both sides are verified;
- isolated integration tests and checksums before any cutover.

## Independent writer control and lease fencing

A control record stored only in Neon or Supabase cannot arbitrate writes when that database is unavailable. The Cloudflare Durable Object under `cloudflare/database-control/` stores the writer authority independently, with a monotonically increasing epoch and transactional state changes.

The Worker now supports active write leases:
- `acquire` succeeds only while the control state is stable and the supplied writer/epoch match.
- `prepare` enters transition state only when no leases are active; while transitioning, new leases are rejected.
- `commit` checks the transition ID and epoch and refuses to switch while any lease remains.
- `release` removes a lease only after the guarded write path has fully completed.

Leases intentionally have no automatic TTL. A stale lease can block failover, but silently expiring one risks allowing a still-running old-writer transaction to commit after cutover. A reviewed recovery path is needed for a crashed process holding a lease.

This protocol is only effective when all writes acquire before starting their DB transaction and release only after commit/rollback. Laravel middleware and every queue/scheduled/background writer must be integrated and tested. The Worker is not deployed and not connected to production. Its initial Neon/epoch 1 state is a code default, not verified production state. Do not enable automatic failover yet.

## Existing journal limitations

The journal trigger runs in the same transaction as application writes, so rolled-back writes do not leave committed journal rows. Each event stores table, operation, primary key, a row snapshot for diagnostics, transaction ID, and local ID. Event IDs are not a global commit order.

## Low-usage constraint

Do not enable Neon logical replication as the first solution: a live subscriber can prevent scale-to-zero. Do not schedule the existing one-way full-dump workflow as recurring sync; it is not incremental and refuses a non-empty target. Replay batches should be bounded and invoked deliberately while staging.

## Status

- [x] Failure classification/state transition policy.
- [x] Pending-event marker groundwork to avoid sequence IDs as commit-order watermarks.
- [x] Destination receipt + row mutation in one transaction.
- [x] Independent writer-control API with write-lease and transition exclusion prototype.
- [x] Laravel API middleware and reusable queued-job lease middleware groundwork (feature flag off by default).
- [ ] Attach reusable lease middleware to every future database-writing queued job and audit scheduler/other services.
- [ ] Runtime writer routing validated against both PostgreSQL URLs; lease release/recovery behavior tested end-to-end.
- [ ] Recovery process for orphaned leases, validated with stopped process/DB connections.
- [ ] Foreign-key retry queue, schema validation, sequence reconciliation, and checksums.
- [ ] Isolated integration tests for auth, posts, replies, DMs, notifications, deletes, and interrupted replay.
- [ ] Enable only after staging validation.
