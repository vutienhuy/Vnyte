"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getPatientList, getHospitals, deleteAppointment } from "@/services/registration.service";
import { getAppointments } from "@/services/appointment.service";
import type { Patient, Hospital } from "@/types/registration";
import type { AppointmentDetailModel } from "@/types/appointment";

import HospitalDropdown from "@/components/appointments/HospitalDropdown";
import MemberDropdown from "@/components/appointments/MemberDropdown";
import AppointmentCard from "@/components/appointments/AppointmentCard";
import AppointmentSkeleton from "@/components/appointments/AppointmentSkeleton";
import EmptyState from "@/components/appointments/EmptyState";
import { COMMON_STYLES } from "@/constants/styles";
import AppLayout from "@/components/layout/AppLayout";

export default function AppointmentsPage() {
    const router = useRouter();

    // State
    const [hospitals, setHospitals] = useState<Hospital[]>([]);
    const [hospital, setHospital] = useState<Hospital | null>(null);
    const [members, setMembers] = useState<Patient[]>([]);
    const [selectedMember, setSelectedMember] = useState<Patient | null>(null);
    const [appointments, setAppointments] = useState<AppointmentDetailModel[]>([]);

    // UI State
    const [loadingHospitals, setLoadingHospitals] = useState(true);
    const [loadingMembers, setLoadingMembers] = useState(true);
    const [loadingAppointments, setLoadingAppointments] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");

    // Pagination
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const observer = useRef<IntersectionObserver | null>(null);

    // Initialize data
    useEffect(() => {
        const init = async () => {
            try {
                const hospitalsResponse = await getHospitals();
                const hospitalsList = hospitalsResponse.data || [];
                setHospitals(hospitalsList);

                if (hospitalsList.length > 0) {
                    setHospital(hospitalsList[0]);
                }
            } catch (err) {
                console.error("Failed to load hospitals:", err);
            } finally {
                setLoadingHospitals(false);
            }

            const patientCode = localStorage.getItem("patientCode") || "";
            if (!patientCode) {
                console.warn("No patient code found in localStorage");
            }

            try {
                const response = await getPatientList(patientCode);
                const memberList = response.data || [];

                const processedList = memberList.map(m => ({
                    ...m,
                    isOwner: m.patientCode === patientCode
                }));

                processedList.sort((a, b) => {
                    if (a.isOwner && !b.isOwner) return -1;
                    if (!a.isOwner && b.isOwner) return 1;
                    return 0;
                });

                setMembers(processedList);
                if (processedList.length > 0) {
                    setSelectedMember(processedList[0]);
                }
            } catch (err) {
                setError("Không thể tải danh sách thành viên");
                console.error(err);
            } finally {
                setLoadingMembers(false);
            }
        };

        init();
    }, [router]);

    const loadAppointments = useCallback(async (isNewSearch = false) => {
        if (!hospital || !selectedMember || !selectedMember.idNumber) return;

        if (isNewSearch) {
            setLoadingAppointments(true);
            setPage(1);
            setHasMore(true);
            setAppointments([]);
        } else {
            setLoadingMore(true);
        }

        setError("");
        const currentPage = isNewSearch ? 1 : page;

        try {
            const response = await getAppointments(
                selectedMember.idNumber,
                currentPage,
                10
            );

            const data = response.data || [];
            if (isNewSearch) {
                setAppointments(data);
            } else {
                setAppointments(prev => [...prev, ...data]);
            }

            setHasMore(data.length === 10);
        } catch (err) {
            setError("Không thể tải danh sách lịch hẹn");
            console.error(err);
        } finally {
            setLoadingAppointments(false);
            setLoadingMore(false);
        }
    }, [hospital, selectedMember, page]);

    useEffect(() => {
        if (selectedMember) {
            loadAppointments(true);
        }
    }, [selectedMember, hospital]);

    const handleCancelAppointment = async (appointmentId: string) => {
        if (!hospital) return;

        try {
            await deleteAppointment(appointmentId);

            loadAppointments(true);
        } catch (err: any) {
            alert(err.message || "Hủy lịch hẹn thất bại");
        }
    };

    const lastElementRef = useCallback((node: HTMLDivElement) => {
        if (loadingAppointments || loadingMore) return;
        if (observer.current) observer.current.disconnect();

        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                setPage(prevPage => prevPage + 1);
            }
        });

        if (node) observer.current.observe(node);
    }, [loadingAppointments, loadingMore, hasMore]);

    useEffect(() => {
        if (page > 1) {
            loadAppointments(false);
        }
    }, [page]);

    const headerContent = (
        <div className="flex justify-center items-center pointer-events-none">
            <div className="pointer-events-auto text-center">
                <h1 className="text-lg sm:text-2xl font-bold text-slate-800">
                    Lịch hẹn
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Quản lý lịch khám của bạn
                </p>
            </div>
        </div>
    );

    return (
        <AppLayout>
            <div className={`min-h-screen ${COMMON_STYLES.fullBackground} pb-12`}>
                <main className="max-w-4xl mx-auto px-4 py-6">
                    {headerContent}
                    <div className="py-4">
                        <HospitalDropdown
                            hospitals={hospitals}
                            selectedHospital={hospital}
                            onSelect={setHospital}
                            loading={loadingHospitals}
                        />
                    </div>

                    <div className="py-4 mb-5">
                        <MemberDropdown
                            members={members}
                            selectedMember={selectedMember}
                            onSelect={setSelectedMember}
                            loading={loadingMembers}
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-5 flex items-center justify-between text-sm">
                            <span>{error}</span>
                            <button onClick={() => loadAppointments(true)} className="font-medium underline cursor-pointer">Thử lại</button>
                        </div>
                    )}

                    <div className="space-y-4">
                        {loadingAppointments ? (
                            <>
                                <AppointmentSkeleton />
                                <AppointmentSkeleton />
                            </>
                        ) : appointments.length > 0 ? (
                            <>
                                {appointments.map((appt, index) => (
                                    <div
                                        key={appt.id || index}
                                        ref={index === appointments.length - 1 ? lastElementRef : null}
                                    >
                                        <AppointmentCard
                                            appointment={appt}
                                            onCancel={handleCancelAppointment}
                                        />
                                    </div>
                                ))}

                                {loadingMore && <AppointmentSkeleton />}

                                {!hasMore && appointments.length > 5 && (
                                    <p className="text-center text-slate-400 text-xs py-4">Hết danh sách lịch hẹn</p>
                                )}
                            </>
                        ) : !loadingMembers && (
                            <div>
                                <EmptyState
                                    memberName={selectedMember?.fullName || selectedMember?.firstName}
                                    onRefresh={() => loadAppointments(true)}
                                />
                            </div>
                        )}
                    </div>
                </main>

                <button
                    onClick={() => router.push("/register")}
                    className="fixed bottom-6 right-6 w-12 h-12 bg-cyan-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-cyan-700 transition-colors duration-200 cursor-pointer z-30"
                    title="Đăng ký khám mới"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                </button>
            </div>
        </AppLayout>
    );
}
