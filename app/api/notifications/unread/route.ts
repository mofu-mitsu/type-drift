import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server-auth";
import { noStoreHeaders, resolveIdentity } from "@/lib/fallback-core";

// Node (Vercel) fallback for the Worker's GET /api/notifications/unread.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

export async function GET(request: NextRequest) {
  try {
    const sql = db();
    const { key, keySet } = await resolveIdentity(request);
    if (!key) {
      return NextResponse.json({ count: 0, counts: {}, notifications: [] }, { headers: noStoreHeaders });
    }
    const notifById = new Map<unknown, Row>();
    for (const k of keySet) {
      const part = (await sql`SELECT * FROM notifications WHERE guest_key=${k} AND user_id IS NULL AND read_at IS NULL ORDER BY created_at DESC LIMIT 50`) as Row[];
      for (const row of part) if (!notifById.has(row.id)) notifById.set(row.id, row);
    }
    const rows = [...notifById.values()]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 50);
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.type] = (counts[row.type] || 0) + 1;
    return NextResponse.json({ count: rows.length, counts, notifications: rows }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("[Type Drift fallback] GET /api/notifications/unread failed", error);
    return NextResponse.json({ error: "database error" }, { status: 500, headers: noStoreHeaders });
  }
}
