import { NextRequest, NextResponse } from "next/server";
import { db, readSession } from "@/lib/server-auth";
import { INITIAL_CONSULTATION_POSTS } from "@/types/consultation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConsultationEntry = {
  id: number;
  external_id: string;
  parent_external_id: string | null;
  user_id: number | null;
  guest_key: string | null;
  payload: Record<string, unknown> | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { postId?: unknown; commentId?: unknown };
    const postId = typeof body.postId === "string" ? body.postId.trim() : "";
    const commentId = typeof body.commentId === "string" ? body.commentId.trim() : "";
    const actorUserId = readSession(request);
    const actorGuestKey = (request.headers.get("x-guest-key") || "").trim();

    if (!postId || !commentId) {
      return NextResponse.json({ ok: false, error: "missing_target" }, { status: 400 });
    }
    if (!actorUserId && !actorGuestKey) {
      return NextResponse.json({ ok: false, error: "missing_actor" }, { status: 400 });
    }

    const sql = db();
    const rows = await sql`
      SELECT id, external_id, parent_external_id, user_id, guest_key, payload
      FROM consultation_entries
      WHERE external_id = ${commentId}
        AND parent_external_id = ${postId}
        AND entry_type = 'reply'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    let target = rows[0] as ConsultationEntry | undefined;
    if (!target) {
      // Seed comments are initially rendered from the static demo thread. Materialize
      // the selected seed comment on first reaction so the normal DB reaction path works.
      const seedPost = INITIAL_CONSULTATION_POSTS.find((post) => post.id === postId);
      const seedComment = seedPost?.comments?.find((comment) => comment.id === commentId);
      if (seedComment) {
        const inserted = await sql`
          INSERT INTO consultation_entries
            (external_id, parent_external_id, entry_type, category, body, payload, guest_key, created_at, updated_at)
          VALUES (
            ${seedComment.id}, ${postId}, 'reply', NULL, ${seedComment.body},
            ${JSON.stringify(seedComment)}::jsonb, NULL, NOW(), NOW()
          )
          ON CONFLICT (external_id) DO NOTHING
          RETURNING id, external_id, parent_external_id, user_id, guest_key, payload
        `;
        const refreshed = inserted.length ? inserted : await sql`
          SELECT id, external_id, parent_external_id, user_id, guest_key, payload
          FROM consultation_entries
          WHERE external_id = ${commentId}
            AND parent_external_id = ${postId}
            AND entry_type = 'reply'
          ORDER BY created_at DESC
          LIMIT 1
        `;
        target = refreshed[0] as ConsultationEntry | undefined;
      }
    }
    if (!target) {
      return NextResponse.json({ ok: false, error: "comment_not_found" }, { status: 404 });
    }

    const payloadUserKey = typeof target.payload?.userKey === "string" ? target.payload.userKey : "";
    const recipientGuestKey = payloadUserKey || target.guest_key || null;
    const isSelfReaction = (actorUserId != null && target.user_id === actorUserId) ||
      (Boolean(actorGuestKey) && Boolean(recipientGuestKey) && actorGuestKey === recipientGuestKey);

    // Persist the count in the comment itself so refreshes and other devices see it.
    await sql`
      UPDATE consultation_entries
      SET payload = jsonb_set(
        COALESCE(payload::jsonb, '{}'::jsonb),
        '{reaction}',
        to_jsonb(COALESCE(NULLIF(payload::jsonb->>'reaction', '')::integer, 0) + 1)
      )::json,
      updated_at = NOW()
      WHERE id = ${target.id}
    `;

    const reactionId = `reaction-${commentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await sql`
      INSERT INTO consultation_entries
        (external_id, parent_external_id, entry_type, body, payload, user_id, guest_key, created_at, updated_at)
      VALUES (
        ${reactionId}, ${postId}, 'reply', 'reaction',
        ${JSON.stringify({ kind: "reaction", commentId })}::json,
        ${actorUserId}, ${actorUserId ? null : actorGuestKey}, NOW(), NOW()
      )
    `;

    let notified = false;
    if (!isSelfReaction) {
      const message = "自認相談室のコメントにリアクションが届きました。";
      if (target.user_id != null) {
        await sql`
          INSERT INTO notifications (user_id, guest_key, type, entity_id, message, created_at, updated_at)
          VALUES (${target.user_id}, NULL, 'consultation_reaction', ${postId}, ${message}, NOW(), NOW())
        `;
        notified = true;
      } else if (recipientGuestKey) {
        await sql`
          INSERT INTO notifications (user_id, guest_key, type, entity_id, message, created_at, updated_at)
          VALUES (NULL, ${recipientGuestKey}, 'consultation_reaction', ${postId}, ${message}, NOW(), NOW())
        `;
        notified = true;
      }
    }

    return NextResponse.json(
      { ok: true, notified, selfReaction: isSelfReaction },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[Type Drift] consultation reaction failed", error);
    return NextResponse.json({ ok: false, error: "reaction_failed" }, { status: 500 });
  }
}
