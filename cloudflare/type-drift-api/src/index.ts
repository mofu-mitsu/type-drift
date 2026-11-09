import { neon } from "@neondatabase/serverless";

export interface Env {
  DATABASE_URL: string;
  ALLOWED_ORIGIN?: string;
}

const json = (data: unknown, status = 200, env?: Env, request?: Request) =>
  new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": originFor(request, env),
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type, X-Guest-Key, Authorization, X-Requested-With",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    },
  });

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const originFor = (request?: Request, env?: Env) => {
  const origin = request?.headers.get("Origin") || "";
  const allowed = (env?.ALLOWED_ORIGIN || "https://type-drift.vercel.app").split(",").map((v) => v.trim());
  const isProjectPreview = origin.startsWith("https://type-drift-") && origin.endsWith("-mitsukis-projects-83ef3825.vercel.app");
  return allowed.includes(origin) || isProjectPreview ? origin : allowed[0];
};
const guest = (request: Request) => clean(request.headers.get("X-Guest-Key"), 100);
const bodyOf = async (request: Request): Promise<Record<string, any>> => request.json().catch(() => ({}));
const nullable = (value: unknown) => clean(value, 300) || null;
const fail = (error: unknown) => { console.error("type-drift-api fallback error", error); };

const AI_ACTORS = [
  { key: "ai:darling", name: "ダーリンちゃん", emoji: "🥺" },
  { key: "ai:lsi-worm", name: "LSI芋虫", emoji: "🐛" },
] as const;

