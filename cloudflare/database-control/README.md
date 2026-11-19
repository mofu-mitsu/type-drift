# Type Drift Writer Control (not deployed)

This Worker uses a single SQLite-backed Durable Object as an independent control plane. It stores the selected writer, monotonically increasing epoch, transition state, and active write leases. All state mutations occur inside a Durable Object storage transaction.

## API

Endpoint: `POST /v1/writer-control`

Every request requires `Authorization: Bearer <CONTROL_TOKEN>`. Set `CONTROL_TOKEN` as a Worker secret before deployment. Never expose it in frontend code.

- `{"action":"read"}` — read state and active lease count.
- `{"action":"acquire","writer":"neon","expectedEpoch":1}` — acquire a write lease for the current writer and epoch. Returns a unique `lease.id`.
- `{"action":"release","leaseId":"..."}` — release a lease after the protected database write has fully completed or rolled back.
- `{"action":"prepare","target":"supabase","expectedEpoch":1}` — begin a transition only when no leases are active; otherwise returns `409 active_writes`. Once transitioning, new leases are denied.
- `{"action":"commit","expectedEpoch":1,"transitionId":"..."}` — switch the writer and increment epoch. Commit is rejected if any leases remain.
- `{"action":"abort","expectedEpoch":1,"transitionId":"..."}` — cancel a pending transition.

## Required calling pattern

1. For every mutation, acquire a lease before opening/starting the database write transaction.
2. Use only the writer and epoch returned by the lease; do not independently choose a DB.
3. Complete or roll back the DB transaction.
4. Release the lease in a `finally` block, after the DB transaction has finished.
5. A transition operator calls `prepare`, waits/retries while leases exist, verifies replication/reconciliation and target readiness, then calls `commit`. Abort if verification fails.

Leases deliberately have no automatic TTL. A request timeout does not prove the database transaction stopped; expiring a lease could allow a cutover while an old writer is still committing. If a process dies while holding a lease, cutover remains blocked until an operator establishes that the process and its DB transaction are stopped and performs a reviewed recovery procedure. Do not add a blind force-release endpoint.

## Important safety boundary

This is still a control-plane primitive, **not a production fence until integrated**. Lease acquisition/release only protects writes if every database mutation is wrapped around the complete write transaction, including queue workers, scheduled jobs, admin endpoints, and other services. No DB connection may be selected before the lease and then silently remain pointed at an old writer. A transition must not commit while any lease is active.

The initial record defaults to Neon/epoch 1 solely as a code default, not proof of the real production writer. This Worker has not been deployed, no Durable Object namespace has been provisioned, no secret has been set, and Laravel is not integrated. Do not enable automatic failover or route production writes through it yet.
