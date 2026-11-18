import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server-auth";
import { bodyOf, clean, ensureBottleQuoteColumn, noStoreHeaders, nullable, resolveIdentity } from "@/lib/fallback-core";

// Node (Vercel) fallback for the Worker's /api/bottles collection routes.
// Behavior mirrors cloudflare/type-drift-api-fallback/index.js so the
// frontend can fail over to this same-origin route when the Worker is down.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

export async function GET(request: NextRequest) {
  try {
    const sql = db();
    const { keySet } = await resolveIdentity(request);
    await ensureBottleQuoteColumn();
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const offset = (page - 1) * 20;
    const mbti = url.searchParams.get("mbti")?.toLowerCase() || null;
    const soc = url.searchParams.get("socionics")?.toLowerCase() || null;
    const q = url.searchParams.get("q") || null;
    const rows = (await sql`
      SELECT b.*,
        (SELECT body FROM bottles WHERE id=b.quoted_bottle_id) AS quoted_body,
        (SELECT mbti FROM bottles WHERE id=b.quoted_bottle_id) AS quoted_mbti,
        (SELECT socionics FROM bottles WHERE id=b.quoted_bottle_id) AS quoted_socionics,
        (SELECT enneagram FROM bottles WHERE id=b.quoted_bottle_id) AS quoted_enneagram,
        (SELECT other_type FROM bottles WHERE id=b.quoted_bottle_id) AS quoted_other_type,
        (SELECT is_ai FROM bottles WHERE id=b.quoted_bottle_id) AS quoted_is_ai,
        (SELECT ai_character FROM bottles WHERE id=b.quoted_bottle_id) AS quoted_ai_character,
        (SELECT (deleted_at IS NOT NULL) FROM bottles WHERE id=b.quoted_bottle_id) AS quoted_deleted,
        (SELECT COUNT(*)::int FROM replies r WHERE r.bottle_id=b.id AND r.deleted_at IS NULL) AS replies_count,
        (SELECT COALESCE(SUM(rx.level),0)::int FROM reactions rx WHERE rx.bottle_id=b.id) AS reactions_sum_level,
        COALESCE((SELECT rx.level FROM reactions rx WHERE rx.bottle_id=b.id AND rx.guest_key = ANY(${keySet}) ORDER BY rx.id DESC LIMIT 1),0)::int AS reaction_level,
        (SELECT COALESCE(array_agg(CASE rx.guest_key WHEN 'ai:darling' THEN '🥺 ダーリンちゃん' WHEN 'ai:lsi-worm' THEN '🐛 LSI芋虫' END), ARRAY[]::text[]) FROM reactions rx WHERE rx.bottle_id=b.id AND rx.guest_key IN ('ai:darling','ai:lsi-worm') AND rx.level > 0) AS ai_likers,
        (b.guest_key = ANY(${keySet})) AS is_mine
      FROM bottles b WHERE b.deleted_at IS NULL AND (${mbti}::text IS NULL OR LOWER(b.mbti)=${mbti})
        AND (${soc}::text IS NULL OR LOWER(b.socionics)=${soc}) AND (${q}::text IS NULL OR b.body ILIKE '%'||${q}||'%')
      ORDER BY b.created_at DESC LIMIT 20 OFFSET ${offset}`) as Row[];
    const totalRows = (await sql`SELECT COUNT(*)::int AS total FROM bottles b WHERE b.deleted_at IS NULL AND (${mbti}::text IS NULL OR LOWER(b.mbti)=${mbti}) AND (${soc}::text IS NULL OR LOWER(b.socionics)=${soc}) AND (${q}::text IS NULL OR b.body ILIKE '%'||${q}||'%')`) as Row[];
    const total = Number(totalRows[0]?.total || 0);
    return NextResponse.json(
      { bottles: { data: rows, current_page: page, last_page: Math.max(1, Math.ceil(total / 20)), total } },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("[Type Drift fallback] GET /api/bottles failed", error);
    return NextResponse.json({ error: "database error" }, { status: 500, headers: noStoreHeaders });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sql = db();
    const { key } = await resolveIdentity(request);
    const b2 = (await bodyOf(request)) as Row;
    if (!key || !clean(b2.body, 5000)) {
      return NextResponse.json({ message: "A guest key and body are required." }, { status: 422, headers: noStoreHeaders });
    }
    const allowLikes = ![false, "false", 0, "0", "f"].includes(b2.allow_likes ?? b2.allowLikes ?? true);
    const allowReplies = ![false, "false", 0, "0", "f"].includes(b2.allow_replies ?? b2.allowReplies ?? true);
    await ensureBottleQuoteColumn();
    let quotedId: number | null = null;
    let quotedOwner: Row | null = null;
    if (b2.quoted_bottle_id != null) {
      const qid = Number(b2.quoted_bottle_id);
      if (!Number.isFinite(qid) || qid <= 0) {
        return NextResponse.json({ message: "quoted_bottle_id is invalid" }, { status: 422, headers: noStoreHeaders });
      }
      const target = (await sql`SELECT guest_key, allow_replies, is_ai FROM bottles WHERE id=${qid} AND deleted_at IS NULL`) as Row[];
      if (!target.length) {
        return NextResponse.json({ message: "quoted bottle not found" }, { status: 422, headers: noStoreHeaders });
      }
      const targetAllowsReplies = ![false, "false", 0, "0", "f"].includes(target[0].allow_replies ?? true);
      if (!targetAllowsReplies) {
        return NextResponse.json({ message: "this bottle cannot be quoted" }, { status: 422, headers: noStoreHeaders });
      }
      quotedId = qid;
      quotedOwner = target[0];
    }
    if (Boolean(b2.is_ai)) {
      // Sea rule (owner request): AI bottles never drift in twice in a row.
      const latest = (await sql`SELECT is_ai FROM bottles WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1`) as Row[];
      if (latest.length && latest[0].is_ai) {
        return NextResponse.json({ skipped: "ai_bottle_cooldown" }, { headers: noStoreHeaders });
      }
      // Near-duplicate guard against recent AI bottles.
      const bigramsOf = (text: unknown) => {
        const t = String(text || "").replace(/\s+/g, "");
        const set = new Set<string>();
        for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
        return set;
      };
      const newBody = String(b2.body || "");
      const newGrams = bigramsOf(newBody);
      const newHead = newBody.replace(/\s+/g, "").slice(0, 8);
      if (newGrams.size) {
        const recentAi = (await sql`SELECT body FROM bottles WHERE is_ai AND deleted_at IS NULL ORDER BY id DESC LIMIT 10`) as Row[];
        const tooSimilar = recentAi.some((row) => {
          const g = bigramsOf(row.body);
          if (!g.size) return false;
          let inter = 0;
          for (const x of newGrams) if (g.has(x)) inter++;
          const jaccard = inter / (newGrams.size + g.size - inter);
          const sameHead = newHead.length >= 8 && String(row.body || "").replace(/\s+/g, "").slice(0, 8) === newHead;
          return jaccard >= 0.35 || sameHead;
        });
        if (tooSimilar) {
          return NextResponse.json({ skipped: "ai_bottle_too_similar" }, { headers: noStoreHeaders });
        }
      }
    }
    const rows = (await sql`INSERT INTO bottles (guest_key,body,image_url,mbti,socionics,enneagram,other_type,is_ai,ai_character,poll_options,allow_likes,allow_replies,quoted_bottle_id,created_at,updated_at)
      VALUES (${key},${clean(b2.body, 5000)},${nullable(b2.image_url)},${nullable(b2.mbti)},${nullable(b2.socionics)},${nullable(b2.enneagram)},${nullable(b2.other_type)},${Boolean(b2.is_ai)},${nullable(b2.ai_character)},${b2.poll_options ? JSON.stringify(b2.poll_options) : null}::jsonb,${allowLikes},${allowReplies},${quotedId},NOW(),NOW()) RETURNING *`) as Row[];
    if (quotedId && quotedOwner && quotedOwner.guest_key && quotedOwner.guest_key !== key && !quotedOwner.is_ai) {
      await sql`INSERT INTO notifications (guest_key,type,entity_id,message,created_at,updated_at) VALUES (${quotedOwner.guest_key},'bottle_quoted',${String(rows[0].id)},'あなたのボトルが引用されました。',NOW(),NOW())`;
    }
    return NextResponse.json({ bottle: rows[0] }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    console.error("[Type Drift fallback] POST /api/bottles failed", error);
    return NextResponse.json({ error: "database error" }, { status: 500, headers: noStoreHeaders });
  }
}
