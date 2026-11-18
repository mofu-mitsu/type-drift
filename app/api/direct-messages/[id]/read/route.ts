import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server-auth";
import { noStoreHeaders, resolveIdentity } from "@/lib/fallback-core";

// Node (Vercel) fallback for the Worker's POST /api/direct-messages/:id/read.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = db();
    const { key, keySet } = await resolveIdentity(request);
    if (!key) return NextResponse.json({ error: "missing_guest_key" }, { status: 422, headers: noStoreHeaders });
    const { id } = await params;
    for (const k of keySet) {
      await sql`UPDATE direct_messages SET read_at=NOW(),updated_at=NOW() WHERE id=${Number(id)} AND recipient_guest_key=${k} AND read_at IS NULL`;
    }
    return NextResponse.json({ ok: true }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("[Type Drift fallback] POST /api/direct-messages/:id/read failed", error);
    return NextResponse.json({ error: "database error" }, { status: 500, headers: noStoreHeaders });
  }
}
