import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { db, setSessionCookie } from "@/lib/server-auth";

export const runtime = "nodejs";
const cookieOptions = (maxAge: number) => ({
  httpOnly: true, secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const, path: "/api/auth", maxAge,
});
function redirectUri(request: NextRequest, provider: string) {
  // Production OAuth callbacks must use the exact canonical hostname registered with
  // Google and X. Do not let stale redirect URI environment variables override it.
  if (process.env.VERCEL && process.env.VERCEL_ENV === "production") {
    return `https://type-drift.vercel.app/api/auth/${provider}/callback`;
  }
  const configured = provider === "google" ? process.env.GOOGLE_REDIRECT_URI : process.env.X_REDIRECT_URI;
  if (configured) return configured;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
  return new URL(`/api/auth/${provider}/callback`, `${request.nextUrl.protocol}//${host}`).toString();
}
function fail(request: NextRequest, reason: string) {
  const url = new URL("/", request.nextUrl.origin);
  url.searchParams.set("login", "error");
  url.searchParams.set("reason", reason);
  const response = NextResponse.redirect(url);
  response.cookies.set("td_oauth_state", "", cookieOptions(0));
  response.cookies.set("td_oauth_verifier", "", cookieOptions(0));
  return response;
}

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string; action: string }> }) {
  const { provider, action } = await context.params;
  if (provider !== "google" && provider !== "x") return NextResponse.json({ error: "Unsupported provider" }, { status: 404 });
  const clientId = provider === "google" ? process.env.GOOGLE_CLIENT_ID : process.env.X_CLIENT_ID;
  const clientSecret = provider === "google" ? process.env.GOOGLE_CLIENT_SECRET : process.env.X_CLIENT_SECRET;
  if (action === "redirect") {
    if (!clientId || (provider === "google" && !clientSecret)) return NextResponse.json({ error: `${provider} OAuth environment variables are missing` }, { status: 503 });
    const state = randomBytes(32).toString("base64url");
    const url = new URL(provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://twitter.com/i/oauth2/authorize");
    const redirect = redirectUri(request, provider);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    if (provider === "google") {
      url.searchParams.set("scope", "openid email profile");
      url.searchParams.set("prompt", "select_account");
    } else {
      const verifier = randomBytes(48).toString("base64url");
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      url.searchParams.set("scope", "users.read tweet.read offline.access");
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      const response = NextResponse.redirect(url);
      response.cookies.set("td_oauth_state", state, cookieOptions(600));
      response.cookies.set("td_oauth_verifier", verifier, cookieOptions(600));
      return response;
    }
    const response = NextResponse.redirect(url);
    response.cookies.set("td_oauth_state", state, cookieOptions(600));
    return response;
  }

  if (action !== "callback") return NextResponse.json({ error: "Unsupported action" }, { status: 404 });
  const returnedState = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get("td_oauth_state")?.value;
  if (request.nextUrl.searchParams.has("error")) return fail(request, "cancelled");
  if (!returnedState || !storedState || returnedState !== storedState) return fail(request, "state_mismatch");
  const code = request.nextUrl.searchParams.get("code");
  if (!code || !clientId || !clientSecret) return fail(request, "configuration_or_code_missing");
  try {
    const redirect = redirectUri(request, provider);
    let profile: { id: string; name: string; email: string };
    if (provider === "google") {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: "authorization_code" }),
        cache: "no-store",
      });
      if (!tokenResponse.ok) throw new Error("Google token exchange failed");
      const token = await tokenResponse.json();
      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { authorization: `Bearer ${token.access_token}` }, cache: "no-store",
      });
      if (!profileResponse.ok) throw new Error("Google profile request failed");
      const p = await profileResponse.json();
      if (!p.sub || !p.email) throw new Error("Google profile missing required fields");
      profile = { id: String(p.sub), name: p.name || "匿名の観測者", email: String(p.email) };
    } else {
      const verifier = request.cookies.get("td_oauth_verifier")?.value;
      if (!verifier) throw new Error("X PKCE verifier missing");
      const tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
        },
        body: new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: redirect, code_verifier: verifier }),
        cache: "no-store",
      });
      if (!tokenResponse.ok) throw new Error("X token exchange failed");
      const token = await tokenResponse.json();
      const profileResponse = await fetch("https://api.x.com/2/users/me?user.fields=name,username", {
        headers: { authorization: `Bearer ${token.access_token}` }, cache: "no-store",
      });
      if (!profileResponse.ok) throw new Error("X profile request failed");
      const p = (await profileResponse.json()).data;
      if (!p?.id) throw new Error("X profile missing user id");
      profile = { id: String(p.id), name: p.name || p.username || "匿名の観測者", email: `x_${p.id}@users.type-drift.local` };
    }
    const sql = db();
    const password = randomUUID() + randomUUID();
    const rows = await sql`
      INSERT INTO users (name, email, email_verified_at, password, oauth_provider, oauth_id, created_at, updated_at)
      VALUES (${profile.name}, ${profile.email}, NOW(), ${password}, ${provider}, ${profile.id}, NOW(), NOW())
      ON CONFLICT (oauth_provider, oauth_id)
      DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, email_verified_at = NOW(), updated_at = NOW()
      RETURNING id
    `;
    const userId = Number(rows[0]?.id);
    if (!Number.isInteger(userId) || userId < 1) throw new Error("User persistence failed");
    const response = NextResponse.redirect(new URL("/?login=success", request.nextUrl.origin));
    setSessionCookie(response, userId);
    response.cookies.set("td_oauth_state", "", cookieOptions(0));
    response.cookies.set("td_oauth_verifier", "", cookieOptions(0));
    return response;
  } catch (error) {
    console.error("[Type Drift OAuth] callback failed", { provider, error: error instanceof Error ? error.message : String(error) });
    return fail(request, "callback_failed");
  }
}
