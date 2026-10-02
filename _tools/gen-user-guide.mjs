// Generate user guide DOCX for VNyTe Kiosk web from screenshots in "Ảnh minh họa các bước".
// Run from parent VNTCloud folder where docx package is installed:
//   cd f:\DATA_CODE\BackEnd\VNTCloud && node cleanatrubire/_tools/gen-user-guide.mjs

import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, AlignmentType, PageBreak, TableOfContents } from "docx";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const IMG_DIR = path.join(ROOT, "Ảnh minh họa các bước");
const OUT = path.join(ROOT, "Hướng dẫn sử dụng VNyTe Kiosk.docx");

// Helper builders
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, bold: true, size: 32, color: "1E40AF" })], spacing: { before: 360, after: 200 } });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true, size: 26, color: "1D4ED8" })], spacing: { before: 280, after: 160 } });
const h3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text, bold: true, size: 22, color: "2563EB" })], spacing: { before: 200, after: 120 } });
const p = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text, size: 22, ...opts })], spacing: { after: 100 } });
const bullet = (text) => new Paragraph({ children: [new TextRun({ text, size: 22 })], bullet: { level: 0 }, spacing: { after: 80 } });
const note = (text) => new Paragraph({ children: [new TextRun({ text: "Lưu ý: ", bold: true, color: "B45309", size: 22 }), new TextRun({ text, size: 22, color: "B45309" })], spacing: { after: 100 } });
const tip = (text) => new Paragraph({ children: [new TextRun({ text: "Mẹo: ", bold: true, color: "047857", size: 22 }), new TextRun({ text, size: 22, color: "047857" })], spacing: { after: 100 } });

function image(filename, widthPx = 480) {
    const fullPath = path.join(IMG_DIR, filename);
    if (!fs.existsSync(fullPath)) {
        return p(`[Thiếu ảnh: ${filename}]`, { italics: true, color: "991B1B" });
    }
    const data = fs.readFileSync(fullPath);
    // Estimate height from aspect ratio is hard without image library; use fixed ratio 0.75 (most screenshots gần vuông/portrait).
    return new Paragraph({
        children: [new ImageRun({ data, transformation: { width: widthPx, height: Math.round(widthPx * 0.85) } })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 200 },
    });
}

const children = [];

