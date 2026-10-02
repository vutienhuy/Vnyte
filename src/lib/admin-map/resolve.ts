// Resolver địa chỉ CCCD định dạng CŨ (trước sáp nhập 2025) → mã tỉnh/xã MỚI (GSO, khớp SDA).
// SERVER-SIDE ONLY: import 2 file dữ liệu lớn (~2MB) — TUYỆT ĐỐI không import vào client bundle.
//
// Luồng: (tên xã+huyện+tỉnh trên thẻ)  →  mã xã cũ (index từ catalog GSO cũ)  →  lookup xã cũ→mới.
// Đầu đọc CCCD chỉ trả ĐỊA CHỈ dạng CHỮ (không có mã) nên buộc phải khớp theo tên — nhưng có
// đủ 3 cấp (xã+huyện+tỉnh) nên định danh là unique (né cảnh báo trùng tên ở README mục 6).

import nameIndex from "./oldward-name-index.json";
import lookupData from "./files/vn_admin_lookup_oldward_to_new.json";

interface NewWard {
    new_ward_code: string;
    new_ward_name: string;
    new_province_code: string;
    new_province_name: string;
}
const lookup = lookupData as Record<string, NewWard[]>;
const idx = nameIndex as { byWDP: Record<string, string>; byWP: Record<string, string> };

// Bỏ dấu tiếng Việt bằng char-class chữ CÓ DẤU precomposed (KHÔNG dùng normalize("NFD") vì
// runtime/transpiler xử lý dấu tổ hợp không nhất quán → mất nguyên âm). PHẢI khớp HỆT generator
// của oldward-name-index.json.
function foldVN(s: string): string {
    return s.toLowerCase()
        .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a")
        .replace(/[èéẹẻẽêềếệểễ]/g, "e")
        .replace(/[ìíịỉĩ]/g, "i")
        .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o")
        .replace(/[ùúụủũưừứựửữ]/g, "u")
        .replace(/[ỳýỵỷỹ]/g, "y")
        .replace(/đ/g, "d");
}
function normA(s?: string): string {
    return foldVN(s || "")
        .replace(/^(phuong|xa|thi tran|tt|thi xa|quan|huyen|thanh pho|tinh|tp)\.?\s+/, "")
        .replace(/y/g, "i")
        .replace(/[^a-z0-9]/g, "");
}

export interface ResolveCandidate {
    wardCode: string;
    wardName: string;
    provinceCode: string;
    provinceName: string;
}
export interface ResolveResult {
    status: "OK" | "AMBIGUOUS" | "NOT_FOUND";
    /** mã tỉnh mới (GSO/SDA) — có ở OK và AMBIGUOUS. */
    provinceCode?: string;
    /** mã xã mới — chỉ ở OK. */
    wardCode?: string;
    /** danh sách xã mới ứng viên — chỉ ở AMBIGUOUS (xã cũ tách vào nhiều xã mới). */
    candidates?: ResolveCandidate[];
}

/**
 * Nhận các phần địa chỉ (đã tách theo dấu phẩy), lấy 3 cấp cuối làm (xã, huyện, tỉnh).
 * Trả mã tỉnh/xã MỚI nếu khớp catalog cũ; NOT_FOUND nếu không.
 */
export function resolveOldAddress(parts: string[]): ResolveResult {
    const p = parts.map(s => s.trim()).filter(Boolean);
    if (p.length < 2) return { status: "NOT_FOUND" };

    const province = p[p.length - 1];
    const hasDistrict = p.length >= 3;
    const district = hasDistrict ? p[p.length - 2] : "";
    // Phần "xã" trên thẻ CŨ có thể GỘP thôn/ấp + xã không dấu phẩy ("Thôn Vĩnh Lại Vĩnh Hưng").
    // → tách theo từ, thử các HẬU TỐ (dài→ngắn) để tìm đúng tên xã ("Vĩnh Hưng").
    const wardRaw = hasDistrict ? p[p.length - 3] : p[p.length - 2];
    const dN = normA(district), pN = normA(province);
    if (!pN) return { status: "NOT_FOUND" };

    const words = foldVN(wardRaw).replace(/y/g, "i").split(/[^a-z0-9]+/).filter(Boolean);
    if (words.length === 0) return { status: "NOT_FOUND" };

    // Khớp đủ xã|huyện|tỉnh trước (hậu tố dài→ngắn); fallback xã|tỉnh (unique toàn quốc).
    let oldCode: string | undefined;
    for (let L = words.length; L >= 1 && !oldCode; L--) {
        const cand = words.slice(-L).join("");
        oldCode = idx.byWDP[`${cand}|${dN}|${pN}`];
    }
    for (let L = words.length; L >= 1 && !oldCode; L--) {
        const cand = words.slice(-L).join("");
        oldCode = idx.byWP[`${cand}|${pN}`];
    }
    if (!oldCode) return { status: "NOT_FOUND" };

    const hits = lookup[oldCode];
    if (!hits || hits.length === 0) return { status: "NOT_FOUND" };

    if (hits.length > 1) {
        return {
            status: "AMBIGUOUS",
            provinceCode: hits[0].new_province_code,
            candidates: hits.map(h => ({
                wardCode: h.new_ward_code,
                wardName: h.new_ward_name,
                provinceCode: h.new_province_code,
                provinceName: h.new_province_name,
            })),
        };
    }
    return { status: "OK", provinceCode: hits[0].new_province_code, wardCode: hits[0].new_ward_code };
}
