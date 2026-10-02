// Activate kiosk: nhận licenseKey + fingerprint từ màn /setup → gọi Gateway
// POST /api/kiosk/activate → lưu bundle cấu hình (kiosk-config.json) cho gateway-proxy dùng.
// KHÔNG trả deviceSecret về client (TT17) — chỉ trả thông tin hiển thị.

import { NextRequest, NextResponse } from "next/server";
import { writeKioskConfig } from "@/config/kiosk-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null);
    const licenseKey: string = (body?.licenseKey || "").trim();
    const fingerprint: string = (body?.fingerprint || "").trim();
    const gatewayUrl: string = (body?.gatewayUrl || process.env.GATEWAY_BASE_URL || "")
        .trim()
        .replace(/\/$/, "");

    if (!licenseKey || !fingerprint) {
        return NextResponse.json({ error: "Thiếu licenseKey hoặc fingerprint" }, { status: 400 });
    }
    if (!gatewayUrl) {
        return NextResponse.json({ error: "Thiếu Gateway URL" }, { status: 400 });
    }

    try {
        const res = await fetch(`${gatewayUrl}/api/kiosk/activate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ licenseKey, fingerprint }),
        });
        const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

        if (!res.ok) {
            const err = json?.error as { code?: string; message?: string } | undefined;
            const code = (json?.errorCode as string) || err?.code || (json?.code as string) || "ACTIVATE_FAILED";
            const msg =
                (json?.errorMessage as string) ||
                err?.message ||
                (json?.message as string) ||
                "Kích hoạt thất bại";
            return NextResponse.json({ error: msg, code }, { status: res.status });
        }

        const data = (json?.data ?? json) as Record<string, string> | null;
        if (!data?.deviceCode || !data?.deviceSecret || !data?.gatewayUrl) {
            return NextResponse.json({ error: "Phản hồi activate không hợp lệ" }, { status: 502 });
        }

        writeKioskConfig({
            gatewayUrl: data.gatewayUrl.replace(/\/$/, ""),
            hospitalCode: data.hospitalCode,
            deviceCode: data.deviceCode,
            deviceSecret: data.deviceSecret,
            activatedAt: new Date().toISOString(),
        });

        // KHÔNG trả deviceSecret
        return NextResponse.json({
            success: true,
            hospitalCode: data.hospitalCode,
            deviceCode: data.deviceCode,
            gatewayUrl: data.gatewayUrl,
        });
    } catch (e) {
        const detail = (e as Error)?.message || String(e);
        const cause = (e as { cause?: { code?: string } })?.cause?.code;
        console.error("[kiosk/activate] error:", detail, cause || "");
        return NextResponse.json(
            { error: `Không kết nối được Gateway (${gatewayUrl}): ${detail}${cause ? " [" + cause + "]" : ""}`, code: "GATEWAY_UNREACHABLE" },
            { status: 502 },
        );
    }
}
