// Map mã lỗi luồng tiếp đón có hỗ trợ (tich-hop-kiosk-tiep-don-co-ho-tro.md mục 6 + 11)
// → thông điệp tiếng Việt + việc app phải làm tiếp.
//
// App rẽ nhánh theo `errors[0].code`, KHÔNG theo `message` (message có thể đổi câu chữ).

/** Việc app phải làm sau khi nhận mã lỗi. */
export type ArErrorAction =
  | "retry"          // lỗi tạm thời/hạ tầng — cho bấm thử lại ngay
  | "fix-fields"     // lỗi theo ô — tô đỏ theo details.fields
  | "reload-list"    // danh sách đã cũ — tải lại rồi cho chọn lại
  | "restart-draft"  // phiếu hỏng/hết hạn — đọc lại CCCD từ đầu
  | "reconcile"      // chưa rõ kết quả trên HIS — sang màn đối soát
  | "back-to-login"  // phiên chết — xoá token, về màn đăng nhập NVYT
  | "back-to-idle"   // hết thời gian chờ — xoá token, về màn chờ
  | "contact-staff"  // hướng dẫn bệnh nhân ra quầy
  | "contact-tech";  // lỗi cấu hình thiết bị/hệ thống — báo kỹ thuật

export interface ArErrorInfo {
  message: string;
  action: ArErrorAction;
  /** Ưu tiên hiện `message` server trả (lý do cụ thể từ HIS/cổng BHXH) thay vì câu mặc định. */
  preferServerMessage?: boolean;
}

const FALLBACK: ArErrorInfo = {
  message: "Đã xảy ra lỗi không xác định. Vui lòng thử lại hoặc hướng dẫn bệnh nhân ra quầy.",
  action: "contact-staff",
};

/** Mã lỗi phiên — đều là 401 trừ ba mã đầu; nhận là phải xoá accessToken. */
export const SESSION_ERROR_CODES = [
  "KIOSK_ASSISTED_RECEPTION_DISABLED",
  "KIOSK_STAFF_INVALID_CREDENTIALS",
  "KIOSK_STAFF_LOGIN_LOCKED",
  "KIOSK_STAFF_HIS_LOGIN_FAILED",
  "KIOSK_STAFF_PERMISSION_DENIED",
  "KIOSK_SESSION_REQUIRED",
  "KIOSK_SESSION_DEVICE_MISMATCH",
  "KIOSK_SESSION_IDLE",
  "KIOSK_SESSION_EXPIRED",
  "KIOSK_SESSION_LOGGED_OUT",
  "KIOSK_SESSION_REPLACED",
  "KIOSK_SESSION_REVOKED",
  "KIOSK_SESSION_HIS_TOKEN_EXPIRED",
  "KIOSK_SESSION_ENDED",
] as const;

