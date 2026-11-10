import { NextRequest, NextResponse } from "next/server";
import { db, readSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The admin identity is checked on the server, never from a client-provided email.
const ADMIN_EMAILS = new Set(["momoka.mimika1122@gmail.com"]);

export async function GET(request: NextRequest) {
  const userId = readSession(request);
  if (!userId) {
    return NextResponse.json(
      { authenticated: false, isAdmin: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const sql = db();
    const rows = await sql`SELECT id, name, email FROM users WHERE id = ${userId} LIMIT 1`;
    const user = rows[0] as { id: number; name: string; email: string } | undefined;
    if (!user) {
      return NextResponse.json(
        { authenticated: false, isAdmin: false },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const email = String(user.email || "").trim().toLowerCase();
    const isAdmin = ADMIN_EMAILS.has(email);
    return NextResponse.json(
      {
        authenticated: true,
        user: { id: Number(user.id), name: user.name, email },
        email,
        isAdmin,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[Type Drift auth/me] failed", error);
    return NextResponse.json(
      { authenticated: false, isAdmin: false, error: "session_lookup_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
