import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPrivateAddress(address: string) {
  const value = address.toLowerCase().split("%")[0];
  if (isIP(value) === 4) {
    const parts = value.split(".").map(Number);
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(value) === 6) {
    return value === "::" || value === "::1" || value.startsWith("fc") ||
      value.startsWith("fd") || /^fe[89ab]/.test(value) ||
      value.startsWith("::ffff:") || value.startsWith("2001:db8:");
  }
  return true;
}

async function assertPublicUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("unsupported_url");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "localhost.localdomain", "metadata.google.internal"].includes(host) ||
      host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("private_host");
  }
  const ipType = isIP(host);
  const addresses = ipType ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) {
    throw new Error("private_host");
  }
  return url;
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function readMeta(html: string, property: string) {
  const escaped = property.replace(/[.*+?^\u007b\u007d()|[\]\\]/g, "\\$&");
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (key !== property.toLowerCase()) continue;
    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
    if (content) return decodeEntities(content.trim());
  }
  return "";
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url") || "";
  if (!raw || raw.length > 2048) return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  try {
    let current = await assertPublicUrl(raw);
    let response: Response | null = null;
    for (let hop = 0; hop <= 3; hop++) {
      response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "TypeDriftLinkPreview/1.0", Accept: "text/html,application/xhtml+xml" },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || hop === 3) return NextResponse.json({ error: "redirect_limit" }, { status: 422 });
      current = await assertPublicUrl(new URL(location, current).toString());
    }
    if (!response || !response.ok || !/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") || "")) {
      return NextResponse.json({ url: current.toString(), title: current.hostname, description: "", image: null }, { status: 200 });
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("empty_response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) { await reader.cancel(); break; }
      chunks.push(value);
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    const title = readMeta(html, "og:title") || readMeta(html, "twitter:title") ||
      decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || current.hostname);
    const description = readMeta(html, "og:description") || readMeta(html, "description") || readMeta(html, "twitter:description");
    const imageValue = readMeta(html, "og:image") || readMeta(html, "twitter:image");
    let image: string | null = null;
    if (imageValue) {
      try {
        const candidate = new URL(imageValue, current);
        if (["http:", "https:"].includes(candidate.protocol)) image = candidate.toString();
      } catch {}
    }
    return NextResponse.json({ url: current.toString(), title: title.slice(0, 240), description: description.slice(0, 500), image }, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (error) {
    const message = error instanceof Error && error.message === "private_host" ? "private_url_blocked" : "preview_unavailable";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
