/**
 * Cờ bật/tắt tính năng của kiosk.
 */

/**
 * Hiển thị "Phí khám" trong luồng đăng ký và check-in.
 *
 * Tắt từ 05/09/2026: số tiền HIS trả ở `slot.servicePrice` chưa chính xác
 * (lệch so với số bệnh nhân thực trả tại quầy), hiển thị lên gây hiểu nhầm.
 * Ẩn tạm cho tới khi phía HIS trả đúng giá dịch vụ. App mobile ẩn cùng lúc,
 * xem `Mobile/plugins/hpa_hospital_register/lib/exam_fee_flag.dart`.
 *
 * Đổi thành `true` là hiện lại đủ 6 chỗ, không phải sửa từng trang:
 *   - app/check-in                        dòng phí trong thẻ lịch hẹn
 *   - app/register                        thẻ tóm tắt slot đã chọn
 *   - app/register/schedule               thẻ tóm tắt slot đã chọn
 *   - app/register/confirm                dòng phí trước khi xác nhận
 *   - app/register/completion             ô phí ở màn đăng ký thành công
 *   - components/appointments/AppointmentCard  ô phí trong thẻ lịch hẹn
 */
export const SHOW_EXAM_FEE = false;

/**
 * Máy này có phải máy CHUYÊN tiếp đón có hỗ trợ (NVYT đứng vận hành) không.
 *
 * `false` (mặc định): máy dùng chung — bệnh nhân tự phục vụ, "Tiếp đón có hỗ trợ"
 * là một thẻ trong menu trang chủ.
 * `true`: mở app là vào thẳng `/assisted`, bỏ hẳn menu bệnh nhân. Dùng cho máy đặt
 * ở bàn tiếp đón, tránh việc NVYT phải cuộn tìm thẻ và bệnh nhân bấm nhầm vào
 * màn đăng nhập HIS không dùng được.
 *
 * Để ở cờ build-time (không phải cấu hình server) vì đây là quyết định theo VỊ TRÍ
 * ĐẶT MÁY, không đổi theo phiên làm việc.
 */
export const ASSISTED_RECEPTION_ONLY = false;
