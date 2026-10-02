"use client";

// Màn rẽ nhánh ngay sau khi bệnh nhân đã đăng nhập (quét CCCD hoặc QR app VNyTe).
//
//   [1] Đăng ký khám thường → /register, giữ nguyên luồng cũ
//   [2] Đăng ký khám BHYT   → /assisted, NVYT đăng nhập HIS rồi tiếp đón
//
// Nhánh BHYT mang sẵn danh tính lấy được ở bước đăng nhập nên KHÔNG phải quét thẻ
// lần nữa. Không lấy được danh tính (tài khoản VNyTe chưa có CCCD) thì vẫn vào được,
// chỉ là phải đọc thẻ ở màn sau.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { Card, PageHead } from "@/components/assisted/FlowShell";
import {
  identityFromCccdSession, identityFromVnyteAccount, storePendingIdentity,
  type PatientIdentity,
} from "@/lib/assisted-identity";

export default function ChooseRegisterModePage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<PatientIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Quét CCCD cho dữ liệu chắc nhất (đúng dấu, đúng ngày) → ưu tiên trước.
    const fromCard = identityFromCccdSession();
    if (fromCard) {
      setIdentity(fromCard);
      setLoading(false);
      return;
    }
    identityFromVnyteAccount()
      .then((id) => { if (!cancelled) setIdentity(id); })
      .catch(() => { if (!cancelled) setIdentity(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const goBhyt = () => {
    if (identity) storePendingIdentity(identity);
    router.push("/assisted");
  };

  return (
    <AppLayout showBackButton backHref="/">
      <div className="flex-1 px-4 py-8">
        <div className="max-w-3xl mx-auto w-full">
          <PageHead
            title="Bạn muốn đăng ký theo hình thức nào?"
            subtitle={
              identity
                ? `Bệnh nhân: ${identity.payload.fullName}`
                : "Chọn hình thức phù hợp để tiếp tục"
            }
          />

          <Card className="space-y-4">
            <button
              type="button"
              onClick={() => router.push("/register")}
              className="w-full text-left p-6 rounded-2xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 transition flex items-center justify-between gap-4"
            >
              <span>
                <span className="block text-3xl font-semibold text-slate-800">Khám dịch vụ / yêu cầu</span>
                <span className="block text-lg text-slate-400 mt-1">
                  Tự chọn chuyên khoa, phòng khám và khung giờ
                </span>
              </span>
              <span className="text-3xl text-slate-300">›</span>
            </button>

            <button
              type="button"
              onClick={goBhyt}
              className="w-full text-left p-6 rounded-2xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 transition flex items-center justify-between gap-4"
            >
              <span>
                <span className="block text-3xl font-semibold text-slate-800">
                  Khám bảo hiểm y tế — có nhân viên hỗ trợ
                </span>
                <span className="block text-lg text-slate-400 mt-1">
                  {loading
                    ? "Đang lấy thông tin bệnh nhân…"
                    : identity
                      ? "Nhân viên y tế tra thẻ BHYT và tiếp đón tại chỗ"
                      : "Nhân viên y tế tiếp đón — cần đọc thẻ CCCD ở bước sau"}
                </span>
              </span>
              <span className="text-3xl text-slate-300">›</span>
            </button>

            {!loading && !identity && (
              <p className="text-lg text-amber-700 px-1">
                Chưa lấy được số CCCD từ bước đăng nhập, nên luồng BHYT sẽ hỏi lại thẻ.
              </p>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
