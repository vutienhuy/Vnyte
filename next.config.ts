import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Standalone output để Electron đóng gói (.next/standalone/server.js chạy trong app).
  output: "standalone",
  // Kiosk cài ở C:\Program Files (chỉ đọc) → next/image cố ghi cache → EPERM. Tắt tối ưu ảnh
  // (kiosk không cần) để hết lỗi ghi cache + phục vụ ảnh trực tiếp.
  images: { unoptimized: true },
  // Giới hạn phạm vi trace về đúng project (mặc định Next suy ra workspace cha VNTCloud
  // do có lockfile khác → trace lan sang file thư mục cha). + Loại artifact build lớn để
  // KHÔNG bị lồng installer cũ (dist-electron) vào .next/standalone.
  outputFileTracingRoot: path.resolve(__dirname),
  // Tracing của Next kéo theo gần như cả thư mục gốc project (vì code server đọc file
  // theo `process.cwd()`), nên mọi thứ vô tình để ở gốc đều chui vào `.next/standalone`
  // rồi vào installer. Đo được: hai bản .zip của build cũ để ở gốc làm gói phình từ
  // ~200MB lên 1.87GB. Danh sách dưới là những đuôi/thư mục CHẮC CHẮN không cần lúc chạy.
  outputFileTracingExcludes: {
    "*": [
      "dist-electron/**",
      "dist/**",
      "**/*.exe",
      "**/*.blockmap",
      "nfc-test.html",
      "aiot-sniffer.html",
      "**/*.pdf",
      // File nén (thường là bản build cũ đem đi gửi) — nặng nhất và vô dụng khi chạy.
      "**/*.zip",
      "**/*.rar",
      "**/*.7z",
      // Tài liệu, ảnh minh hoạ, file tạm của TypeScript.
      "**/*.docx",
      "**/*.doc",
      "**/*.tsbuildinfo",
      "Ảnh minh họa các bước/**",
      "deploy/**",
    ],
  },
  // Force Turbopack dùng cleanatrubire làm workspace root.
  // Thư mục cha (F:\DATA_CODE\BackEnd\VNTCloud) có package-lock.json riêng
  // cho utility docx, khiến Turbopack tự suy ra root sai → không resolve được
  // tailwindcss/dependencies trong node_modules của project này.
  turbopack: {
    root: path.resolve(__dirname),
  },
  async rewrites() {
    return [
      {
        source: '/api/proxy-verify-user',
        destination: 'http://14.241.182.249:8000/auth/verify-user',
      },
    ];
  },
};

export default nextConfig;
