// Proxy GET /auth/qr-login/status/:sessionId để polling trạng thái QR login.
// Dùng thay SSE khi nginx buffering không cho stream.

import { NextRequest, NextResponse } from "next/server";
import { getGatewayBaseUrl } from "@/config/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  if (!getGatewayBaseUrl()) {
    return NextResponse.json(
      { error: "Gateway chưa cấu hình" },
      { status: 500 },
    );
  }

  const url = `${getGatewayBaseUrl().replace(/\/$/, "")}/api/auth/qr-login/status/${encodeURIComponent(
    sessionId,
  )}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      },
    });
    const raw = await res.text();
    return new NextResponse(raw, {
      status: res.status,
      headers: {
        "Content-Type":
          res.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    console.error("[auth-proxy status] fetch error:", error);
    return NextResponse.json(
      { error: "Không kết nối được auth backend" },
      { status: 502 },
    );
  }
}
