// Client service cho luồng "Tiếp đón có hỗ trợ" (đăng ký khám, gồm BHYT) trên KIOSK.
// Mọi request đi qua /api/gateway-proxy → Gateway VNT → vnyte của viện.
//
// Gateway-proxy (src/app/api/gateway-proxy/route.ts) tự inject X-Kiosk-Device-Code/Secret
// và forward nguyên văn Authorization khi path chứa /kiosk-assisted-reception/ hoặc
// /kiosk-staff-session/ → phía client chỉ cần gắn token phiên NVYT.
//
// Nguồn: tich-hop-kiosk-tiep-don-co-ho-tro.md v1.2.

import { HOSPITAL_CODE } from "@/config/hospital";
import { isSessionDead } from "@/constants/assisted-reception-errors";
import type {
  CccdPayload, FollowUpOption, HeinPatientTypeRule, InsuranceCheckResult, KcbHistoryResult,
  FollowUpReferral, LastTransferIn, LookupResult, PatientFieldError, PatientInfoView,
  PatientTypeOption, ReceptionPatientInfo,
  ReceptionRoom, ReceptionTicket, ReconcileResult, RegisterPayload, ServiceListResult,
  VnyteEnvelope,
} from "@/types/assisted-reception";

export class ArError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;
  /** Lỗi theo ô của PUT patient-info / register (KIOSK_AR_PATIENT_INFO_INVALID). */
  readonly fields: PatientFieldError[];

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ArError";
    this.code = code;
    this.status = status;
    this.details = details ?? null;
    const raw = (details as { fields?: PatientFieldError[] } | null)?.fields;
    this.fields = Array.isArray(raw) ? raw : [];
  }
}

// --- Token phiên NVYT ---
// sessionStorage (không phải localStorage): đóng tab/tắt app là mất, không nằm lại trên
// máy ở sảnh. MẬT KHẨU NVYT KHÔNG BAO GIỜ được lưu (mục 9).

const TOKEN_KEY = "arStaffToken";
const STAFF_KEY = "arStaffName";
/**
 * Ngưỡng không-thao-tác của viện, lưu KÈM token.
 *
 * Phải lưu vì trang có thể mở lại giữa phiên (NVYT bấm "Về trang chủ" rồi vào đăng ký
 * cho người tiếp theo, hoặc F5): lúc đó app khôi phục token và tên NVYT từ đây, nhưng
 * nếu không có con số này thì đồng hồ rơi về mặc định 5 phút trong khi phiên thật của
 * viện là 50 phút — đo được trên máy BV Nguyễn Thị Thập.
 */
const IDLE_KEY = "arIdleTimeoutSeconds";

export function getStaffToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setStaffSession(token: string, staffName: string, idleTimeoutSeconds?: number): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(STAFF_KEY, staffName);
  if (Number.isFinite(idleTimeoutSeconds) && (idleTimeoutSeconds as number) > 0) {
    sessionStorage.setItem(IDLE_KEY, String(Math.floor(idleTimeoutSeconds as number)));
  }
}

export function getStaffName(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(STAFF_KEY);
}

/** Ngưỡng đã lưu, hoặc null khi chưa biết — người gọi tự quyết định mặc định. */
export function getStaffIdleTimeout(): number | null {
  if (typeof window === "undefined") return null;
  const n = Number(sessionStorage.getItem(IDLE_KEY));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function clearStaffSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(STAFF_KEY);
  sessionStorage.removeItem(IDLE_KEY);
}

// --- Gọi API ---

type Method = "GET" | "POST" | "PUT";

function toArError(json: VnyteEnvelope<unknown> | null, status: number): ArError {
  const err = json?.errors?.[0];
  const code = err?.code || "UNKNOWN_ERROR";

  // Lỗi DTO (code INVALID_INPUT) có message là mảng { field, message } — KHÁC lỗi nghiệp vụ
  // (mảng string). Đọc nhầm hình dạng sẽ hiện "[object Object]" lên màn hình NVYT.
  let message = json?.message || "Yêu cầu thất bại";
  const rawMessage = err?.message;
  if (Array.isArray(rawMessage) && rawMessage.length > 0) {
    const first = rawMessage[0];
    message = typeof first === "string" ? first : `${first.field}: ${first.message}`;
  }
  return new ArError(code, message, status, err?.details);
}

