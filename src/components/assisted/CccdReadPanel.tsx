"use client";

// Bước 2 — đọc CCCD (chip NFC / QR) rồi gửi lên `lookup` để backend tra HIS và
// mở phiếu nháp. Backend KHÔNG đọc thẻ: việc đọc là của app (mục 2).

import { useRef, useState } from "react";
import { readCccd, type NfcCardData } from "@/lib/nfc-reader";
import TouchField, { FieldShell } from "@/components/assisted/TouchField";
import { Card, GhostButton, PageHead, PrimaryButton, StepBar } from "@/components/assisted/FlowShell";
import type { CccdPayload, ReceptionGender } from "@/types/assisted-reception";

interface Props {
  onRead: (payload: CccdPayload) => void;
  /** Thông báo lỗi từ `lookup` (do trang cha gọi) để hiện ngay tại bước này. */
  errorMessage?: string | null;
  loading?: boolean;
  /** Mở thẳng ô nhập tay với dữ liệu lần trước — dùng khi NVYT quay lại sửa. */
  initial?: CccdPayload | null;
}

/** dd/MM/yyyy hoặc yyyy-MM-dd (tuỳ đầu đọc) → YYYY-MM-DD; không parse được thì trả "". */
export function toIsoDate(raw?: string): string {
  if (!raw) return "";
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return "";
}

/** Đầu đọc trả "Nam"/"Nữ"/"Male"… → enum của API. Không rõ thì OTHER để NVYT sửa lại. */
export function toGender(raw?: string): ReceptionGender {
  const s = (raw || "").trim().toLowerCase();
  if (s.startsWith("nam") || s.startsWith("male") || s === "m") return "MALE";
  if (s.startsWith("nữ") || s.startsWith("nu") || s.startsWith("female") || s === "f") return "FEMALE";
  return "OTHER";
}

export function cardToPayload(d: NfcCardData): CccdPayload {
  return {
    identityNumber: (d.identifyNumber || "").replace(/\D/g, ""),
    fullName: (d.name || "").trim(),
    dob: toIsoDate(d.dateOfBirth),
    gender: toGender(d.gender),
    // Thẻ cũ để trống nơi cư trú → lấy tạm quê quán, NVYT soát lại ở bước hành chính.
    address: (d.address || d.hometown || "").trim() || null,
    issueDate: toIsoDate(d.issueDate) || null,
    issuePlace: null,
    phone: null,
  };
}

