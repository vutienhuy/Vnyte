// Xác thực PIN kỹ thuật để vào lại màn /setup khi kiosk đã kích hoạt.
// PIN đọc server-side từ env SETUP_PIN (KHÔNG nằm trong client bundle), đổi runtime được.
// Mặc định "246810" — ĐỔI qua env khi triển khai.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null);
    const pin = String(body?.pin ?? "");
    const expected = process.env.SETUP_PIN || "246810";
    // So sánh thời gian hằng định đơn giản
    const ok = pin.length === expected.length && pin === expected;
    return NextResponse.json({ ok });
}
