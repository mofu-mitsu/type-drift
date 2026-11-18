import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server-auth";
import { ensureDmReactionsTable, noStoreHeaders, resolveIdentity } from "@/lib/fallback-core";

// Node (Vercel) fallback for the Worker's POST /api/direct-messages/:id/reactions.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = db();
    const { key, keySet } = await resolveIdentity(request);
    if (!key) return NextResponse.json({ error: "missing_guest_key" }, { status: 422, headers: noStoreHeaders });
    const { id: idParam } = await params;
    const id = Number(idParam);
    await ensureDmReactionsTable();
    const msgRows = (await sql`SELECT id, sender_guest_key, recipient_guest_key, bottle_id, thread_id FROM direct_messages WHERE id=${id} LIMIT 1`) as Row[];
    const msg = msgRows[0];
    if (!msg) return NextResponse.json({ message: "Message not found." }, { status: 404, headers: noStoreHeaders });
    if (keySet.includes(String(msg.sender_guest_key || ""))) {
      return NextResponse.json({ message: "自分のメッセージにはリアクションできません。" }, { status: 422, headers: noStoreHeaders });
    }
    if (!keySet.includes(String(msg.recipient_guest_key || ""))) {
      let allowed = false;
      for (const k of keySet) {
        const partRows = (await sql`SELECT 1 FROM direct_messages WHERE thread_id=${msg.thread_id} AND (sender_guest_key=${k} OR recipient_guest_key=${k}) LIMIT 1`) as Row[];
        if (partRows.length) { allowed = true; break; }
      }
      if (!allowed) {
        return NextResponse.json({ message: "このスレッドの参加者だけがリアクションできます。" }, { status: 403, headers: noStoreHeaders });
      }
    }
    const existed = (await sql`SELECT 1 FROM direct_message_reactions WHERE message_id=${id} AND guest_key=${key} LIMIT 1`) as Row[];
    const rows = (await sql`WITH updated AS (UPDATE direct_message_reactions SET level=level+1,updated_at=NOW() WHERE message_id=${id} AND guest_key=${key} RETURNING level)
      INSERT INTO direct_message_reactions (message_id,guest_key,level,created_at,updated_at) SELECT ${id},${key},1,NOW(),NOW() WHERE NOT EXISTS (SELECT 1 FROM updated) RETURNING level`) as Row[];
    const level = rows.length
      ? rows[0].level
      : ((await sql`SELECT level FROM direct_message_reactions WHERE message_id=${id} AND guest_key=${key} ORDER BY id DESC LIMIT 1`) as Row[])[0]?.level;
    const totals = (await sql`SELECT COALESCE(SUM(level),0)::int AS total FROM direct_message_reactions WHERE message_id=${id}`) as Row[];
    if (!existed.length) {
      const authorKey = String(msg.sender_guest_key || "");
      if (authorKey && !authorKey.startsWith("ai:")) {
        await sql`INSERT INTO notifications (guest_key, type, entity_id, message, created_at, updated_at) VALUES (${authorKey}, 'direct_message_reaction', ${String(id)}, 'あなたのメッセージにいいねが届きました。', NOW(), NOW())`;
      }
    }
    return NextResponse.json({ reaction: { message_id: id, level, total: totals[0]?.total ?? level } }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("[Type Drift fallback] POST /api/direct-messages/:id/reactions failed", error);
    return NextResponse.json({ error: "database error" }, { status: 500, headers: noStoreHeaders });
  }
}
