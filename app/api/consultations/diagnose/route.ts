import { NextRequest, NextResponse } from "next/server";
import { db, readSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = new Set(["momoka.mimika1122@gmail.com"]);

export async function POST(request: NextRequest) {
  try {
    const userId = readSession(request);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const postId = typeof body.postId === "string" ? body.postId.trim() : "";
    const result = body.diagnosisResult;
    if (!postId || !result || typeof result !== "object" ||
        typeof result.rank1 !== "string" || !result.rank1.trim() ||
        typeof result.reasoning !== "string" || !result.reasoning.trim()) {
      return NextResponse.json({ ok: false, error: "invalid_diagnosis" }, { status: 400 });
    }

    const sql = db();
    const users = await sql`SELECT email FROM users WHERE id = ${userId} LIMIT 1`;
    const email = String((users[0] as { email?: string } | undefined)?.email || "").trim().toLowerCase();
    if (!ADMIN_EMAILS.has(email)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const saved = await sql`
      UPDATE consultation_entries
      SET payload = (
        COALESCE(payload::jsonb, '{}'::jsonb) ||
        jsonb_build_object(
          'status', 'diagnosed',
          'diagnosisResult', ${JSON.stringify(result)}::jsonb
        )
      )::json,
      updated_at = NOW()
      WHERE external_id = ${postId} AND entry_type = 'thread'
      RETURNING external_id
    `;

    if (!saved.length) {
      return NextResponse.json({ ok: false, error: "consultation_not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, postId }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[Type Drift] diagnosis result save failed", error);
    return NextResponse.json({ ok: false, error: "diagnosis_save_failed" }, { status: 500 });
  }
}