const MAP: Record<string, ArErrorInfo> = {
  // --- Thiết bị (mọi controller KIOSK) ---
  KIOSK_AUTH_FAILED: {
    message: "Kiosk chưa được xác thực với hệ thống. Liên hệ quản trị viên.",
    action: "contact-tech",
  },
  KIOSK_CAPABILITY_NOT_SUPPORTED: {
    message: "Máy kiosk này chưa được cấp chức năng tiếp đón có hỗ trợ. Liên hệ quản trị viên.",
    action: "contact-tech",
  },

  // --- Phiên đăng nhập NVYT (mục 6) ---
  KIOSK_ASSISTED_RECEPTION_DISABLED: {
    message: "Chức năng tiếp đón có hỗ trợ đang tắt tại đơn vị.",
    action: "contact-tech",
  },
  KIOSK_STAFF_INVALID_CREDENTIALS: {
    message: "Sai tài khoản hoặc mật khẩu HIS.",
    action: "retry",
  },
  KIOSK_STAFF_LOGIN_LOCKED: {
    message: "Đã nhập sai quá số lần cho phép. Vui lòng chờ rồi đăng nhập lại.",
    action: "retry",
    preferServerMessage: true, // message chứa thời điểm mở khoá
  },
  KIOSK_STAFF_HIS_LOGIN_FAILED: {
    message: "Không kết nối được HIS để xác thực. Vui lòng thử lại.",
    action: "retry",
  },
  KIOSK_STAFF_PERMISSION_DENIED: {
    message: "Tài khoản không có quyền tiếp đón trên KIOSK.",
    action: "back-to-login",
  },
  KIOSK_SESSION_REQUIRED: { message: "Phiên làm việc không còn hiệu lực.", action: "back-to-login" },
  KIOSK_SESSION_DEVICE_MISMATCH: { message: "Phiên được cấp cho máy khác.", action: "back-to-login" },
  KIOSK_SESSION_IDLE: { message: "Đã quá thời gian không thao tác.", action: "back-to-idle" },
  KIOSK_SESSION_EXPIRED: { message: "Phiên làm việc đã hết hạn.", action: "back-to-login" },
  KIOSK_SESSION_LOGGED_OUT: { message: "Phiên đã đăng xuất.", action: "back-to-login" },
  KIOSK_SESSION_REPLACED: { message: "Đã có người khác đăng nhập trên máy này.", action: "back-to-login" },
  KIOSK_SESSION_REVOKED: { message: "Phiên đã bị thu hồi.", action: "back-to-login" },
  KIOSK_SESSION_HIS_TOKEN_EXPIRED: {
    message: "Phiên HIS đã hết hạn, cần đăng nhập lại.",
    action: "back-to-login",
  },
  KIOSK_SESSION_ENDED: { message: "Phiên làm việc đã kết thúc.", action: "back-to-login" },

  // --- Phiếu tiếp đón (mục 11) ---
  KIOSK_AR_RECEPTION_NOT_FOUND: {
    message: "Không tìm thấy phiếu tiếp đón.",
    action: "restart-draft",
  },
  KIOSK_AR_RECEPTION_EXPIRED: {
    message: "Phiếu tiếp đón đã quá hạn. Vui lòng đọc lại CCCD.",
    action: "restart-draft",
  },
  KIOSK_AR_PATIENT_IDENTITY_CONFLICT: {
    message: "Thông tin CCCD không khớp hồ sơ trên HIS. Vui lòng hướng dẫn bệnh nhân ra quầy tiếp đón.",
    action: "contact-staff",
  },
  KIOSK_AR_ALREADY_REGISTERED_TODAY: {
    message: "Bệnh nhân đã đăng ký khám trong hôm nay.",
    action: "contact-staff",
  },
  KIOSK_AR_PATIENT_INFO_INVALID: {
    message: "Thông tin hành chính chưa hợp lệ.",
    action: "fix-fields",
  },
  KIOSK_AR_PATIENT_INFO_NOT_CONFIRMED: {
    message: "Chưa xác nhận thông tin hành chính.",
    action: "fix-fields",
  },
  KIOSK_AR_PATIENT_TYPE_NOT_ALLOWED: {
    message: "Đối tượng này không được tiếp đón trên KIOSK.",
    action: "reload-list",
  },
  KIOSK_AR_INSURANCE_NOT_CHECKED: {
    message: "Chưa tra thẻ BHYT cho phiếu này.",
    action: "reload-list",
  },
  KIOSK_AR_INSURANCE_CARD_NOT_ACCEPTED: {
    message: "Thẻ BHYT không dùng được.",
    action: "reload-list",
    preferServerMessage: true, // lý do cụ thể từ cổng BHXH
  },
  KIOSK_AR_INSURANCE_GATEWAY_UNAVAILABLE: {
    // 503: KHÔNG được hiển thị là "thẻ hỏng" — đây là lỗi hạ tầng.
    message: "Không kết nối được cổng BHXH. Vui lòng thử lại.",
    action: "retry",
  },
  KIOSK_AR_NON_INSURANCE_WITH_INSURANCE_DATA: {
    message: "Đối tượng không phải BHYT không được gửi kèm Mã BHYT hay giấy tờ BHYT.",
    action: "contact-tech", // lỗi logic app
  },
  KIOSK_AR_HEIN_PATIENT_TYPE_INVALID: {
    message: "Mã BHYT hoặc giấy tờ đi kèm không hợp lệ. Vui lòng chọn lại.",
    action: "reload-list",
    preferServerMessage: true,
  },
  // v1.2 thay KIOSK_AR_FOLLOW_UP_CONFLICT (400) bằng hai mã dưới; mã cũ đã bị gỡ khỏi
  // errors.config.ts của backend nên không cần giữ lại nhánh xử lý.
  KIOSK_AR_FOLLOW_UP_REQUIRED: {
    message: "Mã BHYT 1.5 phải chọn phiếu hẹn khám lại từ danh sách.",
    action: "reload-list",
  },
  KIOSK_AR_FOLLOW_UP_INVALID: {
    message: "Hồ sơ đã chọn không dùng làm hồ sơ tái khám được.",
    action: "reload-list",
    preferServerMessage: true, // message nêu lý do cụ thể
  },
  KIOSK_AR_FOLLOW_UP_NOT_FOUND: {
    message: "Không tìm thấy phiếu hẹn khám lại trong khoảng ngày hẹn.",
    action: "reload-list",
  },
  KIOSK_AR_FOLLOW_UP_ALREADY_USED: {
    message: "Phiếu hẹn khám lại này đã được dùng để tạo hồ sơ.",
    action: "reload-list",
  },
  KIOSK_AR_PRIMARY_PATIENT_TYPE_INVALID: {
    message: "Đối tượng chính không tồn tại hoặc đã ngừng sử dụng.",
    action: "reload-list",
  },
  KIOSK_AR_DEVICE_RECEPTION_ROOM_NOT_CONFIGURED: {
    message: "Máy kiosk chưa được gán phòng tiếp đón. Liên hệ quản trị viên.",
    action: "contact-tech",
  },
  KIOSK_AR_ROOM_UNAVAILABLE: {
    message: "Phòng khám đã chọn hiện không nhận bệnh nhân.",
    action: "reload-list",
  },
  KIOSK_AR_SERVICE_UNAVAILABLE: {
    message: "Công khám đã chọn không còn hợp lệ cho đối tượng này.",
    action: "reload-list",
  },
  KIOSK_AR_RECEPTION_IN_PROGRESS: {
    message: "Phiếu đang được gửi sang HIS, vui lòng chờ.",
    action: "retry",
  },
  KIOSK_AR_RECEPTION_UNKNOWN: {
    message: "Chưa xác định được kết quả trên HIS. Vui lòng bấm Kiểm tra lại.",
    action: "reconcile",
  },
  KIOSK_AR_RECEPTION_NOT_CANCELLABLE: {
    message: "Phiếu đã gửi HIS, không huỷ được.",
    action: "reload-list",
  },
  KIOSK_AR_RECEPTION_NOT_REGISTERED: {
    message: "Phiếu chưa đăng ký thành công.",
    action: "reload-list",
  },
  KIOSK_AR_RECEPTION_NOT_RECONCILABLE: {
    message: "Chỉ đối soát được phiếu chưa rõ kết quả.",
    action: "reload-list",
  },
  KIOSK_AR_HIS_REGISTER_FAILED: {
    message: "Tạo hồ sơ trên HIS thất bại.",
    action: "retry",
    preferServerMessage: true, // lý do HIS trả
  },
  KIOSK_AR_RECEPTION_LOCKED: {
    message: "Phiếu đã gửi HIS, không sửa được.",
    action: "reload-list",
  },

  // --- Lỗi validate DTO (mục 4) ---
  INVALID_INPUT: {
    message: "Dữ liệu gửi lên không hợp lệ.",
    action: "fix-fields",
  },

  // --- Lỗi do Gateway VNT sinh (KioskAssistedReceptionController) ---
  KIOSK_LICENSE_REVOKED: {
    message: "Thiết bị đã bị thu hồi. Liên hệ quản trị viên để kích hoạt lại.",
    action: "contact-tech",
  },
  KIOSK_AR_CONFIG_MISSING: {
    message: "Bệnh viện chưa được cấu hình kết nối tiếp đón. Liên hệ quản trị viên.",
    action: "contact-tech",
  },
  KIOSK_AR_UPSTREAM_TIMEOUT: {
    message: "Hệ thống bệnh viện không phản hồi. Vui lòng thử lại.",
    action: "retry",
  },
  /**
   * Gateway VNT sinh ra mã này khi phản hồi nhận về KHÔNG phải JSON — thực tế là trang
   * lỗi dạng chữ của lớp edge đứng trước vnyte (đo được ở BV Nguyễn Thị Thập:
   * HTTP 502, thân là "error code: 502"). Không có trong tài liệu vnyte vì nó là mã
   * của Gateway, không phải của vnyte.
   *
   * `retry` chỉ đúng cho lệnh CHỈ ĐỌC. Với `register`, xem ghi chú ở doRegister: lỗi
   * kiểu này KHÔNG được coi là thất bại, vì HIS có thể đã tạo hồ sơ rồi.
   */
  KIOSK_AR_UPSTREAM_INVALID: {
    message: "Hệ thống bệnh viện trả về phản hồi không đọc được. Vui lòng thử lại.",
    action: "retry",
  },
};

