import { NextRequest } from "next/server";
import { db, readSession } from "@/lib/server-auth";

// Shared identity resolution for the Node (Vercel) fallback API routes.
// Mirrors the Cloudflare Worker's preamble: a signed-in account can own
// several guest keys across eras; reads and permission checks treat all of
// them as one identity (keySet), writes use the canonical key.

export const clean = (value: unknown, max: number): string =>
  (value == null ? "" : String(value)).trim().slice(0, max);

export const nullable = (value: unknown): string | null =>
  value == null || value === "" ? null : String(value);

export const noStoreHeaders = { "Cache-Control": "no-store" } as const;

export type Identity = {
  key: string;
  keySet: string[];
  accountKey: string | null;
  rawKey: string;
};

export async function resolveIdentity(request: NextRequest): Promise<Identity> {
  const sql = db();
  const rawKey = clean(request.headers.get("x-guest-key"), 120);
  const headerAccount = clean(request.headers.get("x-user-key"), 120);
  const sessionId = readSession(request);
  const accountKey = headerAccount || (sessionId != null ? String(sessionId) : "") || null;

  const accountProfile = accountKey
    ? await sql`SELECT guest_key FROM profiles WHERE user_id::text = ${accountKey} LIMIT 1`
    : [];
  const key = String((accountProfile[0] as { guest_key?: unknown } | undefined)?.guest_key || rawKey || "");

  let keySet = [key];
  if (accountKey) {
    try {
      await sql`CREATE TABLE IF NOT EXISTS profile_guest_keys (user_id text NOT NULL, guest_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, guest_key))`;
      if (rawKey && rawKey !== key) {
        await sql`INSERT INTO profile_guest_keys (user_id, guest_key) VALUES (${accountKey}, ${rawKey}) ON CONFLICT DO NOTHING`;
      }
    } catch { /* linking is best-effort; never break the request */ }
    try {
      const profileKeyRows = await sql`SELECT DISTINCT guest_key FROM profiles WHERE user_id::text = ${accountKey} AND guest_key IS NOT NULL LIMIT 12`;
      const collected = profileKeyRows
        .map((row) => String((row as { guest_key?: unknown }).guest_key || ""))
        .filter(Boolean);
      try {
        const linkRows = await sql`SELECT guest_key FROM profile_guest_keys WHERE user_id = ${accountKey} LIMIT 24`;
        for (const row of linkRows) collected.push(String((row as { guest_key?: unknown }).guest_key || ""));
      } catch { /* link table is optional */ }
      if (rawKey) collected.push(rawKey);
      keySet = [...new Set([key, ...collected].filter(Boolean))];
    } catch { keySet = [key]; }
  }
  return { key, keySet, accountKey, rawKey };
}

export async function bodyOf(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function ensureBottleQuoteColumn(): Promise<void> {
  const sql = db();
  await sql`ALTER TABLE bottles ADD COLUMN IF NOT EXISTS quoted_bottle_id INTEGER`;
}

export async function ensureDmReactionsTable(): Promise<void> {
  const sql = db();
  await sql`CREATE TABLE IF NOT EXISTS direct_message_reactions (id BIGSERIAL PRIMARY KEY, message_id BIGINT NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE, guest_key TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (message_id, guest_key))`;
}