async function call<T>(
  method: Method,
  vnytePath: string,
  opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
): Promise<T> {
  // Gateway-proxy đổi lại segment mã viện theo license đã kích hoạt (kiosk-config.json),
  // nên mã bake lúc build ở đây chỉ là chỗ dựa mặc định.
  const gatewayPath = `/api/hospitals/${HOSPITAL_CODE}${vnytePath}`;
  const params = new URLSearchParams({ path: gatewayPath });
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") params.append(k, String(v));
  }

  const token = getStaffToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api/gateway-proxy?${params.toString()}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(opts.body ?? {}),
  });

  const json = (await res.json().catch(() => null)) as VnyteEnvelope<T> | null;

  if (!res.ok || !json) {
    const error = toArError(json, res.status);
    // Mục 9: xoá accessToken NGAY khi nhận 401 — giữ lại chỉ gây lỗi lặp.
    if (isSessionDead(error.code, error.status)) clearStaffSession();
    throw error;
  }
  return json.data as T;
}

// --- Phiên NVYT (mục 6) ---

/** Đăng nhập bằng tài khoản HIS của NVYT. Trả 200 (không phải 201). */
export async function staffLogin(username: string, password: string) {
  // login KHÔNG gửi Authorization: token cũ (nếu còn) không liên quan phiên mới.
  clearStaffSession();
  const data = await call<{
    accessToken: string;
    expiresAt: string;
    idleTimeoutSeconds: number;
    staff: { loginName: string; userName: string };
  }>("POST", "/kiosk-staff-session/login", { body: { username, password } });
  setStaffSession(
    data.accessToken,
    data.staff?.userName || data.staff?.loginName || "",
    data.idleTimeoutSeconds,
  );
  return data;
}

/**
 * Lấy lại thông tin phiên. CHỈ gọi khi app thức dậy từ màn chờ.
 * TUYỆT ĐỐI KHÔNG gọi định kỳ kiểu heartbeat: mọi request qua guard đều làm mới
 * thời điểm hoạt động cuối → gọi theo timer sẽ vô hiệu hoá idle timeout, NVYT rời
 * máy mà phiên không bao giờ tự đóng (mục 6).
 */
export function staffMe() {
  return call<{
    loginName: string; userName: string; expiresAt: string;
    lastActivityAt: string; idleTimeoutSeconds: number;
  }>("GET", "/kiosk-staff-session/me");
}

/** Đăng xuất. Luôn thành công kể cả khi phiên đã chết → nuốt lỗi, luôn xoá token. */
export async function staffLogout(): Promise<void> {
  try {
    await call<{ success: boolean }>("POST", "/kiosk-staff-session/logout");
  } catch {
    /* phiên có thể đã hết hạn — vẫn coi như đã đăng xuất */
  } finally {
    clearStaffSession();
  }
}

// --- Tiếp đón (mục 7) ---

export function lookup(cccd: CccdPayload) {
  return call<LookupResult>("POST", "/kiosk-assisted-reception/lookup", { body: cccd });
}

export function getPatientInfo(receptionId: string) {
  return call<PatientInfoView>("GET", `/kiosk-assisted-reception/${receptionId}/patient-info`);
}

/** Gửi lại TOÀN BỘ 20 trường, kể cả 4 trường khoá (backend so khớp, sai → lỗi LOCKED). */
export function confirmPatientInfo(receptionId: string, info: ReceptionPatientInfo) {
  return call<PatientInfoView>("PUT", `/kiosk-assisted-reception/${receptionId}/patient-info`, { body: info });
}

/** Tra thẻ BHYT bằng dữ liệu đã lưu trong phiếu — body rỗng, không nhận tham số. */
export function insuranceCheck(receptionId: string) {
  return call<InsuranceCheckResult>("POST", `/kiosk-assisted-reception/${receptionId}/insurance-check`);
}

/** Lịch sử KCB — chỉ để NVYT tham khảo, không chặn luồng. */
export function kcbHistory(receptionId: string) {
  return call<KcbHistoryResult>("GET", `/kiosk-assisted-reception/${receptionId}/kcb-history`);
}

