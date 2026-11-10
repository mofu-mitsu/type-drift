import { neon } from "@neondatabase/serverless";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const AUTH_COOKIE = "type_drift_session";
export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is missing on Vercel");
  return neon(url);
}
function secret() {
  const value = process.env.AUTH_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SESSION_SECRET must be at least 32 characters");
  return value;
}
export function signSession(userId: number) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return payload + "." + sig;
}
export function readSession(request: NextRequest): number | null {
  try {
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (!token) return null;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = createHmac("sha256", secret()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isInteger(data.sub) || data.exp <= Math.floor(Date.now() / 1000)) return null;
    return data.sub as number;
  } catch { return null; }
}
export function setSessionCookie(response: NextResponse, userId: number) {
  response.cookies.set(AUTH_COOKIE, signSession(userId), {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7,
  });
}
export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}
