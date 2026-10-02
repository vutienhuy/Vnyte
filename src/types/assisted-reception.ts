// Types cho luồng "Tiếp đón có hỗ trợ" trên KIOSK — NVYT đứng máy hỗ trợ bệnh nhân
// đăng ký khám, gồm cả ĐĂNG KÝ BHYT (luồng tự phục vụ hiện chỉ đăng ký được dịch vụ).
//
// Nguồn: tich-hop-kiosk-tiep-don-co-ho-tro.md v1.2 (backend vnyte `kiosk-assisted-reception`
// + `kiosk-staff-session`). Tên trường lấy đúng theo response thật, không tự đặt lại.

/** Vỏ response chung của vnyte — KHÁC vỏ { success, data } của Gateway. */
export interface VnyteEnvelope<T> {
  data: T | null;
  errors: VnyteError[] | null;
  pagination: unknown | null;
  status: number;
  message: string;
  now: string;
}

export interface VnyteError {
  code: string;
  /** Lỗi nghiệp vụ: mảng string. Lỗi DTO (code = INVALID_INPUT): mảng { field, message }. */
  message: string[] | Array<{ field: string; message: string }>;
  status: number;
  details?: unknown;
}

// --- Phiên NVYT (mục 6) ---

export interface StaffLoginResult {
  accessToken: string;
  expiresAt: string;
  idleTimeoutSeconds: number;
  staff: { loginName: string; userName: string };
}

export interface StaffMe {
  loginName: string;
  userName: string;
  expiresAt: string;
  lastActivityAt: string;
  idleTimeoutSeconds: number;
}

// --- Thông tin hành chính (mục 7.2) ---

export type ReceptionGender = "MALE" | "FEMALE" | "OTHER";

/** Dữ liệu app đọc từ chip/QR CCCD rồi gửi lên `lookup`. dob/issueDate dạng YYYY-MM-DD. */
export interface CccdPayload {
  identityNumber: string;
  fullName: string;
  dob: string;
  gender: ReceptionGender;
  address?: string | null;
  issueDate?: string | null;
  issuePlace?: string | null;
  phone?: string | null;
}

export interface ReceptionPatientInfo {
  identityNumber: string;
  lastName: string;
  firstName: string;
  dob: string;
  issueDate: string | null;
  issuePlace: string | null;
  /** HIS GENDER_ID: 1 = Nữ, 2 = Nam, 3 = Khác */
  genderId: number | null;
  ethnicCode: string | null;
  nationalCode: string | null;
  careerCode: string | null;
  phone: string | null;
  provinceCode: string | null;
  communeCode: string | null;
  address: string | null;
  workPlace: string | null;
  relativeType: string | null;
  relativeName: string | null;
  relativeIdentityNumber: string | null;
  relativePhone: string | null;
  relativeAddress: string | null;
}

export type PatientInfoField = keyof ReceptionPatientInfo;

/** Thứ tự đúng như PATIENT_INFO_FIELDS của backend — dùng để render form và sắp lỗi. */
export const PATIENT_INFO_FIELDS: PatientInfoField[] = [
  "identityNumber", "lastName", "firstName", "dob", "issueDate", "issuePlace",
  "genderId", "ethnicCode", "nationalCode", "careerCode", "phone", "provinceCode",
  "communeCode", "address", "workPlace", "relativeType", "relativeName",
  "relativeIdentityNumber", "relativePhone", "relativeAddress",
];

/** 4 trường khoá từ bước lookup: gửi lên vẫn phải khớp, sai thì lỗi LOCKED. */
export const LOCKED_FIELDS: PatientInfoField[] = ["identityNumber", "lastName", "firstName", "dob"];

/** Luôn bắt buộc. relativeType/relativeName thêm vào khi bệnh nhân dưới tuổi cấu hình. */
export const ALWAYS_REQUIRED_FIELDS: PatientInfoField[] = [
  "genderId", "ethnicCode", "nationalCode", "careerCode", "provinceCode", "communeCode",
];

export type PatientInfoSource = "HIS" | "CCCD" | "INSURANCE_CARD" | "DEFAULT" | "STAFF";
export type PatientInfoSources = Partial<Record<PatientInfoField, PatientInfoSource>>;

export type PatientFieldErrorCode =
  | "REQUIRED" | "INVALID_FORMAT" | "LOCKED" | "NOT_FOUND" | "INACTIVE" | "NOT_IN_PROVINCE";

export interface PatientFieldError {
  field: PatientInfoField;
  code: PatientFieldErrorCode;
}

export interface PatientInfoView {
  receptionId: string;
  patientInfo: ReceptionPatientInfo;
  sources: PatientInfoSources;
  confirmedAt: string | null;
}

// --- Lookup (mục 7.1) ---

export interface PatientTypeOption {
  id: number;
  code: string;
  name: string;
  isInsurance: boolean;
}

export interface LookupResult {
  receptionId: string;
  /** Hạn của PHIẾU NHÁP (draftTtlSeconds) — khác expiresAt của phiên đăng nhập. */
  expiresAt: string;
  patient: { isNew: boolean; patientCode: string | null };
  patientInfo: ReceptionPatientInfo;
  sources: PatientInfoSources;
  patientTypes: PatientTypeOption[];
}

// --- Thẻ BHYT (mục 7.3) ---

