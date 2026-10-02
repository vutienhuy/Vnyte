"use client";

// Màn "Chưa xác định được kết quả" (mục 10).
//
// UNKNOWN nghĩa là request TỚI HIS CÓ THỂ đã tới nơi. Không được kết luận vội là thất bại:
//   • KHÔNG cho đăng ký lại khi phiếu còn UNKNOWN — CCCD đang bị chính phiếu này khoá
//     "một đăng ký mỗi ngày"; gửi lại hoặc bị chặn, hoặc tệ hơn là tạo trùng đợt điều trị.
//   • Gọi `reconcile` sớm hơn retryAfterSeconds chỉ nhận lại đúng UNKNOWN (backend chưa
//     đủ ngưỡng unknownReconcileMinSeconds) → đếm ngược rồi mới mở nút.

import { useEffect, useState } from "react";
import { ArError, reconcile } from "@/services/assisted-reception.service";
import { getArError } from "@/constants/assisted-reception-errors";
import type { ReceptionTicket } from "@/types/assisted-reception";

interface Props {
  receptionId: string;
  /** Số giây phải chờ trước lần bấm đầu tiên (backend trả kèm lỗi/`reconcile`). */
  initialRetryAfterSeconds?: number;
  onSuccess: (ticket: ReceptionTicket) => void;
  /** HIS xác nhận không tạo gì → cho NVYT sửa và gửi lại như phiếu FAILED thường. */
  onFailed: () => void;
}

export default function ReconcilePanel({
  receptionId, initialRetryAfterSeconds = 0, onSuccess, onFailed,
}: Props) {
  const [waitSeconds, setWaitSeconds] = useState(initialRetryAfterSeconds);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (waitSeconds <= 0) return;
    const t = setInterval(() => setWaitSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [waitSeconds]);

  const check = async () => {
    if (checking || waitSeconds > 0) return;
    setChecking(true);
    setError(null);
    try {
      const res = await reconcile(receptionId);
      if (res.status === "SUCCESS") { onSuccess(res.ticket); return; }
      if (res.status === "FAILED") { onFailed(); return; }
      setWaitSeconds(res.retryAfterSeconds || 30);
    } catch (e) {
      const err = e as ArError;
      /**
       * Phiếu không ở trạng thái UNKNOWN thì không có gì để đối soát. Trên máy thật,
       * trường hợp hay gặp nhất là lệnh `register` bị lớp edge cắt ngang TRƯỚC khi tới
       * vnyte (502 kèm trang lỗi chữ): phiếu vẫn còn DRAFT, HIS chưa hề biết đến nó.
       * Đây là tin tốt — không có hồ sơ trùng — nên đưa NVYT về gửi lại, đừng để họ
       * đứng chờ một cuộc đối soát không bao giờ có kết quả.
       */
      if (err.code === "KIOSK_AR_RECEPTION_NOT_RECONCILABLE") { onFailed(); return; }
      setError(getArError(err.code).message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center space-y-5">
        <div className="text-6xl">⏳</div>
        <h2 className="text-4xl font-bold text-amber-700">Chưa xác định được kết quả</h2>
        <p className="text-xl text-slate-500">
          Hệ thống bệnh viện chưa trả lời rõ phiếu đã được tạo hay chưa. Vui lòng chờ rồi bấm
          Kiểm tra lại. <b>Không đăng ký lại</b> cho bệnh nhân này trong lúc chờ.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-xl">{error}</div>
        )}

        <button
          onClick={check}
          disabled={checking || waitSeconds > 0}
          className={`w-full py-4 rounded-xl font-bold text-2xl ${
            checking || waitSeconds > 0 ? "bg-slate-200 text-slate-400" : "bg-amber-500 text-white"
          }`}
        >
          {checking
            ? "Đang đối soát..."
            : waitSeconds > 0
              ? `Kiểm tra lại sau ${waitSeconds}s`
              : "Kiểm tra lại"}
        </button>
      </div>
    </div>
  );
}
