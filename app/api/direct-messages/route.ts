import { NextRequest, NextResponse } from "next/server";
import { db, readSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const userId = readSession(request);
  if (!userId) {
    return NextResponse.json({ authenticated: false, messages: [] }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const sql = db();
    // Authenticated inboxes are strictly scoped to the current user's database ID.
    // Guest-key messages are intentionally excluded from this endpoint.
    const rows = await sql`
      SELECT
        id, thread_id, sender_name, recipient_name, body, bottle_id,
        bottle_snippet, bottle_author, bottle_type, created_at,
        (read_at IS NOT NULL) AS read,
        (sender_user_id = ${userId}) AS is_mine,
        sender_profile, recipient_profile
      FROM direct_messages
      WHERE sender_user_id = ${userId} OR recipient_user_id = ${userId}
      ORDER BY created_at ASC
      LIMIT 500
    `;
    return NextResponse.json({ authenticated: true, userId, messages: rows }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[Type Drift authenticated DMs] GET failed", error);
    return NextResponse.json({ error: "direct_messages_read_failed", messages: [] }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
