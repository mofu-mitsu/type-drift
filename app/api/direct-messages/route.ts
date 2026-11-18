import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db, readSession } from "@/lib/server-auth";
import { clean, ensureDmReactionsTable, resolveIdentity } from "@/lib/fallback-core";

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
  // Node (Vercel) fallback: mirrors the Worker GET /api/direct-messages
  // (keySet merge, profile resolution, NPC backfill, reaction totals),
  // plus blocked_threads for the client's block sync.
  const userId = readSession(request);
  const guestKey = request.headers.get("x-guest-key")?.trim().slice(0, 200) || "";
  try {
    const sql = db();
    const identity = await resolveIdentity(request);
    const key = identity.key;
    const keySet = identity.keySet;
    const accountKey = identity.accountKey;
    if (!key) {
      return NextResponse.json({ messages: [] }, { headers: { "Cache-Control": "no-store" } });
    }
    await ensureDmBlockTable(sql);
    const blockRows = await sql`SELECT thread_id, target_name, target_emoji, created_at FROM direct_message_blocks WHERE (owner_user_id = ${userId}::int AND ${userId}::int IS NOT NULL) OR (owner_guest_key = ${guestKey} AND ${userId}::int IS NULL)`;

    // Backfill NPC replies on the user's own bottles into their DM threads.
    const existingBottleReplies = await sql`
      SELECT r.bottle_id, r.guest_key AS npc_key, r.body, r.created_at AS reply_created_at,
             b.body AS bottle_body, b.mbti, b.socionics, b.enneagram, b.other_type, b.ai_character
      FROM replies r
      JOIN bottles b ON b.id = r.bottle_id
      WHERE b.guest_key = ${key}
        AND r.guest_key IN ('ai:darling','ai:lsi-worm')
        AND b.deleted_at IS NULL
        AND (b.allow_replies IS NULL OR b.allow_replies = TRUE)
      ORDER BY r.created_at ASC
      LIMIT 300
    `;
    for (const reply of existingBottleReplies as Array<Record<string, any>>) {
      const npcKey = String(reply.npc_key);
      const npcName = npcKey === "ai:darling" ? "ダーリンちゃん" : "LSI芋虫";
      const bottleId = Number(reply.bottle_id);
      const participants = [npcKey, key].sort();
      const threadId = `bottle-${bottleId}-npc-pair-${participants.join("--")}`;
      const blocked = (blockRows as Array<Record<string, any>>).some((block) =>
        String(block.thread_id) === threadId ||
        String(block.thread_id) === npcKey ||
        String(block.target_name || "") === npcName
      );
      if (blocked) continue;
      const exists = await sql`SELECT id FROM direct_messages
        WHERE sender_guest_key=${npcKey} AND recipient_guest_key=${key}
          AND bottle_id=${bottleId} AND body=${reply.body}
        LIMIT 1`;
      if (exists.length) continue;
      const recipientProfileRows = await sql`SELECT nickname,mbti,socionics,enneagram,other_type,bio,links,profile_image_url FROM profiles WHERE guest_key=${key} LIMIT 1`;
      const senderProfile = JSON.stringify({
        nickname: npcName,
        mbti: npcKey === "ai:darling" ? "INTP" : "INTJ",
        socionics: npcKey === "ai:darling" ? "ILI" : "LSI",
        enneagram: npcKey === "ai:darling" ? "5w4" : "5w6"
      });
      const recipientProfile = JSON.stringify(recipientProfileRows[0] || {});
      const bottleType = String(reply.ai_character || [reply.mbti,reply.socionics,reply.enneagram,reply.other_type].filter(Boolean).join(" · ") || "ボトルへの返信");
      await sql`INSERT INTO direct_messages
        (sender_guest_key,recipient_guest_key,thread_id,sender_name,recipient_name,body,bottle_id,bottle_snippet,bottle_author,bottle_type,sender_profile,recipient_profile,created_at,updated_at)
        VALUES (${npcKey},${key},${threadId},${npcName},${clean((recipientProfileRows[0] || {}).nickname,24) || "あなた"},${reply.body},${bottleId},${String(reply.bottle_body || "").slice(0,2500)},${npcName},${bottleType},${senderProfile}::jsonb,${recipientProfile}::jsonb,${reply.reply_created_at},NOW())`;
    }

    await ensureDmReactionsTable();
    const rowById = new Map<unknown, Record<string, any>>();
    for (const k of keySet) {
      const part = await sql`SELECT dm.*, (SELECT COALESCE(SUM(dmr.level),0)::int FROM direct_message_reactions dmr WHERE dmr.message_id=dm.id) AS reaction_total, COALESCE((SELECT dmr.level FROM direct_message_reactions dmr WHERE dmr.message_id=dm.id AND dmr.guest_key=${k}),0)::int AS my_reaction_level, (SELECT r.guest_key FROM replies r WHERE r.bottle_id = dm.bottle_id AND r.body = dm.body AND r.guest_key IN ('ai:darling','ai:lsi-worm') ORDER BY r.created_at DESC LIMIT 1) AS matched_npc_key, p.nickname AS sender_nickname, p.mbti AS sender_mbti, p.socionics AS sender_socionics, p.enneagram AS sender_enneagram, p.other_type AS sender_other_type, p.bio AS sender_bio, p.links AS sender_links, p.profile_image_url AS sender_image, rp.nickname AS recipient_nickname, rp.mbti AS recipient_mbti, rp.socionics AS recipient_socionics, rp.enneagram AS recipient_enneagram, rp.other_type AS recipient_other_type, rp.bio AS recipient_bio, rp.links AS recipient_links, rp.profile_image_url AS recipient_image, p.user_id AS sender_user_id, rp.user_id AS recipient_user_id FROM direct_messages dm LEFT JOIN profiles p ON (p.guest_key = dm.sender_guest_key OR ('user:' || p.user_id::text) = dm.sender_guest_key) LEFT JOIN profiles rp ON (rp.guest_key = dm.recipient_guest_key OR ('user:' || rp.user_id::text) = dm.recipient_guest_key) WHERE dm.sender_guest_key=${k} OR dm.recipient_guest_key=${k} ORDER BY dm.created_at DESC LIMIT 200`;
      for (const row of part as Array<Record<string, any>>) {
        const prev = rowById.get(row.id);
        if (!prev || Number(row.my_reaction_level || 0) > Number(prev.my_reaction_level || 0)) rowById.set(row.id, row);
      }
    }
    const rows = [...rowById.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 200);
    const messages = rows.reverse().map((row) => {
      const senderProfile = row.sender_profile || {nickname:row.sender_nickname || row.sender_name || "",mbti:row.sender_mbti || "",socionics:row.sender_socionics || "",enneagram:row.sender_enneagram || "",other_type:row.sender_other_type || "",bio:row.sender_bio || "",links:row.sender_links || [],profile_image_url:row.sender_image || ""};
      const recipientProfile = row.recipient_profile || {nickname:row.recipient_nickname || row.recipient_name || "",mbti:row.recipient_mbti || "",socionics:row.recipient_socionics || "",enneagram:row.recipient_enneagram || "",other_type:row.recipient_other_type || "",bio:row.recipient_bio || "",links:row.recipient_links || [],profile_image_url:row.recipient_image || ""};
      const asUserId = (v: unknown) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) ? n : null; };
      const senderUserId = keySet.includes(String(row.sender_guest_key || "")) ? (asUserId(accountKey) ?? asUserId(row.sender_user_id)) : asUserId(row.sender_user_id);
      const recipientUserId = keySet.includes(String(row.recipient_guest_key || "")) ? (asUserId(accountKey) ?? asUserId(row.recipient_user_id)) : asUserId(row.recipient_user_id);
      const participants = [String(row.sender_guest_key || ""), String(row.recipient_guest_key || "")].filter(Boolean).sort();
      const isNpcMessage = String(row.sender_guest_key || "").startsWith("ai:") || String(row.recipient_guest_key || "").startsWith("ai:");
      const canonicalThreadId = isNpcMessage && participants.length === 2
        ? (row.bottle_id ? `bottle-${row.bottle_id}-npc-pair-${participants.join("--")}` : "dm-pair-" + participants.join("--"))
        : row.thread_id;
      return {id:row.id,thread_id:canonicalThreadId,matched_npc_key:row.matched_npc_key || null,sender_guest_key:row.sender_guest_key || "",recipient_guest_key:row.recipient_guest_key || "",sender_name:row.sender_name,recipient_name:row.recipient_name,body:row.body,bottle_id:row.bottle_id,bottle_snippet:row.bottle_snippet,bottle_author:row.bottle_author,bottle_type:row.bottle_type,created_at:row.created_at,sender_profile:senderProfile,recipient_profile:recipientProfile,sender_user_id:senderUserId,recipient_user_id:recipientUserId,sender_identity:{mbti:senderProfile.mbti || "",socionics:senderProfile.socionics || "",enneagram:senderProfile.enneagram || "",other_type:senderProfile.other_type || senderProfile.otherType || ""},is_mine:keySet.includes(String(row.sender_guest_key || "")),read:Boolean(row.read_at),reaction_total:Number(row.reaction_total || 0),my_reaction_level:Number(row.my_reaction_level || 0)};
    });
    return NextResponse.json({ authenticated: Boolean(accountKey), userId: accountKey ? Number(accountKey) : null, messages, blocked_threads: blockRows }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[Type Drift fallback] GET /api/direct-messages failed", error);
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
      const bottleId = Number.isFinite(Number(payload.bottle_id)) && payload.bottle_id != null ? Number(payload.bottle_id) : null;
      const bottleMode = payload.conversation_mode === "bottle" && bottleId != null;
      const participantPair = [npcKey, senderKey].sort().join("--");
      const threadId = bottleMode ? `bottle-${bottleId}-npc-pair-${participantPair}` : `dm-pair-${participantPair}`;
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
          ${bottleMode ? bottleId : null}, ${typeof payload.bottle_snippet === "string" ? payload.bottle_snippet.slice(0,500) : null}, ${targetName}, ${targetName}, ${userId}, NULL,
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
      const bottleMode = payload.conversation_mode === "bottle" && bottleId != null;
      const npcRecipientKey = userId ? `user:${userId}` : guestKey;
      const participantPair = [npcKey, npcRecipientKey].sort().join("--");
      // Plaza NPC chats and bottle-originated chats are separate namespaces.
      const threadId = bottleMode ? `bottle-${bottleId}-npc-pair-${participantPair}` : `dm-pair-${participantPair}`;
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
          AND recipient_guest_key = ${recipientGuestKey}
          AND thread_id = ${threadId}
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

  // Generic sends mirror the Worker's POST /api/direct-messages: guest-key
  // based thread resolution (stored thread, bottle + participation, pair-style
  // IDs, legacy dm- IDs, presence session keys), identity fields on the
  // response, and a notification for the recipient.
  try {
    const sql = db();
    const identity = await resolveIdentity(request);
    const key = identity.key;
    const keySet = identity.keySet;
    const accountKey = identity.accountKey;
    if (!key) {
      return NextResponse.json({ error: "missing_guest_key" }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    const b = (await request.json().catch(() => ({}))) as Record<string, any>;
    const text = clean(b.body, 5000);
    if (!text) {
      return NextResponse.json({ message: "body is required" }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    let recipientKey = "";
    let threadId = "";
    let senderName = clean(b.sender_name, 24) || "匿名の誰か";
    let recipientName = clean(b.recipient_name, 24) || "匿名の誰か";
    let context: any = null;
    let contextIsSender = true;
    let bottleId: number | null = null;
    if (b.bottle_id || b.thread_id) {
      bottleId = b.bottle_id ? Number(b.bottle_id) : null;
      const passedThread = String(b.thread_id || "");
      threadId = bottleId ? ((passedThread.startsWith("bottle-" + bottleId + "-pair-") || passedThread.startsWith("bottle-" + bottleId + "-npc-pair-")) ? clean(passedThread, 240) : "bottle-" + bottleId) : clean(passedThread, 240);
      if (!threadId) return NextResponse.json({ message: "thread_id is required" }, { status: 422, headers: { "Cache-Control": "no-store" } });
      let lastRows: Array<Record<string, any>> = [];
      for (const k of keySet) {
        lastRows = (await sql`SELECT * FROM direct_messages WHERE thread_id=${threadId} AND (sender_guest_key=${k} OR recipient_guest_key=${k}) ORDER BY created_at DESC LIMIT 1`) as Array<Record<string, any>>;
        if (lastRows.length) break;
      }
      context = lastRows[0] || null;
      if (!context && bottleId) {
        const wantNpc = String(b.thread_id || "").includes("npc-pair");
        const anyRowMap = new Map<unknown, Record<string, any>>();
        for (const k of keySet) {
          const partRows = (await sql`SELECT * FROM direct_messages WHERE bottle_id=${bottleId} AND (sender_guest_key=${k} OR recipient_guest_key=${k}) ORDER BY created_at DESC LIMIT 20`) as Array<Record<string, any>>;
          for (const row of partRows) if (!anyRowMap.has(row.id)) anyRowMap.set(row.id, row);
        }
        const anyRows = [...anyRowMap.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const picked = anyRows.find((row) => {
          const other = keySet.includes(String(row.sender_guest_key || "")) ? row.recipient_guest_key : row.sender_guest_key;
          return wantNpc ? String(other || "").startsWith("ai:") : !String(other || "").startsWith("ai:");
        }) || anyRows[0];
        if (picked) { context = picked; threadId = String(picked.thread_id || threadId); }
      }
      if (!context && String(b.thread_id || "").includes("ai:")) {
        const npcHit = String(b.thread_id || "").match(/ai:(darling|lsi-worm)/);
        if (npcHit) {
          const npcK = "ai:" + npcHit[1];
          let npcRows: Array<Record<string, any>> = [];
          for (const k of keySet) {
            npcRows = (await sql`SELECT * FROM direct_messages WHERE ((sender_guest_key=${npcK} AND recipient_guest_key=${k}) OR (sender_guest_key=${k} AND recipient_guest_key=${npcK})) ORDER BY created_at DESC LIMIT 1`) as Array<Record<string, any>>;
            if (npcRows.length) break;
          }
          if (npcRows[0]) { context = npcRows[0]; threadId = String(npcRows[0].thread_id || threadId); bottleId = bottleId || (npcRows[0].bottle_id ? Number(npcRows[0].bottle_id) : null); }
        }
      }
      if (context) {
        const currentIsSender = keySet.includes(String(context.sender_guest_key || ""));
        contextIsSender = currentIsSender;
        recipientKey = currentIsSender ? context.recipient_guest_key : context.sender_guest_key;
        senderName = currentIsSender ? context.sender_name : context.recipient_name;
        recipientName = currentIsSender ? context.recipient_name : context.sender_name;
        bottleId = context.bottle_id ? Number(context.bottle_id) : bottleId;
      } else if (bottleId) {
        const ownerRows = (await sql`SELECT guest_key,body,mbti,socionics,enneagram,other_type,is_ai FROM bottles WHERE id=${bottleId} AND deleted_at IS NULL LIMIT 1`) as Array<Record<string, any>>;
        const owner = ownerRows[0];
        if (!owner?.guest_key) return NextResponse.json({ message: "bottle owner not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
        if (String(owner.guest_key) === key) return NextResponse.json({ message: "cannot message yourself" }, { status: 422, headers: { "Cache-Control": "no-store" } });
        if (owner.is_ai) return NextResponse.json({ message: "AI bottle owners are not available for server DM" }, { status: 422, headers: { "Cache-Control": "no-store" } });
        recipientKey = String(owner.guest_key);
        const ownerType = [owner.mbti, owner.socionics, owner.enneagram, owner.other_type].filter(Boolean).join(" · ");
        const ownerProfileRows = (await sql`SELECT nickname,mbti,socionics,enneagram,other_type,bio,links,profile_image_url FROM profiles WHERE guest_key=${owner.guest_key} LIMIT 1`) as Array<Record<string, any>>;
        const savedOwnerProfile = ownerProfileRows[0] || {};
        context = {
          bottle_snippet: owner.body,
          bottle_author: `匿名の${owner.mbti || owner.socionics || "ボトル主"}`,
          bottle_type: ownerType,
          recipient_profile: {
            ...savedOwnerProfile,
            mbti: owner.mbti || savedOwnerProfile.mbti || "",
            socionics: owner.socionics || savedOwnerProfile.socionics || "",
            enneagram: owner.enneagram || savedOwnerProfile.enneagram || "",
            other_type: owner.other_type || savedOwnerProfile.other_type || "",
          },
        };
        const pairThreadId = `bottle-${bottleId}-pair-${[key, recipientKey].sort().join("--")}`;
        const pairRows = (await sql`SELECT thread_id, bottle_snippet, bottle_author, bottle_type, recipient_profile FROM direct_messages WHERE thread_id=${pairThreadId} ORDER BY created_at DESC LIMIT 1`) as Array<Record<string, any>>;
        if (pairRows[0]) {
          threadId = pairThreadId;
          context = { bottle_snippet: pairRows[0].bottle_snippet, bottle_author: pairRows[0].bottle_author, bottle_type: pairRows[0].bottle_type, recipient_profile: pairRows[0].recipient_profile || context.recipient_profile };
        }
      } else if (threadId.includes("-pair-")) {
        const pairPart = threadId.slice(threadId.indexOf("-pair-") + 6);
        const parts = pairPart.split("--").filter(Boolean);
        const mine = (p: string) => keySet.includes(p) || (accountKey != null && p === `user:${accountKey}`);
        const other = parts.find((p) => !mine(p));
        if (!other) return NextResponse.json({ message: "thread not found or forbidden" }, { status: 404, headers: { "Cache-Control": "no-store" } });
        let candidates = [other];
        if (other.startsWith("user:")) {
          const uid = other.slice(5);
          const candProfile = (await sql`SELECT guest_key FROM profiles WHERE user_id::text = ${uid} AND guest_key IS NOT NULL`) as Array<Record<string, any>>;
          let candLink: Array<Record<string, any>> = [];
          try { candLink = (await sql`SELECT guest_key FROM profile_guest_keys WHERE user_id = ${uid}`) as Array<Record<string, any>>; } catch { /* link table optional */ }
          candidates = [...candProfile, ...candLink].map((r) => String(r.guest_key || "")).filter(Boolean);
          if (!candidates.length) return NextResponse.json({ message: "thread not found or forbidden" }, { status: 404, headers: { "Cache-Control": "no-store" } });
        }
        let found: Record<string, any> | null = null;
        for (const cand of candidates) {
          for (const k of keySet) {
            const rows = (await sql`SELECT * FROM direct_messages WHERE ((sender_guest_key=${cand} AND recipient_guest_key=${k}) OR (sender_guest_key=${k} AND recipient_guest_key=${cand})) ORDER BY created_at DESC LIMIT 1`) as Array<Record<string, any>>;
            if (rows.length) { found = rows[0]; break; }
          }
          if (found) break;
        }
        if (found) {
          context = found;
          const currentIsSender = keySet.includes(String(found.sender_guest_key || ""));
          contextIsSender = currentIsSender;
          recipientKey = currentIsSender ? found.recipient_guest_key : found.sender_guest_key;
          senderName = currentIsSender ? found.sender_name : found.recipient_name;
          recipientName = currentIsSender ? found.recipient_name : found.sender_name;
          threadId = String(found.thread_id || threadId);
          bottleId = found.bottle_id ? Number(found.bottle_id) : bottleId;
        } else {
          recipientKey = candidates[0];
          if (!recipientKey || recipientKey === key) return NextResponse.json({ message: "thread not found or forbidden" }, { status: 404, headers: { "Cache-Control": "no-store" } });
        }
      } else if (threadId.startsWith("dm-")) {
        for (const k of keySet) {
          const prefix = `dm-${k}-`;
          const suffix = `-${k}`;
          if (threadId.startsWith(prefix)) { recipientKey = threadId.slice(prefix.length); break; }
          if (threadId.endsWith(suffix)) { recipientKey = threadId.slice(3, -suffix.length); break; }
        }
        if (!recipientKey || recipientKey === key) return NextResponse.json({ message: "thread not found or forbidden" }, { status: 404, headers: { "Cache-Control": "no-store" } });
      } else {
        return NextResponse.json({ message: "thread not found or forbidden" }, { status: 404, headers: { "Cache-Control": "no-store" } });
      }
    } else if (b.recipient_session_key) {
      const sessionKey = clean(b.recipient_session_key, 120);
      const targetRows = (await sql`SELECT guest_key, nickname FROM presence_sessions WHERE session_key=${sessionKey} AND guest_key IS NOT NULL AND last_seen_at > NOW() - INTERVAL '10 minutes' ORDER BY last_seen_at DESC LIMIT 1`) as Array<Record<string, any>>;
      if (!targetRows[0]?.guest_key) return NextResponse.json({ message: "recipient is no longer available" }, { status: 404, headers: { "Cache-Control": "no-store" } });
      recipientKey = String(targetRows[0].guest_key);
      if (recipientKey === key) return NextResponse.json({ message: "cannot message yourself" }, { status: 422, headers: { "Cache-Control": "no-store" } });
      threadId = "dm-" + [key, recipientKey].sort().join("-");
      recipientName = recipientName !== "匿名の誰か" ? recipientName : clean(targetRows[0].nickname, 24) || "匿名の誰か";
    } else {
      return NextResponse.json({ message: "recipient_session_key or thread_id is required" }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    const senderProfileRows = (await sql`SELECT nickname,mbti,socionics,enneagram,other_type,bio,links,profile_image_url FROM profiles WHERE guest_key=${key} LIMIT 1`) as Array<Record<string, any>>;
    const recipientProfileRows = (await sql`SELECT nickname,mbti,socionics,enneagram,other_type,bio,links,profile_image_url FROM profiles WHERE guest_key=${recipientKey} LIMIT 1`) as Array<Record<string, any>>;
    const senderProfile = b.sender_profile && typeof b.sender_profile === "object" ? b.sender_profile : (senderProfileRows[0] || {});
    const contextProfile = context ? (contextIsSender ? context.recipient_profile : context.sender_profile) : null;
    const contextHasIdentity = contextProfile && typeof contextProfile === "object" && Boolean(contextProfile.mbti || contextProfile.socionics || contextProfile.enneagram || contextProfile.other_type || contextProfile.otherType || contextProfile.nickname);
    const recipientProfile = contextHasIdentity ? contextProfile : (b.recipient_profile && typeof b.recipient_profile === "object" ? b.recipient_profile : (contextProfile && typeof contextProfile === "object" ? contextProfile : (recipientProfileRows[0] || { nickname: recipientName })));
    const senderSnapshot = JSON.stringify(senderProfile);
    const recipientSnapshot = JSON.stringify(recipientProfile);
    const saved = (await sql`INSERT INTO direct_messages (sender_guest_key,recipient_guest_key,thread_id,sender_name,recipient_name,body,bottle_id,bottle_snippet,bottle_author,bottle_type,sender_profile,recipient_profile,created_at,updated_at)
      VALUES (${key},${recipientKey},${threadId},${senderName},${recipientName},${text},${bottleId},${context?.bottle_snippet || null},${context?.bottle_author || null},${context?.bottle_type || null},${senderSnapshot}::jsonb,${recipientSnapshot}::jsonb,NOW(),NOW()) RETURNING *`) as Array<Record<string, any>>;
    const message = saved[0];
    let senderUserId: number | null = accountKey ? (Number(accountKey) || null) : null;
    if (senderUserId == null) { try { const sp = (await sql`SELECT user_id FROM profiles WHERE guest_key=${key} LIMIT 1`) as Array<Record<string, any>>; if (sp[0]?.user_id != null) senderUserId = Number(sp[0].user_id); } catch { /* optional */ } }
    let recipientUserId: unknown = null;
    if (String(recipientKey || "").startsWith("user:")) { const n = Number(String(recipientKey).slice(5)); recipientUserId = Number.isFinite(n) ? n : null; }
    else if (recipientKey) { try { const rp = (await sql`SELECT user_id FROM profiles WHERE guest_key=${recipientKey} LIMIT 1`) as Array<Record<string, any>>; recipientUserId = rp[0]?.user_id ?? null; } catch { /* optional */ } }
    if (recipientKey && recipientKey !== key) {
      await sql`INSERT INTO notifications (guest_key,type,entity_id,message,created_at,updated_at) VALUES (${recipientKey},'direct_message',${threadId},'個別メッセージが届きました。',NOW(),NOW())`;
    }
    return NextResponse.json({ message: { id: message.id, thread_id: message.thread_id, sender_name: message.sender_name, recipient_name: message.recipient_name, body: message.body, created_at: message.created_at, read: false, is_mine: true, bottle_id: message.bottle_id, bottle_snippet: message.bottle_snippet, bottle_author: message.bottle_author, bottle_type: message.bottle_type, sender_profile: message.sender_profile || {}, recipient_profile: message.recipient_profile || {}, sender_guest_key: message.sender_guest_key, recipient_guest_key: message.recipient_guest_key, sender_user_id: senderUserId, recipient_user_id: recipientUserId, sender_identity: { mbti: message.sender_profile?.mbti || "", socionics: message.sender_profile?.socionics || "", enneagram: message.sender_profile?.enneagram || "", other_type: message.sender_profile?.other_type || message.sender_profile?.otherType || "" } } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Type Drift fallback] POST /api/direct-messages failed", error);
    return NextResponse.json({ error: "database error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
