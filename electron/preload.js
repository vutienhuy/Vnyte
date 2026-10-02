// Preload — cầu nối an toàn renderer ↔ main (contextIsolation).
// Web nhận biết đang chạy trong Electron qua window.kiosk.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kiosk", {
    isElectron: true,
    // Fingerprint máy thật (1 license = 1 máy) — /setup ưu tiên dùng cái này.
    getFingerprint: () => ipcRenderer.invoke("kiosk:get-fingerprint"),
    // Phase 5 — ngoại vi
    listPrinters: () => ipcRenderer.invoke("kiosk:list-printers"),
    // In im lặng: render HTML ở cửa sổ ẩn rồi in tới deviceName (rỗng = máy in mặc định).
    printHtml: (html, deviceName) => ipcRenderer.invoke("kiosk:print-html", { html, deviceName }),
    // Mở thư mục log (kỹ thuật lấy log debug).
    openLogs: () => ipcRenderer.invoke("kiosk:open-logs"),
});
