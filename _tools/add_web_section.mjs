import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const SRC = "F:/APP-IVT/cleanatrubire/PhuLuc_ChucNang_Mobile.docx";
const WORKDIR = "C:/Users/Admin/AppData/Local/Temp/docx_extract";

const docXmlPath = path.join(WORKDIR, "word/document.xml");
let doc = fs.readFileSync(docXmlPath, "utf8");

const cell = (text, bold = false, header = false) => {
  const rpr = bold ? "<w:rPr><w:b/></w:rPr>" : "";
  const shd = header ? '<w:shd w:val="clear" w:color="auto" w:fill="E7D9BD"/>' : "";
  return (
    '<w:tc><w:tcPr><w:tcW w:w="3276" w:type="dxa"/>' + shd + "</w:tcPr>" +
    "<w:p><w:r>" + rpr + '<w:t xml:space="preserve">' + text + "</w:t></w:r></w:p></w:tc>"
  );
};

const cellWide = (text, bold = false, header = false) => {
  const rpr = bold ? "<w:rPr><w:b/></w:rPr>" : "";
  const shd = header ? '<w:shd w:val="clear" w:color="auto" w:fill="E7D9BD"/>' : "";
  return (
    '<w:tc><w:tcPr><w:tcW w:w="6084" w:type="dxa"/>' + shd + "</w:tcPr>" +
    "<w:p><w:r>" + rpr + '<w:t xml:space="preserve">' + text + "</w:t></w:r></w:p></w:tc>"
  );
};

const TBL_PROPS =
  "<w:tblPr>" +
  '  <w:tblW w:w="5000" w:type="pct"/>' +
  "  <w:tblBorders>" +
  '    <w:top     w:val="single" w:sz="4" w:space="0" w:color="808080"/>' +
  '    <w:left    w:val="single" w:sz="4" w:space="0" w:color="808080"/>' +
  '    <w:bottom  w:val="single" w:sz="4" w:space="0" w:color="808080"/>' +
  '    <w:right   w:val="single" w:sz="4" w:space="0" w:color="808080"/>' +
  '    <w:insideH w:val="single" w:sz="4" w:space="0" w:color="B0B0B0"/>' +
  '    <w:insideV w:val="single" w:sz="4" w:space="0" w:color="B0B0B0"/>' +
  "  </w:tblBorders>" +
  '  <w:tblLayout w:type="fixed"/>' +
  '</w:tblPr><w:tblGrid><w:gridCol w:w="3276"/><w:gridCol w:w="6084"/></w:tblGrid>';

const table = (title, rows) => {
  let out =
    '<w:p><w:pPr><w:spacing w:after="60"/></w:pPr>' +
    '<w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="1F4E79"/></w:rPr>' +
    '<w:t xml:space="preserve">' + title + "</w:t></w:r></w:p>";
  out += "<w:tbl>" + TBL_PROPS;
  out +=
    "<w:tr>" +
    cell("Chuc nang", true, true) +
    cellWide("Mo ta", true, true) +
    "</w:tr>";
  for (const [fn, desc] of rows) {
    out += "<w:tr>" + cell(fn) + cellWide(desc) + "</w:tr>";
  }
  out += "</w:tbl><w:p/>";
  return out;
};

let WEB_SECTION =
  '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>' +
  '<w:r><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="7A3E00"/></w:rPr>' +
  '<w:t xml:space="preserve">3. Danh muc chuc nang Web Kiosk VNyTe</w:t></w:r></w:p>' +
  '<w:p><w:pPr><w:ind w:left="284"/></w:pPr>' +
  '<w:r><w:t xml:space="preserve">Web Kiosk chay tren may tu phuc vu tai co so y te, ho tro benh nhan thuc hien cac tac vu ma khong can qua nhan vien.</w:t></w:r></w:p>' +
  "<w:p/>";

WEB_SECTION += table("E. Xac thuc va Truy cap", [
  ["Dang nhap QR Code",
    "Hien thi QR tren web; benh nhan quet bang app VNyTe de dang nhap. Web polling endpoint /auth/qr-login/status 2 giay mot lan; khi app xac nhan thi web tu chuyen man."],
  ["Xac thuc CCCD",
    "Nhap so CCCD, ho ten, ngay sinh; he thong xac thuc qua cong VNeID. Luong rut gon cho kiosk thanh toan va in phieu kham (khong bat nhap tinh/xa)."],
  ["Quet NFC CCCD gan chip",
    "Doc thong tin CCCD qua dau doc NFC gan voi kiosk, tu dien so, ten, ngay sinh; xac thuc tu dong."],
  ["Nhap/quet ma ho so dieu tri",
    "Card thu 3 tren man login chi xuat hien khi vao luong Thanh toan; cho phep nhap ma hoac quet barcode tren phieu dieu tri; barcode scanner van hoat dong ke ca khi o nhap khong dang focus (document listener)."],
  ["Quan ly phien dang nhap",
    "Token luu o localStorage voi thoi han, tu dang xuat khi het han; QR co thoi han, hien nut 'Lay ma moi' khi expired."],
]);

WEB_SECTION += table("F. Dang ky kham va Check-in", [
  ["Dang ky kham",
    "Multi-step: chon benh vien, chon benh nhan/nguoi than, chon chuyen khoa/bac si/phong kham, chon ngay gio; xac nhan va hoan tat dang ky."],
  ["Xem lich hen",
    "Danh sach cac lich hen da dat; ho tro huy lich; filter theo benh vien va thanh vien gia dinh."],
  ["Check-in lich hen",
    "Danh cho khach hang da dat lich qua app VNyTe; xac nhan co mat tai co so y te, in phieu STT."],
]);

