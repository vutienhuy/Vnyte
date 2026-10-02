// Proxy cho QR login. Forward sang Gateway AuthProxyController.
// Client gọi POST /api/auth-proxy?path=/auth/qr-login/<generate|complete|confirm>
// Server-side map sang Gateway path /api/auth/qr-login/* để share dev Redis với mobile.
// Xem GATEWAY_MIGRATION_PLAN.md.

import { NextRequest, NextResponse } from "next/server";
import { getGatewayBaseUrl } from "@/config/server";

const ALLOWED_PATHS = new Set([
  "/auth/qr-login/generate",
  "/auth/qr-login/complete",
  "/auth/qr-login/confirm",
]);

function errJson(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  if (!getGatewayBaseUrl()) {
    console.error("[auth-proxy] Thiếu env getGatewayBaseUrl()");
    return errJson("Gateway chưa cấu hình", 500);
  }

  const searchParams = request.nextUrl.searchParams;
  const path = searchParams.get("path");
  if (!path) return errJson("Missing path", 400);
  if (!ALLOWED_PATHS.has(path)) return errJson("Path không được phép", 400);

  // Map /auth/qr-login/x → /api/auth/qr-login/x (Gateway prefix)
  const gatewayPath = path.replace(/^\/auth\//, "/api/auth/");

  // Forward các query param khác (sessionId, userId, ...) — trừ "path"
  const fwd = new URLSearchParams();
  searchParams.forEach((v, k) => {
    if (k !== "path") fwd.append(k, v);
  });
  const qs = fwd.toString();
  const url = getGatewayBaseUrl().replace(/\/$/, "") + gatewayPath + (qs ? "?" + qs : "");

  const bodyText = await request.text();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      },
      body: bodyText || undefined,
    });
    const raw = await res.text();
    if (!res.ok) {
      console.error(
        `[auth-proxy] ${res.status} ${url}\n  body=${raw.slice(0, 300)}`,
      );
    }
    return new NextResponse(raw, {
      status: res.status,
      headers: {
        "Content-Type":
          res.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    console.error("[auth-proxy] fetch error:", path, error);
    return errJson("Không kết nối được auth backend", 502);
  }
}
