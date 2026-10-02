// Types cho luồng kiosk-payment. Xem VNYTE-Kiosk-Payment-API-Guide.docx.md.

export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "EXPIRED"
  | "CANCELED"
  | "FAILED"
  | "TIMEOUT";

export interface KioskApiOk<T> {
  success: true;
  data: T;
}
export interface KioskApiErr {
  success: false;
  error: { code: string; message: string };
}
export type KioskApiResponse<T> = KioskApiOk<T> | KioskApiErr;

export interface CheckDebtData {
  treatmentId: number;
  treatmentCode: string;
  patientCode: string;
  patientName: string;
  patientDob: string;
  patientGenderName: string;
  inTime: string;
  outTime: string | null;
  icdCode: string | null;
  icdName: string | null;
  isFinished: number;
  isLockFee: number;
  transReqId: number;
  transReqCode: string;
  amount: number;
  hasDebt: boolean;
  status: PaymentStatus;
  checkedAt: string;
}

export interface DebtItem {
  treatmentId: number;
  treatmentCode: string;
  patientCode: string;
  patientName: string;
  patientDob: string;
  patientGenderName: string;
  inTime: string;
  outTime: string | null;
  icdCode: string | null;
  icdName: string | null;
  totalPatientPrice: number;
  totalPaid: number;
  lockingAmount: number;
  remainingAmount: number;
  oweTypeId: number;
  oweTypeCode: string;
  oweTypeName: string;
  isFinished: number;
  isLockFee: number;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  pageCount: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface DebtsByIdentityData {
  data: DebtItem[];
  pagination: Pagination;
}

export interface GenerateQrData {
  transReqId: number;
  transReqCode: string;
  treatmentId: number;
  amount: number;
  bank: string;
  qrText: string;
  qrCreatedAt: string | null;
  expiredAt: string | null;
  status: PaymentStatus;
}

export interface SseTokenData {
  token: string;
  expiresAt: string;
}

export interface SseStatusEvent {
  transReqId: number;
  status: PaymentStatus;
  amount: number;
  paidAt?: string;
}

export interface SseDoneEvent {
  transReqId: number;
  finalStatus: PaymentStatus;
}

export interface SseErrorEvent {
  code: string;
}
