# Hướng dẫn cấu hình

Tài liệu này mô tả cách quản lý URL backend, API key và các biến môi trường khác cho project.

---

## 1. Nguyên tắc

Chia biến môi trường thành 2 nhóm theo nơi được sử dụng:

| Loại | Prefix | Nơi đọc | Khi nào áp dụng |
|---|---|---|---|
| **Client-side** | `NEXT_PUBLIC_*` | Trình duyệt (JS bundle) | **Build-time** — bake khi `npm run build` |
| **Server-side** | (không prefix) | Next.js API routes, SSR | **Runtime** — đọc `process.env` khi container chạy |

**Hệ quả quan trọng:** Đổi `NEXT_PUBLIC_*` BẮT BUỘC phải build lại. Đổi biến server-side chỉ cần restart container.

---

## 2. Cấu trúc file

```
.env.example       ← template, commit vào git, có sẵn tất cả biến + comment
.env.local         ← dev (npm run dev), gitignored
.env.production    ← build + deploy, gitignored, docker-compose cũng đọc từ đây

src/config/
  api.ts           ← export API_BASE_URL cho client-side (fetch, SSE, ...)
  server.ts        ← export resolveBackend() cho server-side (API routes)
```

**Một biến chỉ khai báo ở đúng một file code** — không đọc `process.env.NEXT_PUBLIC_API_BASE_URL` rải rác trong các component, luôn import từ [src/config/api.ts](src/config/api.ts).

---

## 3. Danh sách biến

| Biến | Loại | Dùng ở đâu |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Client | QR login SSE, http-client, http-utils fallback |
| `HOSPITAL_BASE_URL` | Server | [src/app/api/hospital-proxy/route.ts](src/app/api/hospital-proxy/route.ts) |
| `HOSPITAL_API_KEY` | Server | [src/app/api/hospital-proxy/route.ts](src/app/api/hospital-proxy/route.ts) |
| `KIOSK_PAYMENT_BASE_URL` | Server | [src/app/api/kiosk-proxy/](src/app/api/kiosk-proxy/) (REST + SSE), mặc định = `HOSPITAL_BASE_URL` |
| `KIOSK_DEVICE_CODE` | Server | [src/app/api/kiosk-proxy/](src/app/api/kiosk-proxy/) — header `X-Kiosk-Device-Code` |
| `KIOSK_DEVICE_SECRET` | Server | [src/app/api/kiosk-proxy/](src/app/api/kiosk-proxy/) — header `X-Kiosk-Device-Secret`, **mỗi kiosk vật lý một cặp riêng** |

Xem giá trị mẫu trong [.env.example](.env.example).

---

## 4. Thêm biến mới

### Nếu biến dùng ở client (trình duyệt):

1. Thêm vào [.env.example](.env.example), [.env.local](.env.local), [.env.production](.env.production) với prefix `NEXT_PUBLIC_`
2. Export trong [src/config/api.ts](src/config/api.ts):
   ```ts
   export const MY_VAR = process.env.NEXT_PUBLIC_MY_VAR || "default";
   ```
3. Import từ `@/config/api` ở nơi cần dùng — KHÔNG đọc `process.env.*` trực tiếp

### Nếu biến dùng ở server (API route):

1. Thêm vào [.env.example](.env.example), [.env.local](.env.local), [.env.production](.env.production) không có prefix
2. Export trong [src/config/server.ts](src/config/server.ts):
   ```ts
   export const MY_SECRET = process.env.MY_SECRET || "";
   ```
3. Import từ `@/config/server` chỉ trong API route / middleware — KHÔNG import vào client component

---

## 5. Phát triển local

```bash
cp .env.example .env.local      # lần đầu
# sửa giá trị trong .env.local
npm run dev
```

---

## 6. Deploy production

Quy trình build + deploy qua Docker:

```bash
# 1. Sửa .env.production với URL / API key thật
# 2. Build + chuẩn bị thư mục deploy (trên máy local)
build-and-prepare-deploy.bat

# 3. Copy thư mục deploy/ sang máy chủ Docker, rồi:
docker compose up -d --build
```

**Một file duy nhất cấu hình mọi thứ:** [.env.production](.env.production)
- Next.js đọc lúc `npm run build` → bake `NEXT_PUBLIC_*` vào bundle
- [deploy/docker-compose.yml](deploy/docker-compose.yml) đọc qua `env_file` → inject biến server-side vào container

### Muốn đổi URL/API key sau khi đã deploy?

| Đổi biến nào | Cần làm gì |
|---|---|
| `NEXT_PUBLIC_*` | Sửa `.env.production` → chạy lại `build-and-prepare-deploy.bat` → copy + `docker compose up -d --build` |
| `HOSPITAL_*` (server) | Sửa `.env.production` trên máy chủ → `docker compose up -d` (không cần build) |

### Kiểm tra URL đã được bake đúng

Sau khi build:
```bash
grep -r "hastest.onelink.vn" deploy/.next/static/chunks/ | head -3
```
Nếu thấy URL khác với `.env.production` → env chưa được load lúc build.

---

## 7. Bảo mật

- `.env.*` (trừ `.env.example`) đã gitignored — **KHÔNG commit** file chứa API key thật
- Biến server-side (không có `NEXT_PUBLIC_`) KHÔNG bao giờ lộ ra client
- [src/config/server.ts](src/config/server.ts) chỉ được import trong `src/app/api/**`, middleware, hoặc server actions — không import vào component `"use client"`
