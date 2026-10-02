// Phiếu tiếp đón 80mm — MỘT bản dựng dùng chung cho mọi luồng in của kiosk.
//
// Trước đây có BA bản gần như trùng nhau: build80mmPrintHtml (treatment-print),
// buildPrintHtml (print-invoice) — hai bản này giống nhau từng chữ — và
// buildReceptionTicketHtml (reception). Comment trong treatment-print đã cảnh
// báo đúng rủi ro đó ("tránh lệch template giữa các luồng") nhưng print-invoice
// vẫn giữ một bản chép. Gộp lại một chỗ để sửa mẫu một lần là mọi luồng đổi theo.
//
// Bố cục bám theo phiếu giấy BVĐK TW Cần Thơ đang phát cho bệnh nhân.

import { code128Svg } from "@/lib/barcode";
import type { TreatmentRecord } from "@/types/treatment";
import type { CreatedTreatmentResult } from "@/types/reception";

/**
 * Dữ liệu đã chuẩn hoá của một phiếu. Các luồng có shape API khác nhau
 * (TreatmentRecord của HIS, CreatedTreatmentResult của kiosk-reception) đều
 * quy về đây trước khi dựng HTML.
 *
 * Trường optional = KHÔNG in dòng đó khi thiếu, thay vì in nhãn rỗng.
 */
export interface ExamSlip {
  /** Tên bệnh viện in trên cùng. */
  hospitalName?: string;
  /** Tiêu đề phiếu, vd "PHIẾU TIẾP ĐÓN". */
  title: string;
  /** Thời điểm tiếp đón, vd "09/09/2026 07:06:00". */
  printedAt?: string;
  /** Mã điều trị — vừa in barcode vừa in chữ dưới barcode. */
  code?: string;

  patientName: string;
  patientCode?: string;
  gender?: string;
  /** Chỉ NĂM sinh, theo đúng phiếu giấy ("N.S.: 1978"). */
  birthYear?: string;
  /** Mã thẻ BHYT + mã nơi ĐKKCB, vd "CA5987705620020 - 92004". */
  cardNumber?: string;

  /** Tên dịch vụ khám, vd "Khám Nội Tim mạch". */
  serviceName?: string;
  /** Phòng khám, vd "Phòng 131 - Tầng 1". */
  roomName?: string;
  /** Khoa thực hiện, vd "Nội Tim Mạch 3". */
  departmentName?: string;
  /** Số thứ tự khám. */
  numOrder?: number | string;

  /** Thời gian dự kiến vào khám, vd "09/09/2026 7:26:00". */
  expectedTime?: string;
}

/**
 * Chèn text vào HTML an toàn.
 *
 * Ba bản mẫu cũ nội suy thẳng dữ liệu HIS vào template, nên chỉ cần một bệnh
 * nhân có dấu `&` hay `<` trong tên/địa chỉ là phiếu vỡ bố cục hoặc mất chữ.
 */
