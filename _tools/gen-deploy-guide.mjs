// Generate deploy guide DOCX from HUONG_DAN_DEPLOY_DOCKER.md content.
// Run from VNTCloud parent (docx package installed there):
//   cd f:\DATA_CODE\BackEnd\VNTCloud && node cleanatrubire/_tools/gen-deploy-guide.mjs

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} from "docx";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
// Xuất ra file mới để tránh đụng lock file `~$HUONG_DAN_DEPLOY_DOCKER.docx` khi Word đang mở.
const OUT = path.join(ROOT, "HUONG_DAN_DEPLOY_DOCKER_v2.docx");

const FONT = "Times New Roman";

const run = (text, opts = {}) => new TextRun({ text, font: FONT, size: 22, ...opts });
const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  children: [run(text, { bold: true, size: 30, color: "1E40AF" })],
  spacing: { before: 320, after: 180 },
});
const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  children: [run(text, { bold: true, size: 24, color: "1D4ED8" })],
  spacing: { before: 240, after: 140 },
});
const p = (text, opts = {}) => new Paragraph({
  children: [run(text, opts)],
  spacing: { after: 100 },
});
const bullet = (text) => new Paragraph({
  children: [run(text)],
  bullet: { level: 0 },
  spacing: { after: 80 },
});
const code = (text) => new Paragraph({
  children: text.split("\n").flatMap((line, i) => [
    ...(i > 0 ? [new TextRun({ break: 1 })] : []),
    new TextRun({ text: line, font: "Consolas", size: 20 }),
  ]),
  shading: { type: ShadingType.SOLID, color: "F3F4F6", fill: "F3F4F6" },
  spacing: { before: 80, after: 120 },
});

function cell(text, opts = {}) {
  const { bold = false, header = false, width } = opts;
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: header ? { type: ShadingType.SOLID, color: "DBEAFE", fill: "DBEAFE" } : undefined,
    children: [new Paragraph({ children: [run(text, { bold: bold || header })], spacing: { after: 0 } })],
  });
}

function table(headers, rows, widths) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: headers.map((h, i) => cell(h, { header: true, width: widths?.[i] })),
        tableHeader: true,
      }),
      ...rows.map((r) => new TableRow({
        children: r.map((c, i) => cell(c, { width: widths?.[i] })),
      })),
    ],
  });
}

const children = [];