/** Mã lỗi có nằm trong bảng tra không — dùng để biết câu thông báo là câu mặc định. */
export function isKnownArCode(code: string | null | undefined): boolean {
  return !!code && code in MAP;
}

export function getArError(code: string | null | undefined): ArErrorInfo {
  if (!code) return FALLBACK;
  return MAP[code] ?? FALLBACK;
}

/** Mã lỗi này có đồng nghĩa phiên NVYT đã chết không (phải xoá accessToken). */
export function isSessionDead(code: string | null | undefined, status: number): boolean {
  // Quy tắc chung mục 6: MỌI 401 đều làm token hết dùng được, bất kể mã cụ thể.
  if (status === 401) return true;
  return code === "KIOSK_STAFF_PERMISSION_DENIED" || code === "KIOSK_ASSISTED_RECEPTION_DISABLED";
}

/** Nhãn tiếng Việt cho mã lỗi theo ô (mục 7.2) — dùng để tô đỏ đúng câu chữ. */
export const FIELD_ERROR_LABEL: Record<string, string> = {
  REQUIRED: "Bắt buộc nhập",
  INVALID_FORMAT: "Sai định dạng",
  LOCKED: "Không được sửa (lấy từ CCCD)",
  NOT_FOUND: "Mã không tồn tại trong danh mục",
  INACTIVE: "Mã đã ngừng hoạt động",
  NOT_IN_PROVINCE: "Xã/phường không thuộc tỉnh đã chọn",
};
