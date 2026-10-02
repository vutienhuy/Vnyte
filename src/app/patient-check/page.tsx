"use client";
import { useState, Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { verifyCCCD } from "@/services/cccd.service";
import { readCccd } from "@/lib/nfc-reader";
import { matchCccdAddress } from "@/lib/cccd-address";
import {
  getSdaNationals,
  getSdaEthnics,
  getSdaProvinces,
  getSdaCommunes,
  type SdaNational,
  type SdaEthnic,
  type SdaProvince,
  type SdaCommune,
} from "@/services/sda.service";
import SearchableSelect from "@/components/ui/SearchableSelect";

// ─── Main ─────────────────────────────────────────────────────────────────────
function RegisterCCCDInner() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "";
  // Các luồng chỉ cần CCCD tối thiểu (không bắt nhập tỉnh/xã/địa chỉ).
  const simpleMode =
    redirectTo === "/print-invoice" || redirectTo === "/payment" || redirectTo === "/reception";

  // ── CCCD fields ──────────────────────────────────────────────────────────
  const [cccd, setCccd] = useState("");
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [dobError, setDobError] = useState("");

  // ── SDA data ─────────────────────────────────────────────────────────────
  const [nationals, setNationals] = useState<SdaNational[]>([]);
  const [ethnics, setEthnics] = useState<SdaEthnic[]>([]);
  const [provinces, setProvinces] = useState<SdaProvince[]>([]);
  const [allCommunes, setAllCommunes] = useState<SdaCommune[]>([]);
  const [communes, setCommunes] = useState<SdaCommune[]>([]);

  const [selectedNational, setSelectedNational] = useState<SdaNational | null>(null);
  const [selectedEthnic, setSelectedEthnic] = useState<SdaEthnic | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<SdaProvince | null>(null);
  const [selectedCommune, setSelectedCommune] = useState<SdaCommune | null>(null);
  const [detailAddress, setDetailAddress] = useState("");

  const [loadingSda, setLoadingSda] = useState(true);
  const [sdaError, setSdaError] = useState("");

  // ── UI state ─────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [nfcLoading, setNfcLoading] = useState(false);
  const [nfcError, setNfcError] = useState("");
  const [error, setError] = useState("");
  const [showNfcPopup, setShowNfcPopup] = useState(false);
  const [nfcAbortController, setNfcAbortController] = useState<AbortController | null>(null);
  const [nfcAutoVerifying, setNfcAutoVerifying] = useState(false);

  // ── Danh mục SDA cho handler NFC: đọc qua REF, không qua state ────────────
  //
  // handleNfc bắt đầu chạy từ lúc BẤM nút, nhưng readCccd đứng chờ người dùng
  // chạm thẻ (tối đa 30s). Closure của lần render lúc bấm giữ nguyên giá trị
  // state tại thời điểm đó — nếu danh mục chưa tải xong thì dù 20s sau nó đã
  // tải xong, lần quét ấy vẫn khớp địa chỉ trên MẢNG RỖNG và ra tỉnh/xã null.
  // Đó là lý do lần chạm thẻ đầu tiên sau khi cấu hình license + 2ID không ra
  // tỉnh/xã, còn lần thứ hai (bấm nút lại → closure mới) thì ra.
  //
  // Ref không bị đóng băng theo render nên handler luôn đọc được dữ liệu mới nhất.
  const sdaRef = useRef<{
    nationals: SdaNational[];
    ethnics: SdaEthnic[];
    provinces: SdaProvince[];
    allCommunes: SdaCommune[];
  }>({ nationals: [], ethnics: [], provinces: [], allCommunes: [] });

  /// Promise của lần tải danh mục đang chạy — handler await cái này trước khi khớp.
  const sdaReadyRef = useRef<Promise<void> | null>(null);

  // ── Load SDA data khi mount ───────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoadingSda(true);
      setSdaError("");
      try {
        const [nat, eth, prov, com] = await Promise.all([
          getSdaNationals(),
          getSdaEthnics(),
          getSdaProvinces(),
          getSdaCommunes(),
        ]);
        // Ghi ref TRƯỚC setState: handler NFC đang await sdaReadyRef, khi
        // promise resolve là nó đọc ref ngay, không chờ React commit render.
        sdaRef.current = { nationals: nat, ethnics: eth, provinces: prov, allCommunes: com };
        setNationals(nat);
        setEthnics(eth);
        setProvinces(prov);
        setAllCommunes(com);
        setCommunes(com);
        // Default: Việt Nam + Kinh
        const vn = nat.find(n => n.NATIONAL_CODE === "VN" || n.NATIONAL_NAME?.includes("Việt"));
        if (vn) setSelectedNational(vn);
        const kinh = eth.find(e => e.ETHNIC_CODE === "01" || e.ETHNIC_NAME?.toLowerCase() === "kinh");
        if (kinh) setSelectedEthnic(kinh);
      } catch {
        setSdaError("Không thể tải danh mục. Vui lòng tải lại trang.");
      } finally {
        setLoadingSda(false);
      }
    };
    // Giữ promise lại để handleNfc await được — người dùng bấm quét lúc danh
    // mục còn đang tải là chuyện bình thường trên kiosk vừa cấu hình xong.
    sdaReadyRef.current = load();
  }, []);

  // ── Lọc xã khi đổi tỉnh ──────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedProvince) {
      setCommunes(allCommunes);
      setSelectedCommune(null);
      return;
    }
    const filtered = allCommunes.filter(c => c.PROVINCE_ID === selectedProvince.ID);
    setCommunes(filtered);
    // Giữ xã nếu vẫn thuộc tỉnh vừa chọn (auto-fill NFC set cả tỉnh+xã cùng lúc); ngược lại reset.
    setSelectedCommune(prev => (prev && filtered.some(c => c.ID === prev.ID)) ? prev : null);
  }, [selectedProvince, allCommunes]);

  // ── Điều kiện hiện nút Kiểm tra ──────────────────────────────────────────
  const isFormFull = simpleMode
    ? cccd.trim().length > 0 && name.trim().length > 0 && dob.length === 10
    : cccd.trim().length > 0 &&
      name.trim().length > 0 &&
      dob.length === 10 &&
      !!selectedNational &&
      !!selectedEthnic &&
      !!selectedProvince &&
      !!selectedCommune &&
      !!detailAddress.trim();

  // ── Build enriched patient data ───────────────────────────────────────────
  const buildEnriched = (cccdData: any) => {
    if (simpleMode) return { ...cccdData };
    return {
      ...cccdData,
      nationalCode: selectedNational?.NATIONAL_CODE || "",
      nationalName: selectedNational?.NATIONAL_NAME || "",
      ethnicCode: selectedEthnic?.ETHNIC_CODE || "",
      ethnicName: selectedEthnic?.ETHNIC_NAME || "",
      provinceCode: selectedProvince?.PROVINCE_CODE || "",
      provinceName: selectedProvince?.PROVINCE_NAME || "",
      communeCode: selectedCommune?.COMMUNE_CODE || "",
      communeName: selectedCommune?.COMMUNE_NAME || "",
      address: detailAddress.trim(),
    };
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCheck = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await verifyCCCD({ cccd, name, dob });
      const d = result?.data;
      if (d && d.maKetQua != null && d.errorCode == null && d.errorDescription == null) {
        const enriched = buildEnriched(d);
        sessionStorage.setItem("cccdPatient", JSON.stringify(enriched));
        console.log("redirectTo data:", redirectTo);
        if (redirectTo) {
          window.location.href = redirectTo;
        } else {
          alert("Kiểm tra thành công!");
        }
      } else {
        setError(d?.errorDescription || "Thông tin bạn cung cấp không chính xác");
        if (d?.soCccd) setCccd(d.soCccd);
        if (d?.hoTen) setName(d.hoTen);
        if (d?.ngaySinh) setDob(d.ngaySinh);
      }
      setDobError("");
    } catch (e: any) {
      setError(e.message || "Lỗi không xác định");
    } finally {
      setLoading(false);
    }
  };

  const handleNfc = async () => {
    setShowNfcPopup(true);
    setNfcError("");
    setNfcLoading(true);
    const controller = new AbortController();
    setNfcAbortController(controller);
    try {
      const result = await readCccd({ signal: controller.signal });
      console.log("NFC result:", result);
      if (result?.result.data) {
        const d = result.result.data;
        if (d.identifyNumber) setCccd(d.identifyNumber);
        if (d.name) setName(d.name);

        // Danh mục có thể VẪN ĐANG TẢI lúc người dùng bấm nút quét (kiosk vừa
        // cấu hình xong thì sessionStorage chưa có cache, phải tải lại toàn bộ
        // danh mục xã toàn quốc). Chờ xong rồi mới khớp; đọc từ sdaRef chứ
        // không dùng biến state trong closure vì closure đã đóng băng từ lúc bấm.
        try {
          await sdaReadyRef.current;
        } catch { /* lỗi tải đã hiển thị qua sdaError */ }
        const {
          nationals: sdaNationals,
          ethnics: sdaEthnics,
          provinces: sdaProvinces,
          allCommunes: sdaAllCommunes,
        } = sdaRef.current;

        const national = sdaNationals.find(n => n.NATIONAL_NAME?.toLowerCase() === d.nationality?.toLowerCase());
        if (national) setSelectedNational(national);
        const ethnic = sdaEthnics.find(e => e.ETHNIC_NAME?.toLowerCase() === d.nation?.toLowerCase());
        if (ethnic) setSelectedEthnic(ethnic);

        // Best-effort: khớp địa chỉ thường trú của thẻ vào danh mục SDA để lấy MÃ tỉnh/xã.
        // Khớp chắc → tự chọn (buildEnriched sẽ đẩy provinceCode/communeCode lên API);
        // không khớp → chỉ đổ nguyên chuỗi vào ô Địa chỉ chi tiết, để chọn tay (tránh mã sai).
        // Địa chỉ để khớp tỉnh/xã: ưu tiên nơi cư trú (address); nếu đầu đọc để trống
        // thì fallback nơi khai sinh/quê quán (hometown) — vẫn có tỉnh/xã để auto-fill.
        const cardAddr = (d.address || d.hometown || "").trim();
        if (!simpleMode && cardAddr) {
          // Theo dõi có tự điền được tỉnh/xã không, để cuối cùng còn nhắc người
          // dùng chọn tay. Trước đây không khớp được thì màn hình im lặng, nhân
          // viên tưởng máy điền đủ rồi và bấm tiếp với tỉnh/xã trống.
          let gotProvince = false;
          let gotCommune = false;

          const m = matchCccdAddress(cardAddr, sdaProvinces, sdaAllCommunes);
          if (m.province) { setSelectedProvince(m.province); gotProvince = true; }
          if (m.commune) { setSelectedCommune(m.commune); gotCommune = true; }
          if (m.detail) setDetailAddress(m.detail);

          // Thẻ định dạng CŨ (khớp SDA trực tiếp không ra xã) → hỏi resolver mã xã cũ→mới
          // (dữ liệu GSO sáp nhập 2025) để điền chính xác Tỉnh + Xã mới.
          if (!m.commune) {
            try {
              const rr = await fetch("/api/kiosk/resolve-old-address", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ address: cardAddr }),
              });
              const rj = await rr.json();
              if (rj?.status === "OK" || rj?.status === "AMBIGUOUS") {
                const prov = sdaProvinces.find(p => p.PROVINCE_CODE === rj.provinceCode);
                if (prov) { setSelectedProvince(prov); gotProvince = true; }
                // OK → điền luôn xã mới; AMBIGUOUS (xã cũ tách nhiều xã) → chỉ điền tỉnh, để chọn tay xã.
                if (rj.status === "OK") {
                  // SDA có bản xã CŨ trùng mã (PROVINCE_ID=null) → phải lấy bản MỚI khớp tỉnh.
                  const com = sdaAllCommunes.find(c => c.COMMUNE_CODE === rj.wardCode
                    && (prov ? c.PROVINCE_ID === prov.ID : c.PROVINCE_ID != null));
                  if (com) { setSelectedCommune(com); gotCommune = true; }
                }
                // Địa chỉ chi tiết = phần trước cấp xã (số nhà/ấp), bỏ xã/huyện/tỉnh cũ.
                const ps = cardAddr.split(/[,\n;]+/).map(s => s.trim()).filter(Boolean);
                const cut = ps.length >= 3 ? ps.length - 3 : ps.length - 2;
                const det = ps.slice(0, Math.max(0, cut)).join(", ");
                if (det) setDetailAddress(det);
              }
            } catch { /* resolver lỗi → giữ fallback tỉnh-map + chọn tay */ }
          }

          // Không tự điền được thì NÓI RA. Đây là luồng "best-effort" nên im
          // lặng là sai: nhân viên không biết còn thiếu gì, chỉ thấy nút Kiểm
          // tra bị mờ mà không hiểu tại sao (isFormFull đòi đủ tỉnh + xã).
          if (!gotProvince || !gotCommune) {
            setNfcError(
              sdaProvinces.length === 0
                ? "Chưa tải được danh mục tỉnh/xã — vui lòng tải lại trang rồi quét lại."
                : `Đã đọc được thẻ nhưng chưa tự điền được ${!gotProvince ? "Tỉnh/Thành và Xã/Phường" : "Xã/Phường"} — vui lòng chọn tay ở bên dưới.`,
            );
          }
        }

        let parsedDob = d.dateOfBirth || "";
        if (d.dateOfBirth) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(d.dateOfBirth)) {
            const [yr, mo, da] = d.dateOfBirth.split("-");
            parsedDob = `${da}/${mo}/${yr}`;
          }
          setDob(parsedDob);
        }

        // Từ In phiếu khám: giữ popup, đổi text, tự động verify và chuyển trang
        if (simpleMode && d.identifyNumber && d.name && parsedDob) {
          setNfcLoading(false);
          setNfcAutoVerifying(true);
          try {
            const autoResult = await verifyCCCD({ cccd: d.identifyNumber, name: d.name, dob: parsedDob });
            const ad = autoResult?.data;
            if (ad && ad.maKetQua != null && ad.errorCode == null && ad.errorDescription == null) {
              sessionStorage.setItem("cccdPatient", JSON.stringify({ ...ad }));
              window.location.href = redirectTo;
              return;
            } else {
              setShowNfcPopup(false);
              setNfcAutoVerifying(false);
              setError(ad?.errorDescription || "Thông tin không chính xác, vui lòng kiểm tra lại");
            }
          } catch {
            setShowNfcPopup(false);
            setNfcAutoVerifying(false);
            setError("Lỗi xác thực tự động");
          }
          return;
        }
      }
      setShowNfcPopup(false);
    } catch (e: any) {
      setNfcError(e.name === "AbortError" ? "Đã hủy đọc thẻ CCCD" : e.message || "Lỗi đọc NFC");
    } finally {
      setNfcLoading(false);
    }
  };

  const handleCancelNfc = () => {
    nfcAbortController?.abort();
    setShowNfcPopup(false);
    setNfcLoading(false);
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-slate-50 to-slate-100 p-4 pb-8">
      <div className="w-full max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-slate-500 hover:text-blue-700 transition-colors cursor-pointer group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 transition-transform group-hover:-translate-x-0.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span className="text-lg font-medium">Quay lại</span>
          </a>
        </div>

        {/* Title */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-slate-800">Đăng ký thông tin CCCD</h1>
          <p className="text-lg text-slate-400 mt-1">Nhập thông tin hoặc quét thẻ NFC để điền nhanh</p>
        </div>

        {/* NFC Quick Action */}
        <div className="mb-6">
          <button
            type="button"
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl font-bold text-xl shadow-lg shadow-green-200 hover:from-green-600 hover:to-emerald-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            onClick={handleNfc}
            disabled={loading || nfcLoading}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2" fill="none" />
              <path d="M7 7h10v10H7z" />
              <circle cx="12" cy="12" r="1.5" />
            </svg>
            {nfcLoading ? "Đang đọc NFC..." : "Quét thẻ CCCD gắn chip (NFC)"}
          </button>
          {nfcError && (
            <div className="mt-2 p-2.5 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-xl text-base text-center">{nfcError}</div>
          )}
        </div>

        {/* Divider OR */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-base font-semibold text-slate-400 uppercase tracking-wider">Hoặc nhập thủ công</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* Section 1: Thông tin cá nhân */}
        <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <h2 className="text-xl font-bold text-slate-700">Thông tin cá nhân</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-lg font-medium text-slate-600 mb-1">Số CCCD <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={cccd}
                onChange={e => setCccd(e.target.value)}
                placeholder="Nhập 12 số trên thẻ CCCD"
                inputMode="numeric"
                className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-xl font-semibold text-slate-800 placeholder:text-slate-300 placeholder:font-normal focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-lg font-medium text-slate-600 mb-1">Họ và tên <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nhập đúng họ tên trên CCCD"
                className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-xl text-slate-800 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-lg font-medium text-slate-600 mb-1">Ngày sinh <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={dob}
                onChange={e => {
                  let v = e.target.value.replace(/[^0-9]/g, "");
                  if (v.length === 8) v = v.replace(/(\d{2})(\d{2})(\d{4})/, "$1/$2/$3");
                  else if (v.length > 8) v = v.slice(0, 8).replace(/(\d{2})(\d{2})(\d{4})/, "$1/$2/$3");
                  else if (v.length > 2 && v.length <= 4) v = v.replace(/(\d{2})(\d{1,2})/, "$1/$2");
                  else if (v.length > 4 && v.length < 8) v = v.replace(/(\d{2})(\d{2})(\d{1,4})/, "$1/$2/$3");
                  setDob(v);
                  setDobError("");
                }}
                placeholder="dd/mm/yyyy"
                maxLength={10}
                inputMode="numeric"
                className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-xl text-slate-800 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition"
              />
              {dobError && <p className="text-sm text-red-500 mt-1">{dobError}</p>}
            </div>

            {!simpleMode && (
            <div className="grid grid-cols-2 gap-4">
              <SearchableSelect<SdaNational>
                label={<>Quốc tịch <span className="text-red-400">*</span></> as any}
                placeholder="Chọn quốc tịch"
                items={nationals}
                value={selectedNational}
                getKey={it => it.ID ?? it.NATIONAL_CODE ?? ""}
                getLabel={it => it.NATIONAL_NAME || ""}
                onChange={setSelectedNational}
                loading={loadingSda}
              />

              <SearchableSelect<SdaEthnic>
                label={<>Dân tộc <span className="text-red-400">*</span></> as any}
                placeholder="Chọn dân tộc"
                items={ethnics}
                value={selectedEthnic}
                getKey={it => it.ID ?? it.ETHNIC_CODE ?? ""}
                getLabel={it => it.ETHNIC_NAME || ""}
                onChange={setSelectedEthnic}
                loading={loadingSda}
              />
            </div>
            )}
          </div>
        </div>

        {/* Section 2: Địa chỉ (ẩn khi từ In phiếu khám) */}
        {!simpleMode && (
        <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h2 className="text-xl font-bold text-slate-700">Địa chỉ thường trú</h2>
          </div>

          {sdaError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-base rounded-xl">{sdaError}</div>
          )}

          <div className="space-y-4">
            <SearchableSelect<SdaProvince>
              label={<>Tỉnh/Thành phố <span className="text-red-400">*</span></> as any}
              placeholder="Chọn tỉnh/thành phố"
              items={provinces}
              value={selectedProvince}
              getKey={it => it.ID ?? it.PROVINCE_CODE ?? ""}
              getLabel={it => it.PROVINCE_NAME || ""}
              onChange={p => { setSelectedProvince(p); setSelectedCommune(null); }}
              loading={loadingSda}
            />

            <SearchableSelect<SdaCommune>
              label={<>Xã/Phường/Thị trấn <span className="text-red-400">*</span></> as any}
              placeholder={selectedProvince ? "Chọn xã/phường/thị trấn" : "Vui lòng chọn tỉnh/thành phố trước"}
              items={communes}
              value={selectedCommune}
              getKey={it => it.ID ?? it.COMMUNE_CODE ?? ""}
              getLabel={it => `${it.INITIAL_NAME ? it.INITIAL_NAME + " " : ""}${it.COMMUNE_NAME || ""}`.trim()}
              onChange={setSelectedCommune}
              loading={loadingSda}
              disabled={!selectedProvince}
            />

            <div>
              <label className="block text-lg font-medium text-slate-600 mb-1">Địa chỉ chi tiết <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={detailAddress}
                onChange={e => setDetailAddress(e.target.value)}
                placeholder="Số nhà, thôn/ấp, đường..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-xl text-slate-800 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition"
              />
            </div>
          </div>
        </div>
        )}

        {/* Errors */}
        {error && (
          <div className="mb-4 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-base text-center font-medium">{error}</div>
        )}

        {/* Submit button - always visible */}
        <button
          type="button"
          onClick={handleCheck}
          disabled={loading || !isFormFull}
          className="w-full flex items-center justify-center gap-2.5 px-4 py-4 bg-blue-700 text-white rounded-2xl font-bold text-2xl shadow-lg shadow-blue-200 hover:bg-blue-800 active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <>
              <span className="w-6 h-6 border-4 border-blue-200 border-t-white rounded-full animate-spin" />
              Đang kiểm tra...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Kiểm tra thông tin
            </>
          )}
        </button>

        {/* Hint */}
        {!isFormFull && (
          <p className="text-center text-base text-slate-400 mt-3">
            {simpleMode
              ? "Vui lòng nhập Số CCCD, Họ tên và Ngày sinh để tiếp tục"
              : <>Vui lòng điền đầy đủ các trường có dấu <span className="text-red-400 font-medium">*</span> để tiếp tục</>
            }
          </p>
        )}
      </div>

      {/* ── NFC Popup ──────────────────────────────────────────────────────── */}
      {showNfcPopup && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.3)" }}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center border border-blue-100 min-w-[320px] max-w-[400px] mx-4">
            {nfcAutoVerifying ? (
              <>
                <div className="w-16 h-16 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mb-5" />
                <div className="text-slate-800 font-bold text-xl mb-2 text-center">Đang xác thực thông tin...</div>
                <div className="text-slate-500 text-base mb-5 text-center">Vui lòng chờ, hệ thống đang kiểm tra và chuyển hướng.</div>
              </>
            ) : (
              <>
                <svg className="w-20 h-20 text-blue-700 animate-pulse mb-5" viewBox="0 0 64 64" fill="none">
                  <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="#ECFEFF" />
                  <rect x="20" y="20" width="24" height="24" rx="6" stroke="currentColor" strokeWidth="3" fill="#fff" />
                  <path d="M32 28v8" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="32" cy="36" r="1.5" fill="#06b6d4" />
                </svg>
                <div className="text-slate-800 font-bold text-xl mb-2 text-center">Đưa thẻ CCCD lại gần thiết bị</div>
                <div className="text-slate-500 text-base mb-5 text-center">Giữ thẻ gắn chip gần thiết bị cho đến khi hoàn tất.</div>
                {nfcLoading && <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin mb-4" />}
                <button
                  className="w-full px-8 py-3 bg-red-500 text-white rounded-xl font-semibold text-lg hover:bg-red-600 active:scale-[0.98] transition-all cursor-pointer"
                  onClick={handleCancelNfc}
                >
                  Huỷ thao tác
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RegisterCCCD() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin" />
      </div>
    }>
      <RegisterCCCDInner />
    </Suspense>
  );
}
