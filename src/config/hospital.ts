/**
 * Hospital code — dùng ở cả client và server.
 *
 * `NEXT_PUBLIC_*` được Next.js inline vào client bundle khi build và đồng thời
 * `process.env` đọc được runtime ở server → một nguồn duy nhất cho cả 2 phía.
 *
 * Đổi giá trị PHẢI build lại (vì client bundle bake build-time). Khi triển khai
 * cho bệnh viện khác, sửa NEXT_PUBLIC_HOSPITAL_CODE trong `.env.production`
 * rồi build/deploy lại.
 */
export const HOSPITAL_CODE = process.env.NEXT_PUBLIC_HOSPITAL_CODE || "92000";
