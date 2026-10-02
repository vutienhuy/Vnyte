// SSE streaming proxy cho kiosk payment qua Gateway.
// Dùng Node's http/https module trực tiếp để tránh buffer của undici.
// Upstream: Gateway forward sang HIS /sse/kiosk-payment/{transReqId}.

import { NextRequest } from "next/server";
import http from "node:http";
import https from "node:https";
import { getGatewayBaseUrl } from "@/config/server";
import { HOSPITAL_CODE } from "@/config/hospital";
import { readKioskConfig } from "@/config/kiosk-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface UpstreamConn {
  req: http.ClientRequest;
  res: http.IncomingMessage;
}

function openUpstream(
  url: string,
  headers: Record<string, string>,
  hops = 3,
): Promise<UpstreamConn> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const req = client.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location && hops > 0) {
          const next = new URL(res.headers.location, url).toString();
          console.log(`[gateway-proxy sse] redirect ${status} → ${next}`);
          res.resume();
          req.destroy();
          openUpstream(next, headers, hops - 1).then(resolve, reject);
          return;
        }
        resolve({ req, res });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ transReqId: string }> },
) {
  const { transReqId } = await params;
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "KIOSK_SSE_TOKEN_INVALID", message: "Thiếu token" },
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!getGatewayBaseUrl()) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "GATEWAY_CONFIG_MISSING",
          message: "getGatewayBaseUrl() chưa cấu hình",
        },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // Mã viện runtime từ license (kiosk-config.json) → 1 build phục vụ nhiều viện; fallback mã bake.
  const hospitalCode = readKioskConfig()?.hospitalCode || HOSPITAL_CODE;
  const upstreamUrl =
    `${getGatewayBaseUrl().replace(/\/$/, "")}` +
    `/api/hospitals/${hospitalCode}/kiosk-payment/sse/${encodeURIComponent(transReqId)}` +
    `?token=${encodeURIComponent(token)}`;
  console.log(`[gateway-proxy sse] mở upstream: ${upstreamUrl}`);

  // Gateway tự inject X-Kiosk-Device-* từ Hospital DB → web không gửi header này nữa.
  const upstreamHeaders: Record<string, string> = {
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  };

  let conn: UpstreamConn;
  try {
    conn = await openUpstream(upstreamUrl, upstreamHeaders);
  } catch (err) {
    console.error("[gateway-proxy sse] openUpstream error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "KIOSK_HIS_UPSTREAM_TIMEOUT",
          message: "Không kết nối được Gateway SSE",
        },
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const { req: upstreamReq, res: upstreamRes } = conn;
  const status = upstreamRes.statusCode ?? 0;
  console.log(
    `[gateway-proxy sse] upstream status=${status} ct=${upstreamRes.headers["content-type"]}`,
  );

  if (status < 200 || status >= 300) {
    let body = "";
    upstreamRes.setEncoding("utf8");
    upstreamRes.on("data", (c) => (body += c));
    await new Promise<void>((done) => upstreamRes.on("end", done));
    upstreamReq.destroy();
    const code =
      status === 401 ? "KIOSK_SSE_TOKEN_INVALID" : "KIOSK_HIS_UPSTREAM_TIMEOUT";
    return new Response(
      JSON.stringify({
        success: false,
        error: { code, message: body || `upstream ${status}` },
      }),
      { status, headers: { "Content-Type": "application/json" } },
    );
  }

  // Gateway đã inject heartbeat 25s — không cần thêm ping ở layer này.
  // Vẫn giữ stream forward sạch để tránh buffer.
  let chunkCount = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      upstreamRes.on("data", (chunk: Buffer) => {
        chunkCount++;
        if (chunkCount <= 5) {
          console.log(
            `[gateway-proxy sse] chunk#${chunkCount}: ${chunk.toString().slice(0, 300)}`,
          );
        }
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          /* controller closed */
        }
      });
      upstreamRes.on("end", () => {
        console.log(
          `[gateway-proxy sse] upstream đóng sau ${chunkCount} chunk (transReqId=${transReqId})`,
        );
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
      upstreamRes.on("error", (err) => {
        console.warn(
          `[gateway-proxy sse] upstream error (${transReqId}):`,
          (err as Error).message,
        );
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      console.log(`[gateway-proxy sse] client disconnect ${transReqId}`);
      try {
        upstreamReq.destroy();
      } catch {
        /* ignore */
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
