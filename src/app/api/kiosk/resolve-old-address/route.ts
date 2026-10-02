// Resolve địa chỉ CCCD định dạng CŨ → mã tỉnh/xã MỚI (dùng dữ liệu GSO sáp nhập 2025).
// Server-side: giữ 2 file danh mục (~2MB) khỏi client bundle. Client (patient-check) gọi khi
// khớp SDA trực tiếp thất bại (thẻ cũ). Xem src/lib/admin-map/resolve.ts.

import { NextRequest, NextResponse } from "next/server";
import { resolveOldAddress } from "@/lib/admin-map/resolve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null);
    let parts: string[] = [];
    if (Array.isArray(body?.parts)) {
        parts = body.parts.map((s: unknown) => String(s));
    } else if (typeof body?.address === "string") {
        parts = body.address.split(/[,\n;]+/);
    }
    parts = parts.map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) {
        return NextResponse.json({ status: "NOT_FOUND" });
    }
    return NextResponse.json(resolveOldAddress(parts));
}
