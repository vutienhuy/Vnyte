// Đọc CCCD từ đầu đọc — CONFIG-DRIVEN để 1 bản build chạy nhiều loại kiosk.
//
//   • type = "aiot" (mặc định): đầu đọc AIoT/HANEL — Socket.IO server (NodeServer/server.js).
//        Kết nối ws tới url (mặc định http://localhost:8000), nghe event "/event".
//        id=1 new card • id=2 data CCCD • id=4 img_data (ảnh) • id=5 chip auth • id=8 removed.
//   • type = "http" : đầu đọc kiểu 2ID.Deck — HTTP GET (mặc định http://localhost:7000/api/v1/verify?nfc=true).
//
// Cả hai trả về CÙNG shape { result: { data: {...} } } để chỗ gọi (patient-check) khỏi đổi logic.
// Cấu hình lưu ở localStorage (đặt trong /setup): nfcReaderType, nfcReaderUrl.

import { io, type Socket } from "socket.io-client";

export interface NfcCardData {
  identifyNumber?: string;   // số CCCD
  name?: string;             // họ tên
  dateOfBirth?: string;      // dd/MM/yyyy (AIoT) hoặc theo agent
  gender?: string;
  nationality?: string;      // quốc tịch
  nation?: string;           // dân tộc
  address?: string;          // nơi cư trú (một số đầu đọc để trống)
  hometown?: string;         // nơi đăng ký khai sinh/quê quán — fallback khi address rỗng
  issueDate?: string;
  expiryDate?: string;
  img_data?: string;         // ảnh chân dung base64 (nếu có)
  raw?: unknown;
}
export interface NfcResult { result: { data: NfcCardData }; }

export type NfcReaderType = "aiot" | "http";

export function getReaderConfig(): { type: NfcReaderType; url: string } {
  const ls = typeof localStorage !== "undefined" ? localStorage : null;
  const type = (ls?.getItem("nfcReaderType") as NfcReaderType) || "aiot";
  const url =
    ls?.getItem("nfcReaderUrl") ||
    (type === "http" ? "http://localhost:7000/api/v1/verify?nfc=true" : "http://localhost:8000");
  return { type, url };
}

export interface ReadOpts { timeoutMs?: number; signal?: AbortSignal; }

/** Đọc 1 thẻ CCCD. Resolve khi có dữ liệu, reject khi timeout/huỷ/không kết nối được đầu đọc. */
export function readCccd(opts: ReadOpts = {}): Promise<NfcResult> {
  const cfg = getReaderConfig();
  return cfg.type === "http" ? readHttp(cfg.url, opts) : readAiotSocket(cfg.url, opts);
}

