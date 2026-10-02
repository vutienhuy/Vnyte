"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { generateQrLogin, completeQrLogin, checkQrLoginStatus } from "../api/qr-login";
import { startQrAuto, onQrScan } from "@/lib/qr-serial";

type QrLoginResponse = {
  data: {
    sessionId: string;
    status?: string;
    expiredAt?: number;
    expiresAt?: number;
    qrJson: string;
  };
};

type CompleteQrLoginResponse = {
  data: {
    tokenCode: string;
    patientCode: string;
    expiresTokenCodeAt: number;
    // JWT từ Gateway (enriched complete) — dùng cho /api/patients/* và Nhóm 1 endpoints
    accessToken?: string;
    refreshToken?: string;
    idNumber?: string;
    fullName?: string;
    // Per-session HMAC signing key + AES encryption key — server derive sẵn từ jti
    // để client không phải biết MasterSecret. Cùng pattern với mobile JwtTokenModel.
    signingKey?: string;
    encryptionKey?: string;
  };
};
import dynamic from "next/dynamic";
import dayjs from "dayjs";

const QRCode = dynamic(() => import("react-qr-code"), { ssr: false });
import AppLayout from "@/components/layout/AppLayout";

function LoginQRInner() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const isCheckIn = redirectTo === "/check-in";
  const isPayment = redirectTo === "/payment";
  // Tái khám: cũng có ô nhập/quét mã hẹn khám (Luồng A) như thanh toán,
  // nhưng route về /reception thay vì /payment. Ẩn cột CCCD (Luồng B cần JWT).
  const isReception = redirectTo === "/reception";
  // Trang đích cho luồng quét/nhập mã (treatmentCode).
  const codeTarget = isReception ? "/reception" : "/payment";
  const [qr, setQr] = useState<{ qrJson: string; sessionId: string; expiresAt?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("pending");
  const [autoLoginError, setAutoLoginError] = useState("");
  const [qrExpired, setQrExpired] = useState(false);
  const [treatmentCode, setTreatmentCode] = useState("");
  const [tokenExpireTimeout, setTokenExpireTimeout] = useState<NodeJS.Timeout | null>(null);

  // Bắt barcode scanner ở cấp document — kể cả khi ô input không focus.
  // Scanner gõ nhanh nhiều ký tự liên tiếp rồi Enter.
  // Nếu ký tự cách nhau > 500ms coi như user gõ tay và reset buffer.
  useEffect(() => {
    if (!isPayment && !isReception) return;
    let buffer = "";
    let lastKeyTime = 0;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Nếu đang focus vào input/textarea/button: để native xử lý, không bắt
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const now = Date.now();
      if (now - lastKeyTime > 500) buffer = "";
      lastKeyTime = now;

      if (e.key === "Enter") {
        const code = buffer.trim();
        buffer = "";
        if (code) {
          window.location.href = `${codeTarget}?code=${encodeURIComponent(code)}`;
        }
        return;
      }
      if (e.key.length === 1) {
        buffer += e.key;
        setTreatmentCode(buffer);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isPayment, isReception, codeTarget]);

  // Đầu đọc QR rời qua cổng COM (Web Serial) — mã phiếu khám.
  // Đầu đọc xuất serial (không phải bàn phím) nên keyboard-wedge ở trên không bắt được;
  // ở đây mở cổng đã cấp quyền (trong /setup) và điều hướng giống khi nhấn Enter.
  useEffect(() => {
    if (!isPayment && !isReception) return;
    let cancelled = false;
    void startQrAuto();
    const off = onQrScan((code) => {
      if (cancelled) return;
      const c = code.trim();
      if (c) window.location.href = `${codeTarget}?code=${encodeURIComponent(c)}`;
    });
    return () => { cancelled = true; off(); };
  }, [isPayment, isReception, codeTarget]);

  // Kiểm tra hạn QR code
  useEffect(() => {
    if (!qr?.expiresAt) return;
    const now = Number(dayjs().format("YYYYMMDDHHmmss"));
    if (qr.expiresAt <= now) {
      setQrExpired(true);
      return;
    }
    const msToExpire = dayjs(qr.expiresAt + "", "YYYYMMDDHHmmss").valueOf() - Date.now();
    const timeout = setTimeout(() => setQrExpired(true), msToExpire);
    return () => clearTimeout(timeout);
  }, [qr?.expiresAt]);

  useEffect(() => {
    const deviceInfo = typeof window !== "undefined" ? window.navigator.userAgent : "unknown";
    generateQrLogin(deviceInfo)
      .then((data) => {
        const res = data as QrLoginResponse;
        const expiresAt = res.data?.expiresAt || res.data?.expiredAt;
        const qrJson = typeof res.data.qrJson === "string"
          ? res.data.qrJson
          : JSON.stringify(res.data.qrJson);
        setQr({ qrJson, sessionId: res.data.sessionId, expiresAt });
        setLoading(false);
      })
      .catch(() => {
        setError("Không thể tạo mã QR, vui lòng thử lại.");
        setLoading(false);
      });
  }, []);

  // Polling trạng thái QR login mỗi 4s.
  // Thay SSE vì nginx trước Kestrel buffer response 60s → không stream được.
  // STOP khi status terminal (confirmed/completed/expired/rejected) hoặc 404
  // — tránh leak loop vô hạn (QR_LOGIN_WEB_INTEGRATION.md mục 2.3).
  useEffect(() => {
    if (!qr?.sessionId) return;
    const sessionId = qr.sessionId;
    let cancelled = false;
    let iv: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (iv !== null) {
        clearInterval(iv);
        iv = null;
      }
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await checkQrLoginStatus(sessionId);
        if (cancelled) return;
        // Session expired/cleanup phía server → status terminal, ngừng poll.
        if (res?.notFound) {
          setStatus("expired");
          stop();
          return;
        }
        const s = (res?.data?.status || "").toString().toLowerCase();
        if (!s) return;
        setStatus(s);
        if (s === "confirmed" || s === "completed" || s === "expired" || s === "rejected") {
          stop();
        }
      } catch {
        /* network error tạm thời — retry ở lần poll sau */
      }
    };

    poll(); // lần đầu ngay lập tức
    // 4s — backend Auth có rate limit AuthLimit (10 req/60s). Poll 2s từng làm web ăn 502.
    iv = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      stop();
    };
  }, [qr?.sessionId]);

  useEffect(() => {
    console.log("Status changed:", status, "và qr?.sessionId", qr?.sessionId);
    if (status === "confirmed" && qr?.sessionId) {
      console.log("Status confirmed, completing login for session:", qr.sessionId);
      completeQrLogin(qr.sessionId)
        .then((data) => {
          const res = data as CompleteQrLoginResponse;
          console.log("Complete QR Login response:", res);
          if (res.data.tokenCode && res.data.patientCode) {
            localStorage.setItem("token", res.data.tokenCode);
            localStorage.setItem("patientCode", res.data.patientCode);
            localStorage.setItem("tokenExpireAt", String(res.data.expiresTokenCodeAt));
            // JWT Gateway — dùng cho các call /api/* cần [Authorize].
            if (res.data.accessToken) {
              localStorage.setItem("gatewayToken", res.data.accessToken);
            }
            if (res.data.refreshToken) {
              localStorage.setItem("refreshToken", res.data.refreshToken);
            }
            // Per-session HMAC signing key + AES decryption key.
            // gateway-proxy đọc 2 key này từ header X-Signing-Key / X-Encryption-Key
            // để sign request + decrypt response — không cần MasterSecret.
            if (res.data.signingKey) {
              localStorage.setItem("signingKey", res.data.signingKey);
            }
            if (res.data.encryptionKey) {
              localStorage.setItem("encryptionKey", res.data.encryptionKey);
            }
            if (tokenExpireTimeout) clearTimeout(tokenExpireTimeout);
            const msToExpire = dayjs(res.data.expiresTokenCodeAt + "", "YYYYMMDDHHmmss").valueOf() - Date.now();
            const timeout = setTimeout(() => {
              alert("Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.");
              localStorage.removeItem("token");
              localStorage.removeItem("patientCode");
              localStorage.removeItem("tokenExpireAt");
              localStorage.removeItem("gatewayToken");
              localStorage.removeItem("refreshToken");
              localStorage.removeItem("signingKey");
              localStorage.removeItem("encryptionKey");
              window.location.href = "/login";
            }, msToExpire);
            setTokenExpireTimeout(timeout);
            // Navigate to the originally requested page (or home)
            window.location.href = redirectTo;
          } else {
            setAutoLoginError("Không thể hoàn tất đăng nhập.");
          }
        })
        .catch(() => setAutoLoginError("Không thể hoàn tất đăng nhập."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, qr?.sessionId]);

  useEffect(() => {
    const checkTokenExpire = () => {
      const expireAt = localStorage.getItem("tokenExpireAt");
      if (expireAt) {
        const now = Number(dayjs().format("YYYYMMDDHHmmss"));
        if (Number(expireAt) <= now) {
          alert("Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.");
          localStorage.removeItem("token");
          localStorage.removeItem("patientCode");
          localStorage.removeItem("tokenExpireAt");
          localStorage.removeItem("gatewayToken");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("signingKey");
          localStorage.removeItem("encryptionKey");
          window.location.href = "/login";
        }
      }
    };
    const interval = setInterval(checkTokenExpire, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleGetNewQr = () => {
    setQrExpired(false);
    setQr(null);
    setStatus("pending");
    setLoading(true);
    setError("");
    setAutoLoginError("");
    const deviceInfo = typeof window !== "undefined" ? window.navigator.userAgent : "unknown";
    generateQrLogin(deviceInfo)
      .then((data) => {
        const res = data as QrLoginResponse;
        console.log("Lấy mã QR mới thành công:", res);
        const expiresAt = res.data?.expiresAt || res.data?.expiredAt;
        const qrJson = typeof res.data.qrJson === "string"
          ? res.data.qrJson
          : JSON.stringify(res.data.qrJson);
        setQr({ qrJson, sessionId: res.data.sessionId, expiresAt });
        setLoading(false);
      })
      .catch(() => {
        setError("Không thể tạo mã QR, vui lòng thử lại.");
        setLoading(false);
      });
  };

  return (
    <AppLayout>
      <div className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-5xl">

          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-800">
              {isCheckIn ? "Đăng nhập bằng QR Code" : "Chọn phương thức đăng nhập"}
            </h1>
            <p className="text-2xl text-slate-500 mt-2">
              {isCheckIn
                ? "Quét mã QR từ ứng dụng VNyTe để tiếp tục check-in"
                : isPayment
                  ? "Chọn một trong ba cách bên dưới để thanh toán viện phí"
                  : isReception
                    ? "Quét mã hẹn khám hoặc đăng nhập VNyTe để tái khám"
                    : "Vui lòng chọn một trong hai cách bên dưới để tiếp tục"}
            </p>
          </div>

          {/* Columns: check-in = 1, payment = 3, others = 2 */}
          <div
            className={
              isCheckIn
                ? "flex justify-center"
                : (isPayment || isReception)
                  ? "grid grid-cols-1 md:grid-cols-3 gap-5"
                  : "grid grid-cols-1 md:grid-cols-2 gap-6"
            }
          >

            {/* ── Column 1: QR Code ── */}
            <div className={`bg-white border border-slate-200 shadow-lg rounded-2xl p-6 flex flex-col items-center${isCheckIn ? " max-w-lg w-full" : ""}`}>
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-100 text-blue-700 rounded-full text-lg font-semibold mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12l2 2 4-4" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
                Đã có tài khoản App VNyTe
              </div>

              {/* Header */}
              <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-blue-200">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="3" height="3" />
                  <rect x="18" y="14" width="3" height="3" />
                  <rect x="14" y="18" width="3" height="3" />
                  <rect x="18" y="18" width="3" height="3" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-slate-800 mb-1">Đăng nhập bằng QR Code</h2>
              <p className="text-xl text-slate-500 text-center mb-4">
                Quét mã QR bằng ứng dụng VNyTe trên điện thoại của bạn
              </p>

              {/* Status Badge */}
              {status === "confirmed" && (
                <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded-full flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-green-700 text-xl font-medium">Đã xác nhận, đang chuyển hướng...</span>
                </div>
              )}

              {/* QR Code Container */}
              <div className={`relative flex flex-col items-center justify-center mb-4 transition-all duration-300 ${qrExpired ? "w-72 h-72" : "w-64 h-64"}`}>
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 z-0 shadow-inner" />

                {loading ? (
                  <div className="z-10 flex flex-col items-center gap-4">
                    <div className="relative">
                      <div className="w-12 h-12 border-4 border-blue-200 rounded-full" />
                      <div className="w-12 h-12 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0" />
                    </div>
                    <span className="text-slate-600 text-xl font-medium">Đang tạo mã QR...</span>
                  </div>
                ) : error ? (
                  <div className="z-10 flex flex-col items-center gap-3 p-6">
                    <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <span className="text-red-600 text-lg font-medium text-center">{error}</span>
                    <button onClick={handleGetNewQr} className="mt-2 px-5 py-2 bg-red-600 text-white text-lg font-medium rounded-lg hover:bg-red-700 transition-colors cursor-pointer">
                      Thử lại
                    </button>
                  </div>
                ) : qrExpired ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-white/95 backdrop-blur-sm rounded-2xl">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <span className="text-slate-700 text-xl font-semibold mb-1">QR Code đã hết hạn</span>
                    <p className="text-slate-500 text-lg mb-4 text-center px-4">Vui lòng tạo mã mới để tiếp tục</p>
                    <button className="px-6 py-2.5 bg-gradient-to-r from-blue-700 to-blue-800 text-white text-lg font-semibold rounded-xl hover:from-blue-800 hover:to-blue-900 transition-all shadow-lg shadow-blue-200 cursor-pointer flex items-center gap-2" onClick={handleGetNewQr}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                      Lấy mã mới
                    </button>
                  </div>
                ) : qr && typeof qr.qrJson === "string" && qr.qrJson.length > 0 ? (
                  <div className="flex items-center justify-center w-full h-full z-10 p-4">
                    <div className="bg-white rounded-xl p-3 shadow-md ring-2 ring-blue-100">
                      <QRCode value={qr.qrJson} size={200} bgColor="#ffffff" level="H" />
                    </div>
                  </div>
                ) : null}
              </div>

              {autoLoginError && (
                <div className="w-full mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span className="text-red-700 text-lg font-medium">{autoLoginError}</span>
                </div>
              )}

              {/* Steps */}
              <div className="w-full space-y-2 mt-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-700 text-white rounded-lg flex items-center justify-center text-lg font-bold shrink-0">1</div>
                  <p className="text-xl text-slate-600">Mở ứng dụng <span className="font-semibold text-slate-800">VNyTe</span> trên điện thoại</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-700 text-white rounded-lg flex items-center justify-center text-lg font-bold shrink-0">2</div>
                  <p className="text-xl text-slate-600">Chọn chức năng <span className="font-semibold text-slate-800">Quét QR</span> và quét mã</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-700 text-white rounded-lg flex items-center justify-center text-lg font-bold shrink-0">3</div>
                  <p className="text-xl text-slate-600">Xác nhận trên điện thoại và chờ chuyển hướng</p>
                </div>
              </div>

              <div className="flex items-start gap-2 mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg w-full">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <p className="text-lg text-blue-600">Mã QR có thời hạn giới hạn. Nếu hết hạn, nhấn &ldquo;Lấy mã mới&rdquo;.</p>
              </div>
            </div>

            {/* ── Column 2: CCCD/NFC (ẩn khi từ check-in) ── */}
            {!isCheckIn && (
            <div className="bg-white border border-slate-200 shadow-lg rounded-2xl p-6 flex flex-col items-center">
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-orange-100 text-orange-700 rounded-full text-lg font-semibold mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
                Chưa có tài khoản App VNyTe
              </div>

              {/* Header */}
              <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-green-200">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="16" rx="3" />
                  <path d="M7 8h4" />
                  <path d="M7 12h2" />
                  <circle cx="15" cy="10" r="2" />
                  <path d="M11 16c0-1.7 1.3-3 3-3h2c1.7 0 3 1.3 3 3" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-slate-800 mb-1">Xác thực bằng CCCD / NFC</h2>
              <p className="text-xl text-slate-500 text-center mb-6">
                Sử dụng căn cước công dân hoặc quét thẻ gắn chip NFC để truy cập
              </p>

              {/* CTA Button */}
              <button
                className="w-full px-8 py-6 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-2xl font-bold rounded-2xl hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-lg shadow-green-200 hover:shadow-xl active:scale-[0.98] flex flex-col items-center gap-3 justify-center cursor-pointer mb-6"
                onClick={() => window.location.href = `/patient-check?redirect=${encodeURIComponent(redirectTo)}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="16" rx="3" />
                  <path d="M7 8h4" />
                  <path d="M7 12h2" />
                  <circle cx="15" cy="10" r="2" />
                  <path d="M11 16c0-1.7 1.3-3 3-3h2c1.7 0 3 1.3 3 3" />
                </svg>
                <span>Xác thực CCCD gắn chip</span>
                <span className="text-base font-normal text-green-100">Nhập số CCCD hoặc quét NFC để tiếp tục</span>
              </button>

              {/* Steps */}
              <div className="w-full space-y-2 mt-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-600 text-white rounded-lg flex items-center justify-center text-lg font-bold shrink-0">1</div>
                  <p className="text-xl text-slate-600">Nhập <span className="font-semibold text-slate-800">số CCCD, họ tên, ngày sinh</span></p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-600 text-white rounded-lg flex items-center justify-center text-lg font-bold shrink-0">2</div>
                  <p className="text-xl text-slate-600">Hoặc <span className="font-semibold text-slate-800">quét thẻ CCCD gắn chip NFC</span></p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-600 text-white rounded-lg flex items-center justify-center text-lg font-bold shrink-0">3</div>
                  <p className="text-xl text-slate-600">Xác thực và truy cập hệ thống</p>
                </div>
              </div>

              <div className="flex items-start gap-2 mt-4 p-3 bg-green-50 border border-green-100 rounded-lg w-full">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <p className="text-lg text-green-700">Dành cho người chưa có tài khoản VNyTe. Nhập CCCD hoặc quét NFC để sử dụng các dịch vụ.</p>
              </div>
            </div>
            )}

            {/* ── Column 3: Nhập mã — luồng Thanh toán (mã hồ sơ) hoặc Tái khám (mã hẹn khám) ── */}
            {(isPayment || isReception) && (
            <div className="bg-white border border-slate-200 shadow-lg rounded-2xl p-6 flex flex-col items-center">
              <div className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-100 text-amber-700 rounded-full text-lg font-semibold mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="6" width="18" height="12" rx="2" />
                  <path d="M7 10v4M10 10v4M13 10v4M16 10v4" />
                </svg>
                {isReception ? "Đã có mã hẹn khám" : "Đã có mã hồ sơ điều trị"}
              </div>

              <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-amber-200">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="6" width="18" height="12" rx="2" />
                  <path d="M7 10v4M10 10v4M13 10v4M16 10v4" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-slate-800 mb-1 text-center">
                {isReception ? "Nhập mã hẹn khám" : "Nhập mã hồ sơ"}
              </h2>
              <p className="text-xl text-slate-500 text-center mb-4">
                {isReception
                  ? "Nhập thủ công hoặc quét mã vạch trên giấy hẹn khám để tái khám nhanh"
                  : "Nhập thủ công hoặc quét mã vạch hồ sơ điều trị để thanh toán nhanh"}
              </p>

              <form
                className="w-full space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const code = treatmentCode.trim();
                  if (!code) return;
                  window.location.href = `${codeTarget}?code=${encodeURIComponent(code)}`;
                }}
              >
                <input
                  type="text"
                  autoFocus
                  value={treatmentCode}
                  onChange={(e) => setTreatmentCode(e.target.value)}
                  placeholder="Ví dụ: 000000910124"
                  className="w-full px-4 py-4 text-2xl font-mono border-2 border-amber-200 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 tabular-nums"
                  inputMode="numeric"
                />
                <button
                  type="submit"
                  disabled={!treatmentCode.trim()}
                  className="w-full px-8 py-6 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-2xl font-bold rounded-2xl hover:from-amber-600 hover:to-orange-700 transition-all duration-200 shadow-lg shadow-amber-200 hover:shadow-xl active:scale-[0.98] flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                    <path d="M13 6l6 6-6 6" />
                  </svg>
                  Tiếp tục
                </button>
              </form>

              <div className="w-full space-y-2 mt-5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-600 text-white rounded-lg flex items-center justify-center text-lg font-bold shrink-0">1</div>
                  <p className="text-lg text-slate-600">Nhập <span className="font-semibold text-slate-800">{isReception ? "mã hẹn khám" : "mã hồ sơ điều trị"}</span></p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-600 text-white rounded-lg flex items-center justify-center text-lg font-bold shrink-0">2</div>
                  <p className="text-lg text-slate-600">Hoặc <span className="font-semibold text-slate-800">quét barcode</span> {isReception ? "trên giấy hẹn" : "trên phiếu"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-600 text-white rounded-lg flex items-center justify-center text-lg font-bold shrink-0">3</div>
                  <p className="text-lg text-slate-600">{isReception ? "Xác nhận thông tin và tạo hồ sơ tái khám" : "Xác nhận số tiền và quét QR thanh toán"}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg w-full">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <p className="text-lg text-amber-700">{isReception ? "Nhanh nhất khi bạn đã có giấy hẹn khám với mã/barcode." : "Nhanh nhất khi bạn đã có phiếu điều trị với mã/barcode."}</p>
              </div>
            </div>
            )}

          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default function LoginQR() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-10 h-10 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin" /></div>}>
      <LoginQRInner />
    </Suspense>
  );
}   