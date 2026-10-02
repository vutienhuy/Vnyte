// HTTP client utilities — mọi request đi qua /api/gateway-proxy → Gateway (VNT Gateway).
// Gateway-proxy server-side gắn HMAC sign + AES decrypt (xem GATEWAY_MIGRATION_PLAN.md).

export interface RequestOptions {
    headers?: Record<string, string>;
}

// JWT + per-session keys từ Gateway QR complete — lưu localStorage sau khi login.
function getGatewayToken(): string | null {
    if (typeof window !== "undefined") {
        return localStorage.getItem('gatewayToken');
    }
    return null;
}

function getSigningKey(): string | null {
    if (typeof window !== "undefined") {
        return localStorage.getItem('signingKey');
    }
    return null;
}

function getEncryptionKey(): string | null {
    if (typeof window !== "undefined") {
        return localStorage.getItem('encryptionKey');
    }
    return null;
}

// Gắn JWT + per-session keys vào header /api/gateway-proxy.
// signingKey + encryptionKey do Gateway derive sẵn từ jti (xem AuthenticationService.cs)
// → gateway-proxy server-side dùng trực tiếp, không cần MasterSecret.
function buildGatewayHeaders(extra?: Record<string, string>): Record<string, string> {
    const jwt = getGatewayToken();
    const signingKey = getSigningKey();
    const encryptionKey = getEncryptionKey();
    return {
        "Content-Type": "application/json",
        ...(jwt ? { "Authorization": `Bearer ${jwt}` } : {}),
        ...(signingKey ? { "X-Signing-Key": signingKey } : {}),
        ...(encryptionKey ? { "X-Encryption-Key": encryptionKey } : {}),
        ...(extra || {}),
    };
}

async function handleError(res: Response, defaultMsg?: string) {
    try {
        const data = await res.json();
        if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
            const firstError = data.errors[0];
            if (Array.isArray(firstError.message) && firstError.message.length > 0) {
                throw new Error(firstError.message[0]);
            } else if (typeof firstError.message === 'string') {
                throw new Error(firstError.message);
            }
        }
        if (data.message) {
            throw new Error(data.message);
        }
        if (data.error) {
            throw new Error(data.error);
        }
    } catch (e: any) {
        if (e.message && !e.message.includes("Unexpected token")) {
            throw e;
        }
    }

    const errorText = await res.text().catch(() => "Unknown error");
    throw new Error(defaultMsg || `Request failed: ${errorText}`);
}


export async function getJson<T = unknown>(
    path: string,
    params?: Record<string, string | number>,
    errorMsg?: string,
    options?: RequestOptions
): Promise<T> {
    const proxyParams = new URLSearchParams({
        path,
        ...(params ? Object.entries(params).reduce((acc, [k, v]) => {
            acc[k] = String(v);
            return acc;
        }, {} as Record<string, string>) : {}),
    });

    const res = await fetch(`/api/gateway-proxy?${proxyParams.toString()}`, {
        method: "GET",
        headers: buildGatewayHeaders(options?.headers),
    });

    if (!res.ok) {
        await handleError(res, errorMsg);
    }

    return res.json() as Promise<T>;
}

export async function postJson<T = unknown>(
    path: string,
    body?: Record<string, unknown>,
    errorMsg?: string,
    options?: RequestOptions
): Promise<T> {
    const proxyParams = new URLSearchParams({ path });
    const res = await fetch(`/api/gateway-proxy?${proxyParams.toString()}`, {
        method: "POST",
        headers: buildGatewayHeaders(options?.headers),
        body: JSON.stringify(body ?? {}),
    });

    if (!res.ok) {
        await handleError(res, errorMsg);
    }

    return res.json() as Promise<T>;
}

export async function deleteJson<T = unknown>(
    path: string,
    errorMsg?: string,
    options?: RequestOptions
): Promise<T> {
    const proxyParams = new URLSearchParams({ path });
    const res = await fetch(`/api/gateway-proxy?${proxyParams.toString()}`, {
        method: "DELETE",
        headers: buildGatewayHeaders(options?.headers),
    });

    if (!res.ok) {
        await handleError(res, errorMsg);
    }

    return res.json() as Promise<T>;
}