export interface InsuranceCard {
  heinCardNumber: string;
  /** DD/MM/YYYY — KHÔNG phải ISO, đừng parse bằng thư viện ngày tháng. */
  validFrom: string;
  validTo: string;
  registeredOrgCode: string | null;
  registeredOrgName: string | null;
  fiveYearDate: string | null;
  areaCode: string | null;
}

/** Giấy tờ mã BHYT đòi kèm. */
export type HeinRequires = "NONE" | "REFERRAL" | "FOLLOW_UP";

export interface HeinPatientTypeRule {
  code: string;
  description: string | null;
  rightRouteCode: string | null;
  requires: HeinRequires;
}

export interface InsuranceCheckResult {
  card: InsuranceCard;
  routeStatus: { isCorrectRoute: boolean } & Record<string, unknown>;
  heinPatientTypeRules: HeinPatientTypeRule[];
  /** Chỉ gợi ý khi đúng tuyến và đơn vị bật 1.1; trái tuyến trả null. */
  suggestedHeinPatientTypeCode: string | null;
  patientInfo: PatientInfoView;
}

export interface KcbHistoryResult {
  items: Array<Record<string, unknown>>;
  errorCode?: string;
  errorMessage?: string;
}

// --- Phòng & công khám (mục 7.5, 7.6) ---

export interface ReceptionRoom {
  roomId: number;
  roomCode: string;
  roomName: string;
  address: string | null;
  waitingCount: number;
}

export interface ReceptionService {
  serviceId: number;
  serviceCode: string;
  serviceName: string;
  price: number;
}

export interface ServiceListResult {
  items: ReceptionService[];
  /** true khi phòng chỉ có đúng một công khám hợp lệ — app tự chọn thay NVYT. */
  autoSelect: boolean;
}

// --- Giấy tờ BHYT (mục 8) ---

export interface ReferralData {
  validFrom?: string | null;
  validTo?: string | null;
  validOneYear?: boolean;
  referralDestinationId?: string | null;
  [key: string]: unknown;
}

export interface FollowUpData {
  [key: string]: unknown;
}

/**
 * Một lần khám cũ có hẹn tái khám (GET catalog/follow-ups — tài liệu v1.2 mục 8).
 *
 * Danh sách trả CẢ hồ sơ không dùng được: NVYT cần thấy vì sao phiếu giấy trên tay bệnh
 * nhân lại không chọn được. `invalidReason = null` mới là chọn được.
 */
export interface FollowUpOption {
  treatmentCode: string;
  /** Ngày vào viện của lần khám cũ. */
  inDate: string | null;
  appointmentDate: string | null;
  appointmentTime: string | null;
  appointmentDesc: string | null;
  /** Phòng nơi lần khám cũ KẾT THÚC điều trị, không phải phòng hẹn tái khám. */
  examRoomName: string | null;
  examServiceName: string | null;
  icdCode: string | null;
  icdName: string | null;
  heinPatientTypeCode: string | null;
  /** null = chọn được; khác null là câu lý do cụ thể (đã dùng, không phải BHYT…). */
  invalidReason: string | null;
}

/** GET catalog/follow-ups/{treatmentCode}/referral — giấy chuyển tuyến tiền điền cho mã 1.5. */
export interface FollowUpReferral {
  treatmentCode: string;
  referralData: ReferralData;
}

/** GET catalog/last-transfer-in — bản ghi thô của HIS kèm khối referralData dựng sẵn (v1.2). */
export interface LastTransferIn extends Record<string, unknown> {
  referralData?: ReferralData | null;
}

// --- Đăng ký (mục 7.7) ---

export interface RegisterPayload {
  patientTypeId: number;
  roomId: number;
  serviceId: number;
  heinPatientTypeCode?: string | null;
  referralData?: ReferralData | null;
  followUpData?: FollowUpData | null;
  /** Mã phiếu hẹn từ catalog/follow-ups. Không gửi CÙNG followUpData. */
  followUpTreatmentCode?: string | null;
  primaryPatientTypeId?: number | null;
  /** Tối đa 300 ký tự. */
  symptom?: string | null;
}

/** Nội dung phiếu in — app tự dựng layout, backend không sinh file in. */
export interface ReceptionTicket {
  receptionId: string;
  treatmentCode: string | null;
  patientCode: string | null;
  numOrder: number | null;
  roomName: string | null;
  roomAddress: string | null;
  serviceName: string | null;
  patientTypeName: string | null;
  heinPatientTypeCode: string | null;
  staffName: string | null;
  registeredAt: string;
  qrContent: string | null;
  notices: string[];
}

export type ReconcileResult =
  | { status: "SUCCESS"; ticket: ReceptionTicket }
  | { status: "UNKNOWN"; retryAfterSeconds: number }
  | { status: "FAILED" };

// --- Danh mục phân trang (mục 8) ---

export interface CatalogItem {
  code: string;
  name: string;
  [key: string]: unknown;
}

// --- Chi tiết lỗi có cấu trúc (mục 4) ---

export interface AlreadyRegisteredDetails {
  treatmentCode: string | null;
  roomName: string | null;
  numOrder: number | null;
  source: string | null;
}

export interface IdentityConflictDetails {
  hisPatients: Array<{ patientCode: string; fullName: string; dob: string }>;
}
