# Danh mục ĐVHC Việt Nam — map 3 cấp (cũ) → 2 cấp (mới)

Toàn bộ mã dùng theo **Danh mục hành chính Tổng cục Thống kê (GSO)** — cùng hệ mã mà HIS/BHXH/BHYT đang dùng, nên nối trực tiếp được với dữ liệu bệnh viện.

## Files

| File | Nội dung | Số dòng |
|---|---|---|
| `01_tinh_cu_63.csv` | 63 tỉnh/TP cũ | 63 |
| `02_quanhuyen_cu_696.csv` | Quận/huyện/thị xã/TP cũ | 696 |
| `03_xaphuong_cu_10047.csv` | Xã/phường/thị trấn cũ | 10.047 |
| `04_tinh_moi_34.csv` | 34 tỉnh/TP mới | 34 |
| `05_xaphuong_moi_3321.csv` | Xã/phường/đặc khu mới | 3.321 |
| `06_mapping_cu_sang_moi.csv` | Bảng map xã cũ → xã mới | 10.358 |
| `07_seed_mapping.sql` | DDL + INSERT cho cả 6 bảng trên | — |
| `vn_admin_full.json` | Tất cả trong 1 file JSON | — |
| `vn_admin_lookup_oldward_to_new.json` | Dict tra nhanh: `{ma_xa_cu: [{new_ward_code, new_ward_name, new_province_code, new_province_name}] }` | 10.024 key |

Mã: tỉnh 2 ký tự, huyện 3, xã 5 — **giữ dạng string, có leading zero** (`"01"`, `"00004"`). Đừng parse sang int.

## Cấu trúc bảng map

```
old_province_code, old_province_name, old_district_code, old_district_name,
old_ward_code, old_ward_name,
new_province_code, new_province_name, new_ward_code, new_ward_name
```

Logic convert địa chỉ cũ trong code chỉ cần 1 lookup theo `old_ward_code` (mã xã cũ là unique toàn quốc, không cần kèm mã tỉnh/huyện):

```js
const lut = require('./vn_admin_lookup_oldward_to_new.json');

function convert(oldWardCode) {
  const hits = lut[oldWardCode];
  if (!hits) return { status: 'NOT_FOUND' };
  if (hits.length > 1) return { status: 'AMBIGUOUS', candidates: hits }; // cho user chọn
  return { status: 'OK', ...hits[0] };
}
```

SQL tương đương:

```sql
SELECT m.new_province_code, tm.name AS tinh_moi, m.new_ward_code, xm.name AS xa_moi
FROM benh_nhan bn
JOIN dm_map_xa m  ON m.old_ward_code = bn.ma_xa
JOIN dm_tinh_moi tm ON tm.code = m.new_province_code
JOIN dm_xa_moi   xm ON xm.code = m.new_ward_code;
```

## Lưu ý quan trọng khi migrate

1. **Không phải 1-1.** 297 xã cũ bị **chia** vào 2–3 xã mới (ví dụ Phường Kim Mã → Ba Đình / Giảng Võ / Ngọc Hà). Với các xã này không thể tự động quyết định — cần map theo số nhà/tổ dân phố hoặc để người dùng xác nhận lại địa chỉ. Đây là lý do bảng map có 10.358 dòng cho 10.024 xã cũ.
2. **Bỏ hẳn cấp huyện, nhưng đừng xoá cột.** Nên giữ `ma_huyen_cu`/`ten_huyen_cu` trong DB (nullable, read-only) để tra ngược hồ sơ cũ, in lại giấy tờ đã phát hành, và đối chiếu với dữ liệu BHXH gửi trước 01/07/2025. Thêm cột `ma_xa_moi`, `ma_tinh_moi` song song thay vì ghi đè.
3. **13 đặc khu** (Côn Đảo, Lý Sơn, Phú Quý, Cồn Cỏ, Bạch Long Vĩ, Hoàng Sa…) là huyện đảo cũ chuyển thành đơn vị cấp xã, không có cấp xã bên dưới. Các dòng này trong bảng map có `old_ward_code` rỗng — map ở mức huyện.
4. **Đồng Nai giờ là "Thành phố Đồng Nai"** (NQ 30/2026/QH16, hiệu lực 30/4/2026), 95 ĐVHC cấp xã (33 phường, 62 xã). Dữ liệu file 04/05 đã cập nhật; cột `new_ward_name`/`new_province_name` trong file 06 lấy từ nguồn mapping tháng 10/2025 nên tên có thể cũ hơn — **luôn lấy tên hiển thị từ file 04/05 theo code**, file 06 chỉ dùng để nối code.
5. **14 xã cũ chưa map được**, cần xử lý tay (đã bị sáp nhập/đổi tên trước 01/07/2025 nên không có trong nguồn mapping):

```
06616 TT NT Thái Bình (Đình Lập, Lạng Sơn)     07693 Xã Tân An (TP Bắc Giang)
07732 Xã Nham Sơn (TP Bắc Giang)               07744 Xã Thắng Cương (TP Bắc Giang)
16408 Xã Đông Khê (TP Thanh Hóa)               16411 Xã Đông Xuân (TP Thanh Hóa)
18448 Xã Bình Lộc (Thạch Hà, Hà Tĩnh)          20176 Xã Hương Hòa (Phú Lộc, Huế)
20674 Xã Quế Phước (Quế Sơn, Quảng Nam)        23674 Xã Kông Bơ La (KBang, Gia Lai)
25102 Xã Đạ M'ri (Đạ Huoai, Lâm Đồng)          25174 Xã Mỹ Lâm (Đạ Huoai, Lâm Đồng)
25177 Xã Tư Nghĩa (Đạ Huoai, Lâm Đồng)         25186 Xã Phù Mỹ (Đạ Huoai, Lâm Đồng)
```

6. **Đừng map theo tên.** Tên xã trùng nhau rất nhiều và cách viết dấu không thống nhất giữa các nguồn (Hoà/Hòa, Quí/Quý, i/y, dấu gạch nối). Nếu buộc phải fallback theo tên (dữ liệu cũ không có mã xã), chuẩn hoá: bỏ dấu → bỏ tiền tố Xã/Phường/Thị trấn → bỏ khoảng trắng và ký tự đặc biệt → quy đổi số La Mã (II → 2) → thống nhất y/i, rồi mới so.

## Độ phủ

- 10.033/10.047 xã cũ có map (99,86%)
- 3.320/3.321 xã mới được cover
- 63/63 tỉnh cũ, 695/696 huyện khớp mã

## Nguồn

- Cấu trúc cũ 3 cấp + mã GSO: `github.com/dvhcvn/data` (crawl từ danhmuchanhchinh.gso.gov.vn)
- Cấu trúc mới 2 cấp + mã GSO: `github.com/ThangLeQuoc/vietnamese-provinces-database` (bản 25/07/2026)
- Bảng map cũ→mới: `github.com/vietmap-company/vietnam_administrative_address` (bản 10/2025), đã được nối lại sang mã GSO

Nên verify lại sample với `danhmuchanhchinh.gso.gov.vn` trước khi chạy production, và kiểm tra nguồn ThangLeQuoc định kỳ vì danh mục vẫn còn thay đổi (xã lên phường, thành lập TP mới).
