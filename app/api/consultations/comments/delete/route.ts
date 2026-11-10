import { NextRequest, NextResponse } from "next/server";
import { db, readSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExistingComment = {
  id: number;
  user_id: number | null;
  guest_key: string | null;
  payload: unknown;
};

function objectPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {}
  }
  return {};
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const postId = typeof body.postId === "string" ? body.postId.trim() : "";
    const commentId = typeof body.commentId === "string" ? body.commentId.trim() : "";
    const sessionUserId = readSession(request);
    const guestKey = request.headers.get("X-Guest-Key") || "";

    if (!postId || !commentId) {
      return NextResponse.json({ ok: false, error: "missing_target" }, { status: 400 });
    }
    if (sessionUserId == null && !guestKey) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const sql = db();
    const rows = await sql`
      SELECT id, user_id, guest_key, payload
      FROM consultation_entries
      WHERE external_id = ${commentId}
        AND parent_external_id = ${postId}
        AND entry_type = 'reply'
      ORDER BY created_at DESC
      LIMIT 1
    ` as ExistingComment[];

    const comment = rows[0];
    if (!comment) {
      return NextResponse.json({ ok: false, error: "comment_not_found" }, { status: 404 });
    }

    const payload = objectPayload(comment.payload);
    const payloadUserKey = typeof payload.userKey === "string" ? payload.userKey : "";
    const isOwner =
      (sessionUserId != null && comment.user_id === sessionUserId) ||
      (guestKey !== "" && (comment.guest_key === guestKey || payloadUserKey === guestKey));

    if (!isOwner) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    await sql`
      DELETE FROM consultation_entries
      WHERE id = ${comment.id}
        AND external_id = ${commentId}
        AND parent_external_id = ${postId}
        AND entry_type = 'reply'
    `;

    return NextResponse.json({ ok: true, postId, commentId }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[Type Drift] consultation comment delete API failed", error);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }
}
