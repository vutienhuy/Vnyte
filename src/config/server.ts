/**
 * Cấu hình dùng ở SERVER-SIDE (Next.js API routes, SSR).
 *
 * Các biến này đọc runtime từ process.env — KHÔNG bake vào client bundle
 * nên có thể đổi qua docker-compose / env_file mà không cần build lại.
 *
 * KHÔNG import file này vào code client — sẽ làm lộ secrets.
 * Chỉ dùng trong: src/app/api/**, middleware, server actions.
 *
 * Xem thêm: CONFIG.md, GATEWAY_MIGRATION_PLAN.md
 */

import { readKioskConfig } from "./kiosk-config";

// Gateway mới (VNT Gateway). Dùng ở src/app/api/gateway-proxy.
// HOSPITAL_CODE đặt ở `src/config/hospital.ts` (dùng chung client + server).
export const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL || "";

// Kiosk payment — gateway-proxy inject X-Kiosk-Device-Code/Secret header
// khi path chứa /kiosk-payment/. Mỗi kiosk vật lý dùng cặp riêng để audit log.
export const KIOSK_DEVICE_CODE = process.env.KIOSK_DEVICE_CODE || "";
export const KIOSK_DEVICE_SECRET = process.env.KIOSK_DEVICE_SECRET || "";

// Getters RUNTIME: ưu tiên cấu hình từ activation (kiosk-config.json) rồi mới fallback env.
// Dùng ở gateway-proxy / auth-proxy / kiosk-auth để mỗi kiosk activate xong tự có cấu hình
// mà không cần build lại / đổi env. Xem src/config/kiosk-config.ts.
export function getGatewayBaseUrl(): string {
    return readKioskConfig()?.gatewayUrl || process.env.GATEWAY_BASE_URL || "";
}
export function getKioskDeviceCode(): string {
    return readKioskConfig()?.deviceCode || process.env.KIOSK_DEVICE_CODE || "";
}
export function getKioskDeviceSecret(): string {
    return readKioskConfig()?.deviceSecret || process.env.KIOSK_DEVICE_SECRET || "";
}

// Kiosk OAuth + RSA — xem KIOSK_WEB_OAUTH.md v2.0.
// Web kiosk = OAuth client của viện (role=HIS). 6 endpoint kiosk dùng access_token
// + RSA-SHA256 sign bằng private key viện. Server-side only — TUYỆT ĐỐI không expose
// KIOSK_PRIVATE_KEY ra client bundle.
export const KIOSK_CLIENT_ID = process.env.KIOSK_CLIENT_ID || "";
export const KIOSK_CLIENT_SECRET = process.env.KIOSK_CLIENT_SECRET || "";
export const KIOSK_PRIVATE_KEY = process.env.KIOSK_PRIVATE_KEY || "";
