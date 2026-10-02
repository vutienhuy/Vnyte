"use client";

// Trang Tái khám (kiosk-reception). Hai luồng theo BMC — Kiosk Reception API v1.0 §5:
//   • Luồng A (recommended): vào với ?code=<treatmentCode> (quét/nhập mã hẹn khám trên trang login)
//     → follow-up-by-treatment → xác nhận → create-treatment-from-follow-up → in phiếu. KHÔNG cần login.
//   • Luồng B: đã đăng nhập QR (JWT) → chọn thành viên → follow-up-by-identity → chọn lịch hẹn
//     → xác nhận → create → in phiếu.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import MemberDropdown from "@/components/appointments/MemberDropdown";
import { COMMON_STYLES } from "@/constants/styles";
import { getReceptionError } from "@/constants/reception-errors";
import {
  getFollowUpByTreatment,
  getFollowUpByIdentity,
  createTreatmentFromFollowUp,
  ReceptionError,
} from "@/services/reception.service";
import { getPatientList } from "@/services/registration.service";
import { printHtml } from "@/lib/kiosk-print";
import { buildExamSlipHtml, slipFromCreatedTreatment } from "@/lib/exam-slip";
import type { FollowUpItem, CreatedTreatmentResult } from "@/types/reception";
import type { Patient } from "@/types/registration";

// ── In phiếu tiếp đón 80mm ──
// Bố cục nằm ở @/lib/exam-slip, dùng chung với luồng đăng ký khám và in lại
// phiếu. Ở đây chỉ quy shape CreatedTreatmentResult về ExamSlip.
function buildReceptionTicketHtml(r: CreatedTreatmentResult): string {
  return buildExamSlipHtml(slipFromCreatedTreatment(r, { title: "Phiếu tiếp đón" }));
}

