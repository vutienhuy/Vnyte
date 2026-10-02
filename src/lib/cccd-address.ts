// Khớp chuỗi địa chỉ thường trú từ thẻ CCCD (residencePlace) vào danh mục SDA để
// LẤY MÃ tỉnh/xã (PROVINCE_CODE/COMMUNE_CODE) — thẻ chỉ trả chuỗi, không có mã.
//
// Nguyên tắc: chỉ nhận khi khớp CHẮC CHẮN (so tên đã chuẩn hoá, bỏ dấu + bỏ tiền tố
// hành chính). Không khớp → trả province/commune = null để UI cho chọn tay (tránh gửi
// mã sai, nhất là sau sáp nhập tỉnh/xã 2025 thẻ cũ có thể không khớp danh mục mới).

import type { SdaProvince, SdaCommune } from "@/services/sda.service";
import { mapMergedProvince } from "@/lib/admin-map/province-merge-2025";

/** Bỏ dấu tiếng Việt + đ→d, hạ chữ thường, gộp khoảng trắng. */
function norm(s?: string): string {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Tiền tố cấp hành chính cần bỏ trước khi so tên.
const PROV_PREFIX = /^(thanh pho|tinh|tp|t\.?\s*p)\.?\s+/;
const COMMUNE_PREFIX = /^(thi tran|phuong|xa|tt|p|x)\.?\s+/;
const DISTRICT_PREFIX = /^(huyen|quan|thi xa|tx)\b/;

function stripProv(s?: string): string { return norm(s).replace(PROV_PREFIX, "").trim(); }
function stripCommune(s?: string): string { return norm(s).replace(COMMUNE_PREFIX, "").trim(); }
function isDistrict(s?: string): boolean { return DISTRICT_PREFIX.test(norm(s)); }

export interface CccdAddressMatch {
  province: SdaProvince | null;
  commune: SdaCommune | null;
  /** Phần còn lại của địa chỉ (số nhà, ấp/khu phố...) để đổ vào ô "Địa chỉ chi tiết". */
  detail: string;
}

/**
 * Parse địa chỉ CCCD → khớp tỉnh/xã trong danh mục SDA.
 * @param address chuỗi residencePlace từ thẻ
 * @param provinces danh mục tỉnh (đã load)
 * @param allCommunes danh mục xã (đã load, có PROVINCE_ID)
 */
export function matchCccdAddress(
  address: string,
  provinces: SdaProvince[],
  allCommunes: SdaCommune[],
): CccdAddressMatch {
  const whole = (address || "").trim();
  const fallback: CccdAddressMatch = { province: null, commune: null, detail: whole };
  if (!whole || !provinces?.length) return fallback;

  const parts = whole.split(/[,\n;]+/).map(p => p.trim()).filter(Boolean);
  if (!parts.length) return fallback;

  // 1) Tỉnh — quét từ cuối lên (tỉnh thường đứng cuối địa chỉ).
  let province: SdaProvince | null = null;
  let provIdx = -1;
  let viaMerge = false;
  for (let i = parts.length - 1; i >= 0; i--) {
    const key = stripProv(parts[i]);
    if (!key) continue;
    let found = provinces.find(p => stripProv(p.PROVINCE_NAME) === key);
    // Thẻ định dạng CŨ: tỉnh trước sáp nhập 2025 (vd "Bạc Liêu") không còn trong SDA
    // → tra bảng map tỉnh cũ→mới rồi thử khớp lại (vd "Cà Mau").
    if (!found) {
      const mergedNew = mapMergedProvince(parts[i]);
      if (mergedNew) {
        const nk = stripProv(mergedNew);
        found = provinces.find(p => stripProv(p.PROVINCE_NAME) === nk);
        if (found) viaMerge = true;
      }
    }
    if (found) { province = found; provIdx = i; break; }
  }
  // Không chắc tỉnh → fallback toàn bộ (không đoán bừa).
  if (!province) return fallback;

  // 2) Xã — chỉ khớp cho thẻ MỚI (tỉnh khớp trực tiếp SDA). Thẻ CŨ (tỉnh qua merge-map) thì
  // tên xã/huyện cũ KHÔNG map 1-1 sang danh mục mới (dễ dính nhầm huyện thành xã) → để trống,
  // caller gọi resolver GSO (mã cũ→mới) xử lý chính xác.
  const provCommunes = allCommunes.filter(c => c.PROVINCE_ID === province!.ID);
  let commune: SdaCommune | null = null;
  let comIdx = -1;
  if (!viaMerge) {
    for (let i = 0; i < parts.length; i++) {
      if (i === provIdx) continue;
      const key = stripCommune(parts[i]);
      if (!key) continue;
      const found = provCommunes.find(c => stripCommune(c.COMMUNE_NAME) === key);
      if (found) { commune = found; comIdx = i; break; }
    }
  }

  // 3) Địa chỉ chi tiết = phần còn lại (bỏ tỉnh, xã đã khớp, và cấp huyện/quận nếu có).
  const detail = parts
    .filter((_, i) => i !== provIdx && i !== comIdx && !isDistrict(parts[i]))
    .join(", ")
    .trim();

  return { province, commune, detail };
}
