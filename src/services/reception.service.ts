// Client service cho kiosk-reception (tái khám). Mọi request đi qua /api/gateway-proxy.
// Gateway-proxy inject X-Kiosk-Device-Code/Secret server-side khi path chứa
// /kiosk-reception/ và forward Authorization (JWT) nếu client có (Luồng B).
// Path: /api/hospitals/{HOSPITAL_CODE}/kiosk-reception/*.
//
// Nguồn nghiệp vụ: BMC — Kiosk Reception API v1.0 §4–§5.
//   • follow-up-by-treatment + create-treatment-from-follow-up: chỉ cần device auth (Luồng A — quét mã).
//   • follow-up-by-identity: cần thêm JWT người dùng + IdentityAccessGuard (Luồng B — tra theo CCCD).

import { HOSPITAL_CODE } from "@/config/hospital";
import type { FollowUpItem, CreatedTreatmentResult } from "@/types/reception";

export class ReceptionError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "ReceptionError";
  }
}

// Reception dùng device-auth thuần (gateway-proxy inject X-Kiosk-Device-*). KHÔNG đính
// user JWT: gửi JWT sẽ kích middleware chữ ký HMAC của gateway → đòi X-Signature → 401.

// Dựng ReceptionError từ envelope lỗi { data:null, errors:[{code,message[]}], status, code, message }.
function toReceptionError(json: Record<string, unknown> | null, status: number): ReceptionError {
  const errors = json?.errors as
    | Array<{ code?: string; message?: string | string[] }>
    | undefined;
  const code =
    (json?.code as string | undefined) ||
    errors?.[0]?.code ||
    "HIS_REGISTER_FAILED";
  const rawMsg =
    (json?.message as string | undefined) ||
    (Array.isArray(errors?.[0]?.message)
      ? errors![0].message![0]
      : (errors?.[0]?.message as string | undefined)) ||
    "Yêu cầu thất bại";
  return new ReceptionError(String(code), String(rawMsg), status);
}

async function callReception(
  method: "GET" | "POST",
  kioskPath: string,
  opts: { query?: Record<string, string>; body?: Record<string, unknown> } = {},
): Promise<Record<string, unknown>> {
  // Map /kiosk-reception/x → /api/hospitals/{HOSPITAL_CODE}/kiosk-reception/x
  const gatewayPath = `/api/hospitals/${HOSPITAL_CODE}${kioskPath}`;
  const params = new URLSearchParams({ path: gatewayPath, ...(opts.query ?? {}) });

  const res = await fetch(`/api/gateway-proxy?${params.toString()}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
  });

  const json = (await res.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!res.ok || !json) {
    throw toReceptionError(json, res.status);
  }
  return json;
}

// §4.2 — Luồng A: lấy 01 lịch hẹn tái khám theo mã hẹn khám (treatmentCode) quét được.
export async function getFollowUpByTreatment(
  treatmentCode: string,
): Promise<FollowUpItem> {
  const json = await callReception("GET", "/kiosk-reception/follow-up-by-treatment", {
    query: { treatmentCode },
  });
  return json.data as FollowUpItem;
}

// §4.1 — Luồng B: liệt kê lịch hẹn tái khám theo CCCD/Passport (cần JWT + Identity guard).
export async function getFollowUpByIdentity(
  identityNumber: string,
): Promise<FollowUpItem[]> {
  const json = await callReception("GET", "/kiosk-reception/follow-up-by-identity", {
    query: { identityNumber },
  });
  return (json.data as FollowUpItem[]) ?? [];
}

// §4.3 — tạo hồ sơ khám HIS từ lịch hẹn đã chọn. KHÔNG retry mù (endpoint "destructive").
// confirmCreate BẮT BUỘC = true — lớp phòng vệ chống tạo hồ sơ ngoài ý muốn (§7).
export async function createTreatmentFromFollowUp(
  treatmentCode: string,
  confirmCreate = true,
): Promise<CreatedTreatmentResult> {
  const json = await callReception(
    "POST",
    "/kiosk-reception/create-treatment-from-follow-up",
    { body: { treatmentCode, confirmCreate } },
  );
  return json.data as CreatedTreatmentResult;
}