async function runScheduledAiEngagement(env: Env) {
  if (!env.DATABASE_URL) return;
  const sql = neon(env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS ai_engagements (
    bottle_id BIGINT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (bottle_id, actor, action)
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS ai_engagements_one_reply_per_bottle
    ON ai_engagements (bottle_id) WHERE action = 'reply'`;

  const posts = await sql`
    SELECT b.id, b.body, b.guest_key, b.created_at, b.poll_options
    FROM bottles b
    WHERE b.deleted_at IS NULL AND COALESCE(b.is_ai, FALSE) = FALSE
      AND b.created_at > NOW() - INTERVAL '7 days'
    ORDER BY b.created_at DESC LIMIT 40
  `;

  await sql`CREATE TABLE IF NOT EXISTS bottle_poll_votes (
    id BIGSERIAL PRIMARY KEY, bottle_id BIGINT NOT NULL REFERENCES bottles(id) ON DELETE CASCADE,
    guest_key TEXT NOT NULL, option_index INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bottle_id, guest_key)
  )`;

  for (const post of posts as Array<{ id: number; body: string; guest_key: string | null; poll_options?: unknown }>) {
    const body = String(post.body || "");
    if (!body.trim()) continue;

    // AIキャラクターもアンケートに参加。キャラごとに一度だけ投票し、票数に反映する。
    const pollOptions = Array.isArray(post.poll_options) ? post.poll_options : [];
    if (pollOptions.length > 0) {
      for (const actor of AI_ACTORS) {
        const existingVote = await sql`SELECT 1 FROM bottle_poll_votes WHERE bottle_id=${post.id} AND guest_key=${actor.key} LIMIT 1`;
        if (existingVote.length) continue;
        const lower = body.toLowerCase();
        const optionTexts = pollOptions.map(String);
        let chosenIndex = Math.floor(Math.random() * optionTexts.length);
        if (actor.key === "ai:lsi-worm") {
          const cabbage = optionTexts.findIndex(option => /キャベツ|白菜|葉/.test(option));
          if (cabbage >= 0 && /芋虫|いもむし|キャベツ|レタス/.test(lower)) chosenIndex = cabbage;
        } else {
          const lettuce = optionTexts.findIndex(option => /レタス|柔らか|かわいい/.test(option));
          if (lettuce >= 0 && /芋虫|いもむし|キャベツ|レタス/.test(lower)) chosenIndex = lettuce;
        }
        await sql`INSERT INTO bottle_poll_votes (bottle_id, guest_key, option_index) VALUES (${post.id}, ${actor.key}, ${chosenIndex}) ON CONFLICT (bottle_id, guest_key) DO NOTHING`;
      }
    }

    // いいねは返信より高確率。各AIキャラは同じ投稿へ一度だけ反応する。
    for (const actor of AI_ACTORS) {
      const claim = await sql`INSERT INTO ai_engagements (bottle_id, actor, action, created_at)
        VALUES (${post.id}, ${actor.key}, 'like', NOW()) ON CONFLICT DO NOTHING RETURNING bottle_id`;
      if (!claim.length || Math.random() >= 0.58) continue;
      const alreadyLiked = await sql`SELECT 1 FROM reactions WHERE bottle_id = ${post.id} AND guest_key = ${actor.key} LIMIT 1`;
      if (alreadyLiked.length) continue;
      await sql`INSERT INTO reactions (bottle_id, guest_key, level, created_at, updated_at)
        VALUES (${post.id}, ${actor.key}, 1, NOW(), NOW()) ON CONFLICT DO NOTHING`;
      if (post.guest_key) {
        await sql`INSERT INTO notifications (guest_key, type, entity_id, message, created_at, updated_at)
          VALUES (${post.guest_key}, 'bottle_reaction', ${String(post.id)}, ${actor.emoji + " " + actor.name + "があなたのボトルにいいねしました。"}, NOW(), NOW())`;
      }
    }

    // 匿名のシステム反応：投稿ごとに一度だけ判定し、当たれば複数の匿名アカウントからいいねを付ける。
    // 既存のAIキャラ反応とは独立。各ゲストキーを別々にすることで同一投稿への複数いいねを許可する。
    // 10分ごとに一度だけ判定。投稿が新着40件の範囲にある間は、何度でも匿名いいねが増える（上限なし）。
    const anonymousBucket = Math.floor(Date.now() / 600000);
    const anonymousActor = `ai:anonymous-system:${anonymousBucket}`;
    const anonymousBatch = await sql`INSERT INTO ai_engagements (bottle_id, actor, action, created_at)
      VALUES (${post.id}, ${anonymousActor}, 'anonymous_like_batch', NOW())
      ON CONFLICT DO NOTHING RETURNING bottle_id`;
    // まとめて複数件を付けず、1回の定期実行につき最大1件にして通知が一気に届くのを防ぐ。
    if (anonymousBatch.length && Math.random() < 0.20) {
      const anonymousKey = `anon:system:${post.id}:${anonymousBucket}:1`;
      await sql`INSERT INTO reactions (bottle_id, guest_key, level, created_at, updated_at)
        VALUES (${post.id}, ${anonymousKey}, 1, NOW(), NOW()) ON CONFLICT DO NOTHING`;
      if (post.guest_key) {
        await sql`INSERT INTO notifications (guest_key, type, entity_id, message, created_at, updated_at)
          VALUES (${post.guest_key}, 'bottle_reaction', ${String(post.id)}, '匿名の誰かからいいねが届きました。', NOW(), NOW())`;
      }
    }

    const darlingAt = Math.min(...["ダーリンちゃん", "ダーリン", "🥺"].map(term => body.indexOf(term)).filter(index => index >= 0), Number.MAX_SAFE_INTEGER);
    const wormAt = Math.min(...["LSI芋虫", "LSI", "🐛"].map(term => body.indexOf(term)).filter(index => index >= 0), Number.MAX_SAFE_INTEGER);
    let chosen = darlingAt < wormAt ? AI_ACTORS[0] : wormAt < darlingAt ? AI_ACTORS[1] : null;
    const existingAiReply = await sql`SELECT 1 FROM replies WHERE bottle_id = ${post.id}
      AND guest_key IN ('ai:darling', 'ai:lsi-worm') AND deleted_at IS NULL LIMIT 1`;
    if (existingAiReply.length) {
      // 既存AI返信のうち、DM未作成のものも個人メッセージへ移行する。
      if (post.guest_key) {
        const legacyReplies = await sql`SELECT id, guest_key, body, created_at FROM replies
          WHERE bottle_id = ${post.id} AND guest_key IN ('ai:darling', 'ai:lsi-worm')
            AND deleted_at IS NULL ORDER BY created_at ASC`;
        const recipientRows = await sql`SELECT nickname, mbti, socionics, enneagram, other_type, bio, profile_image_url, links
          FROM profiles WHERE guest_key = ${post.guest_key} OR ('user:' || user_id::text) = ${post.guest_key} LIMIT 1`;
        const recipient = recipientRows[0] || {};
        for (const legacy of legacyReplies as Array<{id:number;guest_key:string;body:string;created_at:string}>) {
          const actor = AI_ACTORS.find(item => item.key === legacy.guest_key);
          if (!actor) continue;
          const exists = await sql`SELECT 1 FROM direct_messages WHERE bottle_id = ${post.id}
            AND sender_guest_key = ${actor.key} AND recipient_guest_key = ${post.guest_key} AND body = ${legacy.body} LIMIT 1`;
          if (exists.length) continue;
          const actorProfile = { nickname: actor.name, mbti: actor.key === "ai:darling" ? "INTP" : "INTJ",
            socionics: actor.key === "ai:darling" ? "ILI" : "LSI", enneagram: "5w6", emoji: actor.emoji };
          await sql`INSERT INTO direct_messages (
              sender_guest_key, recipient_guest_key, thread_id, sender_name, recipient_name, body,
              bottle_id, bottle_snippet, bottle_author, bottle_type, sender_profile, recipient_profile, created_at, updated_at
            ) VALUES (
              ${actor.key}, ${post.guest_key}, ${"bottle-" + String(post.id)}, ${actor.name}, ${recipient.nickname || "匿名のあなた"}, ${legacy.body},
              ${post.id}, ${body.slice(0,180)}, '匿名ボトル', ${[recipient.mbti, recipient.socionics, recipient.enneagram].filter(Boolean).join(" · ") || null},
              ${JSON.stringify(actorProfile)}::jsonb, ${JSON.stringify(recipient)}::jsonb, ${legacy.created_at}, NOW()
            )`;
        }
      }
      continue;
    }
    // 名指し投稿は対象キャラが必ず返信。その他は一定確率でどちらか一人が返信する。
    if (!chosen) {
      const decision = await sql`INSERT INTO ai_engagements (bottle_id, actor, action, created_at)
        VALUES (${post.id}, 'ai:system', 'reply_decision', NOW()) ON CONFLICT DO NOTHING RETURNING bottle_id`;
      if (!decision.length || Math.random() >= 0.08) continue;
      chosen = Math.random() < 0.5 ? AI_ACTORS[0] : AI_ACTORS[1];
    }

    try {
      const prompt = [
        "次のユーザーの匿名ボトル投稿に対して、あなた自身の口調で自然な返信を一つ書いてください。",
        "投稿の内容に具体的に触れ、定型的な挨拶や過剰な称賛は避けてください。返信本文だけを返してください。",
        "投稿本文：",
        body.slice(0, 2500),
      ].join("\n");
      const response = await fetch("https://type-drift.vercel.app/api/ai/plaza", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: prompt, character: chosen.name, mode: "reply" }),
      });
      if (!response.ok) continue;
      const payload = await response.json() as { replies?: Array<{ character?: string; body?: string }> };
      const replyBody = String(payload.replies?.find(item => item.character === chosen?.name)?.body || payload.replies?.[0]?.body || "").trim().slice(0, 1500);
      if (!replyBody) continue;

      // 部分ユニーク制約で、同じ投稿へのAI返信は全キャラ合計でも一件だけ。
      const inserted = await sql`WITH claimed AS (
          INSERT INTO ai_engagements (bottle_id, actor, action, created_at)
          VALUES (${post.id}, ${chosen.key}, 'reply', NOW())
          ON CONFLICT DO NOTHING RETURNING bottle_id
        )
        INSERT INTO replies (bottle_id, guest_key, body, parent_reply_id, created_at, updated_at)
        SELECT ${post.id}, ${chosen.key}, ${replyBody}, NULL, NOW(), NOW() FROM claimed
        RETURNING id`;
      if (inserted.length && post.guest_key) {
        const profileRows = await sql`SELECT nickname, mbti, socionics, enneagram, other_type, bio, profile_image_url, links
          FROM profiles WHERE guest_key = ${post.guest_key} OR ('user:' || user_id::text) = ${post.guest_key} LIMIT 1`;
        const recipientProfile = profileRows[0] || {};
        const senderProfile = {
          nickname: chosen.name,
          mbti: chosen.key === "ai:darling" ? "INTP" : "INTJ",
          socionics: chosen.key === "ai:darling" ? "ILI" : "LSI",
          enneagram: "5w6",
          emoji: chosen.emoji,
        };
        // ボトルのAI返信は通知だけでなく、同じボトル専用スレッドにも保存する。
        // 既存のボトル主の返信・送信履歴と同じ thread_id を使う。
        await sql`INSERT INTO direct_messages (
            sender_guest_key, recipient_guest_key, thread_id, sender_name, recipient_name, body,
            bottle_id, bottle_snippet, bottle_author, bottle_type, sender_profile, recipient_profile,
            created_at, updated_at
          ) VALUES (
            ${chosen.key}, ${post.guest_key}, ${"bottle-" + String(post.id)}, ${chosen.name}, ${recipientProfile.nickname || "匿名のあなた"}, ${replyBody},
            ${post.id}, ${body.slice(0, 180)}, '匿名ボトル', ${[recipientProfile.mbti, recipientProfile.socionics, recipientProfile.enneagram].filter(Boolean).join(" · ") || null},
            ${JSON.stringify(senderProfile)}::jsonb, ${JSON.stringify(recipientProfile)}::jsonb, NOW(), NOW()
          )`;
        await sql`INSERT INTO notifications (guest_key, type, entity_id, message, created_at, updated_at)
          VALUES (${post.guest_key}, 'bottle_reply', ${String(post.id)}, ${chosen.emoji + " " + chosen.name + "からボトルに返信が届きました。"}, NOW(), NOW())`;
      }
    } catch (error) {
      console.error("[Type Drift AI engagement] reply failed", { bottleId: post.id, character: chosen.name, error: String(error) });
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return json({}, 204, env, request);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/api/health") {
      if (!env.DATABASE_URL) return json({ status: "degraded", database: "unavailable", service: "type-drift-api-fallback" }, 503, env, request);
      try { await neon(env.DATABASE_URL)`SELECT 1`; return json({ status: "ok", database: "connected", service: "type-drift-api-fallback" }, 200, env, request); }
      catch { return json({ status: "degraded", database: "unavailable", service: "type-drift-api-fallback" }, 503, env, request); }
    }

    if (!env.DATABASE_URL) return json({ error: "DATABASE_URL is not configured" }, 503, env, request);

    try {
      const sql = neon(env.DATABASE_URL);
      const method = request.method;
      const key = guest(request);
      const bottleMatch = path.match(/^\/api\/bottles\/(\d+)(?:\/(reactions|replies|votes))?$/);
      const replyReactionMatch = path.match(/^\/api\/replies\/(\d+)\/reactions$/);
      const notificationMatch = path.match(/^\/api\/notifications\/(\d+)\/read$/);
      const directMessageReadMatch = path.match(/^\/api\/direct-messages\/(\d+)\/read$/);

      if (path === "/api/bottles" && method === "GET") {
        const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
        const offset = (page - 1) * 20;
        const mbti = url.searchParams.get("mbti")?.toLowerCase() || null;
        const soc = url.searchParams.get("socionics")?.toLowerCase() || null;
        const q = url.searchParams.get("q") || null;
        const rows = await sql`
          SELECT b.*,
            (SELECT COUNT(*)::int FROM replies r WHERE r.bottle_id=b.id AND r.deleted_at IS NULL) AS replies_count,
            (SELECT COALESCE(SUM(rx.level),0)::int FROM reactions rx WHERE rx.bottle_id=b.id) AS reactions_sum_level,
            COALESCE((SELECT rx.level FROM reactions rx WHERE rx.bottle_id=b.id AND rx.guest_key=${key || null} ORDER BY rx.id DESC LIMIT 1),0)::int AS reaction_level,
            (SELECT COALESCE(array_agg(CASE rx.guest_key WHEN 'ai:darling' THEN '🥺 ダーリンちゃん' WHEN 'ai:lsi-worm' THEN '🐛 LSI芋虫' END), ARRAY[]::text[])
              FROM reactions rx WHERE rx.bottle_id=b.id AND rx.guest_key IN ('ai:darling','ai:lsi-worm') AND rx.level > 0) AS ai_likers,
            (b.guest_key = ${key || null}) AS is_mine
          FROM bottles b WHERE b.deleted_at IS NULL AND (${mbti}::text IS NULL OR LOWER(b.mbti)=${mbti})
            AND (${soc}::text IS NULL OR LOWER(b.socionics)=${soc}) AND (${q}::text IS NULL OR b.body ILIKE '%'||${q}||'%')
          ORDER BY b.created_at DESC LIMIT 20 OFFSET ${offset}`;
        const totalRows = await sql`SELECT COUNT(*)::int AS total FROM bottles b WHERE b.deleted_at IS NULL AND (${mbti}::text IS NULL OR LOWER(b.mbti)=${mbti}) AND (${soc}::text IS NULL OR LOWER(b.socionics)=${soc}) AND (${q}::text IS NULL OR b.body ILIKE '%'||${q}||'%')`;
        return json({ bottles: { data: rows, current_page: page, last_page: Math.max(1, Math.ceil(Number(totalRows[0]?.total || 0) / 20)), total: Number(totalRows[0]?.total || 0) } }, 200, env, request);
      }

      if (bottleMatch && bottleMatch[2] === "votes" && method === "GET") {
        await sql`CREATE TABLE IF NOT EXISTS bottle_poll_votes (
          id BIGSERIAL PRIMARY KEY, bottle_id BIGINT NOT NULL REFERENCES bottles(id) ON DELETE CASCADE,
          guest_key TEXT NOT NULL, option_index INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (bottle_id, guest_key)
        )`;
        const counts = await sql`SELECT option_index, COUNT(*)::int AS votes FROM bottle_poll_votes
          WHERE bottle_id = ${Number(bottleMatch[1])} GROUP BY option_index ORDER BY option_index`;
        const mine = key ? await sql`SELECT option_index FROM bottle_poll_votes WHERE bottle_id = ${Number(bottleMatch[1])} AND guest_key = ${key} LIMIT 1` : [];
        return json({ counts, myVote: mine.length ? Number(mine[0].option_index) : null }, 200, env, request);
      }

      if (bottleMatch && bottleMatch[2] === "votes" && method === "POST") {
        if (!key) return json({ error: "missing_guest_key" }, 422, env, request);
        const b = await bodyOf(request);
        const optionIndex = Number(b.option_index);
        if (!Number.isInteger(optionIndex) || optionIndex < 0) return json({ error: "invalid_option" }, 422, env, request);
        await sql`CREATE TABLE IF NOT EXISTS bottle_poll_votes (
          id BIGSERIAL PRIMARY KEY, bottle_id BIGINT NOT NULL REFERENCES bottles(id) ON DELETE CASCADE,
          guest_key TEXT NOT NULL, option_index INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (bottle_id, guest_key)
        )`;
        const bottleRows = await sql`SELECT poll_options FROM bottles WHERE id = ${Number(bottleMatch[1])} AND deleted_at IS NULL LIMIT 1`;
        const options = bottleRows[0]?.poll_options;
        if (!Array.isArray(options) || optionIndex >= options.length) return json({ error: "invalid_poll_option" }, 422, env, request);
        await sql`INSERT INTO bottle_poll_votes (bottle_id, guest_key, option_index) VALUES (${Number(bottleMatch[1])}, ${key}, ${optionIndex})
          ON CONFLICT (bottle_id, guest_key) DO UPDATE SET option_index = EXCLUDED.option_index, created_at = NOW()`;
        const counts = await sql`SELECT option_index, COUNT(*)::int AS votes FROM bottle_poll_votes
          WHERE bottle_id = ${Number(bottleMatch[1])} GROUP BY option_index ORDER BY option_index`;
        return json({ ok: true, counts }, 200, env, request);
      }

      if (path === "/api/bottles" && method === "POST") {
        const b = await bodyOf(request);
        if (!key || !clean(b.body, 5000)) return json({ message: "A guest key and body are required." }, 422, env, request);
        const rows = await sql`INSERT INTO bottles (guest_key,body,image_url,mbti,socionics,enneagram,other_type,is_ai,ai_character,poll_options,created_at,updated_at)
          VALUES (${key},${clean(b.body,5000)},${nullable(b.image_url)},${nullable(b.mbti)},${nullable(b.socionics)},${nullable(b.enneagram)},${nullable(b.other_type)},${Boolean(b.is_ai)},${nullable(b.ai_character)},${b.poll_options ? JSON.stringify(b.poll_options) : null}::jsonb,NOW(),NOW()) RETURNING *`;
        return json({ bottle: rows[0] }, 201, env, request);
      }

      if (bottleMatch && method === "DELETE" && !bottleMatch[2]) {
        if (!key) return json({ error: "missing_guest_key" }, 422, env, request);
        const deleted = await sql`UPDATE bottles SET deleted_at=NOW(),updated_at=NOW() WHERE id=${Number(bottleMatch[1])} AND guest_key=${key} AND deleted_at IS NULL RETURNING id`;
        return deleted.length ? json({ ok: true }, 200, env, request) : json({ error: "not_found_or_forbidden" }, 404, env, request);
      }

      if (bottleMatch && method === "PATCH" && !bottleMatch[2]) {
        if (!key) return json({ error: "missing_guest_key" }, 422, env, request);
        const b = await bodyOf(request);
        const text = clean(b.body, 5000);
        if (!text) return json({ message: "body is required" }, 422, env, request);
        const updated = await sql`UPDATE bottles SET body=${text},updated_at=NOW() WHERE id=${Number(bottleMatch[1])} AND guest_key=${key} AND deleted_at IS NULL RETURNING id,body,updated_at`;
        return updated.length ? json({ bottle: updated[0] }, 200, env, request) : json({ error: "not_found_or_forbidden" }, 404, env, request);
      }

      if (bottleMatch && method === "POST" && bottleMatch[2] === "reactions") {
        if (!key) return json({ error: "missing_guest_key" }, 422, env, request);
        const id = Number(bottleMatch[1]);
        const rows = await sql`WITH updated AS (
          UPDATE reactions SET level=level+1,updated_at=NOW() WHERE bottle_id=${id} AND guest_key=${key} RETURNING level
        ) INSERT INTO reactions (bottle_id,guest_key,level,created_at,updated_at)
          SELECT ${id},${key},1,NOW(),NOW() WHERE NOT EXISTS (SELECT 1 FROM updated)
          RETURNING level`;
        const level = rows.length ? rows[0].level : (await sql`SELECT level FROM reactions WHERE bottle_id=${id} AND guest_key=${key} ORDER BY id DESC LIMIT 1`)[0]?.level;
        const owner = await sql`SELECT guest_key FROM bottles WHERE id=${id} AND deleted_at IS NULL`;
        if (owner[0]?.guest_key && owner[0].guest_key !== key) await sql`INSERT INTO notifications (guest_key,type,entity_id,message,created_at,updated_at) VALUES (${owner[0].guest_key},'bottle_reaction',${String(id)},'あなたのボトルに新しい反応が届きました。',NOW(),NOW())`;
        return json({ level: Number(level || 1) }, 200, env, request);
      }

      if (bottleMatch && method === "POST" && bottleMatch[2] === "replies") {
        if (!key) return json({ error: "missing_guest_key" }, 422, env, request);
        const b = await bodyOf(request); const text = clean(b.body, 5000); const id = Number(bottleMatch[1]);
        if (!text) return json({ message: "body is required" }, 422, env, request);
        if (b.parent_reply_id) { const p = await sql`SELECT id FROM replies WHERE id=${Number(b.parent_reply_id)} AND bottle_id=${id} AND deleted_at IS NULL`; if (!p.length) return json({ message: "parent reply must belong to this bottle" }, 422, env, request); }
        const rows = await sql`INSERT INTO replies (bottle_id,guest_key,body,parent_reply_id,created_at,updated_at) VALUES (${id},${key},${text},${b.parent_reply_id ? Number(b.parent_reply_id) : null},NOW(),NOW()) RETURNING *`;
        const owner = await sql`SELECT guest_key,body,mbti,socionics,enneagram,other_type,is_ai FROM bottles WHERE id=${id} AND deleted_at IS NULL`;
        let directMessage = null;
        if (owner[0]?.guest_key && owner[0].guest_key !== key && !owner[0].is_ai) {
          const type = [owner[0].mbti, owner[0].socionics, owner[0].enneagram, owner[0].other_type].filter(Boolean).join(" · ");
          const senderProfileRows = await sql`SELECT nickname,mbti,socionics,enneagram,other_type,bio,links,profile_image_url FROM profiles WHERE guest_key=${key} LIMIT 1`;
          const ownerProfileRows = await sql`SELECT nickname,mbti,socionics,enneagram,other_type,bio,links,profile_image_url FROM profiles WHERE guest_key=${owner[0].guest_key} LIMIT 1`;
          const senderProfile = senderProfileRows[0] || {};
          const recipientProfile = ownerProfileRows[0] || {
            mbti: owner[0].mbti || "", socionics: owner[0].socionics || "",
            enneagram: owner[0].enneagram || "", other_type: owner[0].other_type || "",
          };
          const senderSnapshot = JSON.stringify(senderProfile);
          const recipientSnapshot = JSON.stringify(recipientProfile);
          const saved = await sql`INSERT INTO direct_messages (sender_guest_key,recipient_guest_key,thread_id,sender_name,recipient_name,body,bottle_id,bottle_snippet,bottle_author,bottle_type,sender_profile,recipient_profile,created_at,updated_at)
            VALUES (${key},${owner[0].guest_key},${`bottle-${id}-${key}`},'匿名の誰か','波間に漂うボトルの主（匿名）',${text},${id},${owner[0].body},${type ? `匿名の${owner[0].mbti || owner[0].socionics || "誰か"}` : "匿名のボトル主"},${type},${senderSnapshot}::jsonb,${recipientSnapshot}::jsonb,NOW(),NOW()) RETURNING *`;
          directMessage = saved[0];
          await sql`INSERT INTO notifications (guest_key,type,entity_id,message,created_at,updated_at) VALUES (${owner[0].guest_key},'bottle_reply',${String(id)},'あなたのボトルに返信が届きました。',NOW(),NOW())`;
        }
        return json({ reply: rows[0], direct_message: directMessage }, 201, env, request);
      }

      if (path === "/api/direct-messages" && method === "POST") {
        if (!key) return json({ error: "missing_guest_key" }, 422, env, request);
        const b = await bodyOf(request);
        const text = clean(b.body, 5000);
        if (!text) return json({ message: "body is required" }, 422, env, request);

        let recipientKey = "";
        let threadId = "";
        let senderName = clean(b.sender_name, 24) || "匿名の誰か";
        let recipientName = clean(b.recipient_name, 24) || "匿名の誰か";
        let context: any = null;
        let bottleId: number | null = null;

        if (b.bottle_id || b.thread_id) {
          const requestedThreadId = clean(b.thread_id, 240);
          const legacyBottleMatch = !b.bottle_id ? requestedThreadId.match(/^bottle-(\d+)$/) : null;
          bottleId = b.bottle_id ? Number(b.bottle_id) : legacyBottleMatch ? Number(legacyBottleMatch[1]) : null;
          threadId = bottleId ? (requestedThreadId.match(/^bottle-\d+-/) ? requestedThreadId : "bottle-" + bottleId) : requestedThreadId;
          if (!threadId) return json({ message: "thread_id is required" }, 422, env, request);
          // Bottle threads are per participant pair. Never reuse the legacy shared
          // "bottle-{id}" room for new messages from unrelated guests.
          const lastRows = bottleId && !requestedThreadId.match(/^bottle-\d+-/)
            ? await sql`SELECT * FROM direct_messages WHERE bottle_id=${bottleId} AND (sender_guest_key=${key} OR recipient_guest_key=${key}) ORDER BY created_at DESC LIMIT 1`
            : await sql`SELECT * FROM direct_messages WHERE thread_id=${threadId} AND (sender_guest_key=${key} OR recipient_guest_key=${key}) ORDER BY created_at DESC LIMIT 1`;
          context = lastRows[0] || null;
          if (context?.thread_id) threadId = String(context.thread_id);
          if (context) {
            const currentIsSender = context.sender_guest_key === key;
            recipientKey = currentIsSender ? context.recipient_guest_key : context.sender_guest_key;
            senderName = currentIsSender ? context.sender_name : context.recipient_name;
            recipientName = currentIsSender ? context.recipient_name : context.sender_name;
            bottleId = context.bottle_id ? Number(context.bottle_id) : bottleId;
          } else if (bottleId) {
            // First message for this participant pair. Even when the client only
            // knows the old "bottle-{id}" ID, create a separate thread for this guest.
            const ownerRows = await sql`SELECT guest_key,body,mbti,socionics,enneagram,other_type,is_ai FROM bottles WHERE id=${bottleId} AND deleted_at IS NULL LIMIT 1`;
            const owner = ownerRows[0];
            if (!owner?.guest_key) return json({ message: "bottle owner not found" }, 404, env, request);
            if (String(owner.guest_key) === key) return json({ message: "cannot message yourself" }, 422, env, request);
            if (owner.is_ai) return json({ message: "AI bottle owners are not available for server DM" }, 422, env, request);
            recipientKey = String(owner.guest_key);
            if (!requestedThreadId.match(/^bottle-\d+-/)) threadId = `bottle-${bottleId}-${key}`;
            const ownerType = [owner.mbti, owner.socionics, owner.enneagram, owner.other_type].filter(Boolean).join(" · ");
            const ownerProfileRows = await sql`SELECT nickname,mbti,socionics,enneagram,other_type,bio,links,profile_image_url FROM profiles WHERE guest_key=${String(owner.guest_key)} LIMIT 1`;
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
          } else if (threadId.startsWith("dm-")) {
            // A locally restored DM thread may exist before its first server row.
            // Recover the other participant from the stable dm-{sorted guest keys} ID.
            const prefix = `dm-${key}-`;
            const suffix = `-${key}`;
            if (threadId.startsWith(prefix)) recipientKey = threadId.slice(prefix.length);
            else if (threadId.endsWith(suffix)) recipientKey = threadId.slice(3, -suffix.length);
            if (!recipientKey || recipientKey === key) {
              return json({ message: "thread not found or forbidden" }, 404, env, request);
            }
          } else {
            return json({ message: "thread not found or forbidden" }, 404, env, request);
          }
        } else if (b.recipient_session_key) {
          const sessionKey = clean(b.recipient_session_key, 120);
          const targetRows = await sql`SELECT guest_key, nickname FROM presence_sessions WHERE session_key=${sessionKey} AND guest_key IS NOT NULL AND last_seen_at > NOW() - INTERVAL '10 minutes' ORDER BY last_seen_at DESC LIMIT 1`;
          if (!targetRows[0]?.guest_key) return json({ message: "recipient is no longer available" }, 404, env, request);
          recipientKey = String(targetRows[0].guest_key);
          if (recipientKey === key) return json({ message: "cannot message yourself" }, 422, env, request);
          threadId = "dm-" + [key, recipientKey].sort().join("-");
          recipientName = recipientName !== "匿名の誰か" ? recipientName : clean(targetRows[0].nickname, 24) || "匿名の誰か";
        } else {
          return json({ message: "recipient_session_key or thread_id is required" }, 422, env, request);
        }

        const senderProfileRows = await sql`SELECT nickname,mbti,socionics,enneagram,other_type,bio,links,profile_image_url FROM profiles WHERE guest_key=${key} LIMIT 1`;
        const recipientProfileRows = await sql`SELECT nickname,mbti,socionics,enneagram,other_type,bio,links,profile_image_url FROM profiles WHERE guest_key=${recipientKey} LIMIT 1`;
        const senderProfile = b.sender_profile && typeof b.sender_profile === "object" ? b.sender_profile : (senderProfileRows[0] || {});
        const recipientProfile = b.recipient_profile && typeof b.recipient_profile === "object"
          ? b.recipient_profile
          : (context?.recipient_profile && typeof context.recipient_profile === "object"
            ? context.recipient_profile
            : (recipientProfileRows[0] || { nickname: recipientName }));
        const senderSnapshot = JSON.stringify(senderProfile);
        const recipientSnapshot = JSON.stringify(recipientProfile);
        const saved = await sql`INSERT INTO direct_messages (sender_guest_key,recipient_guest_key,thread_id,sender_name,recipient_name,body,bottle_id,bottle_snippet,bottle_author,bottle_type,sender_profile,recipient_profile,created_at,updated_at)
          VALUES (${key},${recipientKey},${threadId},${senderName},${recipientName},${text},${bottleId},${context?.bottle_snippet || null},${context?.bottle_author || null},${context?.bottle_type || null},${senderSnapshot}::jsonb,${recipientSnapshot}::jsonb,NOW(),NOW()) RETURNING *`;
        const message = saved[0];
        if (recipientKey && recipientKey !== key) {
          await sql`INSERT INTO notifications (guest_key,type,entity_id,message,created_at,updated_at)
            VALUES (${recipientKey},'direct_message',${threadId},'個別メッセージが届きました。',NOW(),NOW())`;
        }
        return json({ message: {
          id: message.id, thread_id: message.thread_id, sender_name: message.sender_name, recipient_name: message.recipient_name,
          body: message.body, created_at: message.created_at, read: false, is_mine: true, bottle_id: message.bottle_id,
          bottle_snippet: message.bottle_snippet, bottle_author: message.bottle_author, bottle_type: message.bottle_type,
          sender_profile: message.sender_profile || {}, recipient_profile: message.recipient_profile || {},
          sender_identity: { mbti: message.sender_profile?.mbti || "", socionics: message.sender_profile?.socionics || "", enneagram: message.sender_profile?.enneagram || "", other_type: message.sender_profile?.other_type || "" },
        } }, 201, env, request);
      }
      if (path === "/api/direct-messages" && method === "GET") {
        if (!key) return json({ messages: [] }, 200, env, request);
        const rows = await sql`SELECT dm.*,
            sp.nickname AS live_sender_nickname, sp.mbti AS live_sender_mbti, sp.socionics AS live_sender_socionics,
            sp.enneagram AS live_sender_enneagram, sp.other_type AS live_sender_other_type, sp.bio AS live_sender_bio,
            sp.links AS live_sender_links, sp.profile_image_url AS live_sender_image,
            rp.nickname AS live_recipient_nickname, rp.mbti AS live_recipient_mbti, rp.socionics AS live_recipient_socionics,
            rp.enneagram AS live_recipient_enneagram, rp.other_type AS live_recipient_other_type, rp.bio AS live_recipient_bio,
            rp.links AS live_recipient_links, rp.profile_image_url AS live_recipient_image
          FROM direct_messages dm
          LEFT JOIN profiles sp ON (sp.guest_key = dm.sender_guest_key OR ('user:' || sp.user_id::text) = dm.sender_guest_key)
          LEFT JOIN profiles rp ON (rp.guest_key = dm.recipient_guest_key OR ('user:' || rp.user_id::text) = dm.recipient_guest_key)
          WHERE dm.sender_guest_key=${key} OR dm.recipient_guest_key=${key}
          ORDER BY dm.created_at DESC LIMIT 200`;
        return json({ messages: rows.reverse().map((row: any) => {
          const senderSnapshot = row.sender_profile && typeof row.sender_profile === "object" ? row.sender_profile : {};
          const recipientSnapshot = row.recipient_profile && typeof row.recipient_profile === "object" ? row.recipient_profile : {};
          // Snapshot objects may exist but contain empty strings. Fill each blank field
          // from the live profile join instead of letting an empty JSON object mask it.
          const senderProfile = {
            nickname: senderSnapshot.nickname || row.live_sender_nickname || row.sender_name || "",
            mbti: senderSnapshot.mbti || row.live_sender_mbti || "",
            socionics: senderSnapshot.socionics || row.live_sender_socionics || "",
            enneagram: senderSnapshot.enneagram || row.live_sender_enneagram || "",
            other_type: senderSnapshot.other_type || senderSnapshot.otherType || row.live_sender_other_type || "",
            bio: senderSnapshot.bio || row.live_sender_bio || "",
            links: Array.isArray(senderSnapshot.links) && senderSnapshot.links.length ? senderSnapshot.links : (row.live_sender_links || []),
            profile_image_url: senderSnapshot.profile_image_url || senderSnapshot.profileImageUrl || row.live_sender_image || "",
          };
          const recipientProfile = {
            nickname: recipientSnapshot.nickname || row.live_recipient_nickname || row.recipient_name || "",
            mbti: recipientSnapshot.mbti || row.live_recipient_mbti || "",
            socionics: recipientSnapshot.socionics || row.live_recipient_socionics || "",
            enneagram: recipientSnapshot.enneagram || row.live_recipient_enneagram || "",
            other_type: recipientSnapshot.other_type || recipientSnapshot.otherType || row.live_recipient_other_type || "",
            bio: recipientSnapshot.bio || row.live_recipient_bio || "",
            links: Array.isArray(recipientSnapshot.links) && recipientSnapshot.links.length ? recipientSnapshot.links : (row.live_recipient_links || []),
            profile_image_url: recipientSnapshot.profile_image_url || recipientSnapshot.profileImageUrl || row.live_recipient_image || "",
          };
          return {
            id: row.id, thread_id: row.thread_id, sender_name: row.sender_name, recipient_name: row.recipient_name,
            body: row.body, bottle_id: row.bottle_id, bottle_snippet: row.bottle_snippet, bottle_author: row.bottle_author,
            bottle_type: row.bottle_type, created_at: row.created_at,
            sender_profile: senderProfile, recipient_profile: recipientProfile,
            sender_identity: { mbti: senderProfile.mbti || "", socionics: senderProfile.socionics || "", enneagram: senderProfile.enneagram || "", other_type: senderProfile.other_type || senderProfile.otherType || "" },
            is_mine: row.sender_guest_key === key, read: Boolean(row.read_at),
          };
        }) }, 200, env, request);
      }

      if (directMessageReadMatch && method === "POST") {
        if (!key) return json({ error: "missing_guest_key" }, 422, env, request);
        await sql`UPDATE direct_messages SET read_at=NOW(),updated_at=NOW() WHERE id=${Number(directMessageReadMatch[1])} AND recipient_guest_key=${key} AND read_at IS NULL`;
        return json({ ok: true }, 200, env, request);
      }

      if (bottleMatch && method === "GET" && bottleMatch[2] === "replies") {
        const rows = key ? await sql`SELECT r.* FROM replies r JOIN bottles b ON b.id=r.bottle_id WHERE r.bottle_id=${Number(bottleMatch[1])} AND b.guest_key=${key} AND r.deleted_at IS NULL ORDER BY r.created_at DESC` : [];
        return json({ replies: rows }, 200, env, request);
      }

      if (replyReactionMatch && method === "POST") {
        if (!key) return json({ error: "missing_guest_key" }, 422, env, request);
        const id = Number(replyReactionMatch[1]);
        const rows = await sql`WITH updated AS (UPDATE reply_reactions SET level=level+1,updated_at=NOW() WHERE reply_id=${id} AND guest_key=${key} RETURNING level)
          INSERT INTO reply_reactions (reply_id,guest_key,level,created_at,updated_at) SELECT ${id},${key},1,NOW(),NOW() WHERE NOT EXISTS (SELECT 1 FROM updated) RETURNING level`;
        const level = rows.length ? rows[0].level : (await sql`SELECT level FROM reply_reactions WHERE reply_id=${id} AND guest_key=${key} ORDER BY id DESC LIMIT 1`)[0]?.level;
        return json({ level: Number(level || 1) }, 200, env, request);
      }

      if (bottleMatch && method === "POST" && bottleMatch[2] === "votes") {
        if (!key) return json({ error: "missing_guest_key" }, 422, env, request);
        const b = await bodyOf(request); const index = Number(b.option_index); const id = Number(bottleMatch[1]);
        await sql`INSERT INTO poll_votes (bottle_id,guest_key,option_index,created_at,updated_at) SELECT ${id},${key},${index},NOW(),NOW() WHERE NOT EXISTS (SELECT 1 FROM poll_votes WHERE bottle_id=${id} AND guest_key=${key})`;
        return json({ ok: true }, 200, env, request);
      }

      if (path === "/api/notifications/unread" && method === "GET") {
        if (!key) return json({ count: 0, counts: {}, notifications: [] }, 200, env, request);
        const rows = await sql`SELECT * FROM notifications WHERE guest_key=${key} AND user_id IS NULL AND read_at IS NULL ORDER BY created_at DESC LIMIT 50`;
        const counts = await sql`SELECT type,COUNT(*)::int AS total FROM notifications WHERE guest_key=${key} AND user_id IS NULL AND read_at IS NULL GROUP BY type`;
        return json({ count: counts.reduce((n: number, row: any) => n + Number(row.total), 0), counts: Object.fromEntries(counts.map((row: any) => [row.type, Number(row.total)])), notifications: rows }, 200, env, request);
      }
      if (notificationMatch && method === "POST") {
        if (!key) return json({ error: "missing_guest_key" }, 422, env, request);
        await sql`UPDATE notifications SET read_at=NOW(),updated_at=NOW() WHERE id=${Number(notificationMatch[1])} AND guest_key=${key} AND user_id IS NULL`;
        return json({ ok: true }, 200, env, request);
      }
      if (path === "/api/notifications/read-all" && method === "POST") {
        if (!key) return json({ ok: false, message: "missing_guest_key" }, 422, env, request);
        const b = await bodyOf(request); const types: string[] = Array.isArray(b.types) ? b.types.map((t: any) => clean(t,60)).filter(Boolean) : [];
        const updated = types.length ? await sql`UPDATE notifications SET read_at=NOW(),updated_at=NOW() WHERE guest_key=${key} AND user_id IS NULL AND read_at IS NULL AND type=ANY(${types}) RETURNING id` : await sql`UPDATE notifications SET read_at=NOW(),updated_at=NOW() WHERE guest_key=${key} AND user_id IS NULL AND read_at IS NULL RETURNING id`;
        return json({ ok: true, updated: updated.length }, 200, env, request);
      }

      if (path === "/api/consultations" && method === "GET") {
        const rows = await sql`SELECT * FROM consultation_entries WHERE entry_type='thread' ORDER BY created_at DESC LIMIT 100`;
        return json({ entries: rows }, 200, env, request);
      }
      if (path === "/api/consultations/events" && method === "POST") {
        if (!key) return json({ error: "missing_guest_key" }, 422, env, request);
        const b = await bodyOf(request); const external = clean(b.external_id,120); const type = clean(b.entry_type,30);
        if (!external || !["thread","reply","followup"].includes(type)) return json({ message: "invalid consultation entry" }, 422, env, request);
        const rows = await sql`INSERT INTO consultation_entries (external_id,parent_external_id,entry_type,category,body,payload,guest_key,created_at,updated_at) VALUES (${external},${nullable(b.parent_external_id)},${type},${nullable(b.category)},${nullable(b.body)},${b.payload ? JSON.stringify(b.payload) : null}::jsonb,${key},NOW(),NOW()) ON CONFLICT (external_id) DO UPDATE SET parent_external_id=EXCLUDED.parent_external_id,entry_type=EXCLUDED.entry_type,category=EXCLUDED.category,body=EXCLUDED.body,payload=EXCLUDED.payload,updated_at=NOW() RETURNING *`;
        if (type !== "thread" && b.parent_external_id) { const parent = await sql`SELECT guest_key FROM consultation_entries WHERE external_id=${clean(b.parent_external_id,120)}`; if (parent[0]?.guest_key && parent[0].guest_key !== key) await sql`INSERT INTO notifications (guest_key,type,entity_id,message,created_at,updated_at) VALUES (${parent[0].guest_key},'consultation_reply',${clean(b.parent_external_id,120)},'自認相談室に新しい返信が届きました。',NOW(),NOW())`; }
        return json({ ok: true, entry: rows[0] }, 201, env, request);
      }

      if (path === "/api/question-prompts" && method === "GET") {
        return json({ questions: await sql`SELECT id,body,usage_count FROM question_prompts WHERE approved=true ORDER BY created_at DESC LIMIT 100` }, 200, env, request);
      }
      if (path === "/api/question-prompts" && method === "POST") {
        if (!key) return json({ error: "missing_guest_key" }, 422, env, request); const b = await bodyOf(request); const text = clean(b.body,500);
        if (!text) return json({ message: "body is required" }, 422, env, request);
        const rows = await sql`INSERT INTO question_prompts (body,guest_key,approved,usage_count,created_at,updated_at) VALUES (${text},${key},true,0,NOW(),NOW()) RETURNING *`;
        return json({ question: rows[0] }, 201, env, request);
      }

      if (path === "/api/plaza/chain" && method === "GET") {
        let rows = await sql`SELECT * FROM plaza_chain_states ORDER BY id LIMIT 1`;
        if (!rows.length) rows = await sql`INSERT INTO plaza_chain_states (body,updated_guest_key,created_at,updated_at) VALUES ('海辺で、最初に見つけたのは',${key || null},NOW(),NOW()) RETURNING *`;
        return json({ chain: rows[0] }, 200, env, request);
      }
      if (path === "/api/plaza/chain" && method === "POST") {
        if (!key) return json({ error: "missing_guest_key" }, 422, env, request); const b = await bodyOf(request); const text = clean(b.body,48);
        if (!text) return json({ message: "body is required" }, 422, env, request);
        const rows = await sql`UPDATE plaza_chain_states SET body=trim(body)||' '||${text},updated_guest_key=${key},updated_by=NULL,updated_at=NOW() WHERE id=(SELECT id FROM plaza_chain_states ORDER BY id LIMIT 1) RETURNING *`;
        return json({ chain: rows[0] || null }, 201, env, request);
      }

      if (path === "/api/activity-events" && method === "POST") {
        if (!key) return json({ error: "missing_guest_key" }, 422, env, request); const b = await bodyOf(request);
        const rows = await sql`INSERT INTO activity_events (guest_key,event_type,entity_type,entity_id,payload,created_at,updated_at) VALUES (${key},${clean(b.event_type,80)},${nullable(b.entity_type)},${nullable(b.entity_id)},${b.payload ? JSON.stringify(b.payload) : null}::jsonb,NOW(),NOW()) RETURNING id`;
        return json({ ok: true, event_id: rows[0]?.id }, 201, env, request);
      }
      if (path === "/api/feedback" && method === "POST") {
        if (!key) return json({ error: "missing_guest_key" }, 422, env, request);
        const b = await bodyOf(request); const text = clean(b.body,5000);
        if (!text) return json({ message: "body is required" }, 422, env, request);
        const rows = await sql`INSERT INTO feedback (guest_key,category,body,contact_email,status,created_at,updated_at) VALUES (${key},${nullable(b.category)},${text},${nullable(b.contact_email)},'new',NOW(),NOW()) RETURNING id,status`;
        return json({ feedback: rows[0] }, 201, env, request);
      }

      if (path === "/api/presence/join" && method === "POST") {
        const b = await bodyOf(request); const session = clean(b.session_key,120); if (!session || !key) return json({ error: "missing_session_or_guest_key" },422,env,request);
        const rows = await sql`INSERT INTO presence_sessions (session_key,guest_key,nickname,last_seen_at,joined_at,left_at,active,created_at,updated_at) VALUES (${session},${key},${nullable(b.nickname)},NOW(),NOW(),NULL,true,NOW(),NOW()) ON CONFLICT (session_key) DO UPDATE SET guest_key=EXCLUDED.guest_key,nickname=EXCLUDED.nickname,last_seen_at=NOW(),joined_at=NOW(),left_at=NULL,active=true,updated_at=NOW() RETURNING session_key,nickname,last_seen_at`;
        const count = await sql`SELECT COUNT(*)::int AS count FROM presence_sessions WHERE active=true AND last_seen_at>NOW()-INTERVAL '45 seconds'`;
        return json({ ok:true,session:rows[0],count:Number(count[0]?.count||0) },200,env,request);
      }
      if (path === "/api/presence/heartbeat" && method === "POST") {
        const b=await bodyOf(request); const session=clean(b.session_key,120); if(!session) return json({error:"missing_session_key"},422,env,request);
        const rows=await sql`UPDATE presence_sessions SET last_seen_at=NOW(),left_at=NULL,active=true,updated_at=NOW() WHERE session_key=${session} AND guest_key=${key} RETURNING session_key,nickname,last_seen_at`;
        const count=await sql`SELECT COUNT(*)::int AS count FROM presence_sessions WHERE active=true AND last_seen_at>NOW()-INTERVAL '45 seconds'`;
        return rows.length?json({ok:true,session:rows[0],count:Number(count[0]?.count||0)},200,env,request):json({error:"session_not_found"},404,env,request);
      }
      if (path === "/api/presence/leave" && method === "POST") {
        const b=await bodyOf(request); await sql`UPDATE presence_sessions SET left_at=NOW(),active=false,updated_at=NOW() WHERE session_key=${clean(b.session_key,120)} AND guest_key=${key}`; return json({ok:true},200,env,request);
      }
      if (path === "/api/presence/online" && method === "GET") {
        const rows=await sql`UPDATE presence_sessions SET active=false,left_at=NOW(),updated_at=NOW() WHERE active=true AND last_seen_at<NOW()-INTERVAL '45 seconds'`;
        const count=await sql`SELECT COUNT(*)::int AS count FROM presence_sessions WHERE active=true`; return json({count:Number(count[0]?.count||0)},200,env,request);
      }

      if (path === "/api/plaza/messages" && method === "GET") return json({ messages: await sql`SELECT * FROM (SELECT * FROM plaza_messages ORDER BY created_at DESC LIMIT 50) m ORDER BY created_at ASC` }, 200, env, request);
      if (path === "/api/plaza/messages" && method === "POST") {
        if (!key) return json({error:"missing_guest_key"},422,env,request); const b=await bodyOf(request); const text=clean(b.body,280); if(!text) return json({message:"body is required"},422,env,request);
        const rows=await sql`INSERT INTO plaza_messages (guest_key,nickname,body,created_at,updated_at) VALUES (${key},${nullable(b.nickname)},${text},NOW(),NOW()) RETURNING *`; return json({message:rows[0]},201,env,request);
      }

      if (path === "/api/worm/ranking" && method === "GET") {
        const clientKey = clean(url.searchParams.get("clientKey"), 100);
        const rows = await sql`SELECT client_key, nickname, score FROM worm_scores ORDER BY score DESC, updated_at ASC LIMIT 20`;
        return json({ scores: rows.map((row: any) => ({ client_key: row.client_key, nickname: row.nickname, score: Number(row.score) || 0 })), clientKey: clientKey || undefined }, 200, env, request);
      }

      if (path === "/api/worm/ranking" && method === "POST") {
        const body = await bodyOf(request);

        const clientKey = clean(body.clientKey, 100);
        const nickname = clean(body.nickname, 80) || "匿名の芋虫";
        const score = Math.max(0, Math.floor(Number(body.score) || 0));

        if (!clientKey || score <= 0) return json({ error: "invalid score" }, 422, env, request);

        await sql`
          INSERT INTO worm_scores (client_key, nickname, score, created_at, updated_at)
          VALUES (${clientKey}, ${nickname}, ${score}, NOW(), NOW())
          ON CONFLICT (client_key)
          DO UPDATE SET
            nickname = EXCLUDED.nickname,
            score = GREATEST(worm_scores.score, EXCLUDED.score),
            updated_at = NOW()
        `;

        return json({ ok: true }, 200, env, request);
      }

      return json({ error: "not_found" }, 404, env, request);
    } catch (error) {
      fail(error);
      return json({ error: "database error" }, 500, env, request);
    }
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledAiEngagement(env));
  },
};

