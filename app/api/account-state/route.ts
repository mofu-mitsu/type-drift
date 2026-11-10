import { NextRequest, NextResponse } from "next/server";
import { db, readSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS account_app_state (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const userId = readSession(request);
  if (!userId) return response({ authenticated: false }, 401);
  try {
    const sql = db();
    await sql`CREATE TABLE IF NOT EXISTS account_app_state (user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, state JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    const rows = await sql`SELECT state, updated_at FROM account_app_state WHERE user_id = ${userId} LIMIT 1`;
    const row = rows[0] as { state?: unknown; updated_at?: string } | undefined;
    return response({ authenticated: true, userId, hasState: Boolean(row), state: row?.state && typeof row.state === "object" ? row.state : {}, updatedAt: row?.updated_at || null });
  } catch (error) {
    console.error("[Type Drift account-state] GET failed", error);
    return response({ error: "account_state_read_failed" }, 500);
  }
}

export async function PUT(request: NextRequest) {
  const userId = readSession(request);
  if (!userId) return response({ authenticated: false }, 401);
  try {
    const payload = await request.json();
    const state = payload?.state;
    if (!state || typeof state !== "object" || Array.isArray(state)) return response({ error: "invalid_state" }, 400);
    const serialized = JSON.stringify(state);
    if (serialized.length > 2_000_000) return response({ error: "state_too_large" }, 413);
    const sql = db();
    await sql`CREATE TABLE IF NOT EXISTS account_app_state (user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, state JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await sql`INSERT INTO account_app_state (user_id, state, updated_at) VALUES (${userId}, ${serialized}::jsonb, NOW()) ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`;
    return response({ ok: true, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[Type Drift account-state] PUT failed", error);
    return response({ error: "account_state_save_failed" }, 500);
  }
}
