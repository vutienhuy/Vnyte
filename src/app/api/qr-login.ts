// API client cho QR login — đi qua /api/auth-proxy (ẩn backend, tránh CORS).

async function callAuthProxy<T = unknown>(
  path: string,
  queryParams: Record<string, string> = {},
  body?: Record<string, unknown>,
  errorMsg?: string,
): Promise<T> {
  const qs = new URLSearchParams({ path, ...queryParams }).toString();
  const res = await fetch(`/api/auth-proxy?${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(errorMsg || "Request failed");
  return res.json() as Promise<T>;
}

export function generateQrLogin(deviceInfo: string) {
  return callAuthProxy(
    "/auth/qr-login/generate",
    {},
    { deviceInfo },
    "Failed to generate QR login",
  );
}

export function completeQrLogin(sessionId: string) {
  return callAuthProxy(
    "/auth/qr-login/complete",
    { sessionId },
    { sessionId },
    "Failed to complete QR login",
  );
}

export function confirmQrLogin(sessionId: string, userId: string) {
  return callAuthProxy(
    "/auth/qr-login/confirm",
    { sessionId, userId },
    undefined,
    "Failed to confirm QR login",
  );
}

export async function checkQrLoginStatus(sessionId: string): Promise<{
  data?: { sessionId?: string; status?: string; userId?: string };
  success?: boolean;
  notFound?: boolean;
}> {
  const res = await fetch(
    `/api/auth-proxy/status/${encodeURIComponent(sessionId)}`,
    { method: "GET" },
  );
  // 404 = session đã expired/cleanup — caller dùng marker này để stop polling,
  // tránh leak loop vô hạn (QR_LOGIN_WEB_INTEGRATION.md mục 2.3).
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error("Failed to check QR login status");
  return res.json();
}
