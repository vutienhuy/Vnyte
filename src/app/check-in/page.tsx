"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getPatientList,
  getHospitals,
  getTypePatientInKiosk,
  registerHisTreatment,
} from "@/services/registration.service";
import { getAppointments } from "@/services/appointment.service";
import type { Patient, Hospital, PatientType } from "@/types/registration";
import type { AppointmentDetailModel } from "@/types/appointment";
import { SHOW_EXAM_FEE } from "@/lib/feature-flags";

import HospitalDropdown from "@/components/appointments/HospitalDropdown";
import MemberDropdown from "@/components/appointments/MemberDropdown";
import AppointmentSkeleton from "@/components/appointments/AppointmentSkeleton";
import EmptyState from "@/components/appointments/EmptyState";
import { COMMON_STYLES } from "@/constants/styles";
import AppLayout from "@/components/layout/AppLayout";
import { formatDate, formatCurrency } from "@/components/utils/formatters";
import AppointmentStatusBadge from "@/components/appointments/AppointmentStatusBadge";
import { printRegisteredTreatment } from "@/lib/treatment-print";

interface ToastState {
  visible: boolean;
  message: string;
  type: "success" | "error";
}

interface CccdData {
  hoTen?: string | null;
  ngaySinh?: string | null;
  gioiTinh?: string | null;
  soCccd?: string | null;
  maGioiTinh?: number | null;
  [key: string]: any;
}

interface AppointmentCheckInCardProps {
  appt: AppointmentDetailModel;
  patientTypes: PatientType[];
  loadingTypes: boolean;
  onCheckIn: (apptId: string, patientTypeId: number) => Promise<void>;
}

