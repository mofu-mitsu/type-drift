import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server-auth";
import { bodyOf, clean, noStoreHeaders, resolveIdentity } from "@/lib/fallback-core";

// Node (Vercel) fallback for the Worker's POST /api/notifications/read-all.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

export async function POST(request: NextRequest) {
  try {
    const sql = db();
    const { key, keySet } = await resolveIdentity(request);
    if (!key) return NextResponse.json({ ok: false, message: "missing_guest_key" }, { status: 422, headers: noStoreHeaders });
    const b2 = (await bodyOf(request)) as Row;
    const types = Array.isArray(b2.types) ? b2.types.map((t: unknown) => clean(t, 60)).filter(Boolean) : [];
    let updatedTotal = 0;
    for (const k of keySet) {
      const partUpdated = (types.length
        ? await sql`UPDATE notifications SET read_at=NOW(),updated_at=NOW() WHERE guest_key=${k} AND user_id IS NULL AND read_at IS NULL AND type=ANY(${types}) RETURNING id`
        : await sql`UPDATE notifications SET read_at=NOW(),updated_at=NOW() WHERE guest_key=${k} AND user_id IS NULL AND read_at IS NULL RETURNING id`) as Row[];
      updatedTotal += partUpdated.length;
    }
    return NextResponse.json({ ok: true, updated: updatedTotal }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("[Type Drift fallback] POST /api/notifications/read-all failed", error);
    return NextResponse.json({ error: "database error" }, { status: 500, headers: noStoreHeaders });
  }
}
