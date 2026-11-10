import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { kind?: string; payload?: unknown };
    if (body.kind !== "horoscope" && body.kind !== "profile" && body.kind !== "worm-beach") {
      return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
    }
    const serialized = JSON.stringify(body.payload);
    if (!serialized || serialized.length > 30000) {
      return NextResponse.json({ error: "payload_too_large_or_empty" }, { status: 413 });
    }
    const payload = JSON.parse(serialized);
    const id = randomBytes(6).toString("base64url");
    const sql = db();
    await sql`INSERT INTO shared_links (id, kind, payload) VALUES (${id}, ${body.kind}, ${JSON.stringify(payload)}::jsonb)`;
    return NextResponse.json({ id, url: new URL(`/s/${id}`, request.nextUrl.origin).toString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Type Drift share] create failed", error);
    return NextResponse.json({ error: "share_create_failed" }, { status: 500 });
  }
}