function esc(v: unknown): string {
  if (v == null) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildExamSlipHtml(slip: ExamSlip): string {
  const hasSttBlock = slip.roomName || slip.departmentName || slip.numOrder != null;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8"/>
<title>${esc(slip.title)} - ${esc(slip.patientName)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Times New Roman', Times, serif;
    width: 80mm; margin: 0 auto; padding: 3mm 2.5mm;
    font-size: 13px; line-height: 1.35; color: #000;
  }
  .c { text-align: center; }
  .b { font-weight: bold; }
  .divider { border-top: 1px dashed #000; margin: 5px 0; }

  .hospital { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: .3px; }
  .title { font-size: 20px; font-weight: bold; text-transform: uppercase; margin: 2px 0; letter-spacing: .5px; }
  .time { font-size: 12px; }

  .barcode { margin: 6px 0 2px; }
  .barcode svg { width: 100%; max-width: 62mm; height: 13mm; }
  /* Dãy số dưới barcode in giãn chữ cho khớp bề ngang vạch, như phiếu giấy. */
  .barcode-text { font-size: 17px; font-weight: bold; letter-spacing: 3px; }

  .patient-name { font-size: 19px; font-weight: bold; text-transform: uppercase; margin: 4px 0 2px; }
  /* Khối thông tin canh trái nhưng thụt vào, không sát mép giấy. */
  .info { padding-left: 6mm; font-size: 13px; }
  .info div { margin: 1px 0; }

  .service { font-size: 14px; font-weight: bold; font-style: italic; margin: 3px 0; }

  .room-head { display: flex; justify-content: space-between; font-size: 13px; padding: 0 3mm; }
  .room-body { display: flex; justify-content: space-between; align-items: center; padding: 0 2mm; }
  .room-name { font-size: 19px; font-weight: bold; line-height: 1.15; text-align: left; padding-left: 2mm; }
  .stt { font-size: 27px; font-weight: bold; line-height: 1; padding-right: 3mm; }
  .dept { font-size: 14px; padding-left: 3mm; margin-top: 1px; }

  .expect-label { font-size: 13px; font-weight: bold; }
  .expect-time { font-size: 14px; font-weight: bold; }
  .note { font-size: 12px; font-style: italic; margin-top: 2px; }

  @media print {
    body { width: 80mm; padding: 2mm; }
    @page { size: 80mm auto; margin: 0; }
  }
</style>
</head>
<body>
  ${slip.hospitalName ? `<div class="c hospital">${esc(slip.hospitalName)}</div>` : ""}
  <div class="c title">${esc(slip.title)}</div>
  ${slip.printedAt ? `<div class="c time">${esc(slip.printedAt)}</div>` : ""}

  <div class="divider"></div>

  ${slip.code ? `<div class="c barcode">${code128Svg(slip.code)}</div>
  <div class="c barcode-text">${esc(slip.code)}</div>` : ""}

  <div class="c patient-name">${esc(slip.patientName)}</div>
  <div class="info">
    ${slip.patientCode ? `<div>Mã bệnh nhân: ${esc(slip.patientCode)}</div>` : ""}
    ${slip.gender || slip.birthYear
      ? `<div>${slip.gender ? `Giới tính: ${esc(slip.gender)}` : ""}${
          slip.gender && slip.birthYear ? "&nbsp;&nbsp; - " : ""
        }${slip.birthYear ? `N.S.: ${esc(slip.birthYear)}` : ""}</div>`
      : ""}
    ${slip.cardNumber ? `<div>Mã thẻ: ${esc(slip.cardNumber)}</div>` : ""}
  </div>

  ${slip.serviceName || hasSttBlock ? `<div class="divider"></div>` : ""}
  ${slip.serviceName ? `<div class="c service">Khám: ${esc(slip.serviceName)}</div>` : ""}

  ${hasSttBlock ? `
  <div class="room-head"><span>Phòng Khám</span><span>Số TT</span></div>
  <div class="room-body">
    <div class="room-name">${esc(slip.roomName || "")}</div>
    <div class="stt">${esc(slip.numOrder ?? "")}</div>
  </div>
  ${slip.departmentName ? `<div class="dept">${esc(slip.departmentName)}</div>` : ""}` : ""}

  ${slip.expectedTime ? `
  <div class="divider"></div>
  <div class="c expect-label">Thời gian dự kiến vào khám bệnh là:</div>
  <div class="c expect-time">${esc(slip.expectedTime)}</div>
  <div class="c note">(Thời gian này có thể thay đổi tùy thuộc vào số lượng bệnh nhân)</div>` : ""}
</body>
</html>`;
}

// ── Chuyển từ các shape API về ExamSlip ──────────────────────────────────────

/** "YYYYMMDDHHmmss" (hoặc ...HHmm) → "DD/MM/YYYY HH:mm:ss". */
function formatHisTime(time?: number | null): string | undefined {
  const s = String(time ?? "");
  if (s.length < 12) return undefined;
  const date = `${s.substring(6, 8)}/${s.substring(4, 6)}/${s.substring(0, 4)}`;
  const hm = `${s.substring(8, 10)}:${s.substring(10, 12)}`;
  // HIS trả đủ 14 ký tự thì in luôn giây cho khớp phiếu giấy.
  return s.length >= 14 ? `${date} ${hm}:${s.substring(12, 14)}` : `${date} ${hm}`;
}

/** patientDob dạng số "YYYYMMDD" → "YYYY". */
function yearFromHisDob(dob?: number | null): string | undefined {
  const s = String(dob ?? "");
  return s.length >= 4 ? s.substring(0, 4) : undefined;
}

/** Ngày sinh dạng "DD/MM/YYYY" → "YYYY". */
function yearFromDateString(dob?: string | null): string | undefined {
  const m = /(\d{4})\s*$/.exec(String(dob ?? ""));
  return m ? m[1] : undefined;
}

/** Ghép "Phòng 131" + "Tầng 1" thành một dòng, bỏ phần rỗng. */
function joinRoom(name?: string | null, address?: string | null): string | undefined {
  const parts = [name, address].map(p => (p || "").trim()).filter(Boolean);
  return parts.length ? parts.join(" - ") : undefined;
}

/** Luồng HIS (đăng ký khám, check-in, in lại phiếu) — shape TreatmentRecord. */
export function slipFromTreatmentRecord(
  r: TreatmentRecord,
  title = "Phiếu tiếp đón",
): ExamSlip {
  return {
    hospitalName: r.branchName || undefined,
    title,
    printedAt: formatHisTime(r.intructionTime),
    code: r.treatmentCode || undefined,
    patientName: r.patientName || "",
    patientCode: r.patientCode || undefined,
    gender: r.patientGenderName || undefined,
    birthYear: yearFromHisDob(r.patientDob),
    // cardNumber: TreatmentRecord của HIS KHÔNG có số thẻ BHYT → bỏ dòng "Mã thẻ".
    serviceName: r.serviceName || undefined,
    roomName: joinRoom(r.executeRoomName, r.executeRoomAddress),
    // Không có tên khoa riêng; phòng yêu cầu là thứ gần nghĩa nhất và chỉ in
    // khi khác phòng thực hiện, tránh lặp y hệt dòng trên.
    departmentName:
      r.requestRoomName && r.requestRoomName !== r.executeRoomName
        ? r.requestRoomName
        : undefined,
    numOrder: r.numOrder,
    // expectedTime: HIS không trả giờ dự kiến vào khám → bỏ khối cuối.
  };
}

/** Luồng tái khám qua kiosk-reception — shape CreatedTreatmentResult. */
export function slipFromCreatedTreatment(
  r: CreatedTreatmentResult,
  opts: { title?: string; hospitalName?: string } = {},
): ExamSlip {
  return {
    // CreatedTreatmentResult không mang tên bệnh viện → nơi gọi truyền vào,
    // không có thì bỏ dòng chứ không in chuỗi rỗng.
    hospitalName: opts.hospitalName,
    title: opts.title || "Phiếu tiếp đón",
    printedAt: r.treatment?.inTime || undefined,
    code: r.treatment?.code || undefined,
    patientName: r.patient?.name || "",
    patientCode: r.patient?.code || undefined,
    gender: r.patient?.genderName || undefined,
    birthYear: yearFromDateString(r.patient?.dob),
    // cardNumber: API kiosk-reception chỉ trả cờ hasBhytCard (0/1), KHÔNG có
    // số thẻ → không đủ dữ liệu để in dòng "Mã thẻ".
    serviceName: r.service?.name || undefined,
    roomName: joinRoom(r.treatment?.examRoom?.name, r.treatment?.examRoom?.address),
    departmentName: r.treatment?.executeDepartmentName || undefined,
    numOrder: r.treatment?.numOrder,
    // expectedTime: API không trả giờ dự kiến vào khám.
  };
}
