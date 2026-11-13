import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db, readSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureDmBlockTable(sql: ReturnType<typeof db>) {
  await sql`CREATE TABLE IF NOT EXISTS direct_message_blocks (
    id BIGSERIAL PRIMARY KEY,
    owner_user_id INTEGER NULL,
    owner_guest_key TEXT NULL,
    thread_id TEXT NOT NULL,
    target_name TEXT NOT NULL DEFAULT '相手',
    target_emoji TEXT NOT NULL DEFAULT '◌',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (owner_user_id IS NOT NULL OR owner_guest_key IS NOT NULL)
  )`;
}

export async function GET(request: NextRequest) {
  const userId = readSession(request);
  const guestKey = request.headers.get("x-guest-key")?.trim().slice(0, 200) || "";
  if (!userId && !/^[0-9a-f-]{36}$/i.test(guestKey)) {
    return NextResponse.json({ authenticated: false, messages: [] }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const sql = db();
    await ensureDmBlockTable(sql);
    const blockRows = await sql`SELECT thread_id, target_name, target_emoji, created_at FROM direct_message_blocks WHERE (owner_user_id = ${userId}::int AND ${userId}::int IS NOT NULL) OR (owner_guest_key = ${guestKey} AND ${userId}::int IS NULL)`;
    // Signed-in inboxes use the account ID; guest inboxes use their own canonical guest key.
    const rows = await sql`
      SELECT
        id, thread_id, sender_guest_key, recipient_guest_key, sender_user_id, recipient_user_id, sender_name, recipient_name, body, bottle_id,
        bottle_snippet, bottle_author, bottle_type, created_at,
        (read_at IS NOT NULL) AS read,
        (CASE WHEN ${userId}::int IS NOT NULL THEN sender_user_id = ${userId}::int ELSE sender_guest_key = ${guestKey} END) AS is_mine,
        sender_profile, recipient_profile
      FROM direct_messages
      WHERE (${userId}::int IS NOT NULL AND (sender_user_id = ${userId}::int OR recipient_user_id = ${userId}::int))
         OR (${userId}::int IS NULL AND (sender_guest_key = ${guestKey} OR recipient_guest_key = ${guestKey}))
      ORDER BY created_at ASC
      LIMIT 500
    `;
    return NextResponse.json({ authenticated: true, userId, messages: rows, blocked_threads: blockRows }, {
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

export async function POST(request: NextRequest) {
  const userId = readSession(request);
  const guestKey = request.headers.get("x-guest-key")?.trim().slice(0, 200) || "";

  // Block-list changes are persisted server-side for this account/guest identity.
  try {
    const actionPayload = await request.clone().json();
    if (actionPayload?.action === "block_thread" || actionPayload?.action === "unblock_thread") {
      if (!userId && !/^[0-9a-f-]{36}$/i.test(guestKey)) return NextResponse.json({ error: "invalid_guest_key" }, { status: 400 });
      const threadId = typeof actionPayload.thread_id === "string" ? actionPayload.thread_id.slice(0, 200) : "";
      if (!threadId) return NextResponse.json({ error: "invalid_thread_id" }, { status: 400 });
      const sql = db();
      await ensureDmBlockTable(sql);
      if (actionPayload.action === "block_thread") {
        const existing = await sql`SELECT id FROM direct_message_blocks WHERE thread_id = ${threadId} AND ((owner_user_id = ${userId}::int AND ${userId}::int IS NOT NULL) OR (owner_guest_key = ${guestKey} AND ${userId}::int IS NULL)) LIMIT 1`;
        if (!existing.length) {
          await sql`INSERT INTO direct_message_blocks (owner_user_id, owner_guest_key, thread_id, target_name, target_emoji) VALUES (${userId}, ${userId ? null : guestKey}, ${threadId}, ${String(actionPayload.target_name || "相手").slice(0, 120)}, ${String(actionPayload.target_emoji || "◌").slice(0, 20)})`;
        }
      } else {
        await sql`DELETE FROM direct_message_blocks WHERE thread_id = ${threadId} AND ((owner_user_id = ${userId}::int AND ${userId}::int IS NOT NULL) OR (owner_guest_key = ${guestKey} AND ${userId}::int IS NULL))`;
      }
      return NextResponse.json({ ok: true, action: actionPayload.action }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (error) {
    console.error("[Type Drift DM blocks] request failed", error);
    return NextResponse.json({ error: "dm_block_action_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  // NPC replies use dedicated AI identities for both guest and signed-in recipients.
  // Unlike human messages, NPC reply persistence does not require the NPC to own the bottle.
  try {
    const payload = await request.clone().json();
    if (payload?.ai_reply === true) {
      const character = String(payload.ai_character || "");
      const npcKey = character.includes("ダーリン") ? "ai:darling" : character.includes("芋虫") ? "ai:lsi-worm" : "";
      if (!npcKey) return NextResponse.json({ error: "unknown_ai_character" }, { status: 422 });
      if (!userId && !/^[0-9a-f-]{36}$/i.test(guestKey)) return NextResponse.json({ error: "invalid_guest_key" }, { status: 400 });
      const body = typeof payload.body === "string" ? payload.body.trim() : "";
      if (!body || body.length > 10000) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      let bottleId: number | null = Number.isFinite(Number(payload.bottle_id)) && payload.bottle_id != null ? Number(payload.bottle_id) : null;
      const threadId = typeof payload.thread_id === "string" ? payload.thread_id.slice(0, 200) : `dm-${randomUUID()}`;
      const recipientName = typeof payload.recipient_name === "string" ? payload.recipient_name.slice(0, 120) : "あなた";
      const recipientGuestKey = guestKey || (userId ? `user:${userId}` : "");
      const sql = db();
      await ensureDmBlockTable(sql);
      let bottleSnippet: string | null = null;
      let bottleAuthor: string | null = null;
      let bottleType: string | null = null;
      if (bottleId) {
        const bottleRows = await sql`SELECT body, ai_character, mbti, socionics, enneagram FROM bottles WHERE id = ${bottleId} AND deleted_at IS NULL LIMIT 1`;
        const bottle = bottleRows[0] as { body?: string; ai_character?: string; mbti?: string; socionics?: string; enneagram?: string } | undefined;
        // A deleted/hidden source bottle must not prevent an already-generated AI reply from being saved.
        if (bottle) {
          bottleSnippet = String(bottle.body || "").slice(0, 500);
          bottleAuthor = character;
          bottleType = String(bottle.ai_character || [bottle.socionics, bottle.enneagram, bottle.mbti].filter(Boolean).join(" · ") || "ボトルへの返信");
        } else {
          // Keep the conversation alive even if its originating bottle was deleted after the DM opened.
          // Clear the stale ID to avoid a dangling foreign-key reference.
          bottleId = null;
        }
      }
      const inserted = await sql`
        INSERT INTO direct_messages (
          sender_guest_key, recipient_guest_key, thread_id, sender_name, recipient_name, body,
          bottle_id, bottle_snippet, bottle_author, bottle_type, sender_user_id, recipient_user_id,
          sender_profile, recipient_profile, created_at, updated_at
        ) VALUES (
          ${npcKey}, ${recipientGuestKey}, ${threadId}, ${character}, ${recipientName}, ${body},
          ${bottleId}, ${bottleSnippet}, ${bottleAuthor}, ${bottleType}, NULL, ${userId},
          NULL, ${payload.recipient_profile && typeof payload.recipient_profile === "object" ? JSON.stringify(payload.recipient_profile) : null}::json, NOW(), NOW()
        ) RETURNING id, thread_id, sender_name, recipient_name, body, bottle_id, bottle_snippet, bottle_author, bottle_type, created_at, (read_at IS NOT NULL) AS read, false AS is_mine, sender_profile, recipient_profile
      `;
      return NextResponse.json({ ok: true, message: inserted[0] }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (error) {
    console.error("[Type Drift NPC DM save] POST failed", error);
    return NextResponse.json({ error: "ai_reply_save_failed" }, { status: 500 });
  }

  // Normal human messages require a signed-in session; NPC replies were handled above.
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }


  try {
    const payload = await request.json();
    const body = typeof payload?.body === "string" ? payload.body.trim() : "";
    if (!body || body.length > 10000) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const bottleId = Number.isFinite(Number(payload?.bottle_id)) && payload?.bottle_id != null
      ? Number(payload.bottle_id) : null;
    const recipientSessionKey = typeof payload?.recipient_session_key === "string"
      ? payload.recipient_session_key.slice(0, 200) : "";
    const requestedThreadId = typeof payload?.thread_id === "string"
      ? payload.thread_id.slice(0, 200) : "";
    const threadId = requestedThreadId || (bottleId ? `bottle-${bottleId}-user-${userId}` : recipientSessionKey || `dm-${randomUUID()}`);
    const senderName = typeof payload?.sender_name === "string" ? payload.sender_name.slice(0, 120) : "匿名の誰か";
    const recipientName = typeof payload?.recipient_name === "string" ? payload.recipient_name.slice(0, 120) : "匿名の誰か";
    const senderProfile = payload?.sender_profile && typeof payload.sender_profile === "object" ? JSON.stringify(payload.sender_profile) : null;
    const recipientProfile = payload?.recipient_profile && typeof payload.recipient_profile === "object" ? JSON.stringify(payload.recipient_profile) : null;

    const sql = db();
    await ensureDmBlockTable(sql);
    let recipientUserId: number | null = null;
    let recipientGuestKey = recipientSessionKey || `thread:${threadId}`;
    let bottleSnippet: string | null = null;
    let bottleAuthor: string | null = null;
    let bottleType: string | null = null;

    if (bottleId) {
      const bottleRows = await sql`SELECT user_id, guest_key, body, mbti, socionics, enneagram, other_type, ai_character FROM bottles WHERE id = ${bottleId} AND deleted_at IS NULL LIMIT 1`;
      const bottle = bottleRows[0] as { user_id?: number | null; guest_key?: string | null; body?: string; mbti?: string; socionics?: string; enneagram?: string; other_type?: string; ai_character?: string } | undefined;
      if (!bottle) return NextResponse.json({ error: "bottle_not_found" }, { status: 404 });
      recipientUserId = bottle.user_id == null ? null : Number(bottle.user_id);
      recipientGuestKey = bottle.guest_key || (recipientUserId ? `user:${recipientUserId}` : recipientGuestKey);
      bottleSnippet = String(bottle.body || "").slice(0, 500);
      bottleAuthor = recipientName;
      bottleType = String(bottle.ai_character || [bottle.socionics, bottle.enneagram, bottle.mbti].filter(Boolean).join(" · ") || "ボトルへの返信");
    } else if (recipientSessionKey) {
      const profileRows = await sql`SELECT user_id, guest_key FROM profiles WHERE guest_key = ${recipientSessionKey} AND user_id IS NULL LIMIT 1`;
      const profile = profileRows[0] as { user_id?: number | null; guest_key?: string | null } | undefined;
      if (profile?.user_id != null) recipientUserId = Number(profile.user_id);
      if (profile?.guest_key) recipientGuestKey = profile.guest_key;
    } else {
      const prior = await sql`
        SELECT CASE WHEN sender_user_id = ${userId} THEN recipient_user_id ELSE sender_user_id END AS other_user_id,
               CASE WHEN sender_user_id = ${userId} THEN recipient_guest_key ELSE sender_guest_key END AS other_guest_key
        FROM direct_messages
        WHERE thread_id = ${threadId}
          AND (sender_user_id = ${userId} OR recipient_user_id = ${userId})
        ORDER BY created_at DESC LIMIT 1
      `;
      if (prior[0]) {
        const row = prior[0] as { other_user_id?: number | null; other_guest_key?: string | null };
        recipientUserId = row.other_user_id == null ? null : Number(row.other_user_id);
        recipientGuestKey = row.other_guest_key || recipientGuestKey;
      }
    }

    const recipientBlocked = await sql`SELECT id FROM direct_message_blocks
      WHERE thread_id = ${threadId}
        AND ((owner_user_id = ${recipientUserId}::int AND ${recipientUserId}::int IS NOT NULL)
          OR (owner_guest_key = ${recipientGuestKey} AND ${recipientUserId}::int IS NULL))
      LIMIT 1`;
    if (recipientBlocked.length) return NextResponse.json({ error: "recipient_blocked_this_thread" }, { status: 403, headers: { "Cache-Control": "no-store" } });

    const inserted = await sql`
      INSERT INTO direct_messages (
        sender_guest_key, recipient_guest_key, thread_id, sender_name, recipient_name, body,
        bottle_id, bottle_snippet, bottle_author, bottle_type, sender_user_id, recipient_user_id,
        sender_profile, recipient_profile, created_at, updated_at
      ) VALUES (
        ${`user:${userId}`}, ${recipientGuestKey}, ${threadId}, ${senderName}, ${recipientName}, ${body},
        ${bottleId}, ${bottleSnippet}, ${bottleAuthor}, ${bottleType}, ${userId}, ${recipientUserId},
        ${senderProfile}::json, ${recipientProfile}::json, NOW(), NOW()
      )
      RETURNING id, thread_id, sender_name, recipient_name, body, bottle_id, bottle_snippet,
                bottle_author, bottle_type, created_at, (read_at IS NOT NULL) AS read,
                (sender_user_id = ${userId}) AS is_mine, sender_profile, recipient_profile
    `;
    return NextResponse.json({ ok: true, message: inserted[0] }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[Type Drift authenticated DMs] POST failed", error);
    return NextResponse.json({ error: "direct_message_send_failed" }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
