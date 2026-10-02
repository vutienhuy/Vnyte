// Lấy danh tính bệnh nhân từ bước ĐĂNG NHẬP của luồng đăng ký khám, rồi đưa sang
// luồng tiếp đón có hỗ trợ (BHYT) — để NVYT khỏi quét lại thẻ lần nữa.
//
// Hai nguồn, cùng đổ về một hình dạng `CccdPayload` mà `lookup` nhận:
//   • Quét CCCD  → sessionStorage "cccdPatient" (đặt bởi /patient-check)
//   • QR app     → GET /api/patients/me bằng JWT bệnh nhân
//
// `lookup` KHOÁ bốn trường định danh và so với hồ sơ HIS, nên nguồn nào sai dấu hay
// lệch ngày sinh sẽ ra KIOSK_AR_PATIENT_IDENTITY_CONFLICT — quét chip là chắc nhất.

import { getJson } from "@/services/http-utils";
import type { CccdPayload, ReceptionGender, ReceptionPatientInfo } from "@/types/assisted-reception";

/** Khoá sessionStorage mang danh tính sang trang /assisted. */
const PENDING_KEY = "arPendingIdentity";
const SUGGEST_KEY = "arPendingSuggest";

/** Trường điền sẵn thêm cho form hành chính — không gửi lên `lookup`, chỉ gợi ý tại chỗ. */
export type PatientSuggest = Partial<Pick<
  ReceptionPatientInfo,
  "phone" | "address" | "nationalCode" | "ethnicCode" | "careerCode" | "provinceCode" | "communeCode"
>>;

export interface PatientIdentity {
  payload: CccdPayload;
  suggest: PatientSuggest;
  /** Để màn sau nói rõ dữ liệu lấy từ đâu khi lệch hồ sơ HIS. */
  source: "CCCD" | "VNYTE";
}

// --- Nguồn 1: quét CCCD ---

interface CccdSession {
  soCccd?: string | null;
  hoTen?: string | null;
  /** DD/MM/YYYY */
  ngaySinh?: string | null;
  gioiTinh?: string | null;
  maGioiTinh?: number | null;
  diaChi?: string | null;
  address?: string | null;
  nationalCode?: string | null;
  ethnicCode?: string | null;
  provinceCode?: string | null;
  communeCode?: string | null;
}

function vnDateToIso(dmy?: string | null): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((dmy || "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function genderFromVn(text?: string | null, code?: number | null): ReceptionGender {
  if (code === 2) return "MALE";
  if (code === 1) return "FEMALE";
  const s = (text || "").trim().toLowerCase();
  if (s.startsWith("nam")) return "MALE";
  if (s.startsWith("nữ") || s.startsWith("nu")) return "FEMALE";
  return "OTHER";
}

export function identityFromCccdSession(): PatientIdentity | null {
  if (typeof window === "undefined") return null;
  let raw: CccdSession | null = null;
  try {
    raw = JSON.parse(sessionStorage.getItem("cccdPatient") || "null");
  } catch {
    return null;
  }
  const identityNumber = (raw?.soCccd || "").replace(/\D/g, "");
  const dob = vnDateToIso(raw?.ngaySinh);
  if (identityNumber.length !== 12 || !dob || !raw?.hoTen) return null;

  return {
    source: "CCCD",
    payload: {
      identityNumber,
      fullName: String(raw.hoTen).trim(),
      dob,
      gender: genderFromVn(raw.gioiTinh, raw.maGioiTinh),
      address: (raw.address || raw.diaChi || "").trim() || null,
    },
    suggest: {
      address: (raw.address || raw.diaChi || "").trim() || null,
      nationalCode: raw.nationalCode || null,
      ethnicCode: raw.ethnicCode || null,
      provinceCode: raw.provinceCode || null,
      communeCode: raw.communeCode || null,
    },
  };
}

// --- Nguồn 2: tài khoản VNyTe (QR login) ---

interface PatientProfile {
  identityNumber?: string;
  fullName?: string;
  dateOfBirth?: string;
  /** Gateway trả số; 1 = Nữ, 2 = Nam theo HIS_GENDER. */
  gender?: number;
  genderId?: string | null;
  phoneNumber?: string | null;
  address?: string | null;
  nationalCode?: string | null;
  ethnicCode?: string | null;
  careerCode?: string | null;
  provinceCode?: string | null;
  communeCode?: string | null;
}

/** GET /api/patients/me — cần JWT bệnh nhân (có sau QR login). */
export async function identityFromVnyteAccount(): Promise<PatientIdentity | null> {
  const res = await getJson<{ success?: boolean; data?: PatientProfile }>(
    "/api/patients/me",
    undefined,
    "Không lấy được thông tin tài khoản",
  );
  const p = res?.data ?? (res as unknown as PatientProfile);
  const identityNumber = (p?.identityNumber || "").replace(/\D/g, "");
  // Ngày sinh về dạng ISO đầy đủ (2026-09-18T00:00:00) → cắt lấy phần ngày.
  const dob = (p?.dateOfBirth || "").slice(0, 10);
  if (identityNumber.length !== 12 || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || !p?.fullName) return null;

  return {
    source: "VNYTE",
    payload: {
      identityNumber,
      fullName: String(p.fullName).trim(),
      dob,
      gender: p.gender === 2 ? "MALE" : p.gender === 1 ? "FEMALE" : "OTHER",
      phone: p.phoneNumber || null,
      address: p.address || null,
    },
    suggest: {
      phone: p.phoneNumber || null,
      address: p.address || null,
      nationalCode: p.nationalCode || null,
      ethnicCode: p.ethnicCode || null,
      careerCode: p.careerCode || null,
      provinceCode: p.provinceCode || null,
      communeCode: p.communeCode || null,
    },
  };
}

// --- Chuyển sang trang /assisted ---

export function storePendingIdentity(id: PatientIdentity): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(id.payload));
  sessionStorage.setItem(SUGGEST_KEY, JSON.stringify(id.suggest));
}

export function takePendingIdentity(): { payload: CccdPayload; suggest: PatientSuggest } | null {
  if (typeof window === "undefined") return null;
  try {
    const payload = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null") as CccdPayload | null;
    if (!payload?.identityNumber) return null;
    const suggest = JSON.parse(sessionStorage.getItem(SUGGEST_KEY) || "{}") as PatientSuggest;
    // Lấy một lần rồi xoá: NVYT bấm "Tiếp bệnh nhân khác" phải quay về đọc thẻ như
    // thường, không dùng lại danh tính của người trước.
    sessionStorage.removeItem(PENDING_KEY);
    sessionStorage.removeItem(SUGGEST_KEY);
    return { payload, suggest };
  } catch {
    return null;
  }
}
