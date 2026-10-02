"use client";

import AppLayout from "@/components/layout/AppLayout";
import { useRouter } from "next/navigation";
import { ASSISTED_RECEPTION_ONLY } from "@/lib/feature-flags";
import { useState, useRef, useEffect } from "react";

const actions = [
  {
    // Sau khi bệnh nhân đăng nhập (quét CCCD / QR app) mới hỏi hình thức: khám dịch vụ
    // như cũ, hay khám BHYT qua luồng tiếp đón có NVYT hỗ trợ.
    href: "/register/choose",
    label: "Đăng ký khám",
    description: "Khám dịch vụ hoặc khám bảo hiểm y tế",
    image: "/registration.png",
    maintenance: false,
  },
  {
    href: "/payment",
    label: "Thanh toán",
    description: "Thanh toán viện phí an toàn, tiện lợi",
    image: "/credit-card-payment.png",
    maintenance: false,
  },
  {
    href: "/check-in",
    label: "Check-in",
    description: "Dành cho khách hàng đã đăng ký khám online trên ứng dụng VNyTe",
    image: "/check-in.png",
    maintenance: false,
  },
  {
    href: "/reception",
    label: "Tái khám",
    description: "Quét mã hẹn khám hoặc tra theo CCCD để tạo hồ sơ tái khám",
    image: "/schedule.png",
    maintenance: false,
  },
  {
    href: "/print-invoice",
    label: "In phiếu khám",
    description: "Tải và in phiếu khám tại quầy",
    image: "/printer.png",
    maintenance: false,
  },
];

export default function Home() {
  const router = useRouter();
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [maintenanceLabel, setMaintenanceLabel] = useState("");

  // Máy chuyên tiếp đón: bỏ qua menu bệnh nhân, vào thẳng màn đăng nhập NVYT.
  useEffect(() => {
    if (ASSISTED_RECEPTION_ONLY) router.replace("/assisted");
  }, [router]);

  // Mở /setup trên màn cảm ứng (không có bàn phím để bấm Ctrl+Shift+K):
  // chạm góc trên-trái 5 lần trong vòng 2s. /setup vẫn chặn bằng PIN khi máy đã kích hoạt.
  const tapRef = useRef<{ count: number; t: number }>({ count: 0, t: 0 });
  const onSecretTap = () => {
    const now = Date.now();
    const r = tapRef.current;
    if (now - r.t > 2000) r.count = 0;
    r.t = now;
    r.count += 1;
    if (r.count >= 5) {
      r.count = 0;
      router.push("/setup");
    }
  };

  const handleFeatureClick = (href: string, maintenance: boolean, label: string) => {
    if (maintenance) {
      setMaintenanceLabel(label);
      setShowMaintenance(true);
      return;
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("patientCode");
      localStorage.removeItem("tokenExpireAt");
      localStorage.removeItem("gatewayToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("signingKey");
      localStorage.removeItem("encryptionKey");
      sessionStorage.removeItem("cccdPatient");
    }
    router.push(`/login?redirect=${encodeURIComponent(href)}`);
  };

  return (
    <AppLayout>
      {/* Góc ẩn mở cấu hình kiosk: chạm 5 lần (màn cảm ứng, không cần bàn phím) */}
      <div
        onClick={onSecretTap}
        aria-hidden="true"
        className="fixed top-0 left-0 w-16 h-16 z-50"
        style={{ opacity: 0 }}
      />
      <div className="flex-1 flex items-center justify-center px-4 py-6 md:py-10">
        <div className="w-full max-w-4xl">
          {/* Page Header */}
          <div className="text-center mb-10">
            <h2 className="text-5xl md:text-6xl font-bold text-slate-800 mb-2">
              Vui lòng chọn dịch vụ
            </h2>
            <p className="text-2xl text-slate-400">
              Chạm vào chức năng bạn muốn sử dụng
            </p>
          </div>

          {/* Feature Cards */}
          <div className="flex flex-col gap-5">
            {actions.map((action) => (
              <button
                key={action.label}
                onClick={() => handleFeatureClick(action.href, action.maintenance, action.label)}
                className="group relative rounded-2xl px-10 py-7 flex items-center gap-7 active:scale-[0.98] transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 overflow-hidden bg-gradient-to-r from-blue-700 to-blue-600 shadow-lg shadow-blue-200/50 hover:from-blue-800 hover:to-blue-700 hover:shadow-xl hover:shadow-blue-300/50"
              >
                {/* Decorative circle */}
                <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/5 rounded-full" />
                <div className="absolute -right-4 -bottom-10 w-32 h-32 bg-white/5 rounded-full" />

                {/* Image */}
                <div className="relative z-10 w-32 h-32 flex-shrink-0 flex items-center justify-center bg-white rounded-2xl shadow-sm">
                  <img
                    src={action.image}
                    alt={action.label}
                    className="w-22 h-22 object-contain transition-transform duration-300 group-hover:scale-110"
                  />
                </div>

                {/* Text */}
                <div className="relative z-10 flex-1 text-left">
                  <h3 className="text-7xl font-bold text-white mb-1">
                    {action.label}
                  </h3>
                  <p className="text-xl text-white/50">
                    {action.description}
                  </p>
                </div>

                {/* Status / Arrow */}
                <div className="relative z-10 flex-shrink-0 flex items-center gap-3">
                  {action.maintenance && (
                    <span className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-400/90 text-amber-900 text-lg font-bold rounded-full shadow-sm">
                      Bảo trì
                    </span>
                  )}
                  <div className="w-12 h-12 rounded-full bg-white/10 group-hover:bg-white/20 flex items-center justify-center transition-all duration-300">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white/70 group-hover:text-white group-hover:translate-x-0.5 transition-all duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Maintenance Dialog */}
      {showMaintenance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowMaintenance(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center mb-5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#D97706" className="w-10 h-10">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
              </svg>
            </div>

            <h3 className="text-3xl font-bold text-slate-800 mb-2">Đang bảo trì</h3>
            <p className="text-slate-500 text-xl mb-1">
              Chức năng <span className="font-semibold text-slate-700">{maintenanceLabel}</span> đang được nâng cấp.
            </p>
            <p className="text-slate-400 text-lg mb-6">Vui lòng quay lại sau.</p>

            <button
              onClick={() => setShowMaintenance(false)}
              className="w-full py-3 bg-blue-700 hover:bg-blue-800 text-white text-xl font-semibold rounded-xl transition-colors duration-200 cursor-pointer active:scale-[0.98]"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
