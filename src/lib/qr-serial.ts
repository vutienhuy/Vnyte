// Đọc đầu đọc QR rời (mã phiếu khám) qua Web Serial API — KHÔNG cần native module.
// Đầu đọc nối USB COM (mặc định COM3 @ 9600, theo tài liệu AIoT). Electron main đã cấp
// quyền serial + tự chọn cổng (xem electron/main.js). Trên trình duyệt thường (test) cần thao
// tác click để cấp quyền (Web Serial yêu cầu user-gesture cho requestPort).
//
// Dùng:
//   - startQrAuto()           : mở cổng đã cấp quyền trước đó (gọi khi vào trang, không cần click).
//   - connectQrInteractive()  : cấp quyền + mở cổng — PHẢI gọi từ sự kiện click (dùng ở /setup).
//   - onQrScan(cb)            : đăng ký nhận mã mỗi lần quét xong (1 dòng, đã trim).

type ScanCb = (code: string) => void;
const listeners = new Set<ScanCb>();
let active = false;

export function hasWebSerial(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export function onQrScan(cb: ScanCb): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function emit(code: string) {
  const c = code.trim();
  if (c) listeners.forEach((l) => l(c));
}

function getBaud(): number {
  const b = typeof localStorage !== "undefined" ? parseInt(localStorage.getItem("qrSerialBaud") || "", 10) : NaN;
  return Number.isFinite(b) && b > 0 ? b : 9600;
}

// Vòng đọc liên tục: gom byte → tách dòng theo CR/LF → emit từng mã.
async function readFrom(port: SerialPortLike, baud: number) {
  if (active) return;
  active = true;
  try {
    await port.open({ baudRate: baud });
    const decoder = new TextDecoder();
    let buffer = "";
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    // Một số đầu đọc KHÔNG gửi ký tự xuống dòng cuối mã → flush sau ~200ms rảnh.
    const scheduleFlush = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (buffer.trim()) { emit(buffer); buffer = ""; }
      }, 200);
    };
    const reader = port.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.search(/[\r\n]/)) >= 0) {
          emit(buffer.slice(0, idx));
          buffer = buffer.slice(idx + 1);
        }
        scheduleFlush();
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      try { reader.releaseLock(); } catch { /* ignore */ }
    }
  } catch {
    // cổng lỗi/mất kết nối — bỏ qua, cho phép thử lại
  } finally {
    active = false;
  }
}

export async function startQrAuto(): Promise<boolean> {
  if (!hasWebSerial()) return false;
  try {
    const ports = await serial().getPorts();
    if (!ports || !ports.length) return false;
    void readFrom(ports[0], getBaud());
    return true;
  } catch {
    return false;
  }
}

export async function connectQrInteractive(): Promise<boolean> {
  if (!hasWebSerial()) throw new Error("Môi trường không hỗ trợ Web Serial (cần Electron/Chrome).");
  const port = await serial().requestPort();
  void readFrom(port, getBaud());
  return true;
}

// ── Web Serial types (tối giản, tránh phụ thuộc @types/w3c-web-serial) ──
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  readable: { getReader(): { read(): Promise<{ value?: Uint8Array; done: boolean }>; releaseLock(): void } };
}
interface SerialLike {
  getPorts(): Promise<SerialPortLike[]>;
  requestPort(): Promise<SerialPortLike>;
}
function serial(): SerialLike {
  return (navigator as unknown as { serial: SerialLike }).serial;
}
