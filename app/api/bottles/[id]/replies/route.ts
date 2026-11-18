import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server-auth";
import { bodyOf, clean, noStoreHeaders, resolveIdentity } from "@/lib/fallback-core";

// Node (Vercel) fallback for the Worker's /api/bottles/:id/replies routes.
// Like the Worker, the list is the bottle owner's view, and posting a reply
// mirrors it into the owner's DM inbox with a notification.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = db();
    const { key, keySet } = await resolveIdentity(request);
    const { id } = await params;
    const rows = key
      ? ((await sql`SELECT r.* FROM replies r JOIN bottles b ON b.id=r.bottle_id WHERE r.bottle_id=${Number(id)} AND b.guest_key = ANY(${keySet}) AND r.deleted_at IS NULL ORDER BY r.created_at DESC`) as Row[])
      : [];
    return NextResponse.json({ replies: rows }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("[Type Drift fallback] GET /api/bottles/:id/replies failed", error);
    return NextResponse.json({ error: "database error" }, { status: 500, headers: noStoreHeaders });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sql = db();
    const { key } = await resolveIdentity(request);
    if (!key) return NextResponse.json({ error: "missing_guest_key" }, { status: 422, headers: noStoreHeaders });
    const { id: idParam } = await params;
    const id = Number(idParam);
    const b2 = (await bodyOf(request)) as Row;
    const text = clean(b2.body, 5000);
    if (!text) return NextResponse.json({ message: "body is required" }, { status: 422, headers: noStoreHeaders });
    if (b2.parent_reply_id) {
      const p2 = (await sql`SELECT id FROM replies WHERE id=${Number(b2.parent_reply_id)} AND bottle_id=${id} AND deleted_at IS NULL`) as Row[];
      if (!p2.length) {
        return NextResponse.json({ message: "parent reply must belong to this bottle" }, { status: 422, headers: noStoreHeaders });
      }
    }
    const rows = (await sql`INSERT INTO replies (bottle_id,guest_key,body,parent_reply_id,created_at,updated_at) VALUES (${id},${key},${text},${b2.parent_reply_id ? Number(b2.parent_reply_id) : null},NOW(),NOW()) RETURNING *`) as Row[];
    const owner = (await sql`SELECT guest_key,body,mbti,socionics,enneagram,other_type,is_ai FROM bottles WHERE id=${id} AND deleted_at IS NULL`) as Row[];
    let directMessage: Row | null = null;
    if (owner[0]?.guest_key && owner[0].guest_key !== key && !owner[0].is_ai) {
      const type = [owner[0].mbti, owner[0].socionics, owner[0].enneagram, owner[0].other_type].filter(Boolean).join(" · ");
      const senderProfileRows = (await sql`SELECT nickname,mbti,socionics,enneagram,other_type,bio,links,profile_image_url FROM profiles WHERE guest_key=${key} LIMIT 1`) as Row[];
      const ownerProfileRows = (await sql`SELECT nickname,mbti,socionics,enneagram,other_type,bio,links,profile_image_url FROM profiles WHERE guest_key=${owner[0].guest_key} LIMIT 1`) as Row[];
      const dbSenderProfile = senderProfileRows[0] || {};
      const clientSenderProfile = b2.sender_profile && typeof b2.sender_profile === "object" ? b2.sender_profile : {};
      const senderProfile = { ...dbSenderProfile, ...Object.fromEntries(Object.entries(clientSenderProfile).filter(([_, value]) => value !== null && value !== "")) };
      const savedOwnerProfile = ownerProfileRows[0] || {};
      const recipientProfile = { ...savedOwnerProfile, mbti: owner[0].mbti || savedOwnerProfile.mbti || "", socionics: owner[0].socionics || savedOwnerProfile.socionics || "", enneagram: owner[0].enneagram || savedOwnerProfile.enneagram || "", other_type: owner[0].other_type || savedOwnerProfile.other_type || "" };
      const senderSnapshot = JSON.stringify(senderProfile);
      const recipientSnapshot = JSON.stringify(recipientProfile);
      const threadId = `bottle-${id}-pair-${[key, String(owner[0].guest_key)].sort().join("--")}`;
      const saved = (await sql`INSERT INTO direct_messages (sender_guest_key,recipient_guest_key,thread_id,sender_name,recipient_name,body,bottle_id,bottle_snippet,bottle_author,bottle_type,sender_profile,recipient_profile,created_at,updated_at)
        VALUES (${key},${owner[0].guest_key},${threadId},'匿名の誰か','波間に漂うボトルの主（匿名）',${text},${id},${owner[0].body},${type ? `匿名の${owner[0].mbti || owner[0].socionics || "誰か"}` : "匿名のボトル主"},${type},${senderSnapshot}::jsonb,${recipientSnapshot}::jsonb,NOW(),NOW()) RETURNING *`) as Row[];
      directMessage = saved[0];
      await sql`INSERT INTO notifications (guest_key,type,entity_id,message,created_at,updated_at) VALUES (${owner[0].guest_key},'bottle_reply',${String(id)},'あなたのボトルに返信が届きました。',NOW(),NOW())`;
    }
    return NextResponse.json({ reply: rows[0], direct_message: directMessage }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    console.error("[Type Drift fallback] POST /api/bottles/:id/replies failed", error);
    return NextResponse.json({ error: "database error" }, { status: 500, headers: noStoreHeaders });
  }
}
