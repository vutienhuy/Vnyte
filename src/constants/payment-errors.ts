// Map error code (từ API kiosk-payment) → message tiếng Việt + hint xử lý.
// Dùng trong UI payment để hiển thị thông báo thân thiện + chỉ dẫn.

export type PaymentErrorAction =
  | "retry" // thao tác có thể retry (gọi lại cùng endpoint)
  | "reset" // reset flow, bắt đầu lại từ danh sách nợ
  | "contact-staff" // người dùng cần ra quầy
  | "contact-tech"; // lỗi kỹ thuật, cần báo IT

export interface PaymentErrorInfo {
  message: string;
  action: PaymentErrorAction;
}

const FALLBACK: PaymentErrorInfo = {
  message: "Đã xảy ra lỗi không xác định. Vui lòng thử lại hoặc ra quầy.",
  action: "contact-staff",
};

const MAP: Record<string, PaymentErrorInfo> = {
  KIOSK_AUTH_FAILED: {
    message: "Kiosk chưa được xác thực. Liên hệ quản trị viên.",
    action: "contact-tech",
  },
  KIOSK_SSE_TOKEN_INVALID: {
    message: "Phiên theo dõi thanh toán hết hạn. Đang kết nối lại...",
    action: "retry",
  },
  KIOSK_HISPRO_UNAVAILABLE: {
    message: "Hệ thống bệnh viện tạm thời gián đoạn. Vui lòng thử lại sau.",
    action: "retry",
  },
  KIOSK_HIS_UPSTREAM_TIMEOUT: {
    message: "Kết nối tới hệ thống bị chậm. Vui lòng thử lại.",
    action: "retry",
  },
  KIOSK_HIS_CREATE_TRANS_REQ_FAILED: {
    message: "Không thể tạo yêu cầu thanh toán. Vui lòng ra quầy hỗ trợ.",
    action: "contact-staff",
  },
  KIOSK_HIS_QR_GENERATE_FAILED: {
    message: "Không sinh được mã QR thanh toán. Vui lòng ra quầy hỗ trợ.",
    action: "contact-staff",
  },
  KIOSK_TRANS_REQ_NOT_FOUND: {
    message: "Không tìm thấy yêu cầu thanh toán. Vui lòng thử lại từ đầu.",
    action: "reset",
  },
  KIOSK_TRANS_REQ_NOT_REUSABLE: {
    message: "Phiếu đã được xử lý. Đang tạo yêu cầu mới...",
    action: "reset",
  },
  KIOSK_TRANS_REQ_OWNERSHIP_MISMATCH: {
    message: "Dữ liệu không khớp. Vui lòng bắt đầu lại.",
    action: "reset",
  },
  KIOSK_QR_NOT_GENERATED: {
    message: "Chưa thể sinh QR cho hồ sơ này. Vui lòng ra quầy hỗ trợ.",
    action: "contact-staff",
  },
  KIOSK_NO_PENDING_SERVICES: {
    message: "Hồ sơ này không còn khoản chờ thanh toán.",
    action: "reset",
  },
  KIOSK_ROOM_NOT_FOUND: {
    message: "Phòng thu của kiosk bị vô hiệu hoá. Liên hệ quản trị viên.",
    action: "contact-tech",
  },
  KIOSK_PAYMENT_CONFIG_MISSING: {
    message: "Kiosk chưa được cấu hình. Liên hệ kỹ thuật.",
    action: "contact-tech",
  },
};

export function getPaymentError(code: string | undefined | null): PaymentErrorInfo {
  if (!code) return FALLBACK;
  return MAP[code] ?? FALLBACK;
}
