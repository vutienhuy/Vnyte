
"use client";

import { useState } from "react";
import type { AppointmentDetailModel } from "@/types/appointment";
import AppointmentStatusBadge from "./AppointmentStatusBadge";
import { SHOW_EXAM_FEE } from "@/lib/feature-flags";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatDate, formatCurrency } from "@/components/utils/formatters";

interface AppointmentCardProps {
    appointment: AppointmentDetailModel;
    onCancel?: (appointmentId: string) => Promise<void>;
    showCancelButton?: boolean;
}

export default function AppointmentCard({
    appointment,
    onCancel,
    showCancelButton = true
}: AppointmentCardProps) {
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [canceling, setCanceling] = useState(false);

    const handleCancel = async () => {
        if (!appointment.id || !onCancel) return;

        setShowCancelDialog(false);
        setCanceling(true);

        try {
            await onCancel(appointment.id);
        } finally {
            setCanceling(false);
        }
    };

    const canCancel = appointment.appointmentStatus !== "CANCELLED" &&
        appointment.appointmentStatus !== "COMPLETED" &&
        showCancelButton;

    return (
        <>
            <div className="p-5 border border-slate-200 hover:border-slate-300 transition-colors duration-200">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <p className="text-lg font-bold text-slate-800">Mã lịch hẹn</p>
                        <p className="text-sm font-semibold text-slate-800">
                            {appointment.appointmentCode || "N/A"}
                        </p>
                    </div>
                    <AppointmentStatusBadge status={appointment.appointmentStatus} />
                </div>

                {appointment.treatmentCode && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-blue-600 font-medium">Mã điều trị</p>
                                <p className="text-sm font-semibold text-blue-800">{appointment.treatmentCode}</p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <h4 className="font-medium text-slate-800 text-lg">Thông tin bệnh nhân</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                            <p className="text-slate-500">Họ tên</p>
                            <p className="font-medium text-slate-800">
                                {appointment.lastName} {appointment.firstName}
                            </p>
                        </div>
                        <div>
                            <p className="text-slate-500">Giới tính</p>
                            <p className="font-medium text-slate-800">
                                {appointment.genderId === 2 ? "Nam" : "Nữ"}
                            </p>
                        </div>
                        <div>
                            <p className="text-slate-500">Số điện thoại</p>
                            <p className="font-medium text-slate-800">{appointment.phoneNumber || "N/A"}</p>
                        </div>
                        <div>
                            <p className="text-slate-500">Địa chỉ</p>
                            <p className="font-medium text-slate-800">{appointment.address || "N/A"}</p>
                        </div>
                    </div>
                </div>

                {appointment.doctor && (
                    <div className="mb-4 flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div className="flex-1">
                            <p className="font-medium text-slate-800 text-sm">{appointment.doctor.doctorName}</p>
                            {appointment.slot?.doctorTitle && (
                                <p className="text-sm text-slate-500">{appointment.slot.doctorTitle}</p>
                            )}
                        </div>
                    </div>
                )}

                {appointment.clinic && (
                    <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-start gap-2">
                            <svg className="w-4 h-4 text-blue-900 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <div className="flex-1">
                                <p className="font-medium text-slate-800 text-sm">{appointment.clinic.clinicName}</p>
                                {/* {appointment.clinic.departmentName && (
                                    <p className="text-sm text-slate-500 mt-0.5">Khoa: {appointment.clinic.departmentName}</p>
                                )} */}
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="p-2.5 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <svg className="w-4 h-4 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p className="text-sm text-slate-500">Ngày khám</p>
                        </div>
                        <p className="font-medium text-slate-800 text-sm">
                            {appointment.slot?.slotDate ? formatDate(appointment.slot.slotDate) : "N/A"}
                        </p>
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <svg className="w-4 h-4 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-sm text-slate-500">Giờ khám</p>
                        </div>
                        <p className="font-medium text-slate-800 text-sm">{appointment.slot?.slotTime || "N/A"}</p>
                    </div>

                    {SHOW_EXAM_FEE && (
                    <div className="p-2.5 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <svg className="w-4 h-4 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-sm text-slate-500">Phí khám</p>
                        </div>
                        <p className="font-medium text-blue-900 text-sm">
                            {appointment.slot?.servicePrice ? formatCurrency(appointment.slot.servicePrice) : "N/A"}
                        </p>
                    </div>
                    )}

                    <div className="p-2.5 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <svg className="w-4 h-4 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                            <p className="text-sm text-slate-500">Loại ca</p>
                        </div>
                        <p className="font-medium text-slate-800 text-sm">
                            {appointment.slot?.slotType === "MORNING" ? "Sáng" : "Chiều"}
                        </p>
                    </div>
                </div>

                {appointment.symptom && (
                    <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="flex items-center gap-1.5 mb-1">
                            <svg className="w-4 h-4 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-sm font-medium text-slate-600">Triệu chứng</p>
                        </div>
                        <p className="text-sm text-slate-800">{appointment.symptom}</p>
                    </div>
                )}

                {appointment.createdAt && (
                    <p className="text-sm text-slate-500 mb-4">
                        Đăng ký lúc: {new Date(appointment.createdAt).toLocaleString("vi-VN")}
                    </p>
                )}

                {canCancel && (
                    <button
                        onClick={() => setShowCancelDialog(true)}
                        disabled={canceling}
                        className="w-full py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                    >
                        {canceling ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Đang hủy...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Hủy lịch hẹn
                            </>
                        )}
                    </button>
                )}
            </div>

            <ConfirmDialog
                isOpen={showCancelDialog}
                onClose={() => setShowCancelDialog(false)}
                onConfirm={handleCancel}
                title="Xác nhận hủy lịch hẹn"
                message="Bạn có chắc chắn muốn hủy lịch hẹn này không? Hành động này không thể hoàn tác."
                confirmText="Xác nhận hủy"
                cancelText="Không"
                variant="danger"
                icon="warning"
            />
        </>
    );
}
