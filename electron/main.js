// Electron main — wrap Next app (cleanatrubire) thành kiosk desktop.
//
// DEV:  chạy `npm run dev` (Next :3000) riêng, rồi `npm run electron:dev` → load http://localhost:3000.
// PROD: `npm run build` (Next standalone) → `npm run electron:build` (electron-builder) ra .exe.
//       Khi chạy app đóng gói: main spawn Next standalone server (qua Electron-as-node) trên cổng
//       nội bộ, set KIOSK_CONFIG_PATH = userData (để kiosk-config.json lưu hồ sơ máy), rồi load.
//
// Cấu hình kiosk: full-screen, chặn devtools/nav cho người dùng cuối (mở settings bằng phím tắt).

const { app, BrowserWindow, session, ipcMain, shell } = require("electron");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { spawn, execFile } = require("node:child_process");
const net = require("node:net");

// ── Ghi log ra file: %APPDATA%\VNyTe Kiosk\logs\kiosk-YYYYMMDD.log ──
// Bắt: Next server (stdout/stderr), console renderer, sự kiện in/kích hoạt/lỗi.
function logDir() { return path.join(app.getPath("userData"), "logs"); }
function currentLogFile() {
    const d = new Date();
    const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return path.join(logDir(), `kiosk-${day}.log`);
}
function logLine(msg) {
    try {
        fs.mkdirSync(logDir(), { recursive: true });
        const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
        fs.appendFileSync(currentLogFile(), `[${ts}] ${msg}\n`, "utf8");
    } catch { /* ignore */ }
    try { console.log(msg); } catch { /* ignore */ }
}

// Đường dẫn SumatraPDF (in PDF im lặng tới máy in nhiệt). Packaged: resources/bin; dev: electron/bin.
function sumatraPath() {
    return app.isPackaged
        ? path.join(process.resourcesPath, "bin", "SumatraPDF.exe")
        : path.join(__dirname, "bin", "SumatraPDF.exe");
}

const isDev = !app.isPackaged;
const DEV_URL = process.env.KIOSK_DEV_URL || "http://localhost:3000";
const PORT = Number(process.env.KIOSK_PORT || 38472); // cổng nội bộ cho Next standalone (prod)

let mainWindow = null;
let nextServer = null;

// ── Machine fingerprint ổn định (hostname + MAC) — 1 license = 1 máy ──
function machineFingerprint() {
    const nics = os.networkInterfaces();
    const macs = Object.values(nics)
        .flat()
        .filter((n) => n && !n.internal && n.mac && n.mac !== "00:00:00:00:00:00")
        .map((n) => n.mac)
        .sort();
    const seed = `${os.hostname()}|${os.platform()}|${os.arch()}|${macs[0] || ""}`;
    return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

// ── Spawn Next standalone server (chỉ prod) ──
function startNextServer() {
    return new Promise((resolve, reject) => {
        // electron-builder đặt standalone vào resources/standalone (xem electron-builder.yml)
        const serverJs = path.join(process.resourcesPath, "standalone", "server.js");
        nextServer = spawn(process.execPath, [serverJs], {
            env: {
                ...process.env,
                ELECTRON_RUN_AS_NODE: "1", // chạy Electron như Node để boot server.js
                NODE_ENV: "production",
                PORT: String(PORT),
                HOSTNAME: "127.0.0.1",
                // Cấu hình kiosk (deviceSecret sau activate) lưu trong userData
                KIOSK_CONFIG_PATH: path.join(app.getPath("userData"), "kiosk-config.json"),
            },
            stdio: ["ignore", "pipe", "pipe"], // capture stdout/stderr → ghi log file
        });
        nextServer.stdout?.on("data", (b) => logLine("[next] " + String(b).trimEnd()));
        nextServer.stderr?.on("data", (b) => logLine("[next:err] " + String(b).trimEnd()));
        nextServer.on("error", reject);
        waitForPort(PORT, 30000).then(resolve, reject);
    });
}

function waitForPort(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        const tryConnect = () => {
            const sock = net.connect(port, "127.0.0.1");
            sock.on("connect", () => { sock.end(); resolve(); });
            sock.on("error", () => {
                sock.destroy();
                if (Date.now() > deadline) reject(new Error("Next server không lên kịp"));
                else setTimeout(tryConnect, 400);
            });
        };
        tryConnect();
    });
}

