export interface Env {
  WRITER_COORDINATOR: DurableObjectNamespace;
  CONTROL_TOKEN: string;
}

type Writer = "neon" | "supabase";
type ControlStatus = "stable" | "transitioning";

interface WriteLease {
  id: string;
  writer: Writer;
  epoch: number;
  acquiredAt: string;
}

interface ControlState {
  writer: Writer;
  epoch: number;
  status: ControlStatus;
  transitionId: string | null;
  target: Writer | null;
  leases: WriteLease[];
  updatedAt: string;
}

const INITIAL_STATE: ControlState = {
  writer: "neon",
  epoch: 1,
  status: "stable",
  transitionId: null,
  target: null,
  leases: [],
  updatedAt: new Date(0).toISOString(),
};

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

const isWriter = (value: unknown): value is Writer => value === "neon" || value === "supabase";
const isEpoch = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

export class WriterCoordinator {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!this.authorized(request)) return json({ error: "unauthorized" }, 401);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") return json({ error: "invalid_request" }, 400);

    return this.ctx.storage.transaction(async (txn) => {
      const stored = await txn.get<ControlState>("state");
      const state: ControlState = stored
        ? { ...INITIAL_STATE, ...stored, leases: Array.isArray(stored.leases) ? stored.leases : [] }
        : { ...INITIAL_STATE, leases: [] };

      if (body.action === "read") {
        return json({ state, activeLeaseCount: state.leases.length });
      }

      if (body.action === "acquire") {
        if (!isEpoch(body.expectedEpoch)) return json({ error: "invalid_request" }, 400);
        if (state.status !== "stable") return json({ error: "writer_transitioning", state }, 423);
        if (body.expectedEpoch !== state.epoch) return json({ error: "epoch_conflict", state }, 409);
        if (body.writer !== state.writer) return json({ error: "writer_mismatch", state }, 409);

        const lease: WriteLease = {
          id: crypto.randomUUID(),
          writer: state.writer,
          epoch: state.epoch,
          acquiredAt: new Date().toISOString(),
        };
        const next = { ...state, leases: [...state.leases, lease], updatedAt: new Date().toISOString() };
        await txn.put("state", next);
        return json({ lease, writer: next.writer, epoch: next.epoch }, 201);
      }

      if (body.action === "release") {
        if (typeof body.leaseId !== "string" || !body.leaseId) return json({ error: "invalid_request" }, 400);
        const index = state.leases.findIndex((lease) => lease.id === body.leaseId);
        if (index < 0) return json({ error: "lease_not_found" }, 404);
        const next = {
          ...state,
          leases: state.leases.filter((lease) => lease.id !== body.leaseId),
          updatedAt: new Date().toISOString(),
        };
        await txn.put("state", next);
        return json({ released: true, activeLeaseCount: next.leases.length });
      }

      if (body.action === "prepare") {
        if (!isWriter(body.target) || !isEpoch(body.expectedEpoch)) {
          return json({ error: "invalid_request" }, 400);
        }
        if (body.expectedEpoch !== state.epoch) return json({ error: "epoch_conflict", state }, 409);
        if (state.status !== "stable") return json({ error: "transition_in_progress", state }, 409);
        if (body.target === state.writer) return json({ error: "already_active_writer", state }, 409);
        // Leases are released only after the guarded write path has finished.
        // Never expire them automatically: a timed-out lease could still be writing.
        if (state.leases.length > 0) {
          return json({ error: "active_writes", activeLeaseCount: state.leases.length, state }, 409);
        }

        const next: ControlState = {
          ...state,
          status: "transitioning",
          transitionId: crypto.randomUUID(),
          target: body.target,
          updatedAt: new Date().toISOString(),
        };
        await txn.put("state", next);
        return json({ state: next });
      }

      if (body.action === "commit") {
        if (
          state.status !== "transitioning"
          || typeof body.transitionId !== "string"
          || body.transitionId !== state.transitionId
          || !state.target
          || !isEpoch(body.expectedEpoch)
          || body.expectedEpoch !== state.epoch
        ) {
          return json({ error: "transition_conflict", state }, 409);
        }
        if (state.leases.length > 0) {
          return json({ error: "active_writes", activeLeaseCount: state.leases.length, state }, 409);
        }

        const next: ControlState = {
          writer: state.target,
          epoch: state.epoch + 1,
          status: "stable",
          transitionId: null,
          target: null,
          leases: [],
          updatedAt: new Date().toISOString(),
        };
        await txn.put("state", next);
        return json({ state: next });
      }

      if (body.action === "abort") {
        if (
          state.status !== "transitioning"
          || typeof body.transitionId !== "string"
          || body.transitionId !== state.transitionId
          || body.expectedEpoch !== state.epoch
        ) {
          return json({ error: "transition_conflict", state }, 409);
        }
        const next: ControlState = {
          ...state,
          status: "stable",
          transitionId: null,
          target: null,
          updatedAt: new Date().toISOString(),
        };
        await txn.put("state", next);
        return json({ state: next });
      }

      return json({ error: "unknown_action" }, 400);
    });
  }

  private authorized(request: Request): boolean {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    return Boolean(this.env.CONTROL_TOKEN) && token === this.env.CONTROL_TOKEN;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/v1/writer-control") return json({ error: "not_found" }, 404);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!env.CONTROL_TOKEN) return json({ error: "control_not_configured" }, 503);

    const id = env.WRITER_COORDINATOR.idFromName("type-drift-production-writer");
    const stub = env.WRITER_COORDINATOR.get(id);
    return stub.fetch(request);
  },
};
