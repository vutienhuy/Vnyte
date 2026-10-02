// Next standalone KHÔNG tự copy .next/static và public vào .next/standalone.
// Script này copy chúng vào để Electron đóng gói server.js chạy đủ tài nguyên.
// Chạy sau `next build`, trước `electron-builder`. Xem electron/README.md.

const fs = require("node:fs");
const path = require("node:path");

function copyDir(src, dest) {
    if (!fs.existsSync(src)) {
        console.warn(`[prepare-standalone] bỏ qua (không có): ${src}`);
        return;
    }
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(standalone)) {
    console.error("[prepare-standalone] Chưa có .next/standalone — chạy `next build` (output:'standalone') trước.");
    process.exit(1);
}
copyDir(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
copyDir(path.join(root, "public"), path.join(standalone, "public"));

// FIX Next 16 + Turbopack + output:standalone: tracing BỎ SÓT một số runtime compiled
// (vd app-route-turbo.runtime.prod.js — runtime cho API/app route handlers) → trên máy KHÔNG có
// node_modules đầy đủ (kiosk), mọi API route 500 "Cannot find module ...app-route-turbo.runtime.prod.js".
// Copy nguyên thư mục next-server runtime để đảm bảo đủ tất cả file.
copyDir(
    path.join(root, "node_modules", "next", "dist", "compiled", "next-server"),
    path.join(standalone, "node_modules", "next", "dist", "compiled", "next-server"),
);
console.log("[prepare-standalone] Đã copy .next/static + public + next-server runtime vào .next/standalone");