// ── AIoT/HANEL: Socket.IO ──
function readAiotSocket(url: string, opts: ReadOpts): Promise<NfcResult> {
  const timeoutMs = opts.timeoutMs ?? 30000;
  return new Promise<NfcResult>((resolve, reject) => {
    let socket: Socket | null = null;
    let photo = "";
    let done = false;
    let lastFail = "";   // id=3 message gần nhất (vd "Failed scan NFC!") để báo khi timeout

    const cleanup = () => {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      try { socket?.off("/event", onEvent); socket?.close(); } catch { /* ignore */ }
    };
    const finishOk = (r: NfcResult) => { if (done) return; done = true; cleanup(); resolve(r); };
    const finishErr = (e: Error) => { if (done) return; done = true; cleanup(); reject(e); };

    const onEvent = (data: unknown) => {
      const ev = data as { id?: number; data?: Record<string, unknown>; message?: string };
      if (!ev || typeof ev !== "object") return;
      // id=3: quét thất bại (có thể chỉ là QR fail rồi thử NFC) → ghi lại, KHÔNG reject ngay
      if (ev.id === 3 && ev.message) lastFail = String(ev.message);
      // ảnh chân dung có thể tới ngay sau data — giữ lại nếu xuất hiện trước khi resolve
      if (ev.id === 4 && ev.data?.img_data) photo = String(ev.data.img_data);
      if (ev.id === 2 && ev.data && (ev.data.idCode || ev.data.personName)) {
        const d = ev.data as Record<string, string>;
        finishOk({ result: { data: {
          identifyNumber: d.idCode,
          name: d.personName,
          dateOfBirth: d.dateOfBirth,
          gender: d.gender,
          nationality: d.nationality,
          nation: d.race,
          address: d.residencePlace || d.originPlace,
          issueDate: d.issueDate,
          expiryDate: d.expiryDate,
          img_data: photo || undefined,
          raw: d,
        } } });
      }
    };
    const onAbort = () => finishErr(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(
      () => finishErr(new Error(
        lastFail
          ? `Đọc thẻ thất bại: ${lastFail}. Vui lòng đặt lại thẻ đúng chiều.`
          : "Hết thời gian chờ đọc thẻ — vui lòng đặt lại thẻ CCCD.",
      )),
      timeoutMs,
    );

    try {
      if (opts.signal?.aborted) return onAbort();
      opts.signal?.addEventListener("abort", onAbort);
      socket = io(url, { transports: ["websocket", "polling"], reconnectionAttempts: 3, timeout: 5000 });
      socket.on("/event", onEvent);
      socket.on("connect_error", (e: Error) =>
        finishErr(new Error(`Không kết nối được đầu đọc (${url}). Kiểm tra dịch vụ AIoT đang chạy. (${e.message})`)),
      );
    } catch (e) {
      finishErr(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

// ── 2ID kiểu cũ: HTTP GET ──

/** Lấy giá trị chuỗi không rỗng đầu tiên trong các tên trường đồng nghĩa. */
function pick(src: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

/**
 * Chuẩn hoá response của agent 2ID về [NfcCardData].
 *
 * Trước đây chỗ này ép kiểu thẳng `as NfcResult`, tức là TIN agent trả đúng tên
 * trường mình mong đợi. Nhánh AIoT ngay trên có map tên trường tử tế
 * (residencePlace → address...), nhánh này thì không — lệch một tên trường là
 * `address` rỗng, kéo theo bỏ qua toàn bộ việc khớp tỉnh/xã mà KHÔNG báo lỗi gì.
 *
 * Hàm này thuần bổ sung: tên trường nào agent đã trả đúng thì giữ nguyên, thiếu
 * mới dò sang các tên đồng nghĩa. Agent đang chạy đúng thì kết quả không đổi.
 */
function normalizeHttpCard(json: unknown): NfcResult {
  const asObj = (v: unknown): Record<string, unknown> | undefined =>
    v !== null && typeof v === "object" ? (v as Record<string, unknown>) : undefined;

  const root = asObj(json) ?? {};
  // Chấp nhận cả 3 dạng bọc: {result:{data}}, {data}, hoặc object phẳng.
  const d: Record<string, unknown> =
    asObj(asObj(root.result)?.data) ?? asObj(root.data) ?? root;

  return {
    result: {
      data: {
        identifyNumber: pick(d, "identifyNumber", "idCode", "idNumber", "citizenId", "personalId", "soCccd", "cccd"),
        name: pick(d, "name", "personName", "fullName", "hoTen"),
        dateOfBirth: pick(d, "dateOfBirth", "dob", "birthDate", "ngaySinh"),
        gender: pick(d, "gender", "sex", "gioiTinh"),
        nationality: pick(d, "nationality", "national", "quocTich"),
        nation: pick(d, "nation", "race", "ethnic", "ethnicity", "danToc"),
        // Nơi cư trú: thứ tự ưu tiên giống hệt nhánh AIoT.
        address: pick(d, "address", "residencePlace", "permanentAddress", "placeOfResidence", "noiThuongTru", "diaChi"),
        // Quê quán — patient-check dùng làm fallback khi address rỗng.
        hometown: pick(d, "hometown", "originPlace", "placeOfOrigin", "queQuan"),
        issueDate: pick(d, "issueDate", "dateOfIssue", "ngayCap"),
        expiryDate: pick(d, "expiryDate", "dateOfExpiry", "ngayHetHan"),
        img_data: pick(d, "img_data", "image", "photo", "portrait", "avatar"),
        raw: d,
      },
    },
  };
}

async function readHttp(url: string, opts: ReadOpts): Promise<NfcResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30000);
  opts.signal?.addEventListener("abort", () => ctrl.abort());
  try {
    const res = await fetch(url, { method: "GET", signal: ctrl.signal });
    if (!res.ok) throw new Error("Không đọc được dữ liệu từ thẻ CCCD");
    const normalized = normalizeHttpCard(await res.json());
    // Không có cả số thẻ lẫn họ tên = agent trả shape lạ hẳn. Báo ra thay vì
    // trả object rỗng rồi để màn hình đứng im không hiểu vì sao.
    const d = normalized.result.data;
    if (!d.identifyNumber && !d.name) {
      throw new Error("Đầu đọc trả dữ liệu không đúng định dạng — vui lòng kiểm tra lại dịch vụ 2ID.");
    }
    return normalized;
  } finally {
    clearTimeout(timer);
  }
}
