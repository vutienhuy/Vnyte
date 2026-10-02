"use client";

// Ô nhập dùng chung cho luồng tiếp đón trên máy cảm ứng.
//
// Bàn phím: dùng BÀN PHÍM CẢM ỨNG CỦA WINDOWS, app không tự vẽ bàn phím nữa.
// Trước đây app có bàn phím ảo riêng, nhưng trên máy kiosk thật của viện thì Windows
// cũng tự bật bàn phím của nó mỗi khi con trỏ vào ô nhập → màn hình có hai bàn phím
// chồng nhau. Chốt lại là giữ bàn phím của máy, cho thống nhất với luồng tự phục vụ
// (/patient-check, /setup…) vốn đã dùng bàn phím Windows từ đầu.
//
// Một chỗ duy nhất lo: nhãn, dấu bắt buộc, nhãn nguồn dữ liệu, viền đỏ và câu lỗi theo
// ô — để các màn không mỗi nơi một kiểu.

import { useRef, useState } from "react";
import { telexOnInput } from "@/lib/telex";
import type { PatientInfoSource } from "@/types/assisted-reception";

export const SOURCE_LABEL: Record<PatientInfoSource, string> = {
  HIS: "HIS",
  CCCD: "CCCD",
  INSURANCE_CARD: "Thẻ BHYT",
  DEFAULT: "Mặc định",
  STAFF: "NVYT sửa",
};

/** Ô nguồn "Mặc định" là giá trị đơn vị điền hộ — nhắc NVYT soát kỹ hơn các nguồn khác. */
const SOURCE_STYLE: Record<PatientInfoSource, string> = {
  HIS: "bg-slate-100 text-slate-500",
  CCCD: "bg-sky-50 text-sky-700",
  INSURANCE_CARD: "bg-emerald-50 text-emerald-700",
  DEFAULT: "bg-amber-50 text-amber-700",
  STAFF: "bg-violet-50 text-violet-700",
};

export function FieldShell({
  label, required, source, error, hint, children, className = "",
}: {
  label: string;
  required?: boolean;
  source?: PatientInfoSource;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label className="text-2xl font-medium text-slate-600">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {source && (
          <span className={`text-sm px-2 py-0.5 rounded-full ${SOURCE_STYLE[source]}`}>
            {SOURCE_LABEL[source]}
          </span>
        )}
      </div>
      {children}
      {error ? (
        <p className="text-lg text-red-600 mt-1.5">{error}</p>
      ) : hint ? (
        <p className="text-base text-slate-400 mt-1.5">{hint}</p>
      ) : null}
    </div>
  );
}

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  source?: PatientInfoSource;
  error?: string;
  hint?: string;
  mode?: "text" | "number";
  mask?: boolean;
  maxLength?: number;
  /** Ô có dấu tiếng Việt (họ tên, địa chỉ…) — bật Telex cho máy không cài bộ gõ. */
  vietnamese?: boolean;
  /** Đổi cách HIỆN giá trị, không đổi giá trị thật (vd 12021997 → 12/02/1997). */
  format?: (raw: string) => string;
  className?: string;
  disabled?: boolean;
}

export default function TouchField({
  label, value, onChange, placeholder, required, source, error, hint,
  mode = "text", mask, maxLength, className, disabled, vietnamese, format,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  /**
   * Kéo ô đang gõ lên giữa màn hình khi bắt đầu nhập.
   *
   * Bàn phím Windows chiếm gần nửa dưới màn hình và KHÔNG đẩy trang lên; ô nằm trong
   * vùng đó sẽ bị che, NVYT gõ mà không nhìn thấy mình gõ vào đâu.
   */
  const handleFocus = () => {
    setFocused(true);
    requestAnimationFrame(() =>
      boxRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  const clean = (raw: string) => {
    let v = mode === "number" ? raw.replace(/\D/g, "") : raw;
    if (maxLength != null) v = v.slice(0, maxLength);
    return v;
  };

  // Telex chạy ngay trong app (vux → vũ) để máy kiosk không cần cài Unikey. Máy CÓ bộ gõ
  // sẵn (Unikey/EVKey, hay bàn phím Windows để tiếng Việt) cũng không bị gõ hai lần:
  // xem ghi chú trong telexOnInput.
  const handleInput = (raw: string) =>
    onChange(clean(vietnamese ? telexOnInput(value, raw) : raw));

  // Ô có `format` (ngày sinh) hiện chuỗi đã chấm phẩy khi KHÔNG gõ, còn lúc đang gõ thì
  // hiện số thô để con trỏ không nhảy lung tung giữa các dấu "/".
  //
  // Ô mật khẩu che bằng `type="password"` của trình duyệt, TUYỆT ĐỐI không tự thay
  // giá trị bằng chuỗi "•": input là ô có kiểm soát, mỗi lần gõ `e.target.value` sẽ là
  // chuỗi dấu chấm đang hiển thị cộng ký tự mới, và app lưu lại đúng chuỗi dấu chấm đó
  // — đăng nhập hỏng mà nhìn màn hình vẫn thấy đủ số ký tự.
  const display = format && !focused ? format(value) : value;

  return (
    <FieldShell label={label} required={required} source={source} error={error} hint={hint} className={className}>
      <div className="relative" ref={boxRef}>
        <input
          type={mask && !reveal ? "password" : "text"}
          // `inputMode` để Windows biết bật bàn phím nào: ô số (CCCD, điện thoại, ngày
          // sinh) ra bàn phím số phím to, đỡ bấm nhầm.
          inputMode={mode === "number" ? "numeric" : "text"}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          value={display}
          placeholder={placeholder ?? "Chạm để nhập"}
          onFocus={handleFocus}
          onBlur={() => setFocused(false)}
          onChange={(e) => handleInput(e.target.value)}
          className={`w-full min-h-[80px] rounded-2xl pl-5 py-4 text-3xl transition border-2 outline-none
            ${mask ? "pr-24" : "pr-5"}
            ${disabled ? "bg-slate-50 text-slate-400 border-slate-200" : "bg-white focus:border-blue-500"}
            ${error ? "border-red-400" : "border-slate-200"}`}
        />
        {/* Ô mật khẩu: cho xem lại chuỗi vừa gõ — gõ mật khẩu HIS trên bàn phím cảm ứng
            rất dễ sai mà không biết sai ở đâu. */}
        {mask && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setReveal((r) => !r)}
            className="absolute right-3 top-1/2 -translate-y-1/2 px-3 h-12 rounded-xl text-xl text-slate-500 hover:bg-slate-100"
          >
            {reveal ? "Ẩn" : "Hiện"}
          </button>
        )}
      </div>
    </FieldShell>
  );
}