WEB_SECTION += table("G. In phieu kham", [
  ["Tra cuu ho so dieu tri",
    "Lay danh sach ho so dieu tri cua benh nhan theo so CCCD (da xac thuc qua QR login hoac CCCD/NFC truoc do); phan trang."],
  ["In phieu kham thermal 80mm",
    "In phieu co thong tin benh nhan, ma dieu tri, so thu tu, chan doan ICD, dich vu, phong thuc hien, chu ky bac si; kem barcode ma dieu tri de quet nhanh."],
]);

WEB_SECTION += table("H. Thanh toan vien phi", [
  ["Danh sach ho so no theo CCCD (Luong A)",
    "Sau login QR hoac CCCD, kiosk tu lay danh sach tat ca ho so dieu tri con no theo CCCD qua API /kiosk-payment/debts-by-identity; hien thi ten BN, ma ho so, ICD, so tien con no."],
  ["Thanh toan cho nguoi than",
    "Sau QR login, neu tai khoan co nhieu benh nhan lien ket (chu tai khoan + nguoi than), kiosk hien man 'Chon nguoi benh' de user chon ai duoc thanh toan; hien thi SDT, gioi tinh, dia chi, CCCD cua tung nguoi; nguoi chua co CCCD bi vo hieu va bao ro."],
  ["Nhap ma ho so truc tiep (Luong B)",
    "Benh nhan da co phieu dieu tri co the nhap hoac quet barcode ma ho so; kiosk goi /kiosk-payment/check-debt va hien thi xac nhan so tien + thong tin benh nhan + chan doan; bo qua buoc login qua app."],
  ["Sinh QR thanh toan EMVCo",
    "Goi /kiosk-payment/generate-qr, nhan ma QR EMVCo chuan Napas, render ra man hinh de benh nhan quet bang app ngan hang/vi dien tu; hien thi ngan hang xu ly, so tien, ma giao dich."],
  ["Theo doi trang thai realtime",
    "Mo SSE /sse/kiosk-payment/:transReqId kem JWT ngan han (30s) de nhan su kien status va done; keep-alive 25 giay giu ket noi; tu reconnect khi upstream ngat."],
  ["Hien thi trang thai va dem nguoc",
    "Cap nhat label trang thai realtime: Dang cho, Da thanh toan, Het han, Da huy, That bai, Qua thoi gian; dem nguoc toi expiredAt neu co."],
  ["In bien nhan tu dong khi PAID",
    "Khi nhan duoc status PAID tu SSE, chuyen man thanh cong va tu in bien nhan qua iframe an (tranh popup blocker); kho thermal 80mm voi thong tin benh nhan, ma giao dich, ngan hang, so tien, thoi diem."],
  ["Auto-reset khi benh nhan bo di",
    "Man thanh cong tu ve trang chu sau 15s; man that bai/timeout tu quay lai danh sach ho so sau 10s; co nut bo qua dem nguoc bang tay."],
  ["Xu ly loi nghiep vu",
    "Map 13 ma loi cua API (KIOSK_AUTH_FAILED, KIOSK_SSE_TOKEN_INVALID, KIOSK_HISPRO_UNAVAILABLE, ...) sang thong bao tieng Viet + hanh dong goi y (retry, reset, lien he quay, bao ky thuat)."],
]);

WEB_SECTION += table("I. Ha tang va Bao mat", [
  ["Proxy noi bo an backend",
    "Moi request toi backend HIS/VNT deu di qua route /api/*-proxy cua Next.js; an API key va URL backend khoi client bundle; tranh CORS va mixed-content."],
  ["Quan ly bien moi truong",
    "Tach ro bien client (NEXT_PUBLIC_*) va server; co file .env.example lam template; docker-compose dung env_file; tai lieu tai CONFIG.md."],
  ["Da may kiosk",
    "Moi kiosk vat ly dung mot cap KIOSK_DEVICE_CODE va KIOSK_DEVICE_SECRET do VNYTE cap; ho tro audit log theo tung kiosk."],
  ["Deploy Docker",
    "Build production qua build-and-prepare-deploy.bat tao thu muc deploy; docker compose up -d tren may chu; huong dan chi tiet trong CONFIG.md va FLOW_DOCUMENTATION.md."],
]);

const OLD_GHI_CHU = '<w:t xml:space="preserve">3. Ghi chu</w:t>';
const NEW_GHI_CHU = '<w:t xml:space="preserve">4. Ghi chu</w:t>';

if (!doc.includes(OLD_GHI_CHU)) {
  console.error("Cannot find Ghi chu anchor");
  process.exit(1);
}

const idx = doc.indexOf(OLD_GHI_CHU);
let start = doc.lastIndexOf("<w:p>", idx);
if (start < 0) start = doc.lastIndexOf("<w:p ", idx);

doc = doc.slice(0, start) + WEB_SECTION + doc.slice(start);
doc = doc.replace(OLD_GHI_CHU, NEW_GHI_CHU);

doc = doc.replace(
  "DANH MỤC CHỨC NĂNG ỨNG DỤNG MOBILE VNTCloud (VNyTe)",
  "DANH MỤC CHỨC NĂNG ỨNG DỤNG MOBILE &amp; WEB KIOSK VNyTe",
);

fs.writeFileSync(docXmlPath, doc, "utf8");

process.chdir(WORKDIR);
const tmpZip = SRC + ".tmp";
try { fs.unlinkSync(tmpZip); } catch {}

execSync(`zip -r "${tmpZip}" .`, { stdio: "inherit" });

fs.renameSync(tmpZip, SRC);
console.log("OK wrote", SRC);
