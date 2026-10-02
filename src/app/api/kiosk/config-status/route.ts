// Trạng thái cấu hình kiosk — cho màn /setup + cổng chặn khởi động.
// "activated" = có đủ gateway + deviceCode + deviceSecret từ activation (kiosk-config.json)
// HOẶC từ env (.env — luồng dev/prod hiện tại). KHÔNG trả deviceSecret (TT17).

import { NextResponse } from "next/server";
import { getGatewayBaseUrl, getKioskDeviceCode, getKioskDeviceSecret } from "@/config/server";
import { readKioskConfig } from "@/config/kiosk-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
    const gatewayUrl = getGatewayBaseUrl();
    const deviceCode = getKioskDeviceCode();
    const hasSecret = !!getKioskDeviceSecret();
    const c = readKioskConfig();
    const hospitalCode = c?.hospitalCode ?? process.env.NEXT_PUBLIC_HOSPITAL_CODE ?? null;

    let activated = !!(gatewayUrl && deviceCode && hasSecret);
    let revoked = false;

    // Kiosk đã activate qua license: hỏi Gateway xem license còn hiệu lực không.
    // Thu hồi trên Admin → revoked=true → coi như CHƯA activate → AppLayout ép về /setup.
    // Fail-open: Gateway lỗi/không kết nối → KHÔNG tự khoá (tránh chặn nhầm khi mạng chập chờn).
    if (activated && c && gatewayUrl && deviceCode && hospitalCode) {
        try {
            const url = `${gatewayUrl.replace(/\/$/, "")}/api/kiosk/device-status`
                + `?hospitalCode=${encodeURIComponent(hospitalCode)}&deviceCode=${encodeURIComponent(deviceCode)}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
            if (res.ok) {
                // Gateway bọc response trong envelope {success, data:{...}} → lấy data (fallback body phẳng).
                const j = (await res.json().catch(() => null)) as { revoked?: boolean; data?: { revoked?: boolean } } | null;
                const payload = j?.data ?? j;
                if (payload?.revoked === true) { revoked = true; activated = false; }
            }
        } catch {
            /* fail-open: giữ nguyên activated theo cấu hình cục bộ */
        }
    }

    return NextResponse.json({
        activated,
        revoked,
        source: c ? "activation" : "env",
        hospitalCode,
        deviceCode: deviceCode || null,
        gatewayUrl: gatewayUrl || null,
        activatedAt: c?.activatedAt ?? null,
    });
}