// ── Thẻ hiển thị 01 lịch hẹn tái khám + nút tạo hồ sơ ──
function FollowUpCard({
  item,
  onCreate,
  creating,
}: {
  item: FollowUpItem;
  onCreate: (item: FollowUpItem) => void;
  creating: boolean;
}) {
  const blocked = item.isAlreadyUsed;
  return (
    <div className={`${COMMON_STYLES.glassMorphism} rounded-2xl overflow-hidden shadow-sm`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
        <div>
          <p className="text-lg text-slate-500">Mã hẹn khám</p>
          <p className="font-bold text-slate-800 text-xl">{item.previousTreatmentCode}</p>
        </div>
        {item.hasBhytCard === 1 && (
          <span className="inline-flex items-center px-3 py-1 bg-emerald-100 text-emerald-700 text-base font-semibold rounded-full">
            Có thẻ BHYT
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <p className="text-lg text-slate-500">Họ tên</p>
            <p className="font-medium text-slate-800 text-xl">{item.patientName || "—"}</p>
          </div>
          <div>
            <p className="text-lg text-slate-500">Mã BN</p>
            <p className="font-medium text-slate-800 text-xl">{item.patientCode || "—"}</p>
          </div>
          <div>
            <p className="text-lg text-slate-500">Ngày hẹn</p>
            <p className="font-medium text-slate-800 text-xl">{item.appointmentDate || "—"}</p>
          </div>
          <div>
            <p className="text-lg text-slate-500">Giờ hẹn</p>
            <p className="font-medium text-slate-800 text-xl">{item.appointmentTime || "—"}</p>
          </div>
        </div>

        <div className="p-2.5 bg-slate-50 rounded-lg">
          <p className="text-lg text-slate-500">Dịch vụ khám</p>
          <p className="font-medium text-slate-800 text-xl">{item.examServiceName || "—"}</p>
          <p className="text-base text-slate-500 mt-0.5">
            Đối tượng: {item.previousPatientTypeName || "—"}
          </p>
        </div>

        {item.isAlreadyAttended && !item.isAlreadyUsed && (
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-base">
            Lưu ý: bệnh nhân đã có hồ sơ khám trong hôm nay — kiểm tra tránh tạo trùng.
          </div>
        )}

        {item.isAlreadyUsed ? (
          <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 text-base flex items-center gap-2">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Lịch hẹn này đã được tạo hồ sơ tái khám.
          </div>
        ) : (
          <button
            onClick={() => onCreate(item)}
            disabled={blocked || creating}
            className="w-full py-3 bg-blue-900 hover:bg-blue-700 text-white text-xl font-semibold rounded-xl transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {creating ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Đang tạo hồ sơ...
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Tạo hồ sơ tái khám
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Modal kết quả: thông tin phiếu khám + in ──
function TicketModal({
  result,
  onClose,
  onPrint,
  printing,
}: {
  result: CreatedTreatmentResult;
  onClose: () => void;
  onPrint: () => void;
  printing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6 flex flex-col items-center text-center border-b border-slate-100">
          <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-3">
            <svg className="w-9 h-9 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-slate-800">Tạo hồ sơ thành công</h3>
          <p className="text-slate-500 text-lg mt-1">Vui lòng nhận phiếu khám tại máy in.</p>
        </div>

        <div className="p-6 space-y-3 text-left">
          <div className="text-center mb-2">
            <p className="text-lg text-slate-500">Số thứ tự</p>
            <p className="text-5xl font-bold text-blue-800">{result.treatment?.numOrder}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-lg">
            <div>
              <p className="text-slate-500">Họ tên</p>
              <p className="font-semibold text-slate-800">{result.patient?.name}</p>
            </div>
            <div>
              <p className="text-slate-500">Mã điều trị</p>
              <p className="font-semibold text-slate-800">{result.treatment?.code}</p>
            </div>
            <div className="col-span-2">
              <p className="text-slate-500">Phòng khám</p>
              <p className="font-semibold text-slate-800">{result.treatment?.examRoom?.name}</p>
              {result.treatment?.examRoom?.address && (
                <p className="text-base text-slate-500">{result.treatment.examRoom.address}</p>
              )}
            </div>
            <div className="col-span-2">
              <p className="text-slate-500">Dịch vụ</p>
              <p className="font-semibold text-slate-800">{result.service?.name}</p>
            </div>
            <div>
              <p className="text-slate-500">Đối tượng</p>
              <p className="font-semibold text-slate-800">{result.service?.patientTypeName}</p>
            </div>
            <div>
              <p className="text-slate-500">Tiền khám</p>
              <p className="font-semibold text-cyan-700">
                {(result.service?.price ?? 0).toLocaleString("vi-VN")} đ
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 text-lg cursor-pointer"
          >
            Đóng
          </button>
          <button
            onClick={onPrint}
            disabled={printing}
            className="flex-1 py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-xl text-lg flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            {printing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Đang in...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                In phiếu khám
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReceptionInner() {
  const searchParams = useSearchParams();
  const scannedCode = searchParams.get("code")?.trim() || "";
  const mode: "treatment" | "identity" = scannedCode ? "treatment" : "identity";

  // Chung
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string } | null>(null);
  const [items, setItems] = useState<FollowUpItem[]>([]);

  // Luồng QR login (identity qua thành viên)
  const [members, setMembers] = useState<Patient[]>([]);
  const [selectedMember, setSelectedMember] = useState<Patient | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(mode === "identity");

  // Luồng CCCD: patient-check verify CCCD → sessionStorage cccdPatient (không có JWT).
  const [isCccdMode, setIsCccdMode] = useState(false);
  const [cccdData, setCccdData] = useState<{ soCccd?: string; hoTen?: string; ngaySinh?: string } | null>(null);

  // Tạo hồ sơ
  const [pendingItem, setPendingItem] = useState<FollowUpItem | null>(null);
  const [creatingCode, setCreatingCode] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedTreatmentResult | null>(null);
  const [printing, setPrinting] = useState(false);

  const setReceptionError = (e: unknown) => {
    if (e instanceof ReceptionError) {
      setError({ message: getReceptionError(e.code).message });
    } else {
      setError({ message: getReceptionError(null).message });
    }
  };

  // ── Luồng A: quét mã hẹn khám ──
  const loadByTreatment = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const item = await getFollowUpByTreatment(code);
      setItems(item ? [item] : []);
    } catch (e) {
      setItems([]);
      setReceptionError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Luồng B: tra theo CCCD của thành viên đã chọn ──
  const loadByIdentity = useCallback(async (identityNumber: string) => {
    if (!identityNumber) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await getFollowUpByIdentity(identityNumber);
      setItems(list);
    } catch (e) {
      setItems([]);
      setReceptionError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Cleanup cccdPatient khi rời trang
  useEffect(() => () => { sessionStorage.removeItem("cccdPatient"); }, []);

  // Init
  useEffect(() => {
    if (mode === "treatment") {
      loadByTreatment(scannedCode);
      return;
    }
    // Luồng CCCD: đã verify CCCD ở patient-check → dùng soCccd làm identityNumber (không cần JWT).
    const cccdRaw = typeof window !== "undefined" ? sessionStorage.getItem("cccdPatient") : null;
    if (cccdRaw) {
      try {
        const d = JSON.parse(cccdRaw);
        setCccdData(d);
        setIsCccdMode(true);
        setLoadingMembers(false);
        loadByIdentity(d?.soCccd || "");
        return;
      } catch { /* parse lỗi → rơi xuống luồng JWT */ }
    }
    // Luồng QR login: cần JWT. Chưa login → quay về trang đăng nhập.
    const jwt = typeof window !== "undefined" ? localStorage.getItem("gatewayToken") : null;
    if (!jwt) {
      window.location.href = "/login?redirect=/reception";
      return;
    }
    const initMembers = async () => {
      const patientCode = localStorage.getItem("patientCode") || "";
      try {
        const res = await getPatientList(patientCode);
        const list = (res.data || [])
          .map((m) => ({ ...m, isOwner: m.patientCode === patientCode }))
          .sort((a, b) => (a.isOwner ? -1 : b.isOwner ? 1 : 0));
        setMembers(list);
        setSelectedMember(list[0] || null);
      } catch {
        setError({ message: "Không thể tải danh sách thành viên." });
      } finally {
        setLoadingMembers(false);
      }
    };
    initMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, scannedCode]);

  // Load follow-ups khi đổi thành viên (Luồng B)
  useEffect(() => {
    if (mode !== "identity" || isCccdMode) return; // CCCD mode đã load trong init
    if (!selectedMember) {
      if (!loadingMembers) setLoading(false);
      return;
    }
    loadByIdentity(selectedMember.idNumber || selectedMember.identityNumber || "");
  }, [mode, isCccdMode, selectedMember, loadingMembers, loadByIdentity]);

  // ── Tạo hồ sơ (sau khi xác nhận → confirmCreate=true) ──
  const handleConfirmCreate = async () => {
    const item = pendingItem;
    setPendingItem(null);
    if (!item) return;
    setCreatingCode(item.previousTreatmentCode);
    setError(null);
    try {
      const created = await createTreatmentFromFollowUp(item.previousTreatmentCode, true);
      setResult(created);
      // Cập nhật lại danh sách (identity) để phản ánh isAlreadyUsed
      if (mode === "identity" && isCccdMode) {
        loadByIdentity(cccdData?.soCccd || "");
      } else if (mode === "identity" && selectedMember) {
        loadByIdentity(selectedMember.idNumber || selectedMember.identityNumber || "");
      } else {
        setItems((prev) =>
          prev.map((it) =>
            it.previousTreatmentCode === item.previousTreatmentCode
              ? { ...it, isAlreadyUsed: true }
              : it,
          ),
        );
      }
    } catch (e) {
      setReceptionError(e);
    } finally {
      setCreatingCode(null);
    }
  };

  const handlePrint = async () => {
    if (!result) return;
    setPrinting(true);
    try {
      await printHtml(buildReceptionTicketHtml(result));
    } catch (e) {
      setError({ message: (e as Error).message || "In phiếu thất bại" });
    } finally {
      setTimeout(() => setPrinting(false), 1500);
    }
  };

  return (
    <AppLayout>
      <div className={`min-h-screen ${COMMON_STYLES.fullBackground} pb-12`}>
        <main className="max-w-3xl mx-auto px-4 py-6">
          <div className="text-center mb-5">
            <h1 className="text-3xl font-bold text-slate-800">Tái khám</h1>
            <p className="text-xl text-slate-500 mt-0.5">
              {mode === "treatment"
                ? "Xác nhận lịch hẹn từ mã hẹn khám và tạo hồ sơ tái khám"
                : "Chọn lịch hẹn tái khám để tạo hồ sơ"}
            </p>
          </div>

          {/* Luồng CCCD: banner thông tin đã xác thực */}
          {mode === "identity" && isCccdMode && (
            <div className="py-2 mb-4">
              <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-lg text-green-600 font-medium">Thông tin từ CCCD/NFC</p>
                  <p className="font-semibold text-slate-800 text-xl">{cccdData?.hoTen || "—"}</p>
                  <p className="text-base text-slate-500">CCCD: {cccdData?.soCccd || "—"}{cccdData?.ngaySinh ? ` · Ngày sinh: ${cccdData.ngaySinh}` : ""}</p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-base rounded-full font-medium">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Đã kiểm tra
                </span>
              </div>
            </div>
          )}

          {/* Luồng QR login: chọn thành viên */}
          {mode === "identity" && !isCccdMode && (
            <div className="py-2 mb-4">
              <MemberDropdown
                members={members}
                selectedMember={selectedMember}
                onSelect={setSelectedMember}
                loading={loadingMembers}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-5 flex items-center justify-between text-lg gap-3">
              <span>{error.message}</span>
              <button
                onClick={() =>
                  mode === "treatment"
                    ? loadByTreatment(scannedCode)
                    : isCccdMode
                      ? loadByIdentity(cccdData?.soCccd || "")
                      : loadByIdentity(selectedMember?.idNumber || selectedMember?.identityNumber || "")
                }
                className="font-medium underline cursor-pointer shrink-0"
              >
                Thử lại
              </button>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="space-y-4">
              <div className="h-48 bg-white/60 rounded-2xl animate-pulse" />
              <div className="h-48 bg-white/60 rounded-2xl animate-pulse" />
            </div>
          ) : items.length > 0 ? (
            <div className="space-y-4">
              {items.map((item) => (
                <FollowUpCard
                  key={item.previousTreatmentCode}
                  item={item}
                  onCreate={setPendingItem}
                  creating={creatingCode === item.previousTreatmentCode}
                />
              ))}
            </div>
          ) : (
            !error && (
              <div className="text-center py-12">
                <p className="text-slate-500 text-xl">Không tìm thấy lịch hẹn tái khám phù hợp.</p>
                {mode === "treatment" && (
                  <a
                    href="/login?redirect=/reception"
                    className="inline-block mt-4 px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white text-lg font-semibold rounded-xl cursor-pointer"
                  >
                    Quét lại mã hẹn khám
                  </a>
                )}
              </div>
            )
          )}
        </main>
      </div>

      {/* Xác nhận tạo hồ sơ — đáp ứng confirmCreate=true (§4.3, §7) */}
      <ConfirmDialog
        isOpen={pendingItem !== null}
        onClose={() => setPendingItem(null)}
        onConfirm={handleConfirmCreate}
        title="Đồng ý tạo hồ sơ hẹn khám"
        message={
          pendingItem
            ? `Tạo hồ sơ tái khám cho ${pendingItem.patientName} — dịch vụ ${pendingItem.examServiceName}? Thao tác này không thể hủy.`
            : ""
        }
        confirmText="Đồng ý tạo hồ sơ"
        cancelText="Huỷ"
        variant="success"
        icon="check"
      />

      {/* Kết quả + in phiếu */}
      {result && (
        <TicketModal
          result={result}
          onClose={() => setResult(null)}
          onPrint={handlePrint}
          printing={printing}
        />
      )}
    </AppLayout>
  );
}

export default function ReceptionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin" />
        </div>
      }
    >
      <ReceptionInner />
    </Suspense>
  );
}
