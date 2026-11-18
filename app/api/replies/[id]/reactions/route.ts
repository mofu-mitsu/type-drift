import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server-auth";
import { noStoreHeaders, resolveIdentity } from "@/lib/fallback-core";

// Node (Vercel) fallback for the Worker's POST /api/replies/:id/reactions.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = db();
    const { key } = await resolveIdentity(request);
    if (!key) return NextResponse.json({ error: "missing_guest_key" }, { status: 422, headers: noStoreHeaders });
    const { id: idParam } = await params;
    const id = Number(idParam);
    const existed = (await sql`SELECT 1 FROM reply_reactions WHERE reply_id=${id} AND guest_key=${key} LIMIT 1`) as Row[];
    const rows = (await sql`WITH updated AS (UPDATE reply_reactions SET level=level+1,updated_at=NOW() WHERE reply_id=${id} AND guest_key=${key} RETURNING level)
      INSERT INTO reply_reactions (reply_id,guest_key,level,created_at,updated_at) SELECT ${id},${key},1,NOW(),NOW() WHERE NOT EXISTS (SELECT 1 FROM updated) RETURNING level`) as Row[];
    const level = rows.length
      ? rows[0].level
      : ((await sql`SELECT level FROM reply_reactions WHERE reply_id=${id} AND guest_key=${key} ORDER BY id DESC LIMIT 1`) as Row[])[0]?.level;
    if (!existed.length) {
      const replyRows = (await sql`SELECT guest_key, bottle_id FROM replies WHERE id=${id} AND deleted_at IS NULL LIMIT 1`) as Row[];
      const reply = replyRows[0];
      if (reply?.guest_key && reply.guest_key !== key) {
        const bottleRows = (await sql`SELECT guest_key FROM bottles WHERE id=${reply.bottle_id} LIMIT 1`) as Row[];
        const likedByOwner = bottleRows[0]?.guest_key === key;
        const notice = likedByOwner ? "ボトルの投稿主があなたの返信にいいねしました。" : "あなたの返信に新しい反応が届きました。";
        await sql`INSERT INTO notifications (guest_key, type, entity_id, message, created_at, updated_at) VALUES (${reply.guest_key}, 'reply_reaction', ${String(id)}, ${notice}, NOW(), NOW())`;
      }
    }
    return NextResponse.json({ level: Number(level || 1) }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("[Type Drift fallback] POST /api/replies/:id/reactions failed", error);
    return NextResponse.json({ error: "database error" }, { status: 500, headers: noStoreHeaders });
  }
}