async function createWindow() {
    const url = isDev ? DEV_URL : `http://127.0.0.1:${PORT}`;
    if (!isDev) await startNextServer();

    mainWindow = new BrowserWindow({
        kiosk: !isDev,            // full-screen kiosk ở prod
        fullscreen: !isDev,
        autoHideMenuBar: true,
        backgroundColor: "#0f172a",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            devTools: isDev,      // tắt devtools ở prod
        },
    });

    // Bắt console renderer (log đọc thẻ, verify, lỗi client…) vào file log.
    mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
        const src = sourceId ? sourceId.split("/").pop() : "";
        logLine(`[renderer${level >= 2 ? ":err" : ""}] ${message}${src ? ` (${src}:${line})` : ""}`);
    });

    // Chặn điều hướng ra ngoài app (kiosk an toàn)
    mainWindow.webContents.on("will-navigate", (e, target) => {
        if (!target.startsWith(url)) e.preventDefault();
    });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    await mainWindow.loadURL(url);

    // Phím tắt mở/đóng kiosk để kỹ thuật vào cấu hình (Ctrl+Shift+K → /setup)
    mainWindow.webContents.on("before-input-event", (e, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === "k") {
            mainWindow.loadURL(`${url}/setup`);
        }
        if (isDev && input.control && input.shift && input.key.toLowerCase() === "i") {
            mainWindow.webContents.toggleDevTools();
        }
    });
}

// ── IPC: cấp fingerprint máy cho renderer (/setup dùng) ──
ipcMain.handle("kiosk:get-fingerprint", () => machineFingerprint());

// ── IPC: danh sách máy in (Phase 5) ──
ipcMain.handle("kiosk:list-printers", async () => {
    if (!mainWindow) return [];
    return await mainWindow.webContents.getPrintersAsync();
});

// ── IPC: mở thư mục log cho kỹ thuật ──
ipcMain.handle("kiosk:open-logs", async () => {
    try { fs.mkdirSync(logDir(), { recursive: true }); await shell.openPath(logDir()); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e && e.message ? e.message : e) }; }
});

// ── Tìm Microsoft Edge ──
function findEdge() {
    const cands = [
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        path.join(process.env.LOCALAPPDATA || "", "Microsoft\\Edge\\Application\\msedge.exe"),
    ];
    for (const p of cands) { try { if (p && fs.existsSync(p)) return p; } catch { /* ignore */ } }
    return null;
}