/** "1997-02-12" → "12021997" (8 số liền) để đổ vào ô ngày sinh. */
export function isoToDigits(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}${m[2]}${m[1]}` : "";
}

/** Hiện 8 số liền thành DD/MM/YYYY ngay trong lúc gõ, kể cả khi mới gõ được vài số. */
export function formatDobDigits(digits: string): string {
  const d = digits.slice(0, 2), m = digits.slice(2, 4), y = digits.slice(4, 8);
  return [d, m, y].filter(Boolean).join("/");
}

/**
 * "12021997" → "1997-02-12". Trả "" khi chưa đủ 8 số hoặc ngày/tháng vô lý — nút
 * Tiếp tục dựa vào đây để khoá, nên không cần kiểm thêm ở chỗ khác.
 */
export function digitsToIso(digits: string): string {
  if (!/^\d{8}$/.test(digits)) return "";
  const dd = digits.slice(0, 2), mm = digits.slice(2, 4), yyyy = digits.slice(4, 8);
  const d = Number(dd), m = Number(mm), y = Number(yyyy);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return "";
  // Chặn ngày không tồn tại (31/02) — Date tự nhảy sang tháng sau nên so lại là biết.
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return "";
  return `${yyyy}-${mm}-${dd}`;
}

export default function CccdReadPanel({ onRead, errorMessage, loading, initial }: Props) {
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  // Quay lại sửa thì vào thẳng ô nhập tay, giữ nguyên thứ đã gõ — bắt NVYT gõ lại
  // từ đầu chỉ vì sai một dấu là cách nhanh nhất để họ bỏ máy ra quầy.
  const [manual, setManual] = useState(!!initial);
  const [form, setForm] = useState<CccdPayload>(
    initial ?? { identityNumber: "", fullName: "", dob: "", gender: "MALE" },
  );
  const abortRef = useRef<AbortController | null>(null);

  // Ngày sinh nhập LIỀN 8 số (12021997), chỉ chuyển sang YYYY-MM-DD lúc gửi đi.
  // Giữ dạng số thô trong state chứ không ghép ISO sau mỗi phím: gõ dở 3–4 số thì ISO
  // là chuỗi rỗng và sẽ xoá mất thứ NVYT vừa gõ.
  const [dobDigits, setDobDigits] = useState(() => isoToDigits(initial?.dob ?? ""));
  const dobIso = digitsToIso(dobDigits);

  const startRead = async () => {
    setReadError(null);
    setReading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await readCccd({ signal: controller.signal });
      const payload = cardToPayload(res.result.data);
      if (payload.identityNumber.length !== 12 || !payload.dob) {
        // Thiếu dữ liệu bắt buộc (CCCD 12 số + ngày sinh) → chuyển sang nhập tay với
        // phần đọc được điền sẵn, thay vì gửi lên rồi nhận lỗi DTO khó hiểu.
        setForm(payload);
        setDobDigits(isoToDigits(payload.dob)); // đổ luôn phần ngày đọc được sang ô ngày sinh
        setManual(true);
        setReadError("Chưa đọc đủ số CCCD và ngày sinh từ thẻ. Vui lòng kiểm tra và bổ sung bên dưới.");
        return;
      }
      onRead(payload);
    } catch (e) {
      setReadError((e as Error)?.message || "Chưa đọc được thẻ. Đặt lại thẻ lên đầu đọc, hoặc nhập tay.");
    } finally {
      setReading(false);
      abortRef.current = null;
    }
  };

  const cancelRead = () => {
    abortRef.current?.abort();
    setReading(false);
  };

  const manualValid =
    /^\d{12}$/.test(form.identityNumber) && form.fullName.trim().length > 0 && !!dobIso;

  return (
    <div className="max-w-3xl mx-auto w-full">
      <StepBar current={1} />
      <PageHead
        title={manual ? "Nhập thông tin trên thẻ" : "Đọc thẻ CCCD"}
        subtitle={manual ? "Nhập đúng như in trên thẻ của bệnh nhân" : "Đặt thẻ lên đầu đọc — hoặc nhập tay nếu chưa đọc được"}
      />

      <Card className="space-y-5">
        {!manual ? (
          <>
            <button
              type="button"
              onClick={reading ? cancelRead : startRead}
              disabled={loading}
              className={`w-full py-12 rounded-3xl font-bold text-3xl transition border-2 ${
                reading
                  ? "bg-amber-50 border-amber-300 text-amber-800"
                  : "bg-blue-700 border-blue-700 text-white hover:bg-blue-800"
              }`}
            >
              <span className="block text-6xl mb-3">{reading ? "⏳" : "🪪"}</span>
              {reading ? "Đang đọc thẻ… chạm để huỷ" : "Đọc thẻ CCCD"}
            </button>
            <GhostButton onClick={() => { setManual(true); setReadError(null); }} className="w-full">
              Nhập tay thông tin trên thẻ
            </GhostButton>
          </>
        ) : (
          <>
            <TouchField
              label="Số CCCD" required mode="number" maxLength={12}
              value={form.identityNumber}
              onChange={(v) => setForm({ ...form, identityNumber: v })}
              placeholder="12 chữ số"
              hint={form.identityNumber ? `${form.identityNumber.length}/12 số` : "12 chữ số trên thẻ"}
            />

            <TouchField
              label="Họ và tên trên thẻ" required vietnamese
              value={form.fullName}
              onChange={(v) => setForm({ ...form, fullName: v })}
              placeholder="VD: Vũ Tiến Huy"
              // Backend so tên với hồ sơ HIS theo ĐÚNG dấu tiếng Việt (chỉ bỏ qua
              // hoa/thường và khoảng trắng thừa) — gõ không dấu là bị chặn.
              hint="Gõ đúng dấu tiếng Việt như in trên thẻ — gõ không dấu sẽ không khớp hồ sơ HIS"
            />

            {/* KHÔNG dùng <input type="date">: trình duyệt hiển thị theo locale của MÁY,
                máy để tiếng Anh thì ô hiện MM/DD/YYYY — NVYT gõ 12/02 hiểu là 12 tháng 2
                nhưng máy nhận 2 tháng 12, rồi lookup báo "không khớp hồ sơ HIS" mà nhìn
                trên màn hình vẫn thấy đúng ngày. Gõ liền 8 số thì thứ tự do mình định. */}
            <TouchField
              label="Ngày sinh" required mode="number" maxLength={8}
              value={dobDigits}
              onChange={setDobDigits}
              format={formatDobDigits}
              placeholder="Gõ liền 8 số, VD 12021997"
              hint={
                dobDigits.length === 8 && !dobIso
                  ? "Ngày sinh không có thật — kiểm tra lại ngày/tháng"
                  : "Ngày, tháng rồi năm — gõ 12021997 sẽ thành 12/02/1997"
              }
              error={dobDigits.length === 8 && !dobIso ? " " : undefined}
            />

            <FieldShell label="Giới tính" required>
              <div className="flex gap-3">
                {(["MALE", "FEMALE", "OTHER"] as ReceptionGender[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setForm({ ...form, gender: g })}
                    className={`flex-1 min-h-[64px] rounded-2xl text-2xl border-2 transition ${
                      form.gender === g
                        ? "bg-blue-700 text-white border-blue-700"
                        : "border-slate-200 text-slate-600 hover:border-blue-300"
                    }`}
                  >
                    {g === "MALE" ? "Nam" : g === "FEMALE" ? "Nữ" : "Khác"}
                  </button>
                ))}
              </div>
            </FieldShell>

            <div className="flex gap-3 pt-1">
              <GhostButton onClick={() => setManual(false)} className="flex-1">
                Quay lại đọc thẻ
              </GhostButton>
              <PrimaryButton
                onClick={() => onRead({ ...form, dob: dobIso, fullName: form.fullName.trim() })}
                disabled={!manualValid || loading}
                className="flex-[2]"
              >
                {loading ? "Đang tra cứu…" : "Tiếp tục"}
              </PrimaryButton>
            </div>
          </>
        )}

        {(readError || errorMessage) && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-xl">
            {readError || errorMessage}
          </div>
        )}
      </Card>
    </div>
  );
}

