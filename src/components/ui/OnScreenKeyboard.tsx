"use client";

// HIỆN KHÔNG DÙNG: chốt 26/09 là dùng bàn phím cảm ứng của Windows cho toàn bộ luồng
// tiếp đón (xem ghi chú đầu TouchField.tsx). Giữ file lại phòng khi cần quay lại.

// Bàn phím ảo cho màn cảm ứng.
//
// Vì sao app tự vẽ thay vì trông vào bàn phím của Windows: máy kiosk ở sảnh không có
// bàn phím vật lý, mà bàn phím cảm ứng của Windows chỉ tự bật trong tablet mode —
// trên máy dựng kiểu desktop nó không hiện, NVYT sẽ không gõ nổi tài khoản HIS.
//
// Có hai hàng phụ thay nhau (nút "VN"/"ABC" ở góc):
//   • ABC — ký hiệu cho mật khẩu HIS (không dấu).
//   • VN  — chữ tiếng Việt (ă â đ ê ô ơ ư) và 5 dấu thanh, cần cho tên bệnh nhân:
//     backend so tên với hồ sơ HIS theo ĐÚNG dấu, gõ không dấu là bị chặn.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { applyToneToLastWord, telexAppend } from "@/lib/telex";

const ROWS_LOWER = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

// Hàng số khi bật Shift cho ra ký tự đặc biệt hay gặp trong mật khẩu.
const SHIFT_DIGITS = ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"];

// Ký tự phụ hay có trong mật khẩu HIS — để riêng một hàng cho dễ bấm.
const EXTRA = [".", "_", "-", "@", "!", "#", "$", "+", "*"];

/** Nguyên âm riêng của tiếng Việt: bấm thẳng, không cần tổ hợp kiểu Telex. */
const VN_LETTERS = ["ă", "â", "đ", "ê", "ô", "ơ", "ư"];

/** Dấu thanh — ký tự tổ hợp Unicode, ghép vào nguyên âm rồi chuẩn hoá NFC. */
const VN_TONES: Array<{ label: string; mark: string }> = [
  { label: "à", mark: "̀" },
  { label: "á", mark: "́" },
  { label: "ả", mark: "̉" },
  { label: "ã", mark: "̃" },
  { label: "ạ", mark: "̣" },
];

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Đóng bàn phím (nút Xong hoặc chạm ra ngoài). */
  onClose: () => void;
  /** Nhãn cho biết đang gõ vào ô nào — NVYT nhìn bàn phím là chính, không nhìn form. */
  label?: string;
  /** Che nội dung đang gõ (ô mật khẩu). */
  mask?: boolean;
  /** `number`: bàn phím số cỡ lớn cho CCCD/điện thoại — ít phím, bấm nhanh, đỡ sai. */
  mode?: "text" | "number";
  /** Giới hạn số ký tự (vd CCCD 12 số) — chặn ngay tại bàn phím thay vì để form cắt sau. */
  maxLength?: number;
  /** Mở sẵn hàng chữ tiếng Việt (ô họ tên); ô mật khẩu để false lấy hàng ký hiệu. */
  vietnamese?: boolean;
  /** Đổi cách hiện giá trị trên ô xem trước (vd 12021997 → 12/02/1997). */
  format?: (raw: string) => string;
}

