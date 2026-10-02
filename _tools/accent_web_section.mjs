import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const SRC = "F:/APP-IVT/cleanatrubire/PhuLuc_ChucNang_Mobile.docx";
const WORKDIR = "C:/Users/Admin/AppData/Local/Temp/docx_extract";

// Re-extract current docx to workdir to start from latest state
fs.rmSync(WORKDIR, { recursive: true, force: true });
fs.mkdirSync(WORKDIR, { recursive: true });
execSync(`unzip -q "${SRC}" -d "${WORKDIR}"`, { stdio: "inherit" });

const docXmlPath = path.join(WORKDIR, "word/document.xml");
let doc = fs.readFileSync(docXmlPath, "utf8");

// Map: ASCII (trong phần web section vừa thêm) -> tiếng Việt có dấu
const replacements = [
  // Section title
  ["3. Danh muc chuc nang Web Kiosk VNyTe",
   "3. Danh mục chức năng Web Kiosk VNyTe"],
  ["Web Kiosk chay tren may tu phuc vu tai co so y te, ho tro benh nhan thuc hien cac tac vu ma khong can qua nhan vien.",
   "Web Kiosk chạy trên máy tự phục vụ tại cơ sở y tế, hỗ trợ bệnh nhân thực hiện các tác vụ mà không cần qua nhân viên."],

  // Group titles
  ["E. Xac thuc va Truy cap", "E. Xác thực và Truy cập"],
  ["F. Dang ky kham va Check-in", "F. Đăng ký khám và Check-in"],
  ["G. In phieu kham", "G. In phiếu khám"],
  ["H. Thanh toan vien phi", "H. Thanh toán viện phí"],
  ["I. Ha tang va Bao mat", "I. Hạ tầng và Bảo mật"],

  // E. Xac thuc
  ["Dang nhap QR Code", "Đăng nhập QR Code"],
  ["Hien thi QR tren web; benh nhan quet bang app VNyTe de dang nhap. Web polling endpoint /auth/qr-login/status 2 giay mot lan; khi app xac nhan thi web tu chuyen man.",
   "Hiển thị QR trên web; bệnh nhân quét bằng app VNyTe để đăng nhập. Web polling endpoint /auth/qr-login/status 2 giây một lần; khi app xác nhận thì web tự chuyển màn."],

  ["Xac thuc CCCD", "Xác thực CCCD"],
  ["Nhap so CCCD, ho ten, ngay sinh; he thong xac thuc qua cong VNeID. Luong rut gon cho kiosk thanh toan va in phieu kham (khong bat nhap tinh/xa).",
   "Nhập số CCCD, họ tên, ngày sinh; hệ thống xác thực qua cổng VNeID. Luồng rút gọn cho kiosk thanh toán và in phiếu khám (không bắt nhập tỉnh/xã)."],

  ["Quet NFC CCCD gan chip", "Quét NFC CCCD gắn chip"],
  ["Doc thong tin CCCD qua dau doc NFC gan voi kiosk, tu dien so, ten, ngay sinh; xac thuc tu dong.",
   "Đọc thông tin CCCD qua đầu đọc NFC gắn với kiosk, tự điền số, tên, ngày sinh; xác thực tự động."],

  ["Nhap/quet ma ho so dieu tri", "Nhập/quét mã hồ sơ điều trị"],
  ["Card thu 3 tren man login chi xuat hien khi vao luong Thanh toan; cho phep nhap ma hoac quet barcode tren phieu dieu tri; barcode scanner van hoat dong ke ca khi o nhap khong dang focus (document listener).",
   "Card thứ 3 trên màn login chỉ xuất hiện khi vào luồng Thanh toán; cho phép nhập mã hoặc quét barcode trên phiếu điều trị; barcode scanner vẫn hoạt động kể cả khi ô nhập không đang focus (document listener)."],

  ["Quan ly phien dang nhap", "Quản lý phiên đăng nhập"],
  ["Token luu o localStorage voi thoi han, tu dang xuat khi het han; QR co thoi han, hien nut 'Lay ma moi' khi expired.",
   "Token lưu ở localStorage với thời hạn, tự đăng xuất khi hết hạn; QR có thời hạn, hiện nút 'Lấy mã mới' khi expired."],

  // F. Dang ky
  ["Dang ky kham", "Đăng ký khám"],
  ["Multi-step: chon benh vien, chon benh nhan/nguoi than, chon chuyen khoa/bac si/phong kham, chon ngay gio; xac nhan va hoan tat dang ky.",
   "Multi-step: chọn bệnh viện, chọn bệnh nhân/người thân, chọn chuyên khoa/bác sĩ/phòng khám, chọn ngày giờ; xác nhận và hoàn tất đăng ký."],

  ["Xem lich hen", "Xem lịch hẹn"],
  ["Danh sach cac lich hen da dat; ho tro huy lich; filter theo benh vien va thanh vien gia dinh.",
   "Danh sách các lịch hẹn đã đặt; hỗ trợ hủy lịch; filter theo bệnh viện và thành viên gia đình."],

  ["Check-in lich hen", "Check-in lịch hẹn"],
  ["Danh cho khach hang da dat lich qua app VNyTe; xac nhan co mat tai co so y te, in phieu STT.",
   "Dành cho khách hàng đã đặt lịch qua app VNyTe; xác nhận có mặt tại cơ sở y tế, in phiếu STT."],

  // G. In phieu
  ["Tra cuu ho so dieu tri", "Tra cứu hồ sơ điều trị"],
  ["Lay danh sach ho so dieu tri cua benh nhan theo so CCCD (da xac thuc qua QR login hoac CCCD/NFC truoc do); phan trang.",
   "Lấy danh sách hồ sơ điều trị của bệnh nhân theo số CCCD (đã xác thực qua QR login hoặc CCCD/NFC trước đó); phân trang."],

  ["In phieu kham thermal 80mm", "In phiếu khám thermal 80mm"],
  ["In phieu co thong tin benh nhan, ma dieu tri, so thu tu, chan doan ICD, dich vu, phong thuc hien, chu ky bac si; kem barcode ma dieu tri de quet nhanh.",
   "In phiếu có thông tin bệnh nhân, mã điều trị, số thứ tự, chẩn đoán ICD, dịch vụ, phòng thực hiện, chữ ký bác sĩ; kèm barcode mã điều trị để quét nhanh."],

  // H. Thanh toan
  ["Danh sach ho so no theo CCCD (Luong A)", "Danh sách hồ sơ nợ theo CCCD (Luồng A)"],
  ["Sau login QR hoac CCCD, kiosk tu lay danh sach tat ca ho so dieu tri con no theo CCCD qua API /kiosk-payment/debts-by-identity; hien thi ten BN, ma ho so, ICD, so tien con no.",
   "Sau login QR hoặc CCCD, kiosk tự lấy danh sách tất cả hồ sơ điều trị còn nợ theo CCCD qua API /kiosk-payment/debts-by-identity; hiển thị tên BN, mã hồ sơ, ICD, số tiền còn nợ."],

  ["Thanh toan cho nguoi than", "Thanh toán cho người thân"],
  ["Sau QR login, neu tai khoan co nhieu benh nhan lien ket (chu tai khoan + nguoi than), kiosk hien man 'Chon nguoi benh' de user chon ai duoc thanh toan; hien thi SDT, gioi tinh, dia chi, CCCD cua tung nguoi; nguoi chua co CCCD bi vo hieu va bao ro.",
   "Sau QR login, nếu tài khoản có nhiều bệnh nhân liên kết (chủ tài khoản + người thân), kiosk hiện màn 'Chọn người bệnh' để user chọn ai được thanh toán; hiển thị SĐT, giới tính, địa chỉ, CCCD của từng người; người chưa có CCCD bị vô hiệu và báo rõ."],

  ["Nhap ma ho so truc tiep (Luong B)", "Nhập mã hồ sơ trực tiếp (Luồng B)"],
  ["Benh nhan da co phieu dieu tri co the nhap hoac quet barcode ma ho so; kiosk goi /kiosk-payment/check-debt va hien thi xac nhan so tien + thong tin benh nhan + chan doan; bo qua buoc login qua app.",
   "Bệnh nhân đã có phiếu điều trị có thể nhập hoặc quét barcode mã hồ sơ; kiosk gọi /kiosk-payment/check-debt và hiển thị xác nhận số tiền + thông tin bệnh nhân + chẩn đoán; bỏ qua bước login qua app."],

  ["Sinh QR thanh toan EMVCo", "Sinh QR thanh toán EMVCo"],
  ["Goi /kiosk-payment/generate-qr, nhan ma QR EMVCo chuan Napas, render ra man hinh de benh nhan quet bang app ngan hang/vi dien tu; hien thi ngan hang xu ly, so tien, ma giao dich.",
   "Gọi /kiosk-payment/generate-qr, nhận mã QR EMVCo chuẩn Napas, render ra màn hình để bệnh nhân quét bằng app ngân hàng/ví điện tử; hiển thị ngân hàng xử lý, số tiền, mã giao dịch."],

  ["Theo doi trang thai realtime", "Theo dõi trạng thái realtime"],
  ["Mo SSE /sse/kiosk-payment/:transReqId kem JWT ngan han (30s) de nhan su kien status va done; keep-alive 25 giay giu ket noi; tu reconnect khi upstream ngat.",
   "Mở SSE /sse/kiosk-payment/:transReqId kèm JWT ngắn hạn (30s) để nhận sự kiện status và done; keep-alive 25 giây giữ kết nối; tự reconnect khi upstream ngắt."],

  ["Hien thi trang thai va dem nguoc", "Hiển thị trạng thái và đếm ngược"],
  ["Cap nhat label trang thai realtime: Dang cho, Da thanh toan, Het han, Da huy, That bai, Qua thoi gian; dem nguoc toi expiredAt neu co.",
   "Cập nhật label trạng thái realtime: Đang chờ, Đã thanh toán, Hết hạn, Đã huỷ, Thất bại, Quá thời gian; đếm ngược tới expiredAt nếu có."],

  ["In bien nhan tu dong khi PAID", "In biên nhận tự động khi PAID"],
  ["Khi nhan duoc status PAID tu SSE, chuyen man thanh cong va tu in bien nhan qua iframe an (tranh popup blocker); kho thermal 80mm voi thong tin benh nhan, ma giao dich, ngan hang, so tien, thoi diem.",
   "Khi nhận được status PAID từ SSE, chuyển màn thành công và tự in biên nhận qua iframe ẩn (tránh popup blocker); khổ thermal 80mm với thông tin bệnh nhân, mã giao dịch, ngân hàng, số tiền, thời điểm."],

  ["Auto-reset khi benh nhan bo di", "Auto-reset khi bệnh nhân bỏ đi"],
  ["Man thanh cong tu ve trang chu sau 15s; man that bai/timeout tu quay lai danh sach ho so sau 10s; co nut bo qua dem nguoc bang tay.",
   "Màn thành công tự về trang chủ sau 15s; màn thất bại/timeout tự quay lại danh sách hồ sơ sau 10s; có nút bỏ qua đếm ngược bằng tay."],

  ["Xu ly loi nghiep vu", "Xử lý lỗi nghiệp vụ"],
  ["Map 13 ma loi cua API (KIOSK_AUTH_FAILED, KIOSK_SSE_TOKEN_INVALID, KIOSK_HISPRO_UNAVAILABLE, ...) sang thong bao tieng Viet + hanh dong goi y (retry, reset, lien he quay, bao ky thuat).",
   "Map 13 mã lỗi của API (KIOSK_AUTH_FAILED, KIOSK_SSE_TOKEN_INVALID, KIOSK_HISPRO_UNAVAILABLE, ...) sang thông báo tiếng Việt + hành động gợi ý (retry, reset, liên hệ quầy, báo kỹ thuật)."],

  // I. Ha tang
  ["Proxy noi bo an backend", "Proxy nội bộ ẩn backend"],
  ["Moi request toi backend HIS/VNT deu di qua route /api/*-proxy cua Next.js; an API key va URL backend khoi client bundle; tranh CORS va mixed-content.",
   "Mọi request tới backend HIS/VNT đều đi qua route /api/*-proxy của Next.js; ẩn API key và URL backend khỏi client bundle; tránh CORS và mixed-content."],

  ["Quan ly bien moi truong", "Quản lý biến môi trường"],
  ["Tach ro bien client (NEXT_PUBLIC_*) va server; co file .env.example lam template; docker-compose dung env_file; tai lieu tai CONFIG.md.",
   "Tách rõ biến client (NEXT_PUBLIC_*) và server; có file .env.example làm template; docker-compose dùng env_file; tài liệu tại CONFIG.md."],

  ["Da may kiosk", "Đa máy kiosk"],
  ["Moi kiosk vat ly dung mot cap KIOSK_DEVICE_CODE va KIOSK_DEVICE_SECRET do VNYTE cap; ho tro audit log theo tung kiosk.",
   "Mỗi kiosk vật lý dùng một cặp KIOSK_DEVICE_CODE và KIOSK_DEVICE_SECRET do VNYTE cấp; hỗ trợ audit log theo từng kiosk."],

  ["Deploy Docker", "Deploy Docker"],
  ["Build production qua build-and-prepare-deploy.bat tao thu muc deploy; docker compose up -d tren may chu; huong dan chi tiet trong CONFIG.md va FLOW_DOCUMENTATION.md.",
   "Build production qua build-and-prepare-deploy.bat tạo thư mục deploy; docker compose up -d trên máy chủ; hướng dẫn chi tiết trong CONFIG.md và FLOW_DOCUMENTATION.md."],
];

let changed = 0;
for (const [from, to] of replacements) {
  if (doc.includes(from)) {
    doc = doc.replace(from, to);
    changed++;
  } else {
    console.warn("NOT FOUND:", from.slice(0, 60));
  }
}
console.log(`Replaced ${changed}/${replacements.length}`);

fs.writeFileSync(docXmlPath, doc, "utf8");

process.chdir(WORKDIR);
const tmpZip = SRC + ".tmp";
try { fs.unlinkSync(tmpZip); } catch {}

execSync(`zip -r "${tmpZip}" .`, { stdio: "inherit" });
// Dùng copyFile + unlink để né trường hợp file đang mở trong Word/Viewer bị lock rename
try {
  fs.copyFileSync(tmpZip, SRC);
  fs.unlinkSync(tmpZip);
} catch (e) {
  console.error("Failed to write target. Please close any program that opened the docx (Word, Explorer preview) and retry.");
  console.error(e.message);
  process.exit(1);
}
console.log("OK wrote", SRC);
