import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveGasUrl(value: unknown) {
  const raw = typeof value === "string" && value.trim()
    ? value.trim()
    : process.env.NEXT_PUBLIC_GAS_WEBHOOK_URL || "";
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "script.google.com" ||
      !/^\/macros\/s\/[^/]+\/exec\/?$/.test(url.pathname) ||
      url.username ||
      url.password
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { gasUrl?: unknown; payload?: unknown };
    const gasUrl = resolveGasUrl(body.gasUrl);
    if (!gasUrl) {
      return NextResponse.json(
        { ok: false, error: "gas_url_missing_or_invalid", message: "GASのURLが未設定か、形式が正しくありません。" },
        { status: 400 },
      );
    }
    if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    const response = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8", Accept: "application/json" },
      body: JSON.stringify(body.payload),
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    const responseText = await response.text();
    let result: { status?: string; message?: string; id?: string };
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error("[Type Drift GAS] unexpected response", response.status, responseText.slice(0, 300));
      return NextResponse.json(
        { ok: false, error: "gas_unexpected_response", message: "GASからJSON以外の応答が返りました。デプロイ設定やアクセス権を確認してください。" },
        { status: 502 },
      );
    }

    if (!response.ok || result.status !== "success") {
      console.error("[Type Drift GAS] write failed", response.status, result);
      return NextResponse.json(
        {
          ok: false,
          error: result.status || "gas_request_failed",
          message: result.message || "GASがスプレッドシートへの保存成功を返しませんでした。",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, id: result.id || null, message: result.message || "GAS保存成功" }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("[Type Drift GAS] relay failed", message);
    return NextResponse.json(
      { ok: false, error: "gas_relay_failed", message: "GASへの接続中にエラーが発生しました。時間をおいて再試行してください。" },
      { status: 502 },
    );
  }
}
