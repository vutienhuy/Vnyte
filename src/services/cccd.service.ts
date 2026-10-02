// src/services/cccd.service.ts
// Dịch vụ xử lý API kiểm tra CCCD/NFC

import { ApiResponse } from "@/types/registration";
import { HOSPITAL_CODE } from "@/config/hospital";
import { postJson } from "./http-utils";

export interface VerifyCCCDParams {
  cccd?: string;
  name?: string;
  dob?: string;
}

/**
 * Normalize tên: bỏ dấu Unicode + giữ chữ Đ/đ → D/d.
 * HIS upstream của Gateway mới không so sánh được string có dấu tiếng Việt
 * (test thực tế: "VŨ Tiến Huy" → errorCode 050; "Vu Tien Huy" → success).
 */
function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export async function verifyCCCD({ cccd, name, dob }: VerifyCCCDParams): Promise<ApiResponse<any>> {
  const body: Record<string, string> = {};
  if (cccd) body.identityNumber = cccd;
  if (name) body.fullName = stripDiacritics(name);
  if (dob) {
    // Chuyển dd/MM/yyyy thành yyyyMMdd (HIS format)
    let birthDate = dob;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dob)) {
      const [day, month, year] = dob.split("/");
      birthDate = `${year}${month}${day}`;
    }
    body.birthDate = birthDate;
  }
  // Migrate sang Gateway: POST /api/hospitals/92000/auth/verify-user (AllowAnonymous).
  // Bỏ apiKey hardcode — Gateway tự gắn theo X-Hospital-Code.
  // Xem GATEWAY_MIGRATION_PLAN.md mục Nhóm 1.
  return postJson<ApiResponse<any>>(
    `/api/hospitals/${HOSPITAL_CODE}/auth/verify-user`,
    body,
    'Failed to verify CCCD',
  );
}

export async function verifyNFC(signal?: AbortSignal) {
  const res = await fetch("http://localhost:7000/api/v1/verify?nfc=true", {
    method: "GET",
    signal,
  });
  if (!res.ok) throw new Error("Không đọc được dữ liệu từ thẻ CCCD");
  return res.json();
}
