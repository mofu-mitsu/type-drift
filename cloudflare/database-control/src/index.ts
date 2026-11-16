export interface Env {
  WRITER_COORDINATOR: DurableObjectNamespace;
  CONTROL_TOKEN: string;
}

type Writer = "neon" | "supabase";
type ControlStatus = "stable" | "transitioning";

interface ControlState {
  writer: Writer;
  epoch: number;
  status: ControlStatus;
  transitionId: string | null;
  target: Writer | null;
  updatedAt: string;
}

const INITIAL_STATE: ControlState = {
  writer: "neon",
  epoch: 1,
  status: "stable",
  transitionId: null,
  target: null,
  updatedAt: new Date(0).toISOString(),
};

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

const isWriter = (value: unknown): value is Writer => value === "neon" || value === "supabase";

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
      const state = (await txn.get<ControlState>("state")) ?? INITIAL_STATE;
      if (body.action === "read") return json({ state });

      if (body.action === "prepare") {
        if (!isWriter(body.target) || !Number.isSafeInteger(body.expectedEpoch)) {
          return json({ error: "invalid_request" }, 400);
        }
        if (body.expectedEpoch !== state.epoch) {
          return json({ error: "epoch_conflict", state }, 409);
        }
        if (state.status !== "stable") {
          return json({ error: "transition_in_progress", state }, 409);
        }
        if (body.target === state.writer) {
          return json({ error: "already_active_writer", state }, 409);
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
          || !Number.isSafeInteger(body.expectedEpoch)
          || body.expectedEpoch !== state.epoch
        ) {
          return json({ error: "transition_conflict", state }, 409);
        }

        const next: ControlState = {
          writer: state.target,
          epoch: state.epoch + 1,
          status: "stable",
          transitionId: null,
          target: null,
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
    const token = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "") ?? "";
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