export default function OnScreenKeyboard({
  value, onChange, onClose, label, mask, mode = "text", maxLength, vietnamese, format,
}: Props) {
  const [shift, setShift] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [vnRow, setVnRow] = useState(!!vietnamese);
  // Portal chỉ dựng được sau khi mount (lúc SSR chưa có `document`).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /**
   * Chỉ cho "chạm ra ngoài để đóng" sau khi bàn phím đã hiện được một nhịp.
   *
   * Chặn đúng một tình huống: ô nhập nằm ở nửa dưới màn hình, `mousedown` rơi vào ô →
   * ô focus → bàn phím bật lên che ngay chỗ vừa chạm → `mouseup` rơi vào lớp nền. Không
   * có cửa chặn này thì chính cú chạm mở bàn phím lại có thể bị tính là chạm ra ngoài.
   */
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 300);
    return () => clearTimeout(t);
  }, []);

  /**
   * Chừa chỗ dưới trang đúng bằng chiều cao bàn phím khi nó đang mở.
   *
   * Bàn phím che gần nửa dưới màn hình. Không chừa chỗ thì các ô nằm dưới bị khuất hẳn
   * — chạm vào đó là chạm trúng bàn phím, NVYT phải bấm "Xong" rồi mới sang được ô kế
   * tiếp. Có padding thì trang cuộn lên được và TouchField kéo ô đang gõ vào giữa màn.
   */
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mounted) return;
    const h = panelRef.current?.offsetHeight ?? 0;
    const prev = document.body.style.paddingBottom;
    document.body.style.paddingBottom = `${h}px`;
    return () => { document.body.style.paddingBottom = prev; };
  }, [mounted, mode, vnRow]);

  const type = (ch: string) => {
    if (maxLength != null && value.length >= maxLength) return;
    // Bật hàng VN thì phím chữ chạy Telex luôn: gõ v-u-x ra "vũ", khỏi phải với sang
    // hàng dấu. Hàng dấu vẫn giữ để đánh dấu lại một chữ đã gõ xong.
    onChange(vnRow && mode !== "number" ? telexAppend(value, ch) : value + ch);
    // Shift chỉ ăn một ký tự, giống bàn phím thật.
    if (shift) setShift(false);
  };

  /**
   * Mọi phím đều chặn `mousedown`: không cho bàn phím ảo cướp con trỏ khỏi ô nhập.
   *
   * Nhờ vậy ô vẫn là <input> đang focus, nên bàn phím VẬT LÝ và bộ gõ tiếng Việt của
   * máy (Unikey/EVKey) chạy y như bình thường, còn bàn phím ảo chỉ là đường nhập thứ
   * hai cho màn cảm ứng. Trước đây overlay giữ focus rồi tự bắt `keydown`, nên gõ
   * Unikey ra chữ không dấu.
   */
  const hold = (e: React.MouseEvent) => e.preventDefault();

  const keyClass =
    "flex-1 min-w-[48px] h-12 rounded-xl bg-white border border-slate-200 text-2xl font-medium " +
    "text-slate-800 active:bg-slate-200 select-none";

  const renderRow = (keys: string[], rowIndex: number) => (
    <div key={rowIndex} className="flex gap-1.5 justify-center">
      {keys.map((k) => {
        const ch = shift
          ? rowIndex === 0
            ? SHIFT_DIGITS[Number(k)] ?? k
            : k.toUpperCase()
          : k;
        return (
          <button key={k} type="button" onMouseDown={hold} onClick={() => type(ch)} className={keyClass}>
            {ch}
          </button>
        );
      })}
    </div>
  );

  const shown = mask && !reveal ? "•".repeat(value.length) : (format ? format(value) : value);

  // PHẢI render qua portal ra thẳng <body>.
  // AppLayout bọc nội dung trong một div có `backdrop-blur-[2px]`, mà backdrop-filter
  // tạo containing block cho con `position: fixed` → bàn phím sẽ bám đáy của KHỐI NỘI
  // DUNG (cao hơn màn hình) thay vì bám đáy viewport, làm hàng phím cuối (Shift, Dấu
  // cách, Xong) tụt xuống dưới mép màn hình và không bấm được.
  if (!mounted) return null;

  return createPortal(
    // `data-osk` để màn nào có "chạm ra ngoài thì đóng" (SearchableSelect) nhận ra đây
    // là bàn phím của chính nó — bàn phím nằm ngoài cây DOM của ô nhập vì render qua portal.
    <div data-osk="" className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Chạm ra ngoài để đóng */}
      <div className="absolute inset-0 bg-black/30" onClick={() => armed && onClose()} />

      <div ref={panelRef} className="relative bg-slate-100 rounded-t-3xl px-3 pt-3 pb-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xl text-slate-500 shrink-0">{label ?? "Đang nhập"}</span>
          <div className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-2 text-2xl min-h-[48px] break-all">
            {shown || <span className="text-slate-300">…</span>}
          </div>
          {mask && (
            <button
              type="button"
              onMouseDown={hold}
              onClick={() => setReveal((r) => !r)}
              className="h-12 px-4 rounded-xl bg-white border border-slate-200 text-xl text-slate-600"
            >
              {reveal ? "Ẩn" : "Hiện"}
            </button>
          )}
        </div>

        {mode === "number" ? (
          // Bàn phím số: phím to, ít lựa chọn — NVYT nhập CCCD/điện thoại nhanh và ít sai.
          <div className="max-w-md mx-auto space-y-2">
            {[["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["", "0", ""]].map((row, i) => (
              <div key={i} className="flex gap-2 justify-center">
                {row.map((k, j) =>
                  k ? (
                    <button
                      key={k}
                      type="button"
                      onMouseDown={hold}
                      onClick={() => type(k)}
                      className="flex-1 h-16 rounded-2xl bg-white border border-slate-200 text-4xl font-semibold text-slate-800 active:bg-slate-200"
                    >
                      {k}
                    </button>
                  ) : i === 3 && j === 0 ? (
                    <button
                      key="clear"
                      type="button"
                      onMouseDown={hold}
                      onClick={() => onChange("")}
                      className="flex-1 h-16 rounded-2xl bg-white border border-slate-200 text-xl text-slate-600"
                    >
                      Xoá hết
                    </button>
                  ) : (
                    <button
                      key="back"
                      type="button"
                      onMouseDown={hold}
                      onClick={() => onChange(value.slice(0, -1))}
                      className="flex-1 h-16 rounded-2xl bg-white border border-slate-200 text-2xl text-slate-700"
                    >
                      ⌫
                    </button>
                  ),
                )}
              </div>
            ))}
            <button
              type="button"
              onMouseDown={hold}
              onClick={onClose}
              className="w-full h-16 rounded-2xl bg-blue-700 text-white text-2xl font-bold"
            >
              Xong
            </button>
          </div>
        ) : (
        <div className="space-y-1.5">
          {ROWS_LOWER.map(renderRow)}

          <div className="flex gap-1.5 justify-center">
            <button
              type="button"
              onMouseDown={hold}
              onClick={() => setVnRow((v) => !v)}
              className={`min-w-[72px] h-12 rounded-xl text-lg font-semibold border ${
                vnRow ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              {vnRow ? "VN" : "ABC"}
            </button>

            {vnRow ? (
              <>
                {VN_LETTERS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onMouseDown={hold}
                    onClick={() => type(shift ? k.toUpperCase() : k)}
                    className={keyClass}
                  >
                    {shift ? k.toUpperCase() : k}
                  </button>
                ))}
                {VN_TONES.map((t) => (
                  <button
                    key={t.mark}
                    type="button"
                    onMouseDown={hold}
                    onClick={() => onChange(applyToneToLastWord(value, t.mark))}
                    className={`${keyClass} bg-amber-50 border-amber-200`}
                  >
                    {t.label}
                  </button>
                ))}
              </>
            ) : (
              EXTRA.map((k) => (
                <button key={k} type="button" onMouseDown={hold} onClick={() => type(k)} className={keyClass}>
                  {k}
                </button>
              ))
            )}
          </div>

          <div className="flex gap-1.5 justify-center">
            <button
              type="button"
              onMouseDown={hold}
              onClick={() => setShift((s) => !s)}
              className={`min-w-[104px] h-12 rounded-xl text-xl font-semibold border ${
                shift ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-700 border-slate-200"
              }`}
            >
              Shift
            </button>
            <button
              type="button"
              onMouseDown={hold}
              onClick={() => type(" ")}
              className="flex-[3] h-12 rounded-xl bg-white border border-slate-200 text-xl text-slate-600"
            >
              Dấu cách
            </button>
            <button
              type="button"
              onMouseDown={hold}
              onClick={() => onChange(value.slice(0, -1))}
              className="min-w-[104px] h-12 rounded-xl bg-white border border-slate-200 text-xl text-slate-700"
            >
              ⌫ Xoá
            </button>
            <button
              type="button"
              onMouseDown={hold}
              onClick={() => onChange("")}
              className="min-w-[104px] h-12 rounded-xl bg-white border border-slate-200 text-xl text-slate-700"
            >
              Xoá hết
            </button>
            <button
              type="button"
              onMouseDown={hold}
              onClick={onClose}
              className="min-w-[132px] h-12 rounded-xl bg-blue-700 text-white text-2xl font-bold"
            >
              Xong
            </button>
          </div>
        </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
