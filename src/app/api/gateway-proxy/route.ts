// Gateway API Proxy — forward requests đến Gateway mới (VNT Gateway).
// Client gửi `path` qua query string, body JSON. Server-side dispatch theo path:
//   • Kiosk path (6 endpoint trong KIOSK_WEB_OAUTH.md §5.1) → OAuth token + RSA sign (role=HIS)
//   • Path khác có user JWT (QR login) → forward Authorization + HMAC sign per-session
//   • Anonymous / kiosk-payment → forward không auth (hoặc inject device code)
//
// Server-side luôn inject X-Hospital-Code. RSA private key + HMAC signing key
// đều giữ server-only, không expose ra client.
//
// Xem GATEWAY_MIGRATION_PLAN.md + KIOSK_WEB_OAUTH.md.
import { NextRequest, NextResponse } from "next/server";
import { createHmac, createDecipheriv } from "node:crypto";
import { getGatewayBaseUrl, getKioskDeviceCode, getKioskDeviceSecret } from "@/config/server";
import { HOSPITAL_CODE } from "@/config/hospital";
import { readKioskConfig } from "@/config/kiosk-config";
import { getKioskToken, invalidateKioskToken, signKiosk, isKioskPath } from "@/lib/kiosk-auth";

// Mã viện RUNTIME: ưu tiên hospitalCode từ license (kiosk-config.json) → fallback mã bake lúc build.
// Cho phép 1 bản build phục vụ nhiều viện — viện do license kích hoạt quyết định.
function runtimeHospitalCode(): string {
    return readKioskConfig()?.hospitalCode || HOSPITAL_CODE;
}

// Đổi segment /api/hospitals/{code}/... trong path client gửi lên sang mã viện runtime.
// Ký RSA/HMAC + X-Hospital-Code đều dựa trên path này → làm TRƯỚC khi build header/sign để khớp.
function rewriteHospitalInPath(path: string, code: string): string {
    if (!code) return path;
    return path.replace(/^(\/api\/hospitals\/)[^/]+/, `$1${code}`);
}

// Compute X-Signature cho user JWT path: hex_lower(HMAC-SHA256(signingKey, METHOD + path + ts + body))
function computeUserSignature(method: string, path: string, timestamp: string, body: string, signingKey: string): string {
    const payload = `${method}${path}${timestamp}${body}`;
    return createHmac("sha256", signingKey).update(payload).digest("hex");
}

// Try decrypt response wrap { success, data: { encryptedData, iv, tag } } sang plain.
// AES-256-GCM với key do Gateway gửi sẵn (decode base64 → 32 bytes).
function tryDecryptResponse(raw: string, encryptionKey: string | null): string {
    if (!encryptionKey) return raw;
    try {
        const envelope = JSON.parse(raw);
        const data = envelope?.data;
        if (!data || typeof data.encryptedData !== "string" || typeof data.iv !== "string" || typeof data.tag !== "string") {
            return raw;
        }
        const key = Buffer.from(encryptionKey, "base64");
        const iv = Buffer.from(data.iv, "base64");
        const tag = Buffer.from(data.tag, "base64");
        const ciphertext = Buffer.from(data.encryptedData, "base64");
        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);
        const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
        envelope.data = JSON.parse(plain);
        return JSON.stringify(envelope);
    } catch (e) {
        console.warn("[gateway-proxy] decrypt failed:", (e as Error).message);
        return raw;
    }
}

interface KioskAuthHeaders {
    Authorization: string;
    "X-Signature": string;
    "X-Timestamp": string;
}

/**
 * Build kiosk OAuth + RSA sign headers cho 6 endpoint kiosk.
 * Trả null nếu thiếu token/private key — caller forward request không sign,
 * Gateway sẽ trả 401 đúng spec.
 */
async function buildKioskAuth(method: string, path: string, body: string): Promise<KioskAuthHeaders | null> {
    const token = await getKioskToken();
    if (!token) return null;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signKiosk(method, path, body, timestamp);
    if (!signature) return null;
    return {
        Authorization: `Bearer ${token}`,
        "X-Signature": signature,
        "X-Timestamp": timestamp,
    };
}

