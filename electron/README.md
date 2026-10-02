# VNyTe Kiosk — Electron

Đóng gói web `cleanatrubire` (Next.js) thành app kiosk desktop Windows (.exe), kèm
kích hoạt license + cấu hình thiết bị + in phiếu.

## Kiến trúc
- **Main** (`electron/main.js`): tạo cửa sổ kiosk full-screen; prod thì spawn Next standalone
  server (chạy Electron-as-node) trên cổng nội bộ; cấp **fingerprint máy** + danh sách **máy in** + **in im lặng** qua IPC.
- **Preload** (`electron/preload.js`): expose `window.kiosk` (getFingerprint / listPrinters / printHtml).
- **Web**: `/setup` nhập license key → `/api/kiosk/activate` → lưu `kiosk-config.json`
  (ở `userData` khi đóng gói, qua env `KIOSK_CONFIG_PATH`) → gateway-proxy đọc deviceSecret từ đó.
- **Đầu đọc CCCD**: vẫn qua service `http://localhost:7000` như cũ (verifyNFC). Máy in/camera qua Electron.

## Yêu cầu
Đã thêm vào `package.json`: `electron`, `electron-builder` (devDeps), `main: electron/main.js`,
scripts `electron:dev` / `electron:build`, cấu hình `electron-builder.yml` (target NSIS .exe).

> ⚠️ `npm install` sẽ tải binary Electron (~100MB) ở postinstall — cần MÁY CÓ MẠNG ra npm registry.
> (Môi trường sandbox build scaffold KHÔNG cài/chạy được Electron — phải làm trên máy bạn/CI.)

## Dev
```bash
npm install                 # cài deps (gồm electron)
npm run dev                 # terminal 1: Next dev :3000
npm run electron:dev        # terminal 2: mở cửa sổ Electron load http://localhost:3000
```
- Phím tắt: **Ctrl+Shift+K** → mở `/setup`; **Ctrl+Shift+I** (dev) → devtools.

## Build .exe
```bash
npm run electron:build
# = next build (output standalone) → scripts/prepare-standalone.js (copy static+public)
#   → electron-builder (đóng gói NSIS) → dist-electron/*.exe
```
Giao file `dist-electron/VNyTe Kiosk Setup x.y.z.exe` cho đội triển khai.

## Luồng triển khai
1. Cài `.exe` lên máy kiosk.
2. App mở → chưa kích hoạt → tự vào `/setup`.
3. Nhập **license key** (admin cấp từ Admin Portal) → kích hoạt → app nhận cấu hình thiết bị → chạy.
4. Mỗi key chỉ 1 máy (bind theo fingerprint máy thật).

## TODO khi test trên thiết bị thật
- **In im lặng**: HTML phiếu hiện có script tự gọi `window.print()` (cho web). Khi in qua Electron
  (`webContents.print` silent) nên BỎ auto-print trong HTML để tránh in 2 lần / hiện hộp thoại
  — tinh chỉnh trong `buildReceptionTicketHtml` / `buildPrintHtml` lúc test máy in nhiệt.
- **Mã hoá at-rest cấu hình máy**: hiện `kiosk-config.json` lưu plain trong `userData` (được bảo vệ
  bởi tài khoản Windows). Nâng cấp: dùng `safeStorage` (DPAPI) bọc deviceSecret — main giải mã rồi
  truyền cho Next qua env thay vì để Next đọc file.
- **Auto-update**: chưa làm (theo yêu cầu). Khi cần: thêm `electron-updater` + nơi host bản phát hành.
- **Icon**: đặt `build/icon.ico` rồi bỏ comment dòng `icon` trong `electron-builder.yml`.
