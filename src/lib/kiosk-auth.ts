// Kiosk OAuth + RSA signing — SERVER-SIDE ONLY (gateway-proxy route handler).
// Tuyệt đối KHÔNG import file này vào client code — sẽ lộ private key qua bundle.
//
// Pattern (xem KIOSK_WEB_OAUTH.md v2.0):
//   1. POST /oauth/token (client_credentials) → access_token (TTL 1h, role=HIS)
//   2. Mọi request 6 endpoint kiosk đính:
//      Authorization: Bearer <token>
//      X-Hospital-Code: <hospitalCode>
//      X-Timestamp: <unix_seconds>
//      X-Signature: base64( RSA-SHA256-PKCS1( private_key, sign_string ) )
//      sign_string = METHOD + "\n" + path + "\n" + ts + "\n" + canonicalBody
//
// Canonical JSON: sort keys alphabetically (Ordinal), no indent. Khớp Gateway
// CanonicalJsonHelper.Canonicalize.

import { createPrivateKey, createSign, KeyObject } from "node:crypto";
import {
    getGatewayBaseUrl,
    KIOSK_CLIENT_ID,
    KIOSK_CLIENT_SECRET,
    KIOSK_PRIVATE_KEY,
} from "@/config/server";

interface CachedToken {
    accessToken: string;
    expiresAt: number; // ms epoch
}

let cachedToken: CachedToken | null = null;
let cachedPrivateKey: KeyObject | null = null;

// Refresh token khi còn < 5 phút.
const REFRESH_THRESHOLD_MS = 5 * 60_000;

/**
 * Lấy kiosk OAuth token. Cache in-memory module-level (TTL 1h).
 * Trả null nếu credentials chưa cấu hình hoặc backend reject.
 */
export async function getKioskToken(): Promise<string | null> {
    if (!KIOSK_CLIENT_ID || !KIOSK_CLIENT_SECRET || !getGatewayBaseUrl()) {
        return null;
    }
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt - now > REFRESH_THRESHOLD_MS) {
        return cachedToken.accessToken;
    }

    try {
        const body = new URLSearchParams({
            grant_type: "client_credentials",
            client_id: KIOSK_CLIENT_ID,
            client_secret: KIOSK_CLIENT_SECRET,
            scope: "kiosk_appointment",
        });
        const res = await fetch(`${getGatewayBaseUrl().replace(/\/$/, "")}/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        });
        if (!res.ok) {
            const txt = await res.text();
            console.error(`[kiosk-auth] /oauth/token ${res.status}: ${txt.slice(0, 200)}`);
            return null;
        }
        const json = await res.json();
        // Gateway response wrap: { success, data: { access_token, expires_in, ... } }
        const data = json?.data ?? json;
        if (!data?.access_token || !data?.expires_in) {
            console.error("[kiosk-auth] OAuth response missing access_token/expires_in");
            return null;
        }
        cachedToken = {
            accessToken: data.access_token,
            expiresAt: now + Number(data.expires_in) * 1000,
        };
        return cachedToken.accessToken;
    } catch (e) {
        console.error("[kiosk-auth] OAuth fetch error:", (e as Error).message);
        return null;
    }
}

/** Invalidate cache — gọi khi nhận 401 TOKEN_EXPIRED. */
export function invalidateKioskToken(): void {
    cachedToken = null;
}

/**
 * Parse private key từ env. Hỗ trợ cả PEM (có markers) lẫn base64 raw.
 * Cache KeyObject sau lần parse đầu để tránh tốn CPU mỗi request.
 */
function getPrivateKey(): KeyObject | null {
    if (cachedPrivateKey) return cachedPrivateKey;
    if (!KIOSK_PRIVATE_KEY) return null;

    try {
        const raw = KIOSK_PRIVATE_KEY.trim();
        let pem: string;
        if (raw.includes("BEGIN")) {
            pem = raw;
        } else {
            // Base64 raw (1 dòng) → wrap PKCS1. Nếu fail thì thử PKCS8.
            const body = raw.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? raw;
            pem = `-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----`;
        }
        try {
            cachedPrivateKey = createPrivateKey({ key: pem, format: "pem" });
        } catch {
            // Fallback: PKCS8
            const body = raw.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? raw;
            const pkcs8 = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
            cachedPrivateKey = createPrivateKey({ key: pkcs8, format: "pem" });
        }
        return cachedPrivateKey;
    } catch (e) {
        console.error("[kiosk-auth] Failed to parse private key:", (e as Error).message);
        return null;
    }
}

/**
 * Canonical JSON: sort keys alphabetically (Ordinal/Unicode), no indent.
 * Khớp Gateway `CanonicalJsonHelper.Canonicalize()` (System.Text.Json + UnsafeRelaxedJsonEscaping).
 *
 * Lưu ý: JSON.stringify mặc định escape các ký tự `<`, `>`, `&` thành `<` etc. nếu
 * Gateway dùng UnsafeRelaxedJsonEscaping (KHÔNG escape) → cần custom encode. Hiện tại
 * không có endpoint kiosk POST body chứa các ký tự này, để mặc định.
 */
export function canonicalize(value: unknown): string {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return "[" + value.map(canonicalize).join(",") + "]";
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

/**
 * Sign kiosk request bằng RSA-SHA256 PKCS1.
 *   sign_string = METHOD + "\n" + path + "\n" + ts + "\n" + canonicalBody
 *   signature   = base64( RSA-SHA256-PKCS1( private_key, sign_string ) )
 *
 * Trả null nếu private key chưa cấu hình.
 */
export function signKiosk(
    method: string,
    pathNoQuery: string,
    body: string,
    timestamp: string,
): string | null {
    const key = getPrivateKey();
    if (!key) return null;

    const canonicalBody = body ? canonicalize(JSON.parse(body)) : "";
    const signString = `${method.toUpperCase()}\n${pathNoQuery}\n${timestamp}\n${canonicalBody}`;

    const signer = createSign("RSA-SHA256");
    signer.update(signString);
    signer.end();
    return signer.sign(key, "base64");
}

/**
 * 6 endpoint kiosk cần OAuth + RSA sign (xem KIOSK_WEB_OAUTH.md §5.1).
 * Match path WITHOUT query string. `{hospitalCode}` là wildcard segment.
 */
const KIOSK_PATH_PATTERNS: RegExp[] = [
    /^\/api\/hospitals\/[^/]+\/appointment\/branch$/,
    /^\/api\/hospitals\/[^/]+\/his-rs\/service-by-clinic$/,
    /^\/api\/hospitals\/[^/]+\/his-module\/patient-types-for-kiosk$/,
    /^\/api\/hospitals\/[^/]+\/appointment\/create-direct$/,
    /^\/api\/hospitals\/[^/]+\/appointment$/,
    /^\/api\/hospitals\/[^/]+\/his-rs\/treatment-for-print$/,
    // treatment-list-for-print (list variant cho /print-invoice flow) — doc v2.0 thiếu liệt kê
    // nhưng cùng nhóm kiosk read-only với treatment-for-print (single).
    /^\/api\/hospitals\/[^/]+\/his-rs\/treatment-list-for-print$/,
];

export function isKioskPath(path: string): boolean {
    return KIOSK_PATH_PATTERNS.some(re => re.test(path));
}
