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

    // Repair the missing delivery path: copy existing NPC replies into the owner's inbox.
    // This uses the exact stored reply body and never generates a second AI response.
    const npcReplies = await sql`
      SELECT r.id AS reply_id, r.bottle_id, r.guest_key AS npc_key, r.body, r.created_at,
             b.guest_key AS bottle_guest_key, b.user_id AS bottle_user_id, b.body AS bottle_body,
             b.ai_character, b.mbti, b.socionics, b.enneagram, b.other_type
      FROM replies r
      JOIN bottles b ON b.id = r.bottle_id
      WHERE r.guest_key IN ('ai:darling', 'ai:lsi-worm')
        AND b.deleted_at IS NULL
        AND ((${userId}::int IS NOT NULL AND b.user_id = ${userId}::int)
          OR (${userId}::int IS NULL AND b.guest_key = ${guestKey}))
      ORDER BY r.created_at ASC
      LIMIT 300
    `;
    for (const reply of npcReplies as Array<Record<string, any>>) {
      const npcKey = String(reply.npc_key);
      const character = npcKey === "ai:darling" ? "ダーリンちゃん" : "LSI芋虫";
      const recipientKey = userId ? `user:${userId}` : guestKey;
      const threadId = `dm-pair-${[npcKey, recipientKey].sort().join("--")}`;
      const blocked = blockRows.some((block: any) =>
        String(block.thread_id) === threadId ||
        String(block.thread_id) === npcKey ||
        String(block.target_name || "") === character
      );
      if (blocked) continue;
      const exists = await sql`
        SELECT id FROM direct_messages
        WHERE sender_guest_key = ${npcKey}
          AND recipient_guest_key = ${recipientKey}
          AND bottle_id = ${Number(reply.bottle_id)}
          AND body = ${String(reply.body)}
        LIMIT 1
      `;
      if (exists.length) continue;
      const bottleType = String(reply.ai_character || [reply.socionics, reply.enneagram, reply.mbti, reply.other_type].filter(Boolean).join(" · ") || "ボトルへの返信");
      await sql`
        INSERT INTO direct_messages (
          sender_guest_key, recipient_guest_key, thread_id, sender_name, recipient_name, body,
          bottle_id, bottle_snippet, bottle_author, bottle_type, sender_user_id, recipient_user_id,
          sender_profile, recipient_profile, created_at, updated_at
        ) VALUES (
          ${npcKey}, ${recipientKey}, ${threadId}, ${character}, 'あなた', ${String(reply.body)},
          ${Number(reply.bottle_id)}, ${String(reply.bottle_body || "").slice(0, 500)}, ${character}, ${bottleType},
          NULL, ${userId}, NULL, NULL, ${reply.created_at}, NOW()
        )
      `;
    }

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
        // 解除時にDM履歴そのものは削除しない。過去の会話を保持したままブロックだけ解除する。
        await sql`DELETE FROM direct_message_blocks WHERE thread_id = ${threadId} AND ((owner_user_id = ${userId}::int AND ${userId}::int IS NOT NULL) OR (owner_guest_key = ${guestKey} AND ${userId}::int IS NULL))`;
      }
      return NextResponse.json({ ok: true, action: actionPayload.action }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (error) {
    console.error("[Type Drift DM blocks] request failed", error);
    return NextResponse.json({ error: "dm_block_action_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  // Persist the human's message to an NPC in the same canonical pair thread used by the NPC reply.
  try {
    const payload = await request.clone().json();
    if (payload?.npc_message === true) {
      if (!userId && !/^[0-9a-f-]{36}$/i.test(guestKey)) return NextResponse.json({ error: "invalid_guest_key" }, { status: 400 });
      const targetName = String(payload.target_name || "");
      const npcKey = /ダーリン|darling|🥺/i.test(targetName) ? "ai:darling" : /芋虫|worm|🐛/i.test(targetName) ? "ai:lsi-worm" : "";
      if (!npcKey) return NextResponse.json({ error: "unknown_ai_character" }, { status: 422 });
      const body = typeof payload.body === "string" ? payload.body.trim() : "";
      if (!body || body.length > 10000) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      const senderKey = userId ? `user:${userId}` : guestKey;
      const threadId = `dm-pair-${[npcKey, senderKey].sort().join("--")}`;
      const sql = db();
      const blocked = await sql`SELECT id FROM direct_message_blocks WHERE thread_id IN (${threadId}, ${npcKey}) AND ((owner_user_id = ${userId}::int AND ${userId}::int IS NOT NULL) OR (owner_guest_key = ${guestKey} AND ${userId}::int IS NULL)) LIMIT 1`;
      if (blocked.length) return NextResponse.json({ error: "blocked_recipient" }, { status: 403 });
      const inserted = await sql`
        INSERT INTO direct_messages (
          sender_guest_key, recipient_guest_key, thread_id, sender_name, recipient_name, body,
          bottle_id, bottle_snippet, bottle_author, bottle_type, sender_user_id, recipient_user_id,
          sender_profile, recipient_profile, created_at, updated_at
        ) VALUES (
          ${senderKey}, ${npcKey}, ${threadId}, ${String(payload.sender_name || "あなた").slice(0,120)}, ${targetName}, ${body},
          NULL, NULL, ${targetName}, ${targetName}, ${userId}, NULL,
          ${payload.sender_profile && typeof payload.sender_profile === "object" ? JSON.stringify(payload.sender_profile) : null}::json,
          NULL, NOW(), NOW()
        ) RETURNING id, thread_id, sender_name, recipient_name, body, created_at, (read_at IS NOT NULL) AS read
      `;
      return NextResponse.json({ ok: true, message: inserted[0] }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (error) {
    console.error("[Type Drift NPC DM message] POST failed", error);
    return NextResponse.json({ error: "npc_dm_message_save_failed" }, { status: 500 });
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
      // NPCも人間と同じく、受信者の正規IDとNPC IDのペアで会話を識別する。
      // 送信元のボトルIDで会話を分裂させない。
      const npcRecipientKey = userId ? `user:${userId}` : guestKey;
      // NPC is a stable conversation partner, even when its reply came from a different bottle.
      // Keep all replies from the same NPC to this recipient in one DM thread.
      const threadId = `dm-pair-${[npcKey, npcRecipientKey].sort().join("--")}`;
      const recipientName = typeof payload.recipient_name === "string" ? payload.recipient_name.slice(0, 120) : "あなた";
      const recipientGuestKey = userId ? `user:${userId}` : guestKey;
      const sql = db();
      await ensureDmBlockTable(sql);
      // NPCの会話IDはボトルとNPC識別子・受信者識別子から決める。
      // 別の人が同じボトルに返信しても会話が混ざらず、同じ相手との返信は同じトークにまとまる。
      // ブロック中の相手にはNPC返信も保存しない。スレッドIDに加え、NPC識別子と表示名でも照合する。
      const blockedNpc = await sql`SELECT id FROM direct_message_blocks
        WHERE ((owner_user_id = ${userId}::int AND ${userId}::int IS NOT NULL)
          OR (owner_guest_key = ${guestKey} AND ${userId}::int IS NULL))
          AND (thread_id IN (${threadId}, ${npcKey}) OR target_name = ${character})
        LIMIT 1`;
      if (blockedNpc.length) return NextResponse.json({ error: "blocked_recipient" }, { status: 403, headers: { "Cache-Control": "no-store" } });
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
      // Bottle replies may be synchronized repeatedly when the owner opens the thread.
      // Reuse the existing DM row for the same NPC + recipient + bottle + exact reply body.
      // This makes syncing idempotent and prevents duplicate DM entries.
      const existingNpcReply = bottleId ? await sql`
        SELECT id, thread_id, sender_name, recipient_name, body, bottle_id, bottle_snippet, bottle_author,
               bottle_type, created_at, (read_at IS NOT NULL) AS read, false AS is_mine,
               sender_profile, recipient_profile
        FROM direct_messages
        WHERE sender_guest_key = ${npcKey}
          AND bottle_id = ${bottleId}
          AND body = ${body}
          AND ((${userId}::int IS NOT NULL AND recipient_user_id = ${userId}::int)
            OR (${userId}::int IS NULL AND recipient_guest_key = ${guestKey}))
        ORDER BY created_at ASC
        LIMIT 1
      ` : [];
      if (existingNpcReply.length) {
        return NextResponse.json({ ok: true, existing: true, message: existingNpcReply[0] }, {
          headers: { "Cache-Control": "no-store" },
        });
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
      // recipient_session_key can belong to a signed-in profile too. Resolve its account ID
      // regardless of user_id, otherwise A→B and B→A receive different participant keys.
      const profileRows = await sql`SELECT user_id, guest_key FROM profiles WHERE guest_key = ${recipientSessionKey} LIMIT 1`;
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

    // 会話IDは送信方向ではなく、参加者2人の正規化した組み合わせで決める。
    // A→B と B→A が同じトークになり、相手が違えば別スレッドになる。
    const senderIdentityKey = `user:${userId}`;
    const recipientIdentityKey = recipientUserId != null ? `user:${recipientUserId}` : recipientGuestKey;
    const participantPair = [senderIdentityKey, recipientIdentityKey].sort().join("--");
    const canonicalPairThreadId = `dm-pair-${participantPair}`;
    // ボトル返信は「ボトルID × 参加者ペア」で識別する。
    // 同じボトル内の同じ2人は送信方向を問わず同じ会話、別の相手・別のボトルは別会話。
    const finalThreadId = bottleId
      ? `bottle-${bottleId}-pair-${participantPair}`
      : canonicalPairThreadId;
    const recipientBlocked = await sql`SELECT id FROM direct_message_blocks
      WHERE thread_id IN (${finalThreadId}, ${senderIdentityKey})
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
        ${`user:${userId}`}, ${recipientGuestKey}, ${finalThreadId}, ${senderName}, ${recipientName}, ${body},
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
