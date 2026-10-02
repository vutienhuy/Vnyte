// In phiếu: trong Electron dùng silent-print qua window.kiosk (chọn máy in đã cấu hình);
// trên web thường fallback mở cửa sổ in. Giữ localhost:7000 cho đầu đọc CCCD (verifyNFC) như cũ.

interface KioskBridge {
    printHtml?: (html: string, deviceName?: string) => Promise<{ ok: boolean; error?: string }>;
    listPrinters?: () => Promise<Array<{ name: string; displayName?: string; isDefault?: boolean }>>;
    openLogs?: () => Promise<{ ok: boolean; error?: string }>;
    isElectron?: boolean;
}

function bridge(): KioskBridge | undefined {
    if (typeof window === "undefined") return undefined;
    return (window as unknown as { kiosk?: KioskBridge }).kiosk;
}

export function isElectron(): boolean {
    return !!bridge()?.isElectron;
}

export async function listPrinters() {
    const b = bridge();
    if (b?.listPrinters) return b.listPrinters();
    return [];
}

export async function openLogs() {
    const b = bridge();
    if (b?.openLogs) return b.openLogs();
    return { ok: false, error: "Chỉ khả dụng trong app kiosk" };
}

/** In HTML. Electron: in im lặng tới máy in đã chọn (localStorage 'kioskPrinter'). Web: mở cửa sổ in. */
export async function printHtml(html: string): Promise<void> {
    const b = bridge();
    if (b?.printHtml) {
        const printer = (typeof localStorage !== "undefined" && localStorage.getItem("kioskPrinter")) || "";
        const r = await b.printHtml(html, printer);
        if (!r?.ok) throw new Error(r?.error || "In thất bại");
        return;
    }
    // Web fallback
    const win = window.open("", "_blank");
    if (!win) throw new Error("Không mở được cửa sổ in (popup bị chặn?)");
    win.document.write(html);
    win.document.close();
}
