"use client";

function safeSetStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sda_cache_")) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    try {
      localStorage.setItem(key, value);
    } catch {
      sessionStorage.setItem(key, value);
    }
  }
}

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createAppointment, getAppointmentDetail } from "@/services/registration.service";
import { SHOW_EXAM_FEE } from "@/lib/feature-flags";
import type {
    Hospital,
    Patient,
    Specialty,
    Doctor,
    Clinic,
    PatientInfoModel,
    Branch,
} from "@/types/registration";
import type { AppointmentSlotModel } from "@/types/appointment";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatDate, formatCurrency } from "@/components/utils/formatters";
import { COMMON_STYLES } from "@/constants/styles";
import AppLayout from "@/components/layout/AppLayout";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

export default function ConfirmationScreen() {
    const router = useRouter();

    // State from previous steps
    const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
    const [selectedSpecialty, setSelectedSpecialty] = useState<Specialty | null>(null);
    const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
    const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<AppointmentSlotModel | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    // Confirmation state
    const [symptom, setSymptom] = useState("");
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    useEffect(() => {
        // Load data from localStorage
        const hospital = localStorage.getItem("selectedHospital");
        const patient = localStorage.getItem("selectedPatient");
        const branch = localStorage.getItem("selectedBranch");
        const specialty = localStorage.getItem("selectedSpecialty");
        const doctor = localStorage.getItem("selectedDoctor");
        const clinic = localStorage.getItem("selectedClinic");
        const slot = localStorage.getItem("selectedSlot");
        const date = localStorage.getItem("selectedDate");

        if (hospital) setSelectedHospital(JSON.parse(hospital));
        if (patient) setSelectedPatient(JSON.parse(patient));
        if (branch) setSelectedBranch(JSON.parse(branch));
        if (specialty) setSelectedSpecialty(JSON.parse(specialty));
        if (doctor) setSelectedDoctor(JSON.parse(doctor));
        if (clinic) setSelectedClinic(JSON.parse(clinic));
        if (slot) setSelectedSlot(JSON.parse(slot));
        if (date) setSelectedDate(date);
    }, []);



    const handleConfirmBooking = async () => {
        if (!selectedHospital || !selectedPatient || !selectedSlot || !selectedBranch) {
            setError("Thiếu thông tin cần thiết");
            return;
        }

        if (!symptom.trim()) {
            setError("Vui lòng nhập triệu chứng/lý do khám");
            return;
        }

        setShowConfirmDialog(false);
        setCreating(true);
        setError("");

        try {
            const patientInfo: PatientInfoModel = {
                firstName: selectedPatient.firstName || "",
                lastName: selectedPatient.lastName || "",
                dob: String(selectedPatient.dob || "").substring(0, 8),
                identityNumber: selectedPatient.idNumber || "UNKNOWN",
                genderId: selectedPatient.genderId != null ? Number(selectedPatient.genderId) : 0,
                nationalCode: selectedPatient.nationalCode || "",
                nationalName: selectedPatient.nationalName || "",
                ethnicCode: selectedPatient.ethnicCode || "",
                ethnicName: selectedPatient.ethnicName || "",
                provinceCode: selectedPatient.provinceCode || "",
                provinceName: selectedPatient.provinceName || "",
                communeCode: selectedPatient.communeCode || "",
                communeName: selectedPatient.communeName || "",
                address: selectedPatient.address || "",
                phoneNumber: selectedPatient.mobileNumber || "0000000000",
                careerCode: selectedPatient.careerCode || "OTHER",
                careerName: selectedPatient.careerName || "Khác",
            };

            const response = await createAppointment(
                selectedSlot.id!,
                symptom,
                patientInfo,
                selectedBranch.id
            );

            // Load complete appointment detail
            try {
                const appointmentDetail = await getAppointmentDetail(
                    selectedPatient.idNumber || "",
                    response.data.appointmentCode
                );

                // Save complete appointment data for completion screen
                const completeData = {
                    ...response.data,
                    ...appointmentDetail,
                    // Ensure we have all the details
                    doctor: appointmentDetail?.doctor || selectedDoctor,
                    slot: appointmentDetail?.slot || selectedSlot,
                    clinic: appointmentDetail?.clinic || selectedClinic,
                };

                safeSetStorage("lastAppointment", JSON.stringify(completeData));

                // Navigate to completion screen
                router.push(`/register/completion?appointmentCode=${response.data.appointmentCode}`);
            } catch (detailError) {
                console.error("Failed to load appointment detail:", detailError);

                // Fallback: save basic data if detail fetch fails
                safeSetStorage("lastAppointment", JSON.stringify(response.data));
                router.push(`/register/completion?appointmentCode=${response.data.appointmentCode}`);
            }
        } catch (err: any) {
            console.error("Registration failed:", err);
            setError(err.message || "Đăng ký khám thất bại. Vui lòng thử lại.");
        } finally {
            setCreating(false);
        }
    };

    const headerContent = (
        <div className="text-center pointer-events-none mb-3">
            <div className="pointer-events-auto">
                <h1 className="text-base sm:text-2xl font-bold text-slate-800 truncate flex items-center justify-center gap-2">
                    <CheckCircleIcon className="w-5 h-5 text-blue-900" />
                    Xác nhận đăng ký khám
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                    <span className="font-medium">Kiểm tra thông tin và xác nhận</span>
                </p>
            </div>
        </div>
    );

    return (
        <AppLayout>
            <div className={`min-h-screen flex justify-center ${COMMON_STYLES.fullBackground} p-4`}>
                <div className="px-8 max-w-4xl w-full">
                    {headerContent}
                    {error && (
                        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <div className="mb-6">
                        <label className="text-lg font-medium text-slate-700 mb-2 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                            </svg>
                            Triệu chứng / Lý do khám <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={symptom}
                            onChange={(e) => setSymptom(e.target.value)}
                            placeholder="Ví dụ: Đau ngực trái, khó thở khi vận động. Tình trạng xuất hiện 3 ngày nay..."
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                            rows={5}
                            maxLength={500}
                        />
                        <div className="flex items-center justify-between mt-2">
                            <p className="text-sm text-slate-400 italic">
                                Thông tin chi tiết sẽ giúp bác sĩ chuẩn bị tốt hơn
                            </p>
                            <span className="text-xs text-slate-400">{symptom.length}/500</span>
                        </div>
                    </div>

                    <div className="mb-6 p-4 border border-blue-200 bg-blue-50 rounded-lg">
                        <div className="flex items-center mb-3">
                            <svg className="w-4 h-4 text-blue-900 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <h3 className="font-medium text-slate-800 text-lg">Thông tin đặt lịch</h3>
                        </div>

                        <div className="space-y-2 text-sm">
                            <div className="flex">
                                <span className="w-28 text-slate-500">Bệnh nhân:</span>
                                <span className="font-medium text-slate-800">
                                    {selectedPatient?.fullName || `${selectedPatient?.lastName} ${selectedPatient?.firstName}`}
                                </span>
                            </div>
                            <div className="flex">
                                <span className="w-28 text-slate-500">Cơ sở y tế:</span>
                                <span className="font-medium text-slate-800">{selectedHospital?.hospitalName}</span>
                            </div>
                            {selectedSpecialty && (
                                <div className="flex">
                                    <span className="w-28 text-slate-500">Chuyên khoa:</span>
                                    <span className="font-medium text-slate-800">{selectedSpecialty.specialtyName}</span>
                                </div>
                            )}
                            {selectedDoctor && (
                                <div className="flex">
                                    <span className="w-28 text-slate-500">Bác sĩ:</span>
                                    <span className="font-medium text-slate-800">{selectedDoctor.doctorName}</span>
                                </div>
                            )}
                            <div className="flex">
                                <span className="w-28 text-slate-500">Ngày khám:</span>
                                <span className="font-medium text-slate-800">{formatDate(selectedDate || "")}</span>
                            </div>
                            <div className="flex">
                                <span className="w-28 text-slate-500">Giờ khám:</span>
                                <span className="font-medium text-slate-800">{selectedSlot?.slotTime}</span>
                            </div>
                            <div className="flex">
                                <span className="w-28 text-slate-500">Phòng khám:</span>
                                <span className="font-medium text-slate-800">{selectedSlot?.clinicName}</span>
                            </div>
                            {SHOW_EXAM_FEE && (
                            <div className="flex items-center pt-2 border-t border-blue-200 mt-2">
                                <span className="w-28 text-slate-500">Phí khám:</span>
                                <span className="font-medium text-blue-900">{formatCurrency(selectedSlot?.servicePrice)}</span>
                            </div>
                            )}
                        </div>
                    </div>

                    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-center mb-2">
                            <svg className="w-4 h-4 text-amber-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <h4 className="font-medium text-amber-700 text-lg">Lưu ý quan trọng</h4>
                        </div>
                        <ul className="text-sm text-amber-700 space-y-1">
                            <li>• Vui lòng có mặt trước 15 phút so với giờ hẹn</li>
                            <li>• Mang theo CCCD và thẻ BHYT (nếu có)</li>
                            <li>• Có thể hủy lịch trước 2 giờ</li>
                            <li>• Liên hệ qua hotline nếu cần thay đổi</li>
                        </ul>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => router.back()}
                            className="flex-1 py-2.5 bg-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-400 hover:text-white transition-colors duration-200 cursor-pointer text-sm"
                        >
                            Làm lại
                        </button>

                        <button
                            onClick={() => setShowConfirmDialog(true)}
                            disabled={!symptom.trim() || creating}
                            className={`flex-1 py-2.5 font-medium rounded-lg transition-colors duration-200 text-sm ${symptom.trim() && !creating
                                ? "bg-blue-900 text-white hover:bg-blue-700 cursor-pointer"
                                : "bg-slate-300 text-slate-500 cursor-not-allowed"
                                }`}
                        >
                            {creating ? "Đang tạo..." : "Xác nhận đăng ký"}
                        </button>
                    </div>
                </div>

                {/* Confirmation Dialog */}
                <ConfirmDialog
                    isOpen={showConfirmDialog}
                    onClose={() => setShowConfirmDialog(false)}
                    onConfirm={handleConfirmBooking}
                    title="Xác nhận đăng ký khám"
                    message="Sau khi đăng ký khám thành công, bạn sẽ nhận được thông báo xác nhận. Vui lòng kiểm tra kỹ thông tin trước khi xác nhận."
                    confirmText="Xác nhận"
                    cancelText="Hủy"
                    variant="success"
                    icon="check"
                />
            </div>
        </AppLayout>
    );
}