/** Danh sách phòng. PHẢI tải lại mỗi khi đổi đối tượng (mục 9). */
export function listRooms(receptionId: string, patientTypeId: number, search?: string) {
  return call<ReceptionRoom[]>("GET", `/kiosk-assisted-reception/${receptionId}/rooms`, {
    query: { patientTypeId, search: sanitizeSearch(search) },
  });
}

/** Công khám của phòng. Cũng phải tải lại theo đối tượng. */
export function listServices(receptionId: string, roomId: number, patientTypeId: number) {
  return call<ServiceListResult>("GET", `/kiosk-assisted-reception/${receptionId}/services`, {
    query: { roomId, patientTypeId },
  });
}

/**
 * Đăng ký. Chỉ gửi LỰA CHỌN CUỐI của NVYT — hành chính và thẻ BHYT đã nằm trong phiếu.
 * Gọi lại trên phiếu đã SUCCESS trả đúng phiếu cũ (dùng để in lại khi đứt mạng), không
 * tạo hồ sơ HIS thứ hai.
 */
export function register(receptionId: string, payload: RegisterPayload) {
  return call<ReceptionTicket>("POST", `/kiosk-assisted-reception/${receptionId}/register`, {
    body: payload,
  });
}

/** Đối soát phiếu đang UNKNOWN. Tôn trọng retryAfterSeconds trước khi gọi lại. */
export function reconcile(receptionId: string) {
  return call<ReconcileResult>("POST", `/kiosk-assisted-reception/${receptionId}/reconcile`);
}

/** Huỷ phiếu — chỉ được khi phiếu còn DRAFT hoặc FAILED. */
export function cancelReception(receptionId: string) {
  return call<{ status: "CANCELLED" }>("POST", `/kiosk-assisted-reception/${receptionId}/cancel`);
}

/** Lấy lại phiếu in của lượt đã đăng ký thành công. */
export function getTicket(receptionId: string) {
  return call<ReceptionTicket>("GET", `/kiosk-assisted-reception/${receptionId}/ticket`);
}

// --- Danh mục (mục 8) ---

/**
 * `search` của danh mục: tối đa 100 ký tự, KHÔNG chứa `'` `"` `\` `;` hay ký tự điều khiển.
 * Đây là chốt chặn chèn SQL ở backend — lọc sẵn ở app để NVYT không nhận lỗi INVALID_INPUT
 * khó hiểu, KHÔNG phải để nới lỏng.
 */
