/**
 * Cấu hình kiosk lưu RUNTIME (sau khi activate license) — SERVER-SIDE ONLY.
 *
 * Đọc/ghi từ file JSON (mặc định `kiosk-config.json` ở cwd; override qua
 * KIOSK_CONFIG_PATH). gateway-proxy đọc deviceCode/secret/gatewayUrl từ đây
 * thay vì bake env build-time → mỗi kiosk activate xong tự có cấu hình riêng.
 *
 * Electron (Phase 4) sẽ trỏ KIOSK_CONFIG_PATH vào userData (mã hoá DPAPI) hoặc
 * set env trực tiếp — cả 2 đều tương thích (đọc file rồi mới fallback env).
 *
 * TUYỆT ĐỐI không import file này vào client component (lộ deviceSecret).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

export interface KioskRuntimeConfig {
    gatewayUrl: string;
    hospitalCode: string;
    deviceCode: string;
    deviceSecret: string;
    activatedAt?: string;
}

function configPath(): string {
    return process.env.KIOSK_CONFIG_PATH || path.join(process.cwd(), "kiosk-config.json");
}

// Cache theo nội dung file để tránh đọc đĩa mỗi request; reload khi file đổi.
let cache: { raw: string; parsed: KioskRuntimeConfig } | null = null;

export function readKioskConfig(): KioskRuntimeConfig | null {
    try {
        const p = configPath();
        if (!existsSync(p)) return null;
        const raw = readFileSync(p, "utf8");
        if (cache && cache.raw === raw) return cache.parsed;
        const parsed = JSON.parse(raw) as KioskRuntimeConfig;
        cache = { raw, parsed };
        return parsed;
    } catch {
        return null;
    }
}

export function writeKioskConfig(cfg: KioskRuntimeConfig): void {
    const p = configPath();
    const raw = JSON.stringify(cfg, null, 2);
    writeFileSync(p, raw, { encoding: "utf8", mode: 0o600 });
    cache = { raw, parsed: cfg };
}

/** Kiosk đã activate đủ thông tin để hoạt động chưa. */
export function isKioskActivated(): boolean {
    const c = readKioskConfig();
    return !!(c && c.gatewayUrl && c.deviceCode && c.deviceSecret);
}
