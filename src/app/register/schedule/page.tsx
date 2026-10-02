"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SHOW_EXAM_FEE } from "@/lib/feature-flags";
import {
    getAvailableDates,
    getAppointmentSlots,
} from "@/services/registration.service";
import type {
    Hospital,
    Patient,
    Specialty,
    Doctor,
    Clinic,
    Branch,
} from "@/types/registration";
import type { AppointmentSlotModel } from "@/types/appointment";

export default function ScheduleSelectionScreen() {
    const router = useRouter();

    // State from previous steps
    const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
    const [selectedSpecialty, setSelectedSpecialty] = useState<Specialty | null>(null);
    const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
    const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
    const [appointmentMethod, setAppointmentMethod] = useState<string | null>(null);

    // Schedule selection state
    const [availableDates, setAvailableDates] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<AppointmentSlotModel | null>(null);

    // UI state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [showTimeSheet, setShowTimeSheet] = useState(false);

    useEffect(() => {
        // Load data from localStorage or route params
        const hospital = localStorage.getItem("selectedHospital");
        const patient = localStorage.getItem("selectedPatient");
        const branch = localStorage.getItem("selectedBranch");
        const specialty = localStorage.getItem("selectedSpecialty");
        const doctor = localStorage.getItem("selectedDoctor");
        const clinic = localStorage.getItem("selectedClinic");
        const method = localStorage.getItem("appointmentMethod");

        if (hospital) setSelectedHospital(JSON.parse(hospital));
        if (patient) setSelectedPatient(JSON.parse(patient));
        if (branch) setSelectedBranch(JSON.parse(branch));
        if (specialty) setSelectedSpecialty(JSON.parse(specialty));
        if (doctor) setSelectedDoctor(JSON.parse(doctor));
        if (clinic) setSelectedClinic(JSON.parse(clinic));
        if (method) setAppointmentMethod(method);

        loadAvailableDates();
    }, []);

    const getCheckSpecialtyOrDoctor = () => {
        if (appointmentMethod === "specialty") return selectedSpecialty?.specialtyCode || "";
        if (appointmentMethod === "doctor") return selectedDoctor?.doctorCode || "";
        if (appointmentMethod === "clinic") return selectedClinic?.clinicCode || "";
        return "";
    };

    const loadAvailableDates = async () => {
        if (!selectedHospital) return;

        setLoading(true);
        setError("");

        try {
            const response = await getAvailableDates(
                selectedSpecialty?.id,
                selectedDoctor?.doctorId,
                selectedClinic?.clinicId,
                getCheckSpecialtyOrDoctor()
            );

            setAvailableDates(response.data || []);
        } catch (err) {
            setError("Không thể tải danh sách ngày khám");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDateClick = (date: string) => {
        setSelectedDate(date);
        setShowTimeSheet(true);
    };

    const handleSlotSelect = (slot: AppointmentSlotModel) => {
        setSelectedSlot(slot);
        setShowTimeSheet(false);
    };

    const handleContinueToConfirm = () => {
        if (!selectedSlot || !selectedDate) {
            setError("Vui lòng chọn ngày và giờ khám");
            return;
        }

        // Save selected slot and date to localStorage
        localStorage.setItem("selectedSlot", JSON.stringify(selectedSlot));
        localStorage.setItem("selectedDate", selectedDate);

        // Navigate to confirmation screen
        window.location.href = "/register/confirm";
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString("vi-VN");
    };

    const getWeekday = (dateStr: string) => {
        const date = new Date(dateStr);
        const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
        return days[date.getDay()];
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl px-8 py-10 max-w-4xl w-full">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-10 h-10 bg-cyan-600 rounded-lg flex items-center justify-center mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-bold text-slate-800 mb-1 text-center">
                        Chọn lịch khám
                    </h1>
                    <p className="text-slate-500 text-center text-sm">
                        Bước 5/6: Chọn ngày và giờ khám
                    </p>
                </div>

                <div className="mb-8">
                    <div className="flex justify-between mb-2">
                        {[1, 2, 3, 4, 5, 6].map((step) => (
                            <div
                                key={step}
                                className={`flex-1 h-1.5 mx-1 rounded-full transition-all duration-300 ${step <= 5 ? "bg-cyan-600" : "bg-slate-200"}`}
                            />
                        ))}
                    </div>
                </div>

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
                    <div className="mb-4 p-3 bg-cyan-50 border border-cyan-200 rounded-lg">
                        <p className="text-xs text-slate-600">
                            <span className="font-medium">Bệnh nhân:</span> {selectedPatient?.fullName || `${selectedPatient?.lastName} ${selectedPatient?.firstName}`}
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                            <span className="font-medium">
                                {appointmentMethod === "specialty" ? "Chuyên khoa" : appointmentMethod === "doctor" ? "Bác sĩ" : "Phòng khám"}:
                            </span>{" "}
                            {selectedSpecialty?.specialtyName || selectedDoctor?.doctorName || selectedClinic?.clinicName}
                        </p>
                    </div>

                    <h3 className="text-sm font-medium text-slate-800 mb-3">Chọn ngày khám</h3>

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="w-8 h-8 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : availableDates.length > 0 ? (
                        <div className="flex gap-2 overflow-x-auto pb-4">
                            {availableDates.map((date) => (
                                <button
                                    key={date}
                                    onClick={() => handleDateClick(date)}
                                    className={`shrink-0 w-20 p-2.5 rounded-lg border transition-colors duration-200 cursor-pointer ${selectedDate === date
                                        ? "border-cyan-500 bg-cyan-50"
                                        : "border-slate-200 hover:border-cyan-300 bg-white"
                                        }`}
                                >
                                    <div className="text-[10px] text-slate-500 font-medium">{getWeekday(date)}</div>
                                    <div className="text-sm font-medium text-slate-800 mt-0.5">
                                        {formatDate(date).split("/").slice(0, 2).join("/")}
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="text-center text-slate-500 py-8 text-sm">Không có ngày khám khả dụng</p>
                    )}

                    {selectedSlot && (
                        <div className="mt-5">
                            <h3 className="text-sm font-medium text-slate-800 mb-3">Thông tin đã chọn</h3>
                            <div className="p-4 border border-cyan-300 bg-cyan-50 rounded-lg">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <p className="text-xs text-slate-500">Ngày khám</p>
                                        <p className="font-medium text-slate-800 text-sm">{selectedDate ? formatDate(selectedDate) : ""}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500">Giờ khám</p>
                                        <p className="font-medium text-slate-800 text-sm">{selectedSlot.slotTime}</p>
                                    </div>
                                </div>
                                <div className="mb-3">
                                    <p className="text-xs text-slate-500">Phòng khám</p>
                                    <p className="font-medium text-slate-800 text-sm">{selectedSlot.clinicName}</p>
                                </div>
                                {SHOW_EXAM_FEE && (
                                <div>
                                    <p className="text-xs text-slate-500">Phí khám</p>
                                    <p className="font-medium text-cyan-700 text-sm">
                                        {selectedSlot.servicePrice?.toLocaleString("vi-VN")} VNĐ
                                    </p>
                                </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => router.back()}
                        className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors duration-200 cursor-pointer text-sm"
                    >
                        Quay lại
                    </button>

                    <button
                        onClick={handleContinueToConfirm}
                        disabled={!selectedSlot}
                        className={`flex-1 py-2.5 font-medium rounded-lg transition-colors duration-200 text-sm ${selectedSlot
                            ? "bg-cyan-600 text-white hover:bg-cyan-700 cursor-pointer"
                            : "bg-slate-200 text-slate-400 cursor-not-allowed"
                            }`}
                    >
                        Tiếp tục
                    </button>
                </div>
            </div>

            {/* Time Slot Bottom Sheet */}
            {showTimeSheet && selectedDate && selectedHospital && (
                <TimeSlotSheet
                    date={selectedDate}
                    hospital={selectedHospital}
                    specialtyId={selectedSpecialty?.id}
                    doctorId={selectedDoctor?.doctorId}
                    clinicId={selectedClinic?.clinicId}
                    checkSpecialtyOrDoctor={getCheckSpecialtyOrDoctor()}
                    onSelect={handleSlotSelect}
                    onClose={() => setShowTimeSheet(false)}
                />
            )}
        </div>
    );
}

// Time Slot Bottom Sheet Component
function TimeSlotSheet({
    date,
    hospital,
    specialtyId,
    doctorId,
    clinicId,
    checkSpecialtyOrDoctor,
    onSelect,
    onClose,
}: {
    date: string;
    hospital: Hospital;
    specialtyId?: string;
    doctorId?: number;
    clinicId?: number;
    checkSpecialtyOrDoctor: string;
    onSelect: (slot: AppointmentSlotModel) => void;
    onClose: () => void;
}) {
    const [slots, setSlots] = useState<AppointmentSlotModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [slotsByClinic, setSlotsByClinic] = useState<Record<number, AppointmentSlotModel[]>>({});

    useEffect(() => {
        loadSlots();
    }, []);

    const loadSlots = async () => {
        setLoading(true);
        try {
            const response = await getAppointmentSlots(
                date,
                specialtyId,
                doctorId,
                clinicId,
                checkSpecialtyOrDoctor
            );

            const slotData = response.data || [];
            setSlots(slotData);

            // Group by clinic
            const grouped: Record<number, AppointmentSlotModel[]> = {};
            slotData.forEach((slot: AppointmentSlotModel) => {
                if (slot.clinicId) {
                    if (!grouped[slot.clinicId]) {
                        grouped[slot.clinicId] = [];
                    }
                    grouped[slot.clinicId].push(slot);
                }
            });
            setSlotsByClinic(grouped);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString("vi-VN");
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={onClose}>
            <div
                className="bg-white rounded-t-xl w-full max-w-4xl max-h-[80vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sticky top-0 bg-cyan-600 text-white p-4 rounded-t-xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-semibold">Chọn giờ khám</h3>
                            <p className="text-xs text-cyan-100">Ngày: {formatDate(date)}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 cursor-pointer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="p-4">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="w-8 h-8 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : Object.keys(slotsByClinic).length === 0 ? (
                        <p className="text-center text-slate-500 py-12 text-sm">Không có lịch khám</p>
                    ) : (
                        Object.entries(slotsByClinic).map(([clinicId, clinicSlots]) => {
                            const morningSlots = clinicSlots.filter((s) => s.slotType === "MORNING");
                            const afternoonSlots = clinicSlots.filter((s) => s.slotType === "AFTERNOON");
                            const firstSlot = clinicSlots[0];

                            return (
                                <div key={clinicId} className="mb-5">
                                    {/* <div className="mb-3 p-3 bg-cyan-50 border border-cyan-200 rounded-lg">
                                        <h4 className="font-medium text-slate-800 text-sm">{firstSlot.clinicName}</h4>
                                        {firstSlot.clinic?.departmentName && (
                                            <p className="text-xs text-slate-500 mt-0.5">Khoa: {firstSlot.clinic.departmentName}</p>
                                        )}
                                    </div> */}

                                    {morningSlots.length > 0 && (
                                        <div className="mb-3">
                                            <p className="text-xs font-medium text-orange-600 mb-2 flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="5" />
                                                    <line x1="12" y1="1" x2="12" y2="3" />
                                                    <line x1="12" y1="21" x2="12" y2="23" />
                                                </svg>
                                                Buổi sáng
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {morningSlots.map((slot) => (
                                                    <button
                                                        key={slot.id}
                                                        onClick={() => onSelect(slot)}
                                                        disabled={slot.isBooked}
                                                        className={`px-3 py-1.5 rounded-lg border text-sm transition-colors duration-200 ${slot.isBooked
                                                            ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                                            : "border-cyan-300 bg-white text-slate-800 hover:bg-cyan-50 cursor-pointer"
                                                            }`}
                                                    >
                                                        {slot.slotTime}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {afternoonSlots.length > 0 && (
                                        <div>
                                            <p className="text-xs font-medium text-blue-600 mb-2 flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                                                </svg>
                                                Buổi chiều
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {afternoonSlots.map((slot) => (
                                                    <button
                                                        key={slot.id}
                                                        onClick={() => onSelect(slot)}
                                                        disabled={slot.isBooked}
                                                        className={`px-3 py-1.5 rounded-lg border text-sm transition-colors duration-200 ${slot.isBooked
                                                            ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                                            : "border-cyan-300 bg-white text-slate-800 hover:bg-cyan-50 cursor-pointer"
                                                            }`}
                                                    >
                                                        {slot.slotTime}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
