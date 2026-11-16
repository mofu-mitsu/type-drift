# Type Drift Writer Control (not deployed)

This Worker uses a single SQLite-backed Durable Object as an independent, strongly consistent control-plane record. It stores the selected writer, a monotonically increasing epoch, and an explicit prepare/commit/abort transition. All state mutations happen inside a Durable Object storage transaction.

## API

Endpoint: `POST /v1/writer-control`

All requests require `Authorization: Bearer <CONTROL_TOKEN>`. Set `CONTROL_TOKEN` as a Worker secret before any deployment. Do not put it in frontend code.

- `{"action":"read"}` — read the control state.
- `{"action":"prepare","target":"supabase","expectedEpoch":1}` — reserve a transition and return a one-time transition ID.
- `{"action":"commit","expectedEpoch":1,"transitionId":"..."}` — atomically switch the authoritative record and increment the epoch.
- `{"action":"abort","expectedEpoch":1,"transitionId":"..."}` — cancel a pending transition without changing the active writer.

The initial record is `neon`, epoch `1`; it is lazily created when the object is first accessed. Do not use this initial value to route production writes until it has been explicitly checked against the real production configuration.

## Critical fencing limitation

This Worker is an independent **control-plane primitive**, not yet a complete database fence. Updating an epoch in Cloudflare does not by itself stop a Laravel process that already passed a check from committing a write to Neon. Strict fencing requires every mutation to be guarded at the actual write boundary, or a cutover protocol that blocks new writes and drains/rejects all in-flight writers before switching. Do not enable automatic failover or route app writes from this record until Laravel and every background worker enforce the epoch with a tested no-stale-write protocol.

The Worker has not been deployed, no Durable Object namespace has been provisioned, and no Cloudflare secret has been set by this source change. Deployment is deliberately separate from code creation.
