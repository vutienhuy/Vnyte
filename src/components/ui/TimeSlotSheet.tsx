import React from "react";
import type { AppointmentSlotModel } from "@/types/appointment";
import BottomSheet from "./BottomSheet";
import LoadingSpinner from "./LoadingSpinner";
import { formatDate } from "@/components/utils/formatters";

interface TimeSlotSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (slot: AppointmentSlotModel) => void;
    date: string;
    slots: AppointmentSlotModel[];
    loading?: boolean;
}

export default function TimeSlotSheet({
    isOpen,
    onClose,
    onSelect,
    date,
    slots,
    loading = false,
}: TimeSlotSheetProps) {
    // Group slots by clinic
    const slotsByClinic: Record<string, AppointmentSlotModel[]> = {};
    slots.forEach((slot) => {
        const clinicId = slot.clinicId?.toString() || "unknown";
        if (!slotsByClinic[clinicId]) {
            slotsByClinic[clinicId] = [];
        }
        slotsByClinic[clinicId].push(slot);
    });

    return (
        <BottomSheet
            isOpen={isOpen}
            onClose={onClose}
            title="Chọn giờ khám"
            subtitle={`Ngày: ${formatDate(date)}`}
        >
            {loading ? (
                <LoadingSpinner />
            ) : Object.keys(slotsByClinic).length === 0 ? (
                <p className="text-center text-gray-500 py-12">
                    Không có lịch khám
                </p>
            ) : (
                Object.entries(slotsByClinic).map(([clinicId, clinicSlots]) => {
                    const morningSlots = clinicSlots.filter(
                        (s) => s.slotType === "MORNING"
                    );
                    const afternoonSlots = clinicSlots.filter(
                        (s) => s.slotType === "AFTERNOON"
                    );
                    const firstSlot = clinicSlots[0];

                    return (
                        <div key={clinicId} className="mb-6">
                            {/* Clinic Header */}
                            <div className="mb-4 p-4 bg-teal-50 border border-teal-200 rounded-xl">
                                <h4 className="font-bold text-gray-900">
                                    {firstSlot.clinicName}
                                </h4>
                                {/* {firstSlot.clinic?.departmentName && (
                                    <p className="text-sm text-gray-600 mt-1">
                                        Khoa: {firstSlot.clinic.departmentName}
                                    </p>
                                )} */}
                            </div>

                            {/* Morning Slots */}
                            {morningSlots.length > 0 && (
                                <div className="mb-4">
                                    <p className="text-sm font-semibold text-orange-600 mb-2">
                                        🌅 Buổi sáng
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {morningSlots.map((slot) => (
                                            <button
                                                key={slot.id}
                                                onClick={() => onSelect(slot)}
                                                disabled={slot.isBooked}
                                                className={`px-4 py-2 rounded-lg border-2 transition-all ${slot.isBooked
                                                    ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                                                    : "border-teal-500 bg-white text-gray-900 hover:bg-teal-50"
                                                    }`}
                                            >
                                                {slot.slotTime}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Afternoon Slots */}
                            {afternoonSlots.length > 0 && (
                                <div>
                                    <p className="text-sm font-semibold text-blue-600 mb-2">
                                        🌆 Buổi chiều
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {afternoonSlots.map((slot) => (
                                            <button
                                                key={slot.id}
                                                onClick={() => onSelect(slot)}
                                                disabled={slot.isBooked}
                                                className={`px-4 py-2 rounded-lg border-2 transition-all ${slot.isBooked
                                                    ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                                                    : "border-teal-500 bg-white text-gray-900 hover:bg-teal-50"
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
        </BottomSheet>
    );
}
