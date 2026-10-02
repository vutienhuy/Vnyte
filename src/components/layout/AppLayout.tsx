"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ReactNode, useState, useEffect, useRef } from "react";
import ConfirmDialog from "../ui/ConfirmDialog";

interface AppLayoutProps {
  children: ReactNode;
  showBackButton?: boolean;
  backHref?: string;
  headerCenter?: ReactNode;
}

export default function AppLayout({
  children,
  showBackButton = false,
  backHref = "/",
  headerCenter
}: AppLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Cổng chặn: kiosk chưa kích hoạt license → ép sang /setup.
  const [gateChecked, setGateChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/kiosk/config-status")
      .then((r) => r.json())
      .then((s: { activated?: boolean }) => {
        if (cancelled) return;
        if (!s.activated && pathname !== "/setup") {
          window.location.href = "/setup";
          return;
        }
        setGateChecked(true);
      })
      .catch(() => { if (!cancelled) setGateChecked(true); }); // lỗi mạng → vẫn render, tránh kẹt
    return () => { cancelled = true; };
  }, [pathname]);
  // Nút ẩn góc dưới-phải: chạm 5 lần trong 3s → mở /setup (kỹ thuật cấu hình lại, có PIN bảo vệ).
  const tapRef = useRef<{ count: number; t: number }>({ count: 0, t: 0 });
  const handleCornerTap = () => {
    const now = Date.now();
    const r = tapRef.current;
    if (now - r.t > 3000) r.count = 0;
    r.t = now;
    r.count += 1;
    if (r.count >= 5) { r.count = 0; window.location.href = "/setup"; }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("patientCode");
    localStorage.removeItem("tokenExpireAt");
    localStorage.removeItem("gatewayToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("signingKey");
    localStorage.removeItem("encryptionKey");
    router.push("/login");
  };

  if (!gateChecked) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full bg-cover bg-no-repeat bg-center bg-fixed flex flex-col"
      style={{ backgroundImage: "url('/background.jpg')" }}
    >
      <div className="flex-1 backdrop-blur-[2px] bg-white/30 flex flex-col">

        <header className="top-0 z-50 bg-transparent flex-none">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between h-32">
              <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <img src="/logo.ico" alt="VNyTe Logo" className="w-16 h-16" />
                <div>
                  <h1 className="text-4xl font-bold text-blue-900">VNyTe</h1>
                  <p className="text-3xl text-blue-900">- Hệ thống quản lý khám bệnh</p>
                </div>
              </Link>

              {headerCenter && (
                <div className="flex-1 flex justify-center min-w-0">
                  {headerCenter}
                </div>
              )}

              <div>
                <Link
                  href="/"
                  className="flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer px-3 py-2 rounded-lg hover:bg-slate-100"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                  </svg>
                  <span className="text-3xl font-medium hidden sm:inline">Trang chủ</span>
                </Link>

                {/* <button
                  className="flex items-center gap-2 text-slate-600 hover:text-orange-500 transition-colors cursor-pointer px-3 py-2 rounded-lg hover:bg-slate-100"
                  onClick={() => setShowConfirmDialog(true)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  <span className="text-sm font-medium hidden sm:inline">Đăng xuất</span>
                </button> */}
              </div>
            </div>
          </div>
        </header>


        <main className="relative flex-1">
          {showBackButton && (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
              <Link
                href={backHref}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm text-slate-700 rounded-lg hover:bg-white/90 border border-slate-200/50 transition-all duration-200 text-sm font-medium shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Về trang chủ
              </Link>
            </div>
          )}
          {children}
        </main>
      </div>
      {/* Nút ẩn góc dưới-phải — chạm 5 lần để vào cấu hình (kỹ thuật) */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={handleCornerTap}
        className="fixed bottom-0 right-0 w-16 h-16 opacity-0 z-[100] cursor-default"
      />
      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={handleLogout}
        title="Xác nhận đăng xuất"
        message="Bạn có chắc chắn muốn đăng xuất không?"
        confirmText="Đăng xuất"
        cancelText="Hủy"
        variant="danger"
        icon="warning"
      />
    </div>
  );
}
