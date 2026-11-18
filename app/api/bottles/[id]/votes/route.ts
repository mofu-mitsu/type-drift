import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server-auth";
import { bodyOf, noStoreHeaders, resolveIdentity } from "@/lib/fallback-core";

// Node (Vercel) fallback for the Worker's /api/bottles/:id/votes routes.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

async function ensureVotesTable() {
  const sql = db();
  await sql`CREATE TABLE IF NOT EXISTS bottle_poll_votes (id BIGSERIAL PRIMARY KEY, bottle_id BIGINT NOT NULL REFERENCES bottles(id) ON DELETE CASCADE, guest_key TEXT NOT NULL, option_index INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (bottle_id, guest_key))`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = db();
    const { key, keySet } = await resolveIdentity(request);
    const { id } = await params;
    await ensureVotesTable();
    const counts = (await sql`SELECT option_index, COUNT(*)::int AS votes FROM bottle_poll_votes WHERE bottle_id=${Number(id)} GROUP BY option_index ORDER BY option_index`) as Row[];
    const mine = key
      ? ((await sql`SELECT option_index FROM bottle_poll_votes WHERE bottle_id=${Number(id)} AND guest_key = ANY(${keySet}) LIMIT 1`) as Row[])
      : [];
    return NextResponse.json({ counts, myVote: mine.length ? Number(mine[0].option_index) : null }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("[Type Drift fallback] GET /api/bottles/:id/votes failed", error);
    return NextResponse.json({ error: "database error" }, { status: 500, headers: noStoreHeaders });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = db();
    const { key } = await resolveIdentity(request);
    if (!key) return NextResponse.json({ error: "missing_guest_key" }, { status: 422, headers: noStoreHeaders });
    const { id: idParam } = await params;
    const id = Number(idParam);
    const b2 = (await bodyOf(request)) as Row;
    const index = Number(b2.option_index);
    if (!Number.isInteger(index) || index < 0) {
      return NextResponse.json({ error: "invalid_option" }, { status: 422, headers: noStoreHeaders });
    }
    const poll = (await sql`SELECT poll_options FROM bottles WHERE id=${id} AND deleted_at IS NULL LIMIT 1`) as Row[];
    const options = poll[0]?.poll_options;
    if (!Array.isArray(options) || index >= options.length) {
      return NextResponse.json({ error: "invalid_poll_option" }, { status: 422, headers: noStoreHeaders });
    }
    await ensureVotesTable();
    await sql`INSERT INTO bottle_poll_votes (bottle_id,guest_key,option_index) VALUES (${id},${key},${index}) ON CONFLICT (bottle_id,guest_key) DO UPDATE SET option_index=EXCLUDED.option_index,created_at=NOW()`;
    const counts = (await sql`SELECT option_index, COUNT(*)::int AS votes FROM bottle_poll_votes WHERE bottle_id=${id} GROUP BY option_index ORDER BY option_index`) as Row[];
    return NextResponse.json({ ok: true, counts }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("[Type Drift fallback] POST /api/bottles/:id/votes failed", error);
    return NextResponse.json({ error: "database error" }, { status: 500, headers: noStoreHeaders });
  }
}
