// Bản đồ SÁP NHẬP TỈNH 2025 (63 → 34): tên tỉnh CŨ (xuất hiện trên CCCD định dạng cũ,
// trước sáp nhập) → tên tỉnh MỚI. Dùng để auto-fill Tỉnh khi thẻ ghi tên tỉnh cũ.
//   Ví dụ: CCCD ghi "Bạc Liêu" → danh mục SDA mới không còn "Bạc Liêu" → map sang "Cà Mau".
//
// QUY ƯỚC:
//   • "Tỉnh mới" (value) ĐÃ đối chiếu khớp PROVINCE_NAME trong danh mục SDA (34 tỉnh hiện hành).
//   • Chỉ liệt kê tỉnh BỊ GỘP hoặc ĐỔI TÊN. Tỉnh giữ nguyên (Hà Nội, Cao Bằng, Sơn La,
//     Lạng Sơn, Quảng Ninh, Thanh Hóa, Nghệ An, Hà Tĩnh, Lai Châu, Điện Biên) KHÔNG cần map.
//   • Nguồn: Nghị quyết sáp nhập ĐVHC cấp tỉnh 2025. Cập nhật nếu có thay đổi.
//
// ⚠️ CHỈ map cấp TỈNH. Sáp nhập 2025 cũng gộp/đổi cấp XÃ → với thẻ cũ, sau khi điền được Tỉnh,
//    ô Xã vẫn phải chọn tay (tên xã cũ không map 1-1 sang xã mới). Muốn fill cả xã cần bảng
//    ánh xạ xã cũ→mới theo mã (chưa có ở đây).

/** tên tỉnh cũ (CCCD) → tên tỉnh mới (khớp SDA PROVINCE_NAME). */
export const PROVINCE_MERGE_2025: Record<string, string> = {
    // ── Miền núi & trung du phía Bắc ──
    "Hà Giang": "Tuyên Quang",
    "Yên Bái": "Lào Cai",
    "Bắc Kạn": "Thái Nguyên",
    "Vĩnh Phúc": "Phú Thọ",
    "Hòa Bình": "Phú Thọ",
    "Bắc Giang": "Bắc Ninh",
    // ── Đồng bằng sông Hồng ──
    "Thái Bình": "Hưng Yên",
    "Hải Dương": "Thành phố Hải Phòng",
    "Hà Nam": "Ninh Bình",
    "Nam Định": "Ninh Bình",
    // ── Bắc Trung Bộ & Duyên hải miền Trung ──
    "Thừa Thiên Huế": "Thành phố Huế",
    "Quảng Bình": "Quảng Trị",
    "Quảng Nam": "Thành phố Đà Nẵng",
    "Kon Tum": "Quảng Ngãi",
    "Bình Định": "Gia Lai",
    "Phú Yên": "Đắk Lắk",
    "Ninh Thuận": "Khánh Hòa",
    // ── Tây Nguyên ──
    "Đắk Nông": "Lâm Đồng",
    "Bình Thuận": "Lâm Đồng",
    // ── Đông Nam Bộ ──
    "Bình Phước": "Đồng Nai",
    "Bình Dương": "Thành phố Hồ Chí Minh",
    "Bà Rịa - Vũng Tàu": "Thành phố Hồ Chí Minh",
    "Long An": "Tây Ninh",
    // ── Đồng bằng sông Cửu Long ──
    "Tiền Giang": "Đồng Tháp",
    "Bến Tre": "Vĩnh Long",
    "Trà Vinh": "Vĩnh Long",
    "Kiên Giang": "An Giang",
    "Sóc Trăng": "Thành phố Cần Thơ",
    "Hậu Giang": "Thành phố Cần Thơ",
    "Bạc Liêu": "Cà Mau",
};

/** Chuẩn hoá: bỏ dấu + đ→d, bỏ tiền tố "tỉnh/thành phố", đổi gạch ngang thành space, gộp khoảng trắng. */
function norm(s?: string): string {
    return (s || "")
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/đ/g, "d").replace(/Đ/g, "d")
        .toLowerCase()
        .replace(/^(thanh pho|tinh|tp|t\.?\s*p)\.?\s+/, "")
        .replace(/[-–]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Tra cứu không phụ thuộc dấu/tiền tố/gạch ngang.
const NORM_MERGE: Record<string, string> = Object.fromEntries(
    Object.entries(PROVINCE_MERGE_2025).map(([oldName, newName]) => [norm(oldName), newName]),
);

/**
 * Nếu `oldProvinceName` là tỉnh cũ đã sáp nhập/đổi tên 2025 → trả tên tỉnh MỚI (khớp SDA);
 * ngược lại trả null (tỉnh giữ nguyên hoặc không nhận ra).
 */
export function mapMergedProvince(oldProvinceName?: string): string | null {
    const key = norm(oldProvinceName);
    return key ? (NORM_MERGE[key] ?? null) : null;
}
