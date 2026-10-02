"use client";

// Khung chung cho các màn trong luồng tiếp đón: thanh bước, tiêu đề, khung thẻ và
// thanh nút dính đáy. Gom một chỗ để năm màn không mỗi màn một cỡ chữ, một khoảng cách.

import type { ReactNode } from "react";

export const FLOW_STEPS = [
  "Đọc CCCD",
  "Hành chính",
  "Đối tượng",
  "Phòng khám",
  "Phiếu khám",
] as const;

/** Thanh bước: NVYT luôn biết đang ở đâu và còn mấy bước nữa. */
export function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-6 max-w-4xl mx-auto">
      {FLOW_STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={label} className="flex-1 flex items-center gap-2">
            <div className="flex flex-col items-center flex-1">
              <div className={`w-full h-1.5 rounded-full ${done || active ? "bg-blue-600" : "bg-slate-200"}`} />
              <span
                className={`mt-2 text-base whitespace-nowrap ${
                  active ? "text-blue-700 font-semibold" : done ? "text-slate-500" : "text-slate-300"
                }`}
              >
                {done ? "✓ " : ""}{label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PageHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center mb-5">
      <h2 className="text-4xl font-bold text-slate-800">{title}</h2>
      {subtitle && <p className="text-xl text-slate-400 mt-1">{subtitle}</p>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-3xl shadow-lg shadow-slate-200/60 p-6 ${className}`}>
      {children}
    </div>
  );
}

/** Nhóm trường có tiêu đề — form 20 ô mà không chia nhóm thì đọc không nổi. */
export function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-3 border-b border-slate-100 pb-2">
        <h3 className="text-2xl font-semibold text-slate-700">{title}</h3>
        {note && <span className="text-base text-slate-400">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * Thanh nút dính đáy màn hình. Form dài mà để nút ở cuối trang thì NVYT phải cuộn
 * xuống đáy mỗi lần bấm — trên màn cảm ứng dựng đứng là cả một quãng.
 */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 px-6 py-4 bg-white/95 backdrop-blur border-t border-slate-100 rounded-b-3xl">
      <div className="flex gap-3">{children}</div>
    </div>
  );
}

export function PrimaryButton({
  children, onClick, disabled, className = "",
}: { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`py-4 px-6 rounded-2xl font-bold text-2xl transition ${
        disabled ? "bg-slate-200 text-slate-400" : "bg-blue-700 text-white hover:bg-blue-800 active:scale-[0.99]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children, onClick, disabled, className = "",
}: { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`py-4 px-6 rounded-2xl text-xl border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition ${className}`}
    >
      {children}
    </button>
  );
}