// ── Title ──
children.push(
  new Paragraph({
    children: [run("HƯỚNG DẪN DEPLOY DOCKER", { bold: true, size: 44, color: "1E3A8A" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 120 },
  }),
  new Paragraph({
    children: [run("cleanatrubire — Web Kiosk VNyTe (Next.js 16)", { size: 26, italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
  }),
  new Paragraph({
    children: [run("Ngày 25/05/2026 · Liên hệ: huyvt1@vietsens.vn", { size: 22, color: "6B7280" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 320 },
  }),
);

// ── 1. Yêu cầu ──
children.push(
  h1("1. Yêu cầu"),
  table(
    ["Máy", "Cần"],
    [
      ["Build", "Node.js 20 LTS, npm 10, Git"],
      ["Server", "Docker 24+, Docker Compose v2.20+, port 3000 mở"],
    ],
    [20, 80],
  ),
  p(""),
  p("Server cần truy cập được Gateway (https://vntgw.onelink.vn)."),
);

// ── 2. Cấu hình env ──
children.push(
  h1("2. Cấu hình .env.production"),
  p("Mọi request đi qua Gateway. File env hiện có 7 biến (chia 3 nhóm):"),
  code(`# --- CLIENT + SERVER (build-time bake vào bundle — đổi PHẢI build lại) ---
NEXT_PUBLIC_HOSPITAL_CODE=01816    # 01816 = Bệnh viện Hà Đông

# --- SERVER-SIDE runtime (đổi xong chỉ cần restart container) ---
GATEWAY_BASE_URL=https://vntgw.onelink.vn

# Kiosk Payment — mỗi kiosk vật lý 1 cặp riêng (VNYTE cấp)
KIOSK_DEVICE_CODE=KIOSK-A01
KIOSK_DEVICE_SECRET=<device secret>

# Kiosk OAuth + RSA (xem KIOSK_WEB_OAUTH.md v2.0)
# Web kiosk = OAuth client của viện (role=HIS). 6 endpoint kiosk dùng access_token
# + RSA-SHA256 sign bằng private key. KHÔNG expose ra client.
KIOSK_CLIENT_ID=<UUID do Gateway cấp cho viện>
KIOSK_CLIENT_SECRET=<client secret>
KIOSK_PRIVATE_KEY=<base64 raw 1 dòng, hoặc PEM có markers>`),
  p("File này gitignored. Trên server: chmod 600 .env.production."),
  p("Mã viện (HOSPITAL_CODE) là 5 chữ số do MOH cấp. 01816 = Hà Đông. Đổi sang viện khác phải build lại."),
);

// ── 3. Pre-flight check trên server ──
children.push(
  h1("3. Pre-flight check trên server Linux"),
  p("Trước khi copy file lên, SSH vào server và verify 2 điều kiện tiên quyết:"),
  h2("3.1. Docker đã cài và daemon đang chạy"),
  code(`docker --version           # phải >= 24
docker compose version     # phải >= v2.20
docker info | head -5      # phải có dòng "Server Version" → daemon đang chạy`),
  p("Nếu thiếu: cài Docker Engine + Compose plugin theo hướng dẫn chính thức cho distro của server (CentOS/RHEL: dnf install docker-ce docker-compose-plugin; Ubuntu: apt install docker-ce docker-compose-plugin)."),
  h2("3.2. Server kết nối được Gateway"),
  code(`curl -sI https://vntgw.onelink.vn 2>&1 | head -3`),
  p("Phải thấy dòng HTTP/... (kể cả 404 cũng OK — chỉ cần TCP/TLS handshake thành công, nghĩa là DNS + routing tới Gateway hoạt động). Nếu timeout hoặc DNS fail → server không gọi được Gateway, không deploy được — kiểm tra firewall outbound, DNS, hoặc reverse proxy giữa server và Gateway."),
);

// ── 4. Quy trình deploy ──
children.push(
  h1("4. Quy trình deploy"),
  h2("4.1. Build trên máy local (Windows)"),
  code(`cd F:\\DATA_CODE\\BackEnd\\VNTCloud\\cleanatrubire
.\\build-and-prepare-deploy.bat`),
  p("Script chạy: npm install → npm run build → tạo folder deploy/ chứa .next/, public/, package.json, package-lock.json, next.config.ts, .env.production, Dockerfile, docker-compose.yml."),
  p("PowerShell phải dùng prefix .\\ để chạy .bat trong thư mục hiện tại. Script bên trong dùng `call npm install` để control trở lại sau khi npm.cmd xong (lỗi cổ điển khi PowerShell gọi .bat → npm.cmd mà thiếu `call`)."),
  h2("4.2. Copy folder deploy/ lên server"),
  p("Hai cách phổ biến:"),
  p("Cách A — MobaXterm SSH-browser (đơn giản nhất, không cần lệnh):", { bold: true }),
  bullet("Mở SSH session tới server. Cột trái MobaXterm hiện tab \"SSH-browser\" với cây thư mục remote."),
  bullet("Drag-drop folder F:\\DATA_CODE\\BackEnd\\VNTCloud\\cleanatrubire\\deploy từ Windows Explorer vào /root/ (hoặc /home/user/) trong SSH-browser."),
  bullet("MobaXterm upload qua SFTP, hiện progress bar. Xong → folder /root/deploy/ có đủ file."),
  p("Cách B — rsync (delta sync, nhanh hơn cho lần update sau):", { bold: true }),
  code(`rsync -avz --delete deploy/ root@192.168.10.229:/root/deploy/`),
  h2("4.3. Chạy container trên server"),
  code(`ssh root@192.168.10.229
cd /root/deploy
chmod 600 .env.production
docker compose up -d --build`),
  p("Lần đầu mất 2-3 phút (pull node:20-alpine ~180 MB + npm ci ~1-2 phút). Khi xong in dòng \"✔ Container nextjs-app  Started\"."),
  h2("4.4. Verify container hoạt động"),
  code(`docker ps --filter name=nextjs-app           # STATUS: Up X seconds
docker logs --tail=30 nextjs-app             # "▲ Next.js 16.x.x" và "Ready in XXXms"
curl -sI http://localhost:3000 | head -3     # HTTP/1.1 200 hoặc 307`),
  p("Pass nếu: STATUS là Up (không phải Restarting/Exited), log không có Error/EADDRINUSE, HTTP probe 200/307."),
  h2("4.5. Mở firewall port 3000 (truy cập từ máy khác)"),
  p("Nếu chỉ test từ chính server thì bỏ qua. Để máy khác trong cùng mạng (hoặc qua reverse proxy) truy cập:"),
  code(`# CentOS/RHEL với firewalld
firewall-cmd --permanent --add-port=3000/tcp
firewall-cmd --reload

# Ubuntu/Debian với ufw
ufw allow 3000/tcp`),
  p("Sau đó mở browser từ máy client: http://<server-ip>:3000."),
);

// ── 5. Update sau deploy ──
children.push(
  h1("5. Update sau khi đã deploy"),
  table(
    ["Đổi biến", "Cần làm"],
    [
      ["NEXT_PUBLIC_HOSPITAL_CODE (client, bake build-time)", "Sửa local → .\\build-and-prepare-deploy.bat → copy deploy/ lên → docker compose up -d --build"],
      ["GATEWAY_BASE_URL, KIOSK_* (server-side runtime)", "Sửa .env.production TRÊN SERVER → docker compose up -d (không cần --build)"],
      ["KIOSK_PRIVATE_KEY / KIOSK_CLIENT_*", "Như trên + nếu Gateway đã rotate public key tương ứng thì phải sync"],
    ],
    [40, 60],
  ),
);

// ── 6. Operations ──
children.push(
  h1("6. Operations cơ bản"),
  code(`docker logs -f --tail=100 nextjs-app   # Follow logs
docker compose restart                  # Restart không rebuild
docker compose down                     # Stop + xoá container
docker exec -it nextjs-app sh           # Vào shell debug`),
);

// ── 7. Troubleshooting ──
children.push(
  h1("7. Troubleshooting"),
  table(
    ["Triệu chứng", "Fix"],
    [
      ["Container restart liên tục", "docker logs --tail=100 nextjs-app xem error stack"],
      ["EADDRINUSE :3000", "Port chiếm. ss -tlnp | grep 3000 kill process hoặc đổi port map"],
      ["Code mới mà container chạy code cũ", "Quên --build. Chạy docker compose up -d --build"],
      ["NEXT_PUBLIC_* không bake vào bundle", ".env.production không có lúc build. Verify: grep -r vntgw deploy/.next/static/chunks/"],
      ["SSE timeout 60s (qua reverse proxy)", "Nginx: proxy_buffering off; proxy_read_timeout 3600s;"],
      ["Gateway trả HMAC_INVALID / Invalid request signature", "Xem section 8 — chẩn đoán theo thứ tự: OAuth token, RSA private key, clock skew. KHÔNG fix được bằng restart."],
    ],
    [40, 60],
  ),
);

// ── 8. Diagnose Kiosk OAuth + RSA signature (HMAC_INVALID) ──
children.push(
  h1("8. Chẩn đoán lỗi HMAC_INVALID (Kiosk OAuth + RSA)"),
  p("Gateway trả {success:false, errorCode:\"HMAC_INVALID\", message:\"Invalid request signature\"} khi gọi 1 trong 6 endpoint kiosk (appointment/branch, his-rs/service-by-clinic, his-module/patient-types-for-kiosk, appointment, appointment/create-direct, his-rs/treatment-for-print, his-rs/treatment-list-for-print)."),
  p("Flow ký request (xem KIOSK_WEB_OAUTH.md): kiosk-web lấy OAuth token bằng KIOSK_CLIENT_ID + KIOSK_CLIENT_SECRET, mỗi request ký RSA-SHA256 với KIOSK_PRIVATE_KEY rồi gửi X-Signature + X-Timestamp + Authorization Bearer."),
  p("Lỗi này KHÔNG fix được bằng docker restart. Phải tìm root cause:", { bold: true }),
  h2("8.1. Restart container có giúp không?"),
  p("Không — trừ khi vừa SỬA .env.production trên server thì cần restart để pickup. Nếu env không đổi, restart = no-op."),
  h2("8.2. Các nguyên nhân (sắp theo xác suất)"),
  table(
    ["#", "Nguyên nhân", "Cách check"],
    [
      ["1", "OAuth token chưa lấy được → request đi không Authorization", "Logs có [kiosk-auth] /oauth/token <status> hoặc OAuth fetch error"],
      ["2", "KIOSK_PRIVATE_KEY trên server không khớp public key đăng ký tại Gateway cho KIOSK_CLIENT_ID", "Đối chiếu key fingerprint giữa server và Gateway DB"],
      ["3", "Server clock lệch > vài phút với Gateway → timestamp out of window", "Chạy date -u trên cả 2 server, hiệu lệch < 60s"],
      ["4", "Canonical body / sign_string convention khác (ít khả thi với GET no-body)", "So với Gateway code CanonicalJsonHelper.Canonicalize"],
      ["5", "Private key parse sai format (PKCS1 vs PKCS8)", "Logs có [kiosk-auth] Failed to parse private key"],
    ],
    [6, 47, 47],
  ),
  h2("8.3. Lệnh chẩn đoán (chạy trên server kiosk)"),
  p("Bước 1 — Xem logs xem flow OAuth + sign đã làm gì:"),
  code(`docker logs --tail=200 nextjs-app 2>&1 | grep -E "kiosk-auth|gateway-proxy"`),
  p("Bước 2 — Test OAuth token endpoint trực tiếp (bypass app, gọi thẳng Gateway):"),
  code(`curl -s -X POST https://vntgw.onelink.vn/oauth/token \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=client_credentials&client_id=<KIOSK_CLIENT_ID>&client_secret=<KIOSK_CLIENT_SECRET>&scope=kiosk_appointment" \\
  -w "\\nHTTP %{http_code}\\n"`),
  p("Kết quả phân nhánh:"),
  bullet("HTTP 401 / invalid_client → KIOSK_CLIENT_ID/SECRET sai → liên hệ team Gateway cấp lại cặp cho viện."),
  bullet("HTTP 200 + access_token → OAuth OK, lỗi nằm ở RSA signature → so private/public key giữa server và DB Gateway."),
  p("Bước 3 — Clock skew:"),
  code(`date -u
# So với HTTP Date header từ Gateway:
curl -sI https://vntgw.onelink.vn 2>&1 | grep -i ^date

# Nếu lệch nhiều: bật NTP
timedatectl set-ntp true
systemctl restart chronyd   # CentOS/RHEL
# hoặc: systemctl restart systemd-timesyncd   # Ubuntu/Debian`),
  p("Bước 4 — Sanity check env đã vào container (không bị trim hay thiếu BOM):"),
  code(`docker exec nextjs-app sh -c 'echo CID=$KIOSK_CLIENT_ID; \\
  echo SECRET_LEN=\${#KIOSK_CLIENT_SECRET}; \\
  echo PKEY_LEN=\${#KIOSK_PRIVATE_KEY}; \\
  echo HOSPITAL=$NEXT_PUBLIC_HOSPITAL_CODE'`),
  p("KIOSK_PRIVATE_KEY length ~1700-1800 ký tự cho RSA 2048-bit base64. Nếu < 1000 → key bị truncate. CID phải đúng UUID."),
  h2("8.4. Fix cho từng tình huống"),
  table(
    ["Triệu chứng từ bước trên", "Fix"],
    [
      ["Bước 2 trả HTTP 401 invalid_client", "Liên hệ team Gateway cấp lại KIOSK_CLIENT_ID + KIOSK_CLIENT_SECRET cho viện. Update .env.production trên server → docker compose up -d (không cần --build)."],
      ["Bước 2 trả HTTP 200 nhưng API vẫn HMAC_INVALID", "RSA mismatch. Yêu cầu Gateway gửi public key đang đăng ký cho client. Generate lại key pair, gửi public key cho Gateway register, copy private key vào KIOSK_PRIVATE_KEY → restart container."],
      ["Bước 3 lệch > 60s", "Bật NTP như trên. Verify lại bằng date -u sau vài giây."],
      ["Bước 4 PKEY_LEN bất thường", "File .env.production bị copy hỏng (CRLF/BOM). Mở bằng vi trên server, set ff=unix, không có dòng trống/space sau key. Restart container."],
    ],
    [40, 60],
  ),
);

// ── 9. Checklist ──
children.push(
  h1("9. Checklist lần đầu"),
  bullet("Server cài Docker 24+ và Compose v2.20+"),
  bullet("User deploy thuộc group docker"),
  bullet("Port 3000 mở firewall (hoặc đặt sau Nginx + cert HTTPS)"),
  bullet("Server gọi được Gateway (curl -I https://vntgw.onelink.vn)"),
  bullet("Server NTP đồng bộ (timedatectl status — System clock synchronized: yes)"),
  bullet("Đã có cặp KIOSK_CLIENT_ID + KIOSK_CLIENT_SECRET + KIOSK_PRIVATE_KEY do Gateway cấp cho viện này"),
  bullet("Build local, verify folder deploy/ đủ file"),
  bullet("Copy lên server, chmod 600 .env.production"),
  bullet("docker compose up -d --build, verify status + logs + HTTP 200"),
  bullet("Smoke test 1 endpoint kiosk (vd appointment/branch) — phải trả 200, không HMAC_INVALID"),
  bullet("Smoke test trên browser: trang chủ, đăng ký, QR login, thanh toán"),
);

const doc = new Document({
  creator: "Vũ Tiến Huy <huyvt1@vietsens.vn>",
  title: "Hướng dẫn deploy Docker — cleanatrubire",
  styles: {
    default: {
      document: { run: { font: FONT, size: 22 } },
    },
  },
  sections: [{ properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } }, children }],
});

const buf = await Packer.toBuffer(doc);
fs.writeFileSync(OUT, buf);
console.log(`Wrote ${OUT} (${(buf.length / 1024).toFixed(1)} KB)`);
