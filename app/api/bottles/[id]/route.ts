import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server-auth";
import { bodyOf, clean, noStoreHeaders, resolveIdentity } from "@/lib/fallback-core";

// Node (Vercel) fallback for the Worker's /api/bottles/:id routes (edit/delete).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = db();
    const { key, keySet } = await resolveIdentity(request);
    if (!key) return NextResponse.json({ error: "missing_guest_key" }, { status: 422, headers: noStoreHeaders });
    const { id } = await params;
    const editBody = (await bodyOf(request)) as Row;
    const editText = typeof editBody.body === "string" ? clean(editBody.body, 5000) : null;
    const hasLikePref = Object.prototype.hasOwnProperty.call(editBody, "allow_likes") || Object.prototype.hasOwnProperty.call(editBody, "allowLikes");
    const hasReplyPref = Object.prototype.hasOwnProperty.call(editBody, "allow_replies") || Object.prototype.hasOwnProperty.call(editBody, "allowReplies");
    if (!editText && !hasLikePref && !hasReplyPref) {
      return NextResponse.json({ message: "body or interaction preferences are required" }, { status: 422, headers: noStoreHeaders });
    }
    const allowLikes = ![false, "false", 0, "0", "f"].includes(editBody.allow_likes ?? editBody.allowLikes ?? true);
    const allowReplies = ![false, "false", 0, "0", "f"].includes(editBody.allow_replies ?? editBody.allowReplies ?? true);
    const updated = (await sql`UPDATE bottles SET
      body=COALESCE(${editText},body),
      allow_likes=CASE WHEN ${hasLikePref} THEN ${allowLikes} ELSE allow_likes END,
      allow_replies=CASE WHEN ${hasReplyPref} THEN ${allowReplies} ELSE allow_replies END,
      updated_at=NOW()
      WHERE id=${Number(id)} AND guest_key = ANY(${keySet}) AND deleted_at IS NULL
      RETURNING id,body,allow_likes,allow_replies,updated_at`) as Row[];
    return updated.length
      ? NextResponse.json({ bottle: updated[0] }, { headers: noStoreHeaders })
      : NextResponse.json({ error: "not_found_or_forbidden" }, { status: 404, headers: noStoreHeaders });
  } catch (error) {
    console.error("[Type Drift fallback] PATCH /api/bottles/:id failed", error);
    return NextResponse.json({ error: "database error" }, { status: 500, headers: noStoreHeaders });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = db();
    const { key, keySet } = await resolveIdentity(request);
    if (!key) return NextResponse.json({ error: "missing_guest_key" }, { status: 422, headers: noStoreHeaders });
    const { id } = await params;
    const deleted = (await sql`UPDATE bottles SET deleted_at=NOW(),updated_at=NOW() WHERE id=${Number(id)} AND guest_key = ANY(${keySet}) AND deleted_at IS NULL RETURNING id`) as Row[];
    return deleted.length
      ? NextResponse.json({ ok: true }, { headers: noStoreHeaders })
      : NextResponse.json({ error: "not_found_or_forbidden" }, { status: 404, headers: noStoreHeaders });
  } catch (error) {
    console.error("[Type Drift fallback] DELETE /api/bottles/:id failed", error);
    return NextResponse.json({ error: "database error" }, { status: 500, headers: noStoreHeaders });
  }
}
