import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{6,12}$/.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const sql = db();
    const rows = await sql`SELECT kind, payload FROM shared_links WHERE id = ${id} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ kind: rows[0].kind, payload: rows[0].payload }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Type Drift share] lookup failed", error);
    return NextResponse.json({ error: "share_lookup_failed" }, { status: 500 });
  }
}