async function buildHeaders(
    request: NextRequest,
    path: string,
    method: string,
    body: string,
    hospitalCode: string,
): Promise<{ headers: Record<string, string>; useKioskAuth: boolean }> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Hospital-Code": hospitalCode || HOSPITAL_CODE,
    };

    // Inject kiosk device credentials cho luồng kiosk-payment (pattern device code/secret)
    if (path.includes("/kiosk-payment/")) {
        const dc = getKioskDeviceCode(), ds = getKioskDeviceSecret();
        if (dc) headers["X-Kiosk-Device-Code"] = dc;
        if (ds) headers["X-Kiosk-Device-Secret"] = ds;
        return { headers, useKioskAuth: false };
    }

    // Kiosk reception (tái khám): device-auth THUẦN (giống kiosk-payment).
    // KHÔNG forward user JWT: nếu gateway xác thực JWT thành công, middleware chữ ký
    // sẽ đòi X-Signature (reception không ký) → 401. Reception chỉ dùng device code/secret.
    if (path.includes("/kiosk-reception/")) {
        const dc = getKioskDeviceCode(), ds = getKioskDeviceSecret();
        if (dc) headers["X-Kiosk-Device-Code"] = dc;
        if (ds) headers["X-Kiosk-Device-Secret"] = ds;
        return { headers, useKioskAuth: false };
    }

    // Tiếp đón có hỗ trợ (NVYT đứng máy): xác thực HAI LỚP.
    //   lớp 1 — device code/secret (giống kiosk-payment/kiosk-reception), bắt buộc cả ở login;
    //   lớp 2 — token phiên NVYT do vnyte cấp, client gửi lên trong Authorization.
    // Forward Authorization NGUYÊN VĂN và KHÔNG ký HMAC: token này là của vnyte, không phải
    // JWT Gateway — ký thêm X-Signature chỉ làm middleware chữ ký của Gateway từ chối.
    // Xem tich-hop-kiosk-tiep-don-co-ho-tro.md mục 3.
    if (path.includes("/kiosk-assisted-reception/") || path.includes("/kiosk-staff-session/")) {
        const dc = getKioskDeviceCode(), ds = getKioskDeviceSecret();
        if (dc) headers["X-Kiosk-Device-Code"] = dc;
        if (ds) headers["X-Kiosk-Device-Secret"] = ds;
        const staffAuth = request.headers.get("Authorization");
        if (staffAuth) headers["Authorization"] = staffAuth;
        return { headers, useKioskAuth: false };
    }

    // Dispatch 1: Kiosk OAuth + RSA (6 endpoint trong KIOSK_WEB_OAUTH.md §5.1)
    // → server-side override Authorization, bất kể client có gửi user JWT hay không
    if (isKioskPath(path)) {
        const kioskAuth = await buildKioskAuth(method, path, body);
        if (kioskAuth) {
            Object.assign(headers, kioskAuth);
            return { headers, useKioskAuth: true };
        }
        // Thiếu credentials → forward không sign, Gateway sẽ trả 401
    }

    // Dispatch 2: User JWT (QR login) + HMAC per-session
    const auth = request.headers.get("Authorization");
    if (auth) {
        headers["Authorization"] = auth;
        const signingKey = request.headers.get("X-Signing-Key");
        if (signingKey) {
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const signature = computeUserSignature(method, path, timestamp, body, signingKey);
            headers["X-Signature"] = signature;
            headers["X-Timestamp"] = timestamp;
        }
    }

    return { headers, useKioskAuth: false };
}

function buildUrl(path: string, searchParams: URLSearchParams): string {
    const fwd = new URLSearchParams();
    searchParams.forEach((v, k) => {
        if (k !== "path") fwd.append(k, v);
    });
    const qs = fwd.toString();
    return getGatewayBaseUrl().replace(/\/$/, "") + path + (qs ? "?" + qs : "");
}

async function proxy(request: NextRequest, method: "GET" | "POST" | "PUT" | "DELETE") {
    if (!getGatewayBaseUrl()) {
        return NextResponse.json(
            { error: "GATEWAY_BASE_URL chưa cấu hình" },
            { status: 500 },
        );
    }

    const searchParams = request.nextUrl.searchParams;
    const rawPath = searchParams.get("path");
    if (!rawPath) {
        return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    // Áp mã viện runtime (từ license) vào segment /api/hospitals/{code}/... TRƯỚC khi build URL/sign.
    const hospitalCode = runtimeHospitalCode();
    const path = rewriteHospitalInPath(rawPath, hospitalCode);

    const url = buildUrl(path, searchParams);
    let body = "";
    if (method === "POST" || method === "PUT") {
        body = await request.text();
    }
    const { headers, useKioskAuth } = await buildHeaders(request, path, method, body, hospitalCode);
    const encryptionKey = request.headers.get("X-Encryption-Key");

    try {
        let res = await fetch(url, {
            method,
            headers,
            body: body || undefined,
        });

        // Kiosk OAuth: retry 1 lần với token mới nếu 401 do token expired
        if (useKioskAuth && res.status === 401) {
            invalidateKioskToken();
            const retryAuth = await buildKioskAuth(method, path, body);
            if (retryAuth) {
                const retryHeaders = { ...headers, ...retryAuth };
                res = await fetch(url, { method, headers: retryHeaders, body: body || undefined });
            }
        }

        const raw = await res.text();
        if (!res.ok) {
            console.error(
                `[gateway-proxy] ${method} ${res.status} ${url}\n  body=${raw.slice(0, 300)}`,
            );
        }
        // Detect EncryptResponse và decrypt server-side (chỉ user JWT path có encryptionKey).
        const final = res.ok && !useKioskAuth ? tryDecryptResponse(raw, encryptionKey) : raw;
        return new NextResponse(final, {
            status: res.status,
            headers: {
                "Content-Type":
                    res.headers.get("content-type") || "application/json",
            },
        });
    } catch (error) {
        console.error(`[gateway-proxy] ${method} fetch error:`, path, error);
        return NextResponse.json(
            { error: "Không kết nối được Gateway" },
            { status: 502 },
        );
    }
}

export const GET = (req: NextRequest) => proxy(req, "GET");
export const POST = (req: NextRequest) => proxy(req, "POST");
export const PUT = (req: NextRequest) => proxy(req, "PUT");
export const DELETE = (req: NextRequest) => proxy(req, "DELETE");
