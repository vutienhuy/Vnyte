// SSE proxy cho QR login.
// Dùng Node's http/https module trực tiếp để tránh undici buffer SSE.

import { NextRequest } from "next/server";
import http from "node:http";
import https from "node:https";
import { getGatewayBaseUrl } from "@/config/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface UpstreamConn {
  req: http.ClientRequest;
  res: http.IncomingMessage;
}

// Tạo request + chờ response headers. Follow redirect (tối đa 3 hop).
function openUpstream(url: string, hops = 3): Promise<UpstreamConn> {
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
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
          Host: parsed.hostname,
          // Backend ASP.NET Core dùng UseHttpsRedirection + UseForwardedHeaders.
          // Set X-Forwarded-Proto=https để Kestrel coi như đã HTTPS → skip redirect
          // → bypass nginx HTTPS buffer 60s. Truy cập trực tiếp Kestrel qua HTTP.
          "X-Forwarded-Proto": "https",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location && hops > 0) {
          const next = new URL(res.headers.location, url).toString();
          console.log(
            `[auth-proxy sse] redirect ${status} → ${next}`,
          );
          res.resume();
          req.destroy();
          openUpstream(next, hops - 1).then(resolve, reject);
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
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  if (!getGatewayBaseUrl()) {
    return new Response(
      JSON.stringify({ error: "Gateway chưa cấu hình" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const upstreamUrl = `${getGatewayBaseUrl().replace(/\/$/, "")}/api/auth/qr-login/sse/${encodeURIComponent(
    sessionId,
  )}`;
  console.log(`[auth-proxy sse] mở upstream: ${upstreamUrl}`);

  let conn: UpstreamConn;
  try {
    conn = await openUpstream(upstreamUrl);
  } catch (err) {
    console.error("[auth-proxy sse] openUpstream error:", err);
    return new Response(
      JSON.stringify({ error: "Không kết nối được auth SSE" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const { req: upstreamReq, res: upstreamRes } = conn;
  const status = upstreamRes.statusCode ?? 0;
  console.log(
    `[auth-proxy sse] upstream headers status=${status} ct=${upstreamRes.headers["content-type"]}`,
  );

  if (status < 200 || status >= 300) {
    let body = "";
    upstreamRes.setEncoding("utf8");
    upstreamRes.on("data", (c) => (body += c));
    await new Promise<void>((done) => upstreamRes.on("end", done));
    upstreamReq.destroy();
    return new Response(body || `upstream ${status}`, {
      status,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let chunkCount = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      upstreamRes.on("data", (chunk: Buffer) => {
        chunkCount++;
        if (chunkCount <= 5) {
          console.log(
            `[auth-proxy sse] chunk#${chunkCount}: ${chunk.toString().slice(0, 200)}`,
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
          `[auth-proxy sse] upstream đóng sau ${chunkCount} chunk (${sessionId})`,
        );
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
      upstreamRes.on("error", (err) => {
        console.error("[auth-proxy sse] upstream error:", err);
        try {
          controller.error(err);
        } catch {
          /* ignore */
        }
      });
    },
    cancel() {
      console.log(`[auth-proxy sse] client disconnect ${sessionId}`);
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