// ── Title page ──
children.push(
    new Paragraph({
        children: [new TextRun({ text: "HƯỚNG DẪN SỬ DỤNG", bold: true, size: 48, color: "1E3A8A" })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 600, after: 200 },
    }),
    new Paragraph({
        children: [new TextRun({ text: "KIOSK VNyTe — HỆ THỐNG QUẢN LÝ KHÁM BỆNH", bold: true, size: 36, color: "1E40AF" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 800 },
    }),
    new Paragraph({
        children: [new TextRun({ text: "Tài liệu dành cho người dùng cuối", size: 26, italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
    }),
    new Paragraph({
        children: [new TextRun({ text: "Bệnh Viện Đa Khoa Hà Đông", size: 24, bold: true })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
    }),
    new Paragraph({
        children: [new TextRun({ text: "Tác giả: ", size: 22, bold: true }), new TextRun({ text: "Vũ Tiến Huy", size: 22 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
    }),
    new Paragraph({
        children: [new TextRun({ text: "Liên hệ: huyvt1@vietsens.vn", size: 22, color: "6B7280" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
    }),
    new Paragraph({ children: [new PageBreak()] }),
);

// ── Mục lục ──
children.push(
    h1("MỤC LỤC"),
    p("1. Giới thiệu"),
    p("2. Màn hình chính (Trang chủ)"),
    p("3. Đăng ký khám bệnh"),
    p("    3.1. Đăng nhập"),
    p("    3.2. Bước 1 — Chọn cơ sở khám"),
    p("    3.3. Bước 2 — Chọn người cần khám"),
    p("    3.4. Bước 3 — Chọn chuyên khoa / phòng khám / dịch vụ / đối tượng"),
    p("4. Check-in tự động"),
    p("5. In phiếu khám tại quầy"),
    p("6. Thanh toán viện phí"),
    p("    6.1. Đăng nhập luồng thanh toán"),
    p("    6.2. Chọn hồ sơ cần thanh toán"),
    p("    6.3. Xác nhận và quét mã QR"),
    p("7. Phụ lục — Xác thực CCCD / NFC"),
    new Paragraph({ children: [new PageBreak()] }),
);

// ── 1. Giới thiệu ──
children.push(
    h1("1. GIỚI THIỆU"),
    p("VNyTe là hệ thống kiosk tự phục vụ đặt tại bệnh viện, hỗ trợ bệnh nhân và người nhà thực hiện nhanh các chức năng mà không cần xếp hàng tại quầy:"),
    bullet("Đăng ký khám bệnh — chọn cơ sở, chuyên khoa, phòng khám và dịch vụ."),
    bullet("Check-in — xác nhận đến khám từ lịch hẹn / phiếu khám đã có."),
    bullet("In phiếu khám — in lại phiếu STT/QR cho lượt khám hiện hành."),
    bullet("Thanh toán viện phí — quét QR ngân hàng/ví điện tử để thanh toán các hồ sơ còn nợ."),
    p("Tài liệu này hướng dẫn từng bước sử dụng cho 4 chức năng chính. Các ảnh chụp minh hoạ lấy từ giao diện thật của hệ thống."),
);

// ── 2. Trang chủ ──
children.push(
    h1("2. MÀN HÌNH CHÍNH (TRANG CHỦ)"),
    p("Khi mở kiosk, người dùng sẽ thấy 4 chức năng chính, chạm vào để chọn:"),
    image("Trang chủ.png", 380),
    bullet("Đăng ký khám — đặt lịch khám nhanh chóng, chọn chuyên khoa phù hợp."),
    bullet("Thanh toán — thanh toán viện phí an toàn, tiện lợi."),
    bullet("Check-in — dành cho khách hàng đã đăng ký khám online trên ứng dụng VNyTe."),
    bullet("In phiếu khám — tải và in phiếu khám tại quầy."),
    tip("Có thể quay lại Trang chủ bất kỳ lúc nào bằng cách chạm biểu tượng 🏠 Trang chủ ở góc trên phải."),
);

// ── 3. Đăng ký khám ──
children.push(
    new Paragraph({ children: [new PageBreak()] }),
    h1("3. ĐĂNG KÝ KHÁM BỆNH"),
    p("Luồng đăng ký gồm 3 bước: chọn cơ sở khám → chọn người cần khám → chọn chuyên khoa/phòng khám/dịch vụ/đối tượng. Hệ thống đi tiếp tự động sang bước sau khi đã đủ thông tin."),

    h2("3.1. Đăng nhập"),
    p("Trước khi bước vào màn hình đăng ký, hệ thống yêu cầu xác định bệnh nhân bằng một trong các cách:"),
    image("Qrcode và xác thực bằng cccd-nfc.png", 480),
    bullet("Đăng nhập bằng QR Code — mở ứng dụng VNyTe trên điện thoại, chọn Quét QR và quét mã hiển thị."),
    bullet("Xác thực bằng CCCD / NFC — nhập số CCCD, họ tên, ngày sinh, hoặc chạm thẻ CCCD gắn chip lên đầu đọc."),
    p("Khi chọn cách thứ hai, hệ thống hiện form nhập:"),
    image("Nhập thông tin cccd hoặc tap nfc.png", 380),
    bullet("Quét thẻ CCCD gắn chip (NFC) — tự động điền các trường."),
    bullet("Hoặc nhập thủ công Số CCCD, Họ và tên, Ngày sinh (dd/mm/yyyy) rồi chạm Kiểm tra thông tin."),
    note("Họ tên cần đúng chính tả như trên CCCD. Hệ thống đối chiếu với cơ sở dữ liệu bệnh viện trước khi tiếp tục."),

    h2("3.2. Bước 1 — Chọn cơ sở khám"),
    image("Chọn cơ sở khám.png", 480),
    p("Trường hợp bệnh viện chỉ có một cơ sở, hệ thống tự chọn sẵn. Chạm Tiếp tục để sang bước 2."),

    h2("3.3. Bước 2 — Chọn người cần khám"),
    image("Chọn Người Khám.png", 480),
    p("Danh sách hiển thị chủ tài khoản và người thân đã được liên kết. Mỗi mục cho biết:"),
    bullet("Họ tên + nhãn 'Chủ TK' nếu là chủ tài khoản."),
    bullet("Ngày sinh, CCCD, số điện thoại, giới tính, địa chỉ."),
    p("Chạm vào người cần khám rồi chạm Tiếp tục."),

    h2("3.4. Bước 3 — Chọn chuyên khoa, phòng khám, dịch vụ, đối tượng"),
    p("Đây là bước có 4 sub-bước tuần tự, mỗi sub-bước có thể quay lại sửa nếu cần."),

    h3("3.4.1. Chọn chuyên khoa"),
    image("Chọn Chuyên Khoa .png", 480),
    p("Danh sách các chuyên khoa của bệnh viện kèm mã. Chạm vào chuyên khoa muốn khám."),

    h3("3.4.2. Chọn phòng khám"),
    image("Chọn Phòng Khám.png", 480),
    p("Hệ thống lọc phòng khám thuộc chuyên khoa vừa chọn. Có thể chạm Đổi chuyên khoa ở góc phải nếu muốn quay lại."),

    h3("3.4.3. Chọn dịch vụ"),
    image("Chọn Dịch Vụ.png", 480),
    p("Danh sách dịch vụ khả dụng tại phòng khám. Mỗi dịch vụ kèm mã."),

    h3("3.4.4. Chọn đối tượng khám"),
    image("Chọn Đối Tượng Khám.png", 480),
    p("Chọn đối tượng phù hợp:"),
    bullet("Thu Phí — bệnh nhân không sử dụng BHYT, trả phí dịch vụ."),
    bullet("Tự Nguyện — khám theo yêu cầu, trả phí tự nguyện."),
    p("Sau khi chọn đối tượng, nút Xác nhận đăng ký sẽ chuyển sang trạng thái sẵn sàng. Chạm để hoàn tất đăng ký."),
    note("Sau khi xác nhận, hệ thống cấp số thứ tự khám và phiếu khám điện tử. Người dùng có thể in phiếu ngay (xem mục 5)."),
);

// ── 4. Check-in ──
children.push(
    new Paragraph({ children: [new PageBreak()] }),
    h1("4. CHECK-IN TỰ ĐỘNG"),
    p("Chức năng này dành cho khách đã đặt khám online trên app VNyTe trước khi đến bệnh viện. Sau khi đăng nhập (giống mục 3.1), màn hình hiện danh sách các phiếu khám trong ngày:"),
    image("Màn hình Check In.png", 380),
    bullet("Chọn thành viên — nếu một tài khoản có nhiều người thân, chọn thành viên cần check-in."),
    bullet("Mỗi card phiếu khám hiển thị: Mã phiếu, Mã điều trị, Họ tên, Giới tính, Ngày khám, Giờ khám, Phòng khám."),
    bullet("Phiếu đã check-in thành công sẽ có nhãn xanh 'Đã xác nhận' và 'Đã check-in - Mã điều trị'."),
    tip("Sau khi check-in, có thể tiếp tục sang chức năng In phiếu khám (mục 5) để lấy phiếu STT."),
);

// ── 5. In phiếu khám ──
children.push(
    new Paragraph({ children: [new PageBreak()] }),
    h1("5. IN PHIẾU KHÁM TẠI QUẦY"),
    p("Sau khi đã đăng ký hoặc check-in, người dùng có thể tự in phiếu khám tại quầy. Đăng nhập (giống mục 3.1) rồi vào Trang chủ → In phiếu khám:"),
    image("Màn In Phiếu Khám.png", 480),
    p("Danh sách hồ sơ điều trị hiển thị thông tin từng phiếu:"),
    bullet("Họ tên, Mã bệnh nhân, Ngày sinh, Giới tính."),
    bullet("Mã điều trị, Số thứ tự (STT)."),
    bullet("Dịch vụ, Phòng thực hiện, Thời gian, Phí khám."),
    p("Chạm nút In phiếu khám trên card tương ứng. Máy in tự in phiếu mẫu sau:"),
    image("Mẫu Phiếu Khám Được IN.png", 280),
    bullet("Tên bệnh viện và địa chỉ."),
    bullet("Số thứ tự khám lớn ở giữa, mã vạch để quét tại phòng khám."),
    bullet("Thông tin bệnh nhân (Họ tên, Mã BN, Ngày sinh, Giới tính, Địa chỉ, SĐT)."),
    bullet("Bảng dịch vụ với số lượng, giá, tổng tiền."),
    bullet("Phòng tiếp đón và phòng thực hiện."),
    note("Cầm phiếu khám đến phòng khám tương ứng theo STT. Trường hợp phiếu không in được, đến quầy tiếp đón để được hỗ trợ."),
);

// ── 6. Thanh toán viện phí ──
children.push(
    new Paragraph({ children: [new PageBreak()] }),
    h1("6. THANH TOÁN VIỆN PHÍ"),

    h2("6.1. Đăng nhập luồng thanh toán"),
    p("Luồng thanh toán hỗ trợ 3 cách định danh:"),
    image("Đăng Nhập Luồng Thanh Toán.png", 480),
    bullet("Đăng nhập bằng QR Code — đã có tài khoản app VNyTe, quét QR trên kiosk."),
    bullet("Xác thực bằng CCCD / NFC — chưa có tài khoản app, dùng CCCD/thẻ NFC."),
    bullet("Nhập mã hồ sơ — đã có mã hồ sơ điều trị, nhập trực tiếp (ví dụ: 000000910124) hoặc quét barcode trên phiếu cũ rồi chạm Tiếp tục."),
    tip("Nhanh nhất khi đã có phiếu điều trị với mã/barcode in sẵn."),

    h2("6.2. Chọn hồ sơ cần thanh toán"),
    image("Danh sách Hồ sơ còn nợ viện phí.png", 380),
    p("Hệ thống hiển thị danh sách hồ sơ còn nợ viện phí của bệnh nhân (hoặc người thân nếu đăng nhập bằng QR/CCCD chủ tài khoản):"),
    bullet("Họ tên, Mã hồ sơ, Mã BN."),
    bullet("Ngày nhập viện, ngày thanh toán gần nhất."),
    bullet("Số tiền còn nợ — hiển thị màu cam nổi bật."),
    p("Chạm vào hồ sơ cần thanh toán."),

    h2("6.3. Xác nhận và quét mã QR thanh toán"),
    image("Thông tin thanh toán hồ sơ.png", 380),
    p("Màn xác nhận hiển thị:"),
    bullet("Số tiền cần thanh toán (lớn, màu đỏ)."),
    bullet("Tên bệnh nhân, Mã BN, Mã hồ sơ, Ngày nhập viện."),
    p("Chạm Tạo mã QR thanh toán để sinh mã. Nếu chọn nhầm hồ sơ, chạm Quay lại."),
    image("Mã QRcode thanh toán.png", 380),
    bullet("Mở app ngân hàng hoặc ví điện tử trên điện thoại, dùng chức năng Quét QR."),
    bullet("Quét mã QR hiển thị trên kiosk. Số tiền và nội dung chuyển khoản tự động điền."),
    bullet("Xác nhận thanh toán trên app ngân hàng."),
    bullet("Kiosk theo dõi trạng thái và tự cập nhật khi giao dịch hoàn tất."),
    note("Mã QR có thời hạn ngắn. Nếu hết hạn, chạm Huỷ và quay lại danh sách để tạo mã mới."),
    note("Trạng thái 'Đang chờ thanh toán' sẽ tự đổi sang 'Đã thanh toán' khi ngân hàng gửi xác nhận về hệ thống (thường vài giây)."),
);

// ── 7. Phụ lục ──
children.push(
    new Paragraph({ children: [new PageBreak()] }),
    h1("7. PHỤ LỤC — XÁC THỰC CCCD / NFC"),
    p("Tính năng xác thực bệnh nhân bằng thẻ CCCD gắn chip (Căn cước công dân) áp dụng cho cả luồng Đăng ký khám và Thanh toán viện phí."),
    h2("7.1. Yêu cầu thẻ CCCD"),
    bullet("Thẻ CCCD do Bộ Công an cấp, có gắn chip điện tử (mã chip mặt sau)."),
    bullet("Thẻ còn hiệu lực, chưa bị hủy/cấp đổi."),
    h2("7.2. Cách quét bằng NFC"),
    bullet("Chạm Quét thẻ CCCD gắn chip (NFC) trên màn hình."),
    bullet("Đặt mặt sau của thẻ CCCD áp sát vào vùng đầu đọc NFC trên kiosk (thường có biểu tượng sóng)."),
    bullet("Giữ thẻ ổn định khoảng 2-3 giây. Hệ thống đọc và tự điền các trường thông tin."),
    h2("7.3. Cách nhập thủ công"),
    bullet("Trường Số CCCD: 12 chữ số trên mặt trước thẻ."),
    bullet("Trường Họ và tên: nhập đúng như trên CCCD, có dấu."),
    bullet("Trường Ngày sinh: định dạng dd/mm/yyyy."),
    bullet("Chạm Kiểm tra thông tin. Hệ thống đối chiếu với CSDL bệnh viện."),
    note("Nếu hệ thống báo không tìm thấy hồ sơ, vui lòng kiểm tra lại chính tả họ tên (kể cả dấu) và định dạng ngày sinh."),
);

const doc = new Document({
    creator: "Vũ Tiến Huy <huyvt1@vietsens.vn>",
    title: "Hướng dẫn sử dụng VNyTe Kiosk",
    description: "User guide for VNyTe Kiosk web — Bệnh Viện Đa Khoa Hà Đông",
    styles: {
        default: {
            document: { run: { font: "Times New Roman" } },
        },
    },
    sections: [{ children }],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(OUT, buffer);
console.log(`[OK] Wrote ${OUT}`);
console.log(`     Size: ${(buffer.length / 1024).toFixed(1)} KB`);
