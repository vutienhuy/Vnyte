"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { deleteAppointment } from "@/services/registration.service";
import { SHOW_EXAM_FEE } from "@/lib/feature-flags";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatDate, formatDOB, formatCurrency } from "@/components/utils/formatters";
import { COMMON_STYLES } from "@/constants/styles";
import AppLayout from "@/components/layout/AppLayout";

function CompletionContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [appointmentData, setAppointmentData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [canceling, setCanceling] = useState(false);
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [showResultDialog, setShowResultDialog] = useState(false);
    const [resultDialogType, setResultDialogType] = useState<"success" | "error">("success");
    const [resultDialogMessage, setResultDialogMessage] = useState("");

    useEffect(() => {
        const appointmentCode = searchParams.get("appointmentCode");
        const savedData = localStorage.getItem("lastAppointment") || sessionStorage.getItem("lastAppointment");

        if (savedData) {
            setAppointmentData(JSON.parse(savedData));
        } else if (appointmentCode) {
            // Could fetch from API if needed
            setAppointmentData({ appointmentCode });
        }

        setLoading(false);
    }, [searchParams]);

    const handleGoHome = () => {
        localStorage.removeItem("selectedPatient");
        localStorage.removeItem("selectedBranch");
        localStorage.removeItem("selectedSpecialty");
        localStorage.removeItem("selectedDoctor");
        localStorage.removeItem("selectedClinic");
        localStorage.removeItem("appointmentMethod");
        localStorage.removeItem("selectedSlot");
        localStorage.removeItem("selectedDate");
        localStorage.removeItem("lastAppointment");
        sessionStorage.removeItem("lastAppointment");

        router.push("/");
    };

    const handleCancelAppointment = async () => {
        if (!appointmentData?.id) {
            setResultDialogType("error");
            setResultDialogMessage("Không tìm thấy thông tin lịch hẹn");
            setShowResultDialog(true);
            return;
        }

        const hospitalData = localStorage.getItem("selectedHospital");
        if (!hospitalData) {
            setResultDialogType("error");
            setResultDialogMessage("Không tìm thấy thông tin bệnh viện");
            setShowResultDialog(true);
            return;
        }

        setShowCancelDialog(false);
        setCanceling(true);

        try {
            await deleteAppointment(
                appointmentData.id
            );

            setResultDialogType("success");
            setResultDialogMessage("Hủy lịch hẹn thành công!");
            setShowResultDialog(true);
        } catch (error: any) {
            setResultDialogType("error");
            setResultDialogMessage(error.message || "Hủy lịch hẹn thất bại. Vui lòng thử lại.");
            setShowResultDialog(true);
        } finally {
            setCanceling(false);
        }
    };

    const handleCloseResultDialog = () => {
        setShowResultDialog(false);
        if (resultDialogType === "success") {
            handleGoHome();
        }
    };

    const getStatusBadge = (status?: string) => {
        const statusMap: Record<string, { label: string; color: string }> = {
            PENDING: { label: "Chờ xác nhận", color: "bg-orange-500" },
            CONFIRMED: { label: "Đã xác nhận", color: "bg-teal-500" },
            CANCELLED: { label: "Đã hủy", color: "bg-red-500" },
            CHECKED_IN: { label: "Đã check-in", color: "bg-blue-500" },
            COMPLETED: { label: "Hoàn thành", color: "bg-green-500" },
        };

        const statusInfo = statusMap[status || "PENDING"] || statusMap.PENDING;

        return (
            <span className={`px-3 py-1 rounded-full text-white text-sm font-semibold ${statusInfo.color}`}>
                {statusInfo.label}
            </span>
        );
    };

    if (loading || canceling) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center">
                    <div className="w-10 h-10 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                    {canceling && (
                        <p className="text-slate-600 text-sm font-medium">Đang hủy lịch hẹn...</p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen flex justify-center ${COMMON_STYLES.fullBackground} p-4`}>
            <div className="px-8 py-2 max-w-4xl w-full">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800 mb-1 text-center">
                        Đăng ký thành công!
                    </h1>
                    <p className="text-slate-500 text-sm text-center">
                        Lịch khám của bạn đã được tạo
                    </p>
                </div>

                <div className="mb-6 p-4 bg-cyan-50 border border-cyan-200 rounded-lg">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Mã lịch hẹn</p>
                            <p className="text-2xl font-bold text-gray-900">{appointmentData?.appointmentCode || "N/A"}</p>
                        </div>
                        {getStatusBadge(appointmentData?.appointmentStatus)}
                    </div>
                    {appointmentData?.treatmentCode && (
                        <div className="mt-3 pt-3 border-t border-teal-200">
                            <p className="text-sm text-gray-600">Mã điều trị</p>
                            <p className="text-lg font-bold text-gray-900">{appointmentData.treatmentCode}</p>
                        </div>
                    )}
                </div>

                <div className="mb-5 p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center mb-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-2">
                            <svg className="w-4 h-4 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <h3 className="font-medium text-slate-800 text-lg">Thông tin bệnh nhân</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <p className="text-slate-500">Họ tên</p>
                            <p className="font-medium text-slate-800">
                                {appointmentData?.lastName} {appointmentData?.firstName}
                            </p>
                        </div>
                        <div>
                            <p className="text-slate-500">Giới tính</p>
                            <p className="font-medium text-slate-800">
                                {appointmentData?.genderId === 2 ? "Nam" : "Nữ"}
                            </p>
                        </div>
                        <div>
                            <p className="text-slate-500">Số điện thoại</p>
                            <p className="font-medium text-slate-800">{appointmentData?.phoneNumber || "N/A"}</p>
                        </div>
                        <div>
                            <p className="text-slate-500">Ngày sinh</p>
                            <p className="font-medium text-slate-800">{formatDOB(appointmentData?.dob)}</p>
                        </div>
                    </div>
                </div>

                {appointmentData?.doctor && (
                    <div className="mb-5 p-4 bg-slate-50 rounded-lg">
                        <div className="flex items-center mb-2">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-2">
                                <svg className="w-4 h-4 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h3 className="font-medium text-slate-800 text-lg">Bác sĩ khám</h3>
                        </div>
                        <p className="font-medium text-slate-800 text-sm">{appointmentData.doctor.doctorName}</p>
                        {appointmentData.slot?.doctorTitle && (
                            <p className="text-xs text-slate-500 mt-0.5">{appointmentData.slot.doctorTitle}</p>
                        )}
                    </div>
                )}

                <div className="mb-5 grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center mb-1">
                            <svg className="w-4 h-4 text-blue-900 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p className="text-sm text-slate-500">Ngày khám</p>
                        </div>
                        <p className="font-medium text-slate-800 text-sm">{formatDate(appointmentData?.slot?.slotDate)}</p>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center mb-1">
                            <svg className="w-4 h-4 text-blue-900 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-sm text-slate-500">Giờ khám</p>
                        </div>
                        <p className="font-medium text-slate-800 text-sm">{appointmentData?.slot?.slotTime || "N/A"}</p>
                    </div>

                    {/* Ẩn phí khám thì Phòng khám chiếm hết hàng, tránh để trống nửa bên phải. */}
                    <div className={`p-3 bg-slate-50 rounded-lg${SHOW_EXAM_FEE ? "" : " col-span-2"}`}>
                        <div className="flex items-center mb-1">
                            <svg className="w-4 h-4 text-blue-900 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <p className="text-sm text-slate-500">Phòng khám</p>
                        </div>
                        <p className="font-medium text-slate-800 text-sm">{appointmentData?.clinic?.clinicName || "N/A"}</p>
                    </div>

                    {SHOW_EXAM_FEE && (
                    <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center mb-1">
                            <svg className="w-4 h-4 text-blue-900 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-sm text-slate-500">Phí khám</p>
                        </div>
                        <p className="font-medium text-blue-900 text-sm">{formatCurrency(appointmentData?.slot?.servicePrice)}</p>
                    </div>
                    )}
                </div>

                {appointmentData?.symptom && (
                    <div className="mb-5 p-4 bg-slate-50 rounded-lg">
                        <div className="flex items-center mb-1">
                            <svg className="w-4 h-4 text-blue-900 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-sm text-slate-500">Triệu chứng</p>
                        </div>
                        <p className="text-slate-800 text-sm">{appointmentData.symptom}</p>
                    </div>
                )}

                {appointmentData?.createdAt && (
                    <p className="text-sm text-slate-500 text-center mb-5">
                        Đăng ký lúc: {new Date(appointmentData.createdAt).toLocaleString("vi-VN")}
                    </p>
                )}

                <div className="flex gap-3">
                    <button
                        onClick={() => setShowCancelDialog(true)}
                        className="flex-1 py-2.5 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition-colors duration-200 cursor-pointer text-sm"
                    >
                        Hủy lịch hẹn
                    </button>

                    <button
                        onClick={handleGoHome}
                        className="flex-1 py-2.5 bg-blue-900 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors duration-200 cursor-pointer text-sm"
                    >
                        Về trang chủ
                    </button>
                </div>
            </div>

            <ConfirmDialog
                isOpen={showCancelDialog}
                onClose={() => setShowCancelDialog(false)}
                onConfirm={handleCancelAppointment}
                title="Xác nhận hủy lịch hẹn"
                message="Bạn có chắc chắn muốn hủy lịch hẹn này không? Hành động này không thể hoàn tác."
                confirmText="Xác nhận hủy"
                cancelText="Không"
                variant="danger"
                icon="warning"
            />

            {showResultDialog && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl transform animate-fade-in">
                        <div className="flex flex-col items-center">
                            {resultDialogType === "success" ? (
                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                    <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                            ) : (
                                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-4">
                                    <svg className="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </div>
                            )}

                            <h3 className={`text-2xl font-bold mb-3 ${resultDialogType === "success" ? "text-green-600" : "text-red-600"}`}>
                                {resultDialogType === "success" ? "Thành công" : "Thất bại"}
                            </h3>

                            <p className="text-gray-700 text-center mb-6">
                                {resultDialogMessage}
                            </p>

                            <button
                                onClick={handleCloseResultDialog}
                                className={`w-full py-2.5 rounded-lg font-medium text-sm text-white transition-colors duration-200 cursor-pointer ${resultDialogType === "success"
                                    ? "bg-green-600 hover:bg-green-700"
                                    : "bg-red-500 hover:bg-red-600"
                                    }`}
                            >
                                {resultDialogType === "success" ? "Về trang chủ" : "Đóng"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function CompletionScreen() {
    return (
        <AppLayout>
            <Suspense fallback={
                <div className="min-h-screen flex items-center justify-center bg-slate-50">
                    <div className="flex flex-col items-center">
                        <div className="w-10 h-10 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-slate-600 text-sm font-medium">Đang tải thông tin...</p>
                    </div>
                </div>
            }>
                <CompletionContent />
            </Suspense>
        </AppLayout>
    );
}

