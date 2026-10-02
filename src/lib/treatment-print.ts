// In phiếu 80mm cho các luồng tạo hồ sơ HIS (đăng ký khám, check-in...).
//
// Bố cục phiếu nằm ở @/lib/exam-slip (dùng chung với print-invoice và
// reception). File này chỉ còn phần lấy dữ liệu + gọi in.
import { printHtml } from "@/lib/kiosk-print";
import { buildExamSlipHtml, slipFromTreatmentRecord } from "@/lib/exam-slip";
import { getTreatmentForPrint, getTreatmentRecords } from "@/services/treatment.service";
import type { TreatmentRecord } from "@/types/treatment";

export function build80mmPrintHtml(record: TreatmentRecord): string {
  return buildExamSlipHtml(slipFromTreatmentRecord(record));
}

// In phiếu sau khi tạo hồ sơ HIS thành công. Lấy treatment id từ response (nhiều tên key có thể có),
// nếu không có → fallback lấy hồ sơ mới nhất theo định danh (giống luồng In phiếu khám). Trả true nếu đã in.
export async function printRegisteredTreatment(
  responseData: Record<string, unknown> | null | undefined,
  identityNumber: string,
): Promise<boolean> {
  const d = responseData || {};
  const rawId =
    d["ID"] ?? d["id"] ?? d["Id"] ?? d["treatmentId"] ?? d["TREATMENT_ID"] ?? d["TreatmentId"];
  const id = rawId != null ? String(rawId) : "";
  try {
    // treatment-for-print CHỈ nhận treatmentId dạng SỐ. HIS Cần Thơ trả id là GUID → gọi thẳng
    // sẽ 400. Nên chỉ thử khi id là số; nếu lỗi thì rơi xuống fallback (KHÔNG bỏ việc in).
    if (/^\d+$/.test(id)) {
      try {
        const printRes = await getTreatmentForPrint(id);
        if (printRes.data && printRes.data.length > 0) {
          for (const rec of printRes.data) await printHtml(build80mmPrintHtml(rec));
          return true;
        }
      } catch (e) {
        console.error("getTreatmentForPrint lỗi, dùng fallback theo CCCD:", e);
      }
    }
    // Fallback: hồ sơ mới nhất theo CCCD (list trả id SỐ + đủ field để in — In phiếu dùng luồng này).
    if (identityNumber) {
      const recs = await getTreatmentRecords(identityNumber, 1, 1);
      if (recs.status === 200 && recs.data && recs.data.length > 0) {
        await printHtml(build80mmPrintHtml(recs.data[0]));
        return true;
      }
    }
  } catch (e) {
    console.error("Print after register failed:", e);
  }
  return false;
}
