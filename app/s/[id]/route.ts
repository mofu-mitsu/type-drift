import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server-auth";

export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const sql = db();
    const rows = await sql`SELECT kind FROM shared_links WHERE id = ${id} LIMIT 1`;
    if (!rows.length) return NextResponse.redirect(new URL("/?share=not-found", request.nextUrl.origin));
    const kind = String(rows[0].kind);
    const destination = kind === "profile" ? new URL("/profile", request.nextUrl.origin) : new URL("/", request.nextUrl.origin);
    if (kind === "horoscope") {
      destination.searchParams.set("page", "stars");
      destination.searchParams.set("share", id);
      destination.hash = "typedrift";
    } else if (kind === "profile") {
      destination.searchParams.set("share", id);
    } else if (kind === "worm-beach") {
      destination.searchParams.set("page", "games");
      destination.searchParams.set("share", id);
      destination.hash = "typedrift";
    }
    return NextResponse.redirect(destination);
  } catch (error) {
    console.error("[Type Drift share] redirect failed", error);
    return NextResponse.redirect(new URL("/?share=error", request.nextUrl.origin));
  }
}
