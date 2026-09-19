import { neon } from "@neondatabase/serverless";

export interface Env {
  NEON_DATABASE_URL: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(init.headers || {}),
    },
  });

const clean = (value: unknown, max: number) =>
  String(value ?? "").trim().slice(0, max);

async function ranking(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sql = neon(env.NEON_DATABASE_URL);
  const clientKey = clean(url.searchParams.get("clientKey"), 100);

  const scores = await sql`
    SELECT client_key, nickname, score, updated_at
    FROM worm_scores
    WHERE score > 0
    ORDER BY score DESC, updated_at ASC
    LIMIT 5
  `;

  let result = [...scores];

  if (clientKey && !result.some(row => row.client_key === clientKey)) {
    const self = await sql`
      SELECT client_key, nickname, score, updated_at
      FROM worm_scores
      WHERE client_key = ${clientKey} AND score > 0
      LIMIT 1
    `;
    if (self.length) result.push(self[0]);
  }

  return json({ scores: result });
}

async function saveScore(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null) as
    | { clientKey?: unknown; nickname?: unknown; score?: unknown }
    | null;

  const clientKey = clean(body?.clientKey, 100);
  const nickname = clean(body?.nickname, 80);
  const score = Number(body?.score);

  if (!clientKey || !nickname || !Number.isInteger(score) || score < 0 || score > 100000) {
    return json({ message: "invalid payload" }, { status: 422 });
  }

  const sql = neon(env.NEON_DATABASE_URL);
  await sql`
    INSERT INTO worm_scores (client_key, nickname, score, created_at, updated_at)
    VALUES (${clientKey}, ${nickname}, ${score}, NOW(), NOW())
    ON CONFLICT (client_key) DO UPDATE
      SET nickname = EXCLUDED.nickname,
          score = EXCLUDED.score,
          updated_at = NOW()
      WHERE worm_scores.score < EXCLUDED.score
  `;

  return json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/worm/ranking" && request.method === "GET") {
        return await ranking(request, env);
      }
      if (url.pathname === "/api/worm/ranking" && request.method === "POST") {
        return await saveScore(request, env);
      }
      return json({ message: "not found" }, { status: 404 });
    } catch (error) {
      console.error(error);
      return json({ message: "ranking service unavailable" }, { status: 503 });
    }
  },
};
