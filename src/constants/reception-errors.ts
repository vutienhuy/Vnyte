// Map error code (từ API kiosk-reception §6) → message tiếng Việt + hướng xử lý.
// Hiển thị theo field `code` (i18n key) thay vì hardcode message — xem khuyến nghị §7.

export type ReceptionErrorAction =
  | "retry" // có thể thử lại (read-only hoặc lỗi mạng tạm thời)
  | "reset" // bắt đầu lại từ đầu (quét/tra cứu lại)
  | "contact-staff" // bệnh nhân cần ra quầy tiếp đón
  | "contact-tech"; // lỗi cấu hình/kỹ thuật, báo IT

export interface ReceptionErrorInfo {
  message: string;
  action: ReceptionErrorAction;
}

const FALLBACK: ReceptionErrorInfo = {
  message: "Đã xảy ra lỗi không xác định. Vui lòng thử lại hoặc ra quầy tiếp đón.",
  action: "contact-staff",
};

const MAP: Record<string, ReceptionErrorInfo> = {
  VALIDATION_ERROR: {
    message: "Thiếu hoặc sai thông tin. Vui lòng kiểm tra lại.",
    action: "reset",
  },
  BHYT_CARD_MISSING: {
    message: "Bệnh nhân thuộc đối tượng BHYT nhưng hồ sơ trước chưa có thẻ. Vui lòng ra quầy.",
    action: "contact-staff",
  },
  BHYT_CARD_INVALID: {
    message: "Thẻ BHYT không hợp lệ. Vui lòng ra quầy tiếp đón.",
    action: "contact-staff",
  },
  KIOSK_AUTH_FAILED: {
    message: "Kiosk chưa được xác thực. Liên hệ quản trị viên.",
    action: "contact-tech",
  },
  KIOSK_CAPABILITY_NOT_SUPPORTED: {
    message: "Kiosk này chưa được cấp chức năng tiếp đón. Liên hệ quản trị viên.",
    action: "contact-tech",
  },
  FOLLOW_UP_NOT_FOUND: {
    message: "Không tìm thấy lịch hẹn tái khám phù hợp (sai mã hoặc ngoài cửa sổ ngày hẹn).",
    action: "reset",
  },
  TREATMENT_ALREADY_EXISTS_TODAY: {
    message: "Bệnh nhân đã có hồ sơ khám trong ngày hôm nay.",
    action: "reset",
  },
  FOLLOW_UP_ALREADY_USED: {
    message: "Lịch hẹn này đã được tạo hồ sơ trước đó. Không thể tạo lại.",
    action: "reset",
  },
  EXAM_ROOM_INVALID: {
    message: "Không xác định được phòng khám. Vui lòng ra quầy tiếp đón.",
    action: "contact-staff",
  },
  EXAM_SERVICE_INVALID: {
    message: "Không xác định được dịch vụ khám. Vui lòng ra quầy tiếp đón.",
    action: "contact-staff",
  },
  KIOSK_RECEPTION_ROOM_NOT_CONFIGURED: {
    message: "Kiosk chưa cấu hình bàn tiếp đón. Liên hệ quản trị viên.",
    action: "contact-tech",
  },
  KIOSK_RECEPTION_CONFIG_MISSING: {
    message: "Thiếu cấu hình tiếp đón phía hệ thống. Liên hệ kỹ thuật.",
    action: "contact-tech",
  },
  BHYT_CARD_CHECK_FAILED: {
    message: "Không kết nối được cổng BHXH. Vui lòng thử lại sau.",
    action: "retry",
  },
  HIS_REGISTER_FAILED: {
    message: "Hệ thống bệnh viện từ chối tạo hồ sơ. Vui lòng ra quầy tiếp đón.",
    action: "contact-staff",
  },
  KIOSK_HIS_UPSTREAM_TIMEOUT: {
    message: "Hệ thống bệnh viện đang bận hoặc gián đoạn. Vui lòng thử lại hoặc ra quầy tiếp đón.",
    action: "retry",
  },
};

export function getReceptionError(code: string | undefined | null): ReceptionErrorInfo {
  if (!code) return FALLBACK;
  return MAP[code] ?? FALLBACK;
}