function AppointmentCheckInCard({
  appt,
  patientTypes,
  loadingTypes,
  onCheckIn,
}: AppointmentCheckInCardProps) {
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canCheckIn =
    appt.appointmentStatus !== "CANCELLED" &&
    appt.appointmentStatus !== "COMPLETED" &&
    !appt.treatmentCode;

  const handleCheckIn = async () => {
    if (!appt.id || selectedTypeId === null) return;
    setSubmitting(true);
    try {
      await onCheckIn(appt.id, selectedTypeId);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div>
      <div className={`${COMMON_STYLES.glassMorphism} rounded-2xl overflow-hidden shadow-sm`}>
        {/* Card header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-xl text-slate-500">Mã phiếu khám</p>
            <p className="font-bold text-slate-800 text-md">{appt.appointmentCode || "—"}</p>
          </div>
          <AppointmentStatusBadge status={appt.appointmentStatus} />
        </div>

        {appt.treatmentCode && (
          <div className="mx-4 mt-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <svg className="w-6 h-6 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-xl text-green-600 font-medium">Đã check-in · Mã điều trị</p>
              <p className="text-xl font-bold text-green-800">{appt.treatmentCode}</p>
            </div>
          </div>
        )}

        <div className="p-4 space-y-3">
          {/* Patient info */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-xl text-slate-500">Họ tên</p>
              <p className="font-medium text-slate-800 text-lg">
                {[appt.lastName, appt.firstName].filter(Boolean).join(" ") || "—"}
              </p>
            </div>
            <div>
              <p className="text-xl text-slate-500">Giới tính</p>
              <p className="font-medium text-slate-800 text-lg">
                {appt.genderId === 2 ? "Nam" : appt.genderId === 1 ? "Nữ" : "—"}
              </p>
            </div>
            <div>
              <p className="text-xl text-slate-500">Ngày khám</p>
              <p className="font-medium text-slate-800 text-lg">
                {appt.slot?.slotDate ? formatDate(appt.slot.slotDate) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xl text-slate-500">Giờ khám</p>
              <p className="font-medium text-slate-800 text-lg">{appt.slot?.slotTime || "—"}</p>
            </div>
          </div>

          {/* Doctor / Clinic */}
          {(appt.doctor || appt.clinic) && (
            <div className="p-2.5 bg-slate-50 rounded-lg space-y-0.5">
              {appt.doctor && (
                <p className="font-medium text-slate-800 text-lg">{appt.doctor.doctorName}</p>
              )}
              {appt.clinic && (
                <p className="text-slate-500 text-lg">{appt.clinic.clinicName}</p>
              )}
            </div>
          )}

          {/* Service price */}
          {SHOW_EXAM_FEE && appt.slot?.servicePrice !== undefined && (
            <div className="flex items-center justify-between text-xl">
              <span className="text-slate-500">Phí khám</span>
              <span className="font-semibold text-cyan-700 text-xl">
                {formatCurrency(appt.slot.servicePrice)}
              </span>
            </div>
          )}

          {/* ── Inline patient-type selector (only for check-in-eligible) ── */}
          {canCheckIn && (
            <>
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xl font-medium text-slate-700 mb-2">Chọn đối tượng bệnh nhân</p>

                {loadingTypes ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-11 bg-slate-100 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : patientTypes.length === 0 ? (
                  <p className="text-md text-slate-400 py-2">Không có đối tượng bệnh nhân</p>
                ) : (
                  <div className="space-y-2">
                    {patientTypes.map((pt) => {
                      const isSelected = selectedTypeId === pt.patientTypeId;

                      return (
                        <button
                          key={pt.patientTypeId}
                          onClick={() => setSelectedTypeId(pt.patientTypeId)}
                          className={`w-full text-left px-4 py-2.5 rounded-xl border-2 transition-all duration-200 cursor-pointer flex items-center justify-between ${isSelected
                            ? "border-blue-500 bg-blue-50"
                            : "border-blue-200 bg-white hover:border-blue-300 hover:bg-blue-50"
                            }`}
                        >
                          {/* Bên trái: Thông tin text */}
                          <div className="flex-1">
                            <p className={`text-lg font-semibold ${isSelected ? "text-blue-700" : "text-slate-800"}`}>
                              {pt.patientTypeName}
                            </p>
                            {pt.description && (
                              <p className="text-md text-slate-500 mt-0.5">{pt.description}</p>
                            )}
                          </div>

                          {/* Bên phải: Dấu tích khi được chọn */}
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center ml-3 flex-shrink-0 animate-in fade-in zoom-in duration-200">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Check-in button */}
              <button
                onClick={handleCheckIn}
                disabled={selectedTypeId === null || submitting}
                className="w-full py-2.5 bg-blue-900 hover:bg-blue-700 text-white text-md font-semibold rounded-xl transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Check-in
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CheckInPage() {
  // const [hospitals, setHospitals] = useState<Hospital[]>([]);
  // const [hospital, setHospital] = useState<Hospital | null>(null);
  const [members, setMembers] = useState<Patient[]>([]);
  const [selectedMember, setSelectedMember] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<AppointmentDetailModel[]>([]);
  const [patientTypes, setPatientTypes] = useState<PatientType[]>([]);

  // CCCD mode
  const [isCccdMode, setIsCccdMode] = useState(false);
  const [cccdData, setCccdData] = useState<CccdData | null>(null);

  // UI state
  // const [loadingHospitals, setLoadingHospitals] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [error, setError] = useState("");

  // Pagination
  const PAGE_SIZE = 5;
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);

  // Toast
  const [toast, setToast] = useState<ToastState>({ visible: false, message: "", type: "success" });

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 4000);
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // Kiểm tra CCCD mode
      const cccdRaw = sessionStorage.getItem("cccdPatient");
      let cccdMode = false;
      if (cccdRaw) {
        try {
          const d: CccdData = JSON.parse(cccdRaw);
          setCccdData(d);
          setIsCccdMode(true);
          cccdMode = true;
        } catch { /* ignore */ }
      }

      // Chỉ load members khi không phải CCCD mode
      if (!cccdMode) {
        const patientCode = localStorage.getItem("patientCode") || "";
        try {
          const res = await getPatientList(patientCode);
          const memberList = res.data || [];
          const processed = memberList
            .map((m) => ({ ...m, isOwner: m.patientCode === patientCode }))
            .sort((a, b) => (a.isOwner ? -1 : b.isOwner ? 1 : 0));
          setMembers(processed);
          if (processed.length > 0) setSelectedMember(processed[0]);
        } catch {
          /* silent */
        } finally {
          setLoadingMembers(false);
        }
      } else {
        setLoadingMembers(false);
      }
    };
    init();

    // Dọn sessionStorage khi unmount
    return () => {
      sessionStorage.removeItem("cccdPatient");
    };
  }, []);

  const loadPatientTypes = useCallback(async () => {
    setLoadingTypes(true);
    try {
      const res = await getTypePatientInKiosk();
      setPatientTypes(res.data || []);
    } catch {
      setPatientTypes([]);
    } finally {
      setLoadingTypes(false);
    }
  }, []);

  // ── Load appointments ─────────────────────────────────────────────────────
  const loadAppointments = useCallback(async (targetPage: number) => {
    setLoadingAppointments(true);
    setError("");

    const cccdRaw = sessionStorage.getItem("cccdPatient");
    const d: CccdData | null = cccdRaw ? JSON.parse(cccdRaw) : null;
    try {
      const res = await getAppointments(
        isCccdMode ? cccdData?.soCccd || d?.soCccd || '' : selectedMember?.idNumber || d?.soCccd || "",
        targetPage,
        PAGE_SIZE
      );
      const data = res.data || [];
      setAppointments(data);
      setPage(targetPage);
      setHasMore(data.length === PAGE_SIZE);
      setHasPrev(targetPage > 1);
    } catch {
      setError("Không thể tải danh sách phiếu khám");
    } finally {
      setLoadingAppointments(false);
    }
  }, [selectedMember, isCccdMode, cccdData, PAGE_SIZE]);

  useEffect(() => {
    loadAppointments(1);
    loadPatientTypes();
  }, [selectedMember, isCccdMode]);

  // ── Check-in handler ──────────────────────────────────────────────────────
  const handleCheckIn = async (apptId: string, patientTypeId: number) => {
    try {
      const res = await registerHisTreatment(
        apptId,
        patientTypeId
      );
      // In phiếu ngay sau khi tạo hồ sơ HIS thành công (dùng chung helper với luồng Đăng ký khám).
      const identityNumber = isCccdMode
        ? (cccdData?.soCccd || "")
        : (selectedMember?.idNumber || "");
      const printed = await printRegisteredTreatment(
        res?.data as Record<string, unknown>,
        identityNumber,
      );
      showToast(
        printed
          ? "Check-in thành công! Đang in phiếu khám."
          : "Check-in thành công! Hồ sơ HIS đã được tạo.",
        "success"
      );
      loadAppointments(page);
    } catch (err: any) {
      showToast(err?.message || "Check-in thất bại. Vui lòng thử lại.", "error");
    }
  };

  // ─── Header ───────────────────────────────────────────────────────────────
  const headerContent = (
    <div className="flex justify-center items-center pointer-events-none">
      <div className="pointer-events-auto text-center">
        <h1 className="text-3xl sm:text-3xl font-bold text-slate-800">Check-in</h1>
        <p className="text-xl sm:text-xl text-slate-500 mt-0.5">Tạo hồ sơ khám từ phiếu khám</p>
      </div>
    </div>
  );

  return (
    <>
      <AppLayout>
        <div className={`min-h-screen ${COMMON_STYLES.fullBackground} pb-12`}>
          <main className="max-w-4xl mx-auto px-4 py-6">
            {headerContent}

            {/* Member: chỉ hiển thị khi không phải CCCD mode */}
            {isCccdMode ? (
              <div className="py-4 mb-5">
                <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-xl text-green-600 font-medium">Thông tin từ CCCD/NFC</p>
                    <p className="font-semibold text-slate-800 text-lg">{cccdData?.hoTen || "—"}</p>
                    <p className="text-md text-slate-500">CCCD: {cccdData?.soCccd || "—"} &middot; Ngày sinh: {cccdData?.ngaySinh || "—"}</p>
                  </div>
                  <div className="shrink-0">
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-lg rounded-full font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Đã kiểm tra
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-4 mb-5">
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
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-5 flex items-center justify-between text-lg">
                <span>{error}</span>
                <button
                  onClick={() => loadAppointments(page)}
                  className="font-medium underline cursor-pointer"
                >
                  Thử lại
                </button>
              </div>
            )}

            {/* List */}
            <div className="space-y-4">
              {loadingAppointments ? (
                <>
                  <AppointmentSkeleton />
                  <AppointmentSkeleton />
                </>
              ) : appointments.length > 0 ? (
                <>
                  {appointments.map((appt, index) => (
                    <AppointmentCheckInCard
                      key={appt.id || index}
                      appt={appt}
                      patientTypes={patientTypes}
                      loadingTypes={loadingTypes}
                      onCheckIn={handleCheckIn}
                    />
                  ))}

                  {/* Pagination */}
                  {(hasPrev || hasMore) && (
                    <div className="flex items-center justify-center gap-2 pt-4">
                      <button
                        onClick={() => loadAppointments(page - 1)}
                        disabled={!hasPrev || loadingAppointments}
                        className="px-4 py-2 text-lg rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
                      >
                        ‹ Trước
                      </button>
                      <span className="px-4 py-2 text-lg font-semibold text-slate-700">
                        Trang {page}
                      </span>
                      <button
                        onClick={() => loadAppointments(page + 1)}
                        disabled={!hasMore || loadingAppointments}
                        className="px-4 py-2 text-lg rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
                      >
                        Sau ›
                      </button>
                    </div>
                  )}
                </>
              ) : !loadingMembers && (
                <EmptyState
                  memberName={isCccdMode ? (cccdData?.hoTen || undefined) : (selectedMember?.fullName || selectedMember?.firstName)}
                  onRefresh={() => loadAppointments(1)}
                />
              )}
            </div>
          </main>
        </div>
      </AppLayout>

      {/* Toast */}
      {toast.visible && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-medium ${toast.type === "success" ? "bg-green-600" : "bg-red-600"
            }`}
        >
          {toast.type === "success" ? (
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {toast.message}
        </div>
      )}
    </>
  );
}
