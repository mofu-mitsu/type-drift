import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const sql = db();
    const rows = await sql`SELECT kind FROM shared_links WHERE id = ${id} LIMIT 1`;
    if (!rows.length) return NextResponse.redirect(new URL("/?share=not-found", request.nextUrl.origin));

    const kind = String(rows[0].kind);
    const origin = request.nextUrl.origin;
    const destination = kind === "profile" ? new URL("/profile", origin) : new URL("/", origin);
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

    const shareMeta = kind === "horoscope"
      ? {
          title: "ホロスコープ｜Type Drift",
          description: "星の配置から、自分だけのホロスコープを覗いてみよう。",
          image: "https://type-drift.vercel.app/ogp_hoshi.png",
        }
      : kind === "worm-beach"
        ? {
            title: "芋虫浜｜Type Drift",
            description: "LSI芋虫たちが集う、Type Driftの芋虫浜。",
            image: "https://type-drift.vercel.app/ogp_lsi.png",
          }
        : {
            title: "プロフィール｜Type Drift",
            description: "Type Driftで共有されたプロフィール。",
            image: "https://type-drift.vercel.app/ogp.png",
          };

    const redirectUrl = escapeHtml(destination.toString());
    const scriptUrl = JSON.stringify(destination.toString()).replace(/</g, "\\u003c");
    const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(shareMeta.title)}</title>
<meta name="description" content="${escapeHtml(shareMeta.description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Type Drift">
<meta property="og:locale" content="ja_JP">
<meta property="og:title" content="${escapeHtml(shareMeta.title)}">
<meta property="og:description" content="${escapeHtml(shareMeta.description)}">
<meta property="og:url" content="${escapeHtml(new URL(`/s/${encodeURIComponent(id)}`, "https://type-drift.vercel.app").toString())}">
<meta property="og:image" content="${shareMeta.image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(shareMeta.title)}">
<meta name="twitter:description" content="${escapeHtml(shareMeta.description)}">
<meta name="twitter:image" content="${shareMeta.image}">
<meta http-equiv="refresh" content="1;url=${redirectUrl}">
</head>
<body>
<p>共有ページを開いています… <a href="${redirectUrl}">こちらをタップ</a></p>
<script>window.location.replace(${scriptUrl});</script>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[Type Drift share] redirect failed", error);
    return NextResponse.redirect(new URL("/?share=error", request.nextUrl.origin));
  }
}
