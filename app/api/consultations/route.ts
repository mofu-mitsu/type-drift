import { NextResponse } from "next/server";
import { db } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Entry = {
  id: number;
  external_id: string;
  parent_external_id: string | null;
  entry_type: string;
  category: string | null;
  body: string | null;
  payload: unknown;
  created_at: string | Date;
};

function objectPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {}
  }
  return {};
}

export async function GET() {
  try {
    const sql = db();
    const threads = await sql`
      SELECT id, external_id, parent_external_id, entry_type, category, body, payload, created_at
      FROM consultation_entries
      WHERE entry_type = 'thread'
      ORDER BY created_at DESC
      LIMIT 100
    ` as Entry[];

    if (!threads.length) {
      return NextResponse.json({ entries: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    // Replies are stored as separate rows. Fetch them and attach them to their parent
    // thread so the consultation UI can render comments after reloads and on other devices.
    const children = await sql`
      SELECT id, external_id, parent_external_id, entry_type, category, body, payload, created_at
      FROM consultation_entries
      WHERE entry_type IN ('reply', 'followup')
        AND parent_external_id IS NOT NULL
      ORDER BY created_at ASC
      LIMIT 1000
    ` as Entry[];

    const commentsByThread = new Map<string, Record<string, unknown>[]>();
    for (const entry of children) {
      if (entry.entry_type !== "reply" || !entry.parent_external_id) continue;
      const payload = objectPayload(entry.payload);
      // Reaction events share the reply table but are not user comments.
      if (payload.kind === "reaction" || entry.body === "reaction") continue;

      const comment = {
        ...payload,
        id: entry.external_id,
        body: typeof entry.body === "string" ? entry.body : String(payload.body || ""),
        createdAt: payload.createdAt || entry.created_at,
        reaction: Number(payload.reaction || 0),
      };
      const group = commentsByThread.get(entry.parent_external_id) || [];
      group.push(comment);
      commentsByThread.set(entry.parent_external_id, group);
    }

    const entries = threads.map((thread) => {
      const payload = objectPayload(thread.payload);
      const savedComments = commentsByThread.get(thread.external_id) || [];
      const legacyComments = Array.isArray(payload.comments)
        ? payload.comments.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        : [];
      const byId = new Map<string, Record<string, unknown>>();
      for (const comment of legacyComments) {
        if (typeof comment.id === "string") byId.set(comment.id, comment);
      }
      for (const comment of savedComments) {
        if (typeof comment.id === "string") byId.set(comment.id, comment);
      }
      return {
        ...thread,
        payload: { ...payload, comments: Array.from(byId.values()) },
      };
    });

    return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Type Drift] consultation list failed", error);
    return NextResponse.json({ entries: [], error: "consultations_unavailable" }, { status: 500 });
  }
}