export function sanitizeSearch(value?: string): string | undefined {
  if (!value) return undefined;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/['"\\;]/g, "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  return cleaned ? cleaned.slice(0, 100) : undefined;
}

type CatalogPage<T> = { data?: T[]; items?: T[] } | T[];

function unwrapCatalog<T>(res: CatalogPage<T>): T[] {
  if (Array.isArray(res)) return res;
  return res?.data ?? res?.items ?? [];
}

async function catalog<T>(name: string, query: Record<string, string | number | undefined>): Promise<T[]> {
  const res = await call<CatalogPage<T>>("GET", `/kiosk-assisted-reception/catalog/${name}`, { query });
  return unwrapCatalog(res);
}

export function catalogPatientTypes() {
  return call<PatientTypeOption[]>("GET", "/kiosk-assisted-reception/catalog/patient-types");
}

export function catalogHeinPatientTypes() {
  return call<HeinPatientTypeRule[]>("GET", "/kiosk-assisted-reception/catalog/hein-patient-types");
}

export interface CatalogQuery { search?: string; page?: number; limit?: number }

const paged = (q: CatalogQuery = {}) => ({
  search: sanitizeSearch(q.search),
  page: q.page ?? 1,
  limit: q.limit ?? 20,
});

export const catalogCareers = (q?: CatalogQuery) => catalog<Record<string, unknown>>("careers", paged(q));
export const catalogEthnics = (q?: CatalogQuery) => catalog<Record<string, unknown>>("ethnics", paged(q));
export const catalogNationals = (q?: CatalogQuery) => catalog<Record<string, unknown>>("nationals", paged(q));
export const catalogProvinces = (q?: CatalogQuery) => catalog<Record<string, unknown>>("provinces", paged(q));
export const catalogMediOrgs = (q?: CatalogQuery) => catalog<Record<string, unknown>>("medi-orgs", paged(q));
export const catalogIcds = (q?: CatalogQuery) => catalog<Record<string, unknown>>("icds", paged(q));

export const catalogCommunes = (provinceCode: string, q?: CatalogQuery) =>
  catalog<Record<string, unknown>>("communes", { ...paged(q), provinceCode });

// --- Tải TRỌN danh mục để chọn trong dropdown ---
//
// `limit` tối đa của API là 100, trong khi danh mục thật dài hơn nhiều: quốc tịch 252
// dòng (Việt Nam KHÔNG nằm trong 100 dòng đầu), nghề nghiệp 785, xã/phường 126 cho
// một tỉnh. Chỉ lấy trang đầu thì NVYT không tìm thấy chính những mục hay dùng nhất,
// và ô tìm kiếm của dropdown lọc trên mảng đã tải nên cũng không cứu được.
//
// Nhớ theo phiên chạy của app: danh mục hầu như không đổi trong một ca trực, không có
// lý do gì tải lại cho từng bệnh nhân.
const catalogCache = new Map<string, Record<string, unknown>[]>();

const PAGE_SIZE = 100;
const MAX_PAGES = 30; // chặn lỗi phân trang của server làm app quay vô hạn

async function fetchAll(
  key: string,
  page: (p: number) => Promise<Record<string, unknown>[]>,
): Promise<Record<string, unknown>[]> {
  const cached = catalogCache.get(key);
  if (cached) return cached;

  const all: Record<string, unknown>[] = [];
  for (let p = 1; p <= MAX_PAGES; p++) {
    const rows = await page(p);
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  catalogCache.set(key, all);
  return all;
}

export const catalogAllNationals = () =>
  fetchAll("nationals", (p) => catalogNationals({ page: p, limit: PAGE_SIZE }));
export const catalogAllEthnics = () =>
  fetchAll("ethnics", (p) => catalogEthnics({ page: p, limit: PAGE_SIZE }));
export const catalogAllCareers = () =>
  fetchAll("careers", (p) => catalogCareers({ page: p, limit: PAGE_SIZE }));
export const catalogAllProvinces = () =>
  fetchAll("provinces", (p) => catalogProvinces({ page: p, limit: PAGE_SIZE }));
export const catalogAllCommunes = (provinceCode: string) =>
  fetchAll(`communes:${provinceCode}`, (p) => catalogCommunes(provinceCode, { page: p, limit: PAGE_SIZE }));

/** Lần chuyển tuyến gần nhất — tra theo CCCD CỦA PHIẾU, app không gửi CCCD. */
export function catalogLastTransferIn(receptionId: string) {
  return call<LastTransferIn | null>(
    "GET", "/kiosk-assisted-reception/catalog/last-transfer-in", { query: { receptionId } },
  );
}

/** Phiếu hẹn khám lại của bệnh nhân trên phiếu (mã BHYT 1.5) — NVYT chọn, không gõ số phiếu. */
export function catalogFollowUps(receptionId: string) {
  return call<FollowUpOption[]>(
    "GET", "/kiosk-assisted-reception/catalog/follow-ups", { query: { receptionId } },
  );
}

/**
 * Giấy chuyển tuyến tiền điền cho mã BHYT 1.5 (tài liệu v1.2 mục 8).
 *
 * Gọi sau khi NVYT chọn một hồ sơ ở `catalog/follow-ups`. Server xác minh lại mã trước
 * khi trả chẩn đoán — app gửi mã bừa sẽ nhận đúng các mã lỗi như `register`, nên không
 * dò được chẩn đoán của người khác.
 */
export function catalogFollowUpReferral(receptionId: string, treatmentCode: string) {
  return call<FollowUpReferral>(
    "GET",
    `/kiosk-assisted-reception/catalog/follow-ups/${encodeURIComponent(treatmentCode)}/referral`,
    { query: { receptionId } },
  );
}
