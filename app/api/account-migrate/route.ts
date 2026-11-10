import { NextRequest, NextResponse } from "next/server";
import { db, readSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const userId = readSession(request);
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const guestKey = String(request.headers.get("x-guest-key") || "").trim();
  if (!guestKey || guestKey.length > 200) {
    return NextResponse.json({ error: "guest_key_required" }, { status: 400 });
  }

  try {
    const sql = db();
    // Attach only the guest profile whose opaque key is present in this browser.
    // Never infer ownership from nickname, email, or post count.
    const current = await sql`SELECT id FROM profiles WHERE user_id = ${userId} LIMIT 1`;
    if (current.length) {
      return NextResponse.json({ ok: true, migrated: false, reason: "account_profile_exists" });
    }
    const rows = await sql`
      UPDATE profiles
      SET user_id = ${userId}, guest_key = NULL, updated_at = NOW()
      WHERE guest_key = ${guestKey} AND user_id IS NULL
      RETURNING id
    `;
    return NextResponse.json({ ok: true, migrated: rows.length > 0, reason: rows.length ? "guest_profile_attached" : "no_matching_guest_profile" });
  } catch (error) {
    console.error("[Type Drift account-migrate] failed", error);
    return NextResponse.json({ error: "account_migration_failed" }, { status: 500 });
  }
}
