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

## Independent writer control is a hard prerequisite

A control record stored only in Neon or only in Supabase cannot arbitrate writes if that database is unavailable. Writer authority must live in an independent control plane with atomic compare-and-swap / lease semantics and monotonically increasing fencing epochs. Every API request and background worker must validate the current epoch before a write; merely storing an epoch is not fencing if stale workers can still write. No independent authority is configured in this branch, so failover must remain disabled.

## Existing journal limitations

The journal trigger runs in the same transaction as application writes, so rolled-back writes do not leave committed journal rows. Each event stores table, operation, primary key, a row snapshot for diagnostics, transaction ID, and local ID. Event IDs are not a global commit order.

## Low-usage constraint

Do not enable Neon logical replication as the first solution: a live subscriber can prevent scale-to-zero. Do not schedule the existing one-way full-dump workflow as recurring sync; it is not incremental and refuses a non-empty target. Replay batches should be bounded and invoked deliberately while staging.

## Status

- [x] Failure classification/state transition policy.
- [x] Pending-event marker groundwork to avoid sequence IDs as commit-order watermarks.
- [x] Destination receipt + row mutation in one transaction.
- [ ] Runtime writer routing and independent writer authority with fencing.
- [ ] Foreign-key retry queue, schema validation, sequence reconciliation, and checksums.
- [ ] Isolated integration tests for auth, posts, replies, DMs, notifications, deletes, and interrupted replay.
- [ ] Enable only after staging validation.
