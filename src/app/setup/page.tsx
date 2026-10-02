"use client";

// Màn cấu hình/kích hoạt kiosk. Nhập license key (từ Admin Portal) → activate →
// lưu cấu hình thiết bị (gateway-proxy dùng) → mở khoá app.
// Phase 3 (web standalone): fingerprint sinh + lưu localStorage. Electron (Phase 4)
// sẽ thay bằng fingerprint máy thật + lưu cấu hình mã hoá (DPAPI).

import { useEffect, useState } from "react";
import Link from "next/link";
import { isElectron, listPrinters, printHtml, openLogs } from "@/lib/kiosk-print";
import { readCccd, getReaderConfig, type NfcReaderType } from "@/lib/nfc-reader";
import { connectQrInteractive, onQrScan, hasWebSerial } from "@/lib/qr-serial";

const DEFAULT_GATEWAY = "https://vntgw.onelink.vn";

// Electron cung cấp fingerprint máy thật qua window.kiosk; web standalone fallback localStorage.
interface KioskBridge { getFingerprint?: () => Promise<string> }
async function getFingerprint(): Promise<string> {
  const bridge = (window as unknown as { kiosk?: KioskBridge }).kiosk;
  if (bridge?.getFingerprint) {
    try { const fp = await bridge.getFingerprint(); if (fp) return fp; } catch { /* fallback */ }
  }
  let fp = localStorage.getItem("kioskFingerprint");
  if (!fp) {
    fp = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `web-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    localStorage.setItem("kioskFingerprint", fp);
  }
  return fp;
}

interface Status {
  activated: boolean;
  revoked?: boolean;
  hospitalCode?: string | null;
  deviceCode?: string | null;
  gatewayUrl?: string | null;
  activatedAt?: string | null;
}

export default function SetupPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [licenseKey, setLicenseKey] = useState("");
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Máy in (chỉ trong Electron)
  const [printers, setPrinters] = useState<Array<{ name: string; displayName?: string }>>([]);
  const [printer, setPrinter] = useState<string>("");

  // Đầu đọc CCCD (config-driven: aiot = Socket.IO AIoT/HANEL, http = 2ID)
  const [nfcType, setNfcType] = useState<NfcReaderType>("aiot");
  const [nfcUrl, setNfcUrl] = useState<string>("");
  const [nfcTesting, setNfcTesting] = useState(false);
  const [nfcMsg, setNfcMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onSaveReader = (type: NfcReaderType, url: string) => {
    setNfcType(type); setNfcUrl(url);
    localStorage.setItem("nfcReaderType", type);
    localStorage.setItem("nfcReaderUrl", url);
  };

  const testReader = async () => {
    setNfcTesting(true); setNfcMsg(null);
    try {
      const r = await readCccd({ timeoutMs: 20000 });
      const d = r?.result?.data;
      if (d?.identifyNumber || d?.name) {
        setNfcMsg({ ok: true, text: `✅ Đọc OK: ${d.name || ""} — ${d.identifyNumber || ""} (${d.dateOfBirth || ""})` });
      } else {
        setNfcMsg({ ok: false, text: "Kết nối được nhưng chưa lấy được dữ liệu thẻ." });
      }
    } catch (e) {
      setNfcMsg({ ok: false, text: "❌ " + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setNfcTesting(false);
    }
  };

  // Đầu đọc QR rời (COM serial) — mã phiếu khám
  const [qrBaud, setQrBaud] = useState<string>("9600");
  const [qrMsg, setQrMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [qrTestVal, setQrTestVal] = useState<string>("");

  useEffect(() => {
    setQrBaud(localStorage.getItem("qrSerialBaud") || "9600");
    // Hiển thị mã mỗi khi quét được (sau khi đã kết nối)
    const off = onQrScan((code) => setQrMsg({ ok: true, text: `🔖 Quét được mã: ${code}` }));
    return off;
  }, []);

  const onSaveBaud = (v: string) => {
    setQrBaud(v);
    if (v.trim()) localStorage.setItem("qrSerialBaud", v.trim());
  };

  const connectQr = async () => {
    setQrMsg(null);
    try {
      await connectQrInteractive();
      setQrMsg({ ok: true, text: "✅ Đã kết nối đầu đọc QR. Hãy quét thử 1 mã phiếu." });
    } catch (e) {
      setQrMsg({ ok: false, text: "❌ " + (e instanceof Error ? e.message : String(e)) });
    }
  };

  const testPrinter = async () => {
    try {
      await printHtml(`<html><body style="font-family:Arial;width:80mm;padding:4mm"><h3 style="text-align:center">PHIẾU TEST</h3><p>Kiosk in thử 80mm.</p><p>${new Date().toLocaleString("vi-VN")}</p></body></html>`);
      setNfcMsg({ ok: true, text: "✅ Đã gửi lệnh in thử. Kiểm tra máy in nhiệt." });
    } catch (e) {
      setNfcMsg({ ok: false, text: "❌ In lỗi: " + (e instanceof Error ? e.message : String(e)) });
    }
  };

  // Cổng PIN: khi kiosk ĐÃ kích hoạt, vào lại /setup để cấu hình lại phải nhập PIN kỹ thuật.
  const [pinVerified, setPinVerified] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const needPin = !!status?.activated && !pinVerified;

  const handleVerifyPin = async () => {
    setPinError("");
    try {
      const r = await fetch("/api/kiosk/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const j = await r.json();
      if (j.ok) setPinVerified(true);
      else setPinError("PIN không đúng");
    } catch {
      setPinError("Lỗi kiểm tra PIN");
    }
  };

  const loadStatus = () => {
    fetch("/api/kiosk/config-status")
      .then((r) => r.json())
      .then((s: Status) => {
        setStatus(s);
        if (s.gatewayUrl) setGatewayUrl(s.gatewayUrl);
      })
      .catch(() => {});
  };

  useEffect(loadStatus, []);

  // Nạp danh sách máy in (Electron)
  useEffect(() => {
    if (!isElectron()) return;
    setPrinter(localStorage.getItem("kioskPrinter") || "");
    listPrinters().then((ps) => setPrinters(ps || [])).catch(() => {});
  }, []);

  // Nạp cấu hình đầu đọc CCCD
  useEffect(() => {
    const c = getReaderConfig();
    setNfcType(c.type);
    setNfcUrl(c.url);
  }, []);

  const onPickPrinter = (name: string) => {
    setPrinter(name);
    localStorage.setItem("kioskPrinter", name);
  };

  const refreshPrinters = () => {
    listPrinters().then((ps) => setPrinters(ps || [])).catch(() => {});
  };

  const handleActivate = async () => {
    const key = licenseKey.trim().toUpperCase();
    if (!key) { setError("Vui lòng nhập license key"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/kiosk/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: key, fingerprint: await getFingerprint(), gatewayUrl: gatewayUrl.trim() }),
      });
      const text = await res.text();
      let json: { error?: string } | null = null;
      try { json = JSON.parse(text); } catch { /* non-JSON */ }
      if (!res.ok) {
        setError((json?.error || `Kích hoạt thất bại [HTTP ${res.status}]`) + (json ? "" : ` — ${text.slice(0, 200)}`));
        return;
      }
      setDone(true);
      loadStatus();
      // Tự về trang chủ sau 1.5s
      setTimeout(() => { window.location.href = "/"; }, 1500);
    } catch (e) {
      setError("Lỗi gọi kích hoạt: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Trở lại + mở thư mục log */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            onClick={() => { window.location.href = "/"; }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-lg font-medium hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            Về màn hình chức năng
          </button>
          {isElectron() && (
            <button
              onClick={() => openLogs()}
              className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 text-base font-medium hover:bg-slate-50 transition"
            >
              📁 Mở thư mục log
            </button>
          )}
        </div>
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-200">
            <svg className="w-11 h-11 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Kích hoạt Kiosk</h1>
          <p className="text-lg text-slate-500 mt-1">Nhập license key được cấp để kích hoạt thiết bị</p>
        </div>

        {/* Cổng PIN khi cấu hình lại kiosk đã kích hoạt */}
        {needPin && (
          <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6 space-y-4">
            <div className="text-center">
              <p className="text-xl font-semibold text-slate-700">Kiosk đã kích hoạt</p>
              <p className="text-base text-slate-500 mt-1">Nhập PIN kỹ thuật để cấu hình lại thiết bị.</p>
            </div>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleVerifyPin(); }}
              placeholder="• • • • • •"
              className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-3xl text-center tracking-[0.3em] text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            {pinError && <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-xl text-center text-base">{pinError}</div>}
            <button onClick={handleVerifyPin} disabled={!pin} className="w-full py-3.5 bg-blue-700 text-white rounded-2xl font-bold text-xl hover:bg-blue-800 active:scale-[0.98] disabled:opacity-50 transition-all cursor-pointer">Mở cấu hình</button>
            <Link href="/" className="block text-center text-base text-slate-400 hover:text-slate-600">Về trang chủ</Link>
          </div>
        )}

        {!needPin && (<>
        {/* License bị thu hồi trên Admin → thiết bị đã bị khoá */}
        {status?.revoked && (
          <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-2xl">
            <div className="flex items-center gap-2 text-red-700 font-semibold text-lg mb-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              Thiết bị đã bị thu hồi
            </div>
            <p className="text-base text-slate-600">License của thiết bị này đã bị thu hồi trên hệ thống quản trị. Kiosk đã ngừng hoạt động. Vui lòng liên hệ quản trị để được cấp key mới rồi kích hoạt lại.</p>
          </div>
        )}

        {/* Trạng thái hiện tại */}
        {status?.activated && (
          <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-2xl">
            <div className="flex items-center gap-2 text-green-700 font-semibold text-lg mb-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Đã kích hoạt
            </div>
            <p className="text-base text-slate-600">Bệnh viện: <b>{status.hospitalCode}</b> · Thiết bị: <b>{status.deviceCode}</b></p>
            <p className="text-base text-slate-500">Gateway: {status.gatewayUrl}</p>
            <p className="text-sm text-slate-400 mt-1">Nhập key mới bên dưới để cấu hình lại.</p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6 space-y-4">
          <div>
            <label className="block text-lg font-medium text-slate-600 mb-1">License key <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
              placeholder="VD: A1B2-C3D4-E5F6-G7H8"
              className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-2xl font-mono tracking-wider text-slate-800 placeholder:text-slate-300 placeholder:font-sans placeholder:text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-lg font-medium text-slate-600 mb-1">Gateway URL</label>
            <input
              type="text"
              value={gatewayUrl}
              onChange={(e) => setGatewayUrl(e.target.value)}
              placeholder={DEFAULT_GATEWAY}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-lg text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition"
            />
            <p className="text-sm text-slate-400 mt-1">Để mặc định, hoặc nhập URL LAN nếu triển khai nội bộ.</p>
          </div>

          {/* Máy in — luôn hiện; chọn từ danh sách HOẶC nhập tay tên (vd W80) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-lg font-medium text-slate-600">Máy in phiếu</label>
              <button type="button" onClick={refreshPrinters} className="text-base text-blue-600 hover:underline">↻ Làm mới</button>
            </div>
            {printers.length > 0 && (
              <select
                value={printers.some((p) => p.name === printer) ? printer : ""}
                onChange={(e) => onPickPrinter(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-lg text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition mb-2"
              >
                <option value="">— Chọn từ danh sách ({printers.length}) —</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
                ))}
              </select>
            )}
            <input
              value={printer}
              onChange={(e) => onPickPrinter(e.target.value)}
              placeholder="Hoặc nhập tên máy in (vd: W80)"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-lg text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition"
            />
            <p className="text-sm text-slate-400 mt-1">
              {printers.length > 0 ? "Chọn trong danh sách hoặc gõ tên máy in nhiệt (vd W80)." : "Chưa dò được máy in — gõ đúng tên driver (vd W80) rồi In thử."}
            </p>
            <button type="button" onClick={testPrinter} className="mt-2 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-base font-medium hover:bg-slate-200 transition">🖨️ In thử</button>
          </div>

          {/* Đầu đọc CCCD */}
          <div>
            <label className="block text-lg font-medium text-slate-600 mb-1">Đầu đọc CCCD</label>
            <div className="flex gap-2">
              <select
                value={nfcType}
                onChange={(e) => onSaveReader(e.target.value as NfcReaderType, e.target.value === "http" ? "http://localhost:7000/api/v1/verify?nfc=true" : "http://localhost:8000")}
                className="border border-slate-200 rounded-xl px-4 py-3 text-lg text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="aiot">AIoT / HANEL (Socket.IO)</option>
                <option value="http">2ID (HTTP)</option>
              </select>
              <input
                value={nfcUrl}
                onChange={(e) => onSaveReader(nfcType, e.target.value)}
                className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="URL đầu đọc"
              />
            </div>
            <button type="button" onClick={testReader} disabled={nfcTesting} className="mt-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-base font-medium hover:bg-blue-700 disabled:opacity-60 transition">
              {nfcTesting ? "Đang chờ thẻ…" : "🪪 Test đọc thẻ — đặt thẻ rồi bấm"}
            </button>
            <p className="text-sm text-slate-400 mt-1">AIoT/HANEL: Socket.IO (mặc định :8000). 2ID: HTTP (:7000).</p>
          </div>

          {nfcMsg && (
            <div className={`p-3 rounded-xl text-base text-center font-medium ${nfcMsg.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
              {nfcMsg.text}
            </div>
          )}

          {/* Đầu đọc QR (mã phiếu khám) — KHUYẾN NGHỊ chế độ Keyboard */}
          <div>
            <label className="block text-lg font-medium text-slate-600 mb-1">Đầu đọc QR (mã phiếu khám)</label>
            <p className="text-base text-slate-500 mb-2">
              Khuyến nghị để đầu đọc ở <b>chế độ Keyboard</b> (giả lập bàn phím, có Enter cuối) — <b>không cần cấu hình</b>. Bấm vào ô dưới rồi quét thử 1 mã:
            </p>
            <input
              value={qrTestVal}
              onChange={(e) => setQrTestVal(e.target.value)}
              placeholder="Đặt con trỏ vào đây rồi quét QR mã phiếu…"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-lg text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition"
            />
            {qrTestVal && <p className="text-base text-green-700 mt-1 font-medium">✅ Đầu đọc keyboard OK — đã nhập: {qrTestVal}</p>}

            {/* Tùy chọn: chế độ COM serial (chỉ khi không dùng keyboard) */}
            <details className="mt-2">
              <summary className="text-sm text-slate-400 cursor-pointer">Đầu đọc ở chế độ COM serial? Bấm để cấu hình</summary>
              <div className="flex gap-2 items-center mt-2">
                <input
                  value={qrBaud}
                  onChange={(e) => onSaveBaud(e.target.value)}
                  inputMode="numeric"
                  className="w-28 border border-slate-200 rounded-xl px-3 py-2 text-base text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Baud 9600"
                />
                <button type="button" onClick={connectQr} disabled={!hasWebSerial()} className="px-4 py-2 rounded-xl bg-slate-600 text-white text-base font-medium hover:bg-slate-700 disabled:opacity-60 transition">
                  🔌 Kết nối cổng COM
                </button>
              </div>
              <p className="text-sm text-slate-400 mt-1">Chỉ dùng khi đầu đọc chạy COM serial (vd COM3). Chế độ keyboard thì bỏ qua mục này.</p>
            </details>
          </div>

          {qrMsg && (
            <div className={`p-3 rounded-xl text-base text-center font-medium ${qrMsg.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
              {qrMsg.text}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-base text-center font-medium">{error}</div>
          )}
          {done && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-base text-center font-medium">
              Kích hoạt thành công! Đang chuyển về trang chủ...
            </div>
          )}

          <button
            onClick={handleActivate}
            disabled={loading || !licenseKey.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-blue-700 text-white rounded-2xl font-bold text-xl shadow-lg shadow-blue-200 hover:bg-blue-800 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <><span className="w-6 h-6 border-4 border-blue-200 border-t-white rounded-full animate-spin" /> Đang kích hoạt...</>
            ) : (
              <>
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Kích hoạt
              </>
            )}
          </button>
        </div>

        <p className="text-center text-sm text-slate-400 mt-4">
          Mỗi license key chỉ kích hoạt được 1 máy. Liên hệ quản trị để được cấp key.
        </p>
        </>)}
      </div>
    </div>
  );
}
