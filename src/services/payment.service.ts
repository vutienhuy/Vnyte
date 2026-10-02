// Client service cho kiosk payment. Mọi request đi qua /api/gateway-proxy
// (Gateway forward sang HIS, kèm X-Kiosk-Device-* server-side).
// Path: /api/hospitals/92000/kiosk-payment/*. Xem GATEWAY_MIGRATION_PLAN.md.
// Response envelope giữ nguyên { success, data/error } / { data, errors, status }.

import type {
  CheckDebtData,
  DebtItem,
  DebtsByIdentityData,
  GenerateQrData,
  Pagination,
  SseTokenData,
} from "@/types/payment";

import { HOSPITAL_CODE } from "@/config/hospital";

export class KioskError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "KioskError";
  }
}

// Gọi gateway-proxy với path kiosk-payment, trả envelope top-level đã parse.
// Throw KioskError nếu HTTP non-2xx hoặc body không parse được.
async function callKioskProxyRaw(
  kioskPath: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Map /kiosk-payment/x → /api/hospitals/92000/kiosk-payment/x
  const gatewayPath = `/api/hospitals/${HOSPITAL_CODE}${kioskPath}`;
  const res = await fetch(
    `/api/gateway-proxy?path=${encodeURIComponent(gatewayPath)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    },
  );

  const json = (await res.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!res.ok) {
    const err = json?.error as { code?: string; message?: string } | undefined;
    const errors = json?.errors as
      | Array<{ code?: string; message?: string | string[] }>
      | undefined;
    const code =
      err?.code || errors?.[0]?.code || "KIOSK_HIS_UPSTREAM_TIMEOUT";
    const rawMsg =
      err?.message ||
      (Array.isArray(errors?.[0]?.message)
        ? errors![0].message[0]
        : errors?.[0]?.message) ||
      (json?.message as string | undefined) ||
      "Yêu cầu thất bại";
    throw new KioskError(code, String(rawMsg));
  }

  if (!json || typeof json !== "object") {
    throw new KioskError(
      "KIOSK_HIS_UPSTREAM_TIMEOUT",
      "Phản hồi không hợp lệ",
    );
  }
  return json;
}

// Unwrap cho các endpoint trả về single-object.
// Chấp nhận cả { success: true, data } (spec) và { data, status, message } (HIS).
function unwrapData<T>(json: Record<string, unknown>): T {
  if ("data" in json && json.data !== undefined && json.data !== null) {
    return json.data as T;
  }
  return json as unknown as T;
}

// checkDebt chấp nhận cả treatmentId (số) và treatmentCode (chuỗi).
// Luồng A: truyền treatmentId lấy từ danh sách nợ (number).
// Luồng B: truyền treatmentCode do bệnh nhân nhập/quét barcode (string).
// Phân biệt bằng typeof — treatmentCode có thể toàn số nên không dùng regex.
export async function checkDebt(
  idOrCode: number | string,
): Promise<CheckDebtData> {
  const body: Record<string, unknown> =
    typeof idOrCode === "number"
      ? { treatmentId: idOrCode }
      : { treatmentCode: idOrCode };
  const r = await callKioskProxyRaw("/kiosk-payment/check-debt", body);
  return unwrapData<CheckDebtData>(r);
}

export async function getDebtsByIdentity(
  identityNumber: string,
  page = 1,
  limit = 10,
): Promise<DebtsByIdentityData> {
  const r = await callKioskProxyRaw("/kiosk-payment/debts-by-identity", {
    identityNumber,
    page,
    limit,
  });
  // Hai dạng envelope có thể gặp:
  //   spec: { success: true, data: { data: [...], pagination: {...} } }
  //   HIS:  { data: [...], pagination: {...}, status, message, now }
  if (
    r.success === true &&
    r.data &&
    typeof r.data === "object" &&
    "data" in (r.data as object)
  ) {
    return r.data as DebtsByIdentityData;
  }
  return {
    data: (r.data as DebtItem[]) ?? [],
    pagination: (r.pagination as Pagination) ?? {
      total: 0,
      page,
      limit,
      pageCount: 0,
      hasNext: false,
      hasPrev: false,
    },
  };
}

export async function generateQr(
  treatmentId: number,
  existingTransReqId?: number,
): Promise<GenerateQrData> {
  const body: Record<string, unknown> = { treatmentId };
  if (existingTransReqId != null) body.existingTransReqId = existingTransReqId;
  const r = await callKioskProxyRaw("/kiosk-payment/generate-qr", body);
  return unwrapData<GenerateQrData>(r);
}

export async function getSseToken(): Promise<SseTokenData> {
  const r = await callKioskProxyRaw("/kiosk-payment/sse-token");
  return unwrapData<SseTokenData>(r);
}

// Mở SSE tới Next proxy (đã inject kiosk headers phía server, forward sang Gateway).
// Caller chịu trách nhiệm gọi es.close() khi unmount.
export function openPaymentSse(transReqId: number, token: string): EventSource {
  const url = `/api/gateway-proxy/sse/${transReqId}?token=${encodeURIComponent(token)}`;
  return new EventSource(url);
}
