import { neon } from "@neondatabase/serverless";

export interface Env {
  DATABASE_URL: string;
  ALLOWED_ORIGIN?: string;
}

const json = (data: unknown, status = 200, env?: Env) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": env?.ALLOWED_ORIGIN || "https://type-drift.vercel.app",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
  });

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return json({}, 204, env);

    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "type-drift-api" }, 200, env);
    }

    if (url.pathname !== "/api/worm/ranking") {
      return new Response("not found", { status: 404 });
    }

    if (!env.DATABASE_URL) return json({ error: "DATABASE_URL is not configured" }, 503, env);

    try {
      const sql = neon(env.DATABASE_URL);

      if (request.method === "GET") {
        const clientKey = clean(url.searchParams.get("clientKey"), 100);
        const rows = await sql`
          SELECT client_key, nickname, score
          FROM worm_scores
          ORDER BY score DESC, updated_at ASC
          LIMIT 20
        `;

        return json({
          scores: rows.map((row: any) => ({
            client_key: row.client_key,
            nickname: row.nickname,
            score: Number(row.score) || 0,
          })),
          clientKey: clientKey || undefined,
        }, 200, env);
      }

      if (request.method === "POST") {
        const body = await request.json().catch(() => ({})) as {
          clientKey?: string;
          nickname?: string;
          score?: number;
        };

        const clientKey = clean(body.clientKey, 100);
        const nickname = clean(body.nickname, 80) || "匿名の芋虫";
        const score = Math.max(0, Math.floor(Number(body.score) || 0));

        if (!clientKey || score <= 0) return json({ error: "invalid score" }, 422, env);

        await sql`
          INSERT INTO worm_scores (client_key, nickname, score, created_at, updated_at)
          VALUES (${clientKey}, ${nickname}, ${score}, NOW(), NOW())
          ON CONFLICT (client_key)
          DO UPDATE SET
            nickname = EXCLUDED.nickname,
            score = GREATEST(worm_scores.score, EXCLUDED.score),
            updated_at = NOW()
        `;

        return json({ ok: true }, 200, env);
      }

      return new Response("method not allowed", { status: 405 });
    } catch (error) {
      console.error(error);
      return json({ error: "database error" }, 500, env);
    }
  },
};
