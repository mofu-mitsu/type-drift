import { NextRequest, NextResponse } from "next/server";
import { db, readSession } from "@/lib/server-auth";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const userId = readSession(request);
  if (!userId) return NextResponse.json({ user: null }, { status: 401 });
  try {
    const rows = await db()`SELECT id, name, email, oauth_provider, oauth_id FROM users WHERE id = ${userId} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user: rows[0] });
  } catch (error) {
    console.error("[Type Drift Auth] /api/me failed", error);
    return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
  }
}
