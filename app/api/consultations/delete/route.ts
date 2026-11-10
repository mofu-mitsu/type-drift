import { NextRequest, NextResponse } from "next/server";
import { db, readSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExistingThread = {
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
    if (!postId) {
      return NextResponse.json({ ok: false, error: "missing_post_id" }, { status: 400 });
    }

    const sessionUserId = readSession(request);
    const guestKey = request.headers.get("X-Guest-Key") || "";
    if (sessionUserId == null && !guestKey) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const sql = db();
    const rows = await sql`
      SELECT id, user_id, guest_key, payload
      FROM consultation_entries
      WHERE external_id = ${postId} AND entry_type = 'thread'
      LIMIT 1
    ` as ExistingThread[];

    const thread = rows[0];
    if (!thread) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const payload = objectPayload(thread.payload);
    const payloadUserKey = typeof payload.userKey === "string" ? payload.userKey : "";
    const isOwner =
      (sessionUserId != null && thread.user_id === sessionUserId) ||
      (guestKey !== "" && (thread.guest_key === guestKey || payloadUserKey === guestKey));

    if (!isOwner) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    await sql`DELETE FROM consultation_entries WHERE parent_external_id = ${postId}`;
    await sql`DELETE FROM consultation_entries WHERE id = ${thread.id}`;

    return NextResponse.json({ ok: true, postId });
  } catch (error) {
    console.error("[Type Drift] consultation delete API failed", error);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }
}