// ── IPC: in im lặng phiếu HTML ──
// QUAN TRỌNG: máy in nhiệt W80 (driver MS800) CHỈ in đúng qua đường render của Chromium/Edge.
// webContents.print(silent) và SumatraPDF đều ra RÁC; chỉ Edge in HTML ra đẹp (đã kiểm chứng).
// → In bằng Edge "--kiosk-printing" (window.print() im lặng tới máy in mặc định). SumatraPDF làm
//   fallback cho máy KHÔNG có Edge.
ipcMain.handle("kiosk:print-html", async (_e, { html, deviceName }) => {
    const edge = findEdge();
    logLine(`[print] start deviceName=${deviceName || "(default)"} via=${edge ? "edge" : "sumatra"}`);

    if (edge) {
        // Chèn auto-print + ghi HTML ra file tạm để Edge mở bằng file://
        const printScript = "<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},300);});<\/script>";
        const out = html.includes("</body>") ? html.replace("</body>", printScript + "</body>") : html + printScript;
        const tmpHtml = path.join(os.tmpdir(), `vnyte-print-${Date.now()}.html`);
        fs.writeFileSync(tmpHtml, out, "utf8");
        let child = null;
        try {
            // --kiosk-printing in tới MÁY IN MẶC ĐỊNH → đặt máy in đã chọn làm mặc định trước.
            if (deviceName) {
                await new Promise((res) => execFile("rundll32", ["printui.dll,PrintUIEntry", "/y", "/n", deviceName], () => res()));
            }
            const profileDir = path.join(os.tmpdir(), "vnyte-edge-print");
            const args = [
                "--kiosk-printing", "--no-first-run", "--no-default-browser-check",
                "--disable-extensions", "--disable-sync", "--disable-background-networking",
                `--user-data-dir=${profileDir}`, "--new-window",
                "--window-position=-32000,-32000", "--window-size=420,1400",
                `file:///${tmpHtml.replace(/\\/g, "/")}`,
            ];
            child = spawn(edge, args, { windowsHide: true });
            await new Promise((r) => setTimeout(r, 7000)); // chờ Edge load + spool job in
            logLine("[print] edge OK");
            return { ok: true };
        } catch (err) {
            logLine("[print:err] edge " + String(err && err.message ? err.message : err));
            return { ok: false, error: String(err && err.message ? err.message : err) };
        } finally {
            // Tắt instance Edge tạm (offscreen) để không tích tụ.
            if (child && child.pid) { try { execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], () => {}); } catch { /* ignore */ } }
            setTimeout(() => { try { fs.unlinkSync(tmpHtml); } catch { /* ignore */ } }, 12000);
        }
    }

    // ── Fallback (không có Edge): printToPDF → SumatraPDF ──
    const win = new BrowserWindow({ show: false, width: 320, height: 1200, webPreferences: { offscreen: false } });
    let pdfPath = "";
    try {
        await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
        await new Promise((r) => setTimeout(r, 250));
        let heightPx = 600;
        try {
            heightPx = await win.webContents.executeJavaScript(
                "Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))",
            );
        } catch { /* fallback 600 */ }
        const pdf = await win.webContents.printToPDF({
            printBackground: true,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            pageSize: { width: 80000, height: Math.max(40000, Math.round((heightPx + 16) * 264.5833)) },
        });
        pdfPath = path.join(os.tmpdir(), `vnyte-print-${Date.now()}.pdf`);
        fs.writeFileSync(pdfPath, pdf);
        const args = deviceName
            ? ["-print-to", deviceName, "-silent", "-print-settings", "noscale", pdfPath]
            : ["-print-to-default", "-silent", "-print-settings", "noscale", pdfPath];
        await new Promise((resolve, reject) => execFile(sumatraPath(), args, (err) => (err ? reject(err) : resolve())));
        logLine("[print] sumatra OK");
        return { ok: true };
    } catch (err) {
        logLine("[print:err] sumatra " + String(err && err.message ? err.message : err));
        return { ok: false, error: String(err && err.message ? err.message : err) };
    } finally {
        try { win.destroy(); } catch { /* ignore */ }
        if (pdfPath) setTimeout(() => { try { fs.unlinkSync(pdfPath); } catch { /* ignore */ } }, 8000);
    }
});

// Cổng COM ưu tiên cho đầu đọc QR (mã phiếu khám). Có thể override bằng env KIOSK_QR_COM.
const QR_COM = (process.env.KIOSK_QR_COM || "").toUpperCase();

// ── Single-instance: chặn mở 2 bản → tránh EADDRINUSE cổng 38472 ──
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    app.quit();
}
app.on("second-instance", () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

if (gotSingleInstanceLock) app.whenReady().then(() => {
    logLine(`=== VNyTe Kiosk start v${app.getVersion()} | ${os.hostname()} | ${new Date().toString()} ===`);
    const ses = session.defaultSession;
    // Cho phép camera + Web Serial (đầu đọc QR COM) — kiosk tin cậy
    ses.setPermissionRequestHandler((_wc, permission, cb) => {
        cb(permission === "media" || permission === "fullscreen" || permission === "serial");
    });
    ses.setPermissionCheckHandler((_wc, permission) =>
        permission === "media" || permission === "fullscreen" || permission === "serial",
    );
    // Tự chọn cổng serial cho đầu đọc QR (không hiện hộp chọn ở kiosk).
    // Ưu tiên KIOSK_QR_COM, sau đó cổng COM bất kỳ.
    ses.on("select-serial-port", (event, portList, _wc, callback) => {
        event.preventDefault();
        const pick =
            (QR_COM && portList.find((p) => (p.portName || "").toUpperCase() === QR_COM)) ||
            portList.find((p) => /COM/i.test(p.portName || "")) ||
            portList[0];
        callback(pick ? pick.portId : "");
    });
    // Cho phép truy cập thiết bị serial đã cấp quyền (persist qua các lần mở app).
    ses.setDevicePermissionHandler((details) => details.deviceType === "serial");
    createWindow();
});

app.on("window-all-closed", () => {
    if (nextServer) try { nextServer.kill(); } catch { /* ignore */ }
    if (process.platform !== "darwin") app.quit();
});
