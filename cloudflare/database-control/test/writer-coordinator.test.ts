import { describe, expect, it } from "vitest";
import { WriterCoordinator, type Env } from "../src/index";

class FakeStorage {
  private values = new Map<string, unknown>();
  private tail: Promise<unknown> = Promise.resolve();

  transaction<T>(callback: (txn: { get: <V>(key: string) => Promise<V | undefined>; put: (key: string, value: unknown) => Promise<void> }) => Promise<T>): Promise<T> {
    const run = this.tail.then(() => callback({
      get: async <V>(key: string) => this.values.get(key) as V | undefined,
      put: async (key: string, value: unknown) => { this.values.set(key, structuredClone(value)); },
    }));
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }
}

function harness() {
  const storage = new FakeStorage();
  const coordinator = new WriterCoordinator({ storage } as unknown as DurableObjectState, { CONTROL_TOKEN: "test" } as Env);
  const call = async (body: Record<string, unknown>) => {
    const response = await coordinator.fetch(new Request("https://do.test", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() as Record<string, any> };
  };
  return { call };
}

describe("writer coordinator lease fencing", () => {
  it("rejects transition preparation while a write lease is active", async () => {
    const { call } = harness();
    const acquired = await call({ action: "acquire", writer: "neon", expectedEpoch: 1 });
    expect(acquired.status).toBe(201);

    const prepared = await call({ action: "prepare", target: "supabase", expectedEpoch: 1 });
    expect(prepared.status).toBe(409);
    expect(prepared.body.error).toBe("active_writes");
  });

  it("rejects new leases after transition preparation", async () => {
    const { call } = harness();
    const prepared = await call({ action: "prepare", target: "supabase", expectedEpoch: 1 });
    expect(prepared.status).toBe(200);

    const acquired = await call({ action: "acquire", writer: "neon", expectedEpoch: 1 });
    expect(acquired.status).toBe(423);
  });

  it("switches only after release and increments the fencing epoch", async () => {
    const { call } = harness();
    const acquired = await call({ action: "acquire", writer: "neon", expectedEpoch: 1 });
    const leaseId = acquired.body.lease.id as string;

    expect((await call({ action: "release", leaseId })).status).toBe(200);
    const prepared = await call({ action: "prepare", target: "supabase", expectedEpoch: 1 });
    expect(prepared.status).toBe(200);

    const committed = await call({
      action: "commit",
      expectedEpoch: 1,
      transitionId: prepared.body.state.transitionId,
    });
    expect(committed.status).toBe(200);
    expect(committed.body.state.writer).toBe("supabase");
    expect(committed.body.state.epoch).toBe(2);
  });

  it("serializes a concurrent acquire and prepare so only one wins", async () => {
    const { call } = harness();
    const results = await Promise.all([
      call({ action: "acquire", writer: "neon", expectedEpoch: 1 }),
      call({ action: "prepare", target: "supabase", expectedEpoch: 1 }),
    ]);

    expect(results.filter((result) => result.status === 201 || result.status === 200)).toHaveLength(1);
    expect(results.some((result) => result.status === 409 || result.status === 423)).toBe(true);
  });
  it("allows a manually recovered abandoned lease to unblock a safe transition", async () => {
    const { call } = harness();
    const acquired = await call({ action: "acquire", writer: "neon", expectedEpoch: 1 });
    const leaseId = acquired.body.lease.id as string;

    const blocked = await call({ action: "prepare", target: "supabase", expectedEpoch: 1 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("active_writes");

    // Simulate operator-confirmed process termination, then release its lease.
    expect((await call({ action: "release", leaseId })).status).toBe(200);
    const prepared = await call({ action: "prepare", target: "supabase", expectedEpoch: 1 });
    expect(prepared.status).toBe(200);

    const committed = await call({
      action: "commit",
      expectedEpoch: 1,
      transitionId: prepared.body.state.transitionId,
    });
    expect(committed.status).toBe(200);
    expect(committed.body.state.writer).toBe("supabase");
    expect(committed.body.state.epoch).toBe(2);
  });

});
