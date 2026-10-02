"use client";

import { useState, useCallback, useEffect } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { getTreatmentRecords } from "@/services/treatment.service";
import { getPatientList } from "@/services/registration.service";
import type { TreatmentRecord, Pagination } from "@/types/treatment";
import { formatDOB, formatCurrency } from "@/components/utils/formatters";
import { printHtml } from "@/lib/kiosk-print";
import { buildExamSlipHtml, slipFromTreatmentRecord } from "@/lib/exam-slip";

function formatInstructionTime(time: number): string {
    const s = String(time);
    if (s.length < 12) return "N/A";
    const year = s.substring(0, 4);
    const month = s.substring(4, 6);
    const day = s.substring(6, 8);
    const hour = s.substring(8, 10);
    const min = s.substring(10, 12);
    return `${day}/${month}/${year} ${hour}:${min}`;
}

// Bố cục phiếu dùng chung ở @/lib/exam-slip — trước đây file này giữ một bản
// chép GIỐNG HỆT build80mmPrintHtml của treatment-print, sửa mẫu là phải nhớ
// sửa cả hai chỗ, quên một chỗ là hai luồng in ra hai kiểu phiếu khác nhau.
function buildPrintHtml(record: TreatmentRecord): string {
    return buildExamSlipHtml(slipFromTreatmentRecord(record));
}

export default function PrintInvoice() {
    const [identityNumber, setIdentityNumber] = useState("");
    const [records, setRecords] = useState<TreatmentRecord[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [printingId, setPrintingId] = useState<number | null>(null);
    const [initLoading, setInitLoading] = useState(true);

    const fetchRecords = useCallback(async (id: string, page: number) => {
        if (!id?.trim()) return;
        setLoading(true);
        setError(null);

        try {
            const res = await getTreatmentRecords(id, page, 5);
            if (res.status === 200) {
                setRecords(res.data);
                setPagination(res.pagination);
            } else {
                setError(res.message || "Có lỗi xảy ra");
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Không thể tải dữ liệu");
        } finally {
            setLoading(false);
        }
    }, []);

    // Auto-resolve identityNumber from login session
    useEffect(() => {
        const init = async () => {
            // Luồng 1: CCCD/NFC → sessionStorage("cccdPatient").soCccd
            const cccdRaw = sessionStorage.getItem("cccdPatient");
            if (cccdRaw) {
                try {
                    const d = JSON.parse(cccdRaw);
                    if (d?.soCccd) {
                        setIdentityNumber(d.soCccd);
                        setInitLoading(false);
                        fetchRecords(d.soCccd, 1);
                        return;
                    }
                } catch { /* ignore */ }
            }

            // Luồng 2: QR Login → localStorage("patientCode") → getPatientList → idNumber
            const patientCode = localStorage.getItem("patientCode");
            if (patientCode) {
                try {
                    const res = await getPatientList(patientCode);
                    const owner = (res.data || []).find(m => m.patientCode === patientCode);
                    const idNum = owner?.idNumber || owner?.identityNumber || (res.data?.[0]?.idNumber) || (res.data?.[0]?.identityNumber);
                    if (idNum) {
                        setIdentityNumber(idNum);
                        setInitLoading(false);
                        fetchRecords(idNum, 1);
                        return;
                    }
                } catch { /* ignore */ }
            }

            setInitLoading(false);
        };
        init();
    }, [fetchRecords]);

    const goToPage = (page: number) => {
        fetchRecords(identityNumber, page);
    };

    const handlePrint = async (record: TreatmentRecord) => {
        setPrintingId(record.id);
        try {
            await printHtml(buildPrintHtml(record));
        } catch (e) {
            setError("In thất bại: " + (e instanceof Error ? e.message : String(e)));
        } finally {
            setPrintingId(null);
        }
    };

    // Build page numbers to display
    const renderPagination = () => {
        if (!pagination || pagination.pageCount <= 1) return null;
        const { page, pageCount, hasPrev, hasNext } = pagination;
        const pages: (number | string)[] = [];

        pages.push(1);
        if (page > 3) pages.push("...");
        for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i++) {
            pages.push(i);
        }
        if (page < pageCount - 2) pages.push("...");
        if (pageCount > 1) pages.push(pageCount);

        return (
            <div className="flex items-center justify-center gap-1 pt-2">
                <button
                    onClick={() => goToPage(page - 1)}
                    disabled={!hasPrev || loading}
                    className="px-4 py-2 text-lg rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                    ‹
                </button>
                {pages.map((p, i) =>
                    typeof p === "string" ? (
                        <span key={`ellipsis-${i}`} className="px-2 text-slate-400 text-lg">...</span>
                    ) : (
                        <button
                            key={p}
                            onClick={() => goToPage(p)}
                            disabled={loading}
                            className={`px-4 py-2 text-lg rounded-lg border transition-colors ${
                                p === page
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "border-slate-200 hover:bg-slate-50"
                            }`}
                        >
                            {p}
                        </button>
                    )
                )}
                <button
                    onClick={() => goToPage(page + 1)}
                    disabled={!hasNext || loading}
                    className="px-4 py-2 text-lg rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                    ›
                </button>
            </div>
        );
    };

    return (
        <AppLayout>
            <div className="max-w-5xl mx-auto w-full flex flex-col p-4 pb-24 space-y-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 text-center">
                    In phiếu khám
                </h1>

                {/* Error */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-lg">
                        {error}
                    </div>
                )}

                {/* Loading */}
                {(loading || initLoading) && (
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white rounded-lg border border-slate-200 p-4 animate-pulse">
                                <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
                                <div className="h-3 bg-slate-200 rounded w-1/2 mb-2" />
                                <div className="h-3 bg-slate-200 rounded w-2/3" />
                            </div>
                        ))}
                    </div>
                )}

                {/* Results */}
                {!loading && !initLoading && records.length > 0 && (
                    <>
                        <p className="text-lg text-slate-500">
                            Trang {pagination?.page || 1} / {pagination?.pageCount || 1} — Tổng {pagination?.total || 0} kết quả
                        </p>
                        <div className="space-y-3">
                            {records.map((record) => {
                                const isPrinting = printingId === record.id;
                                return (
                                    <div
                                        key={record.id}
                                        className="bg-white rounded-lg border-l-4 border-l-blue-600 border border-slate-200 p-4 shadow-sm"
                                    >
                                        <div className="flex justify-between items-start mb-3">
                                            <h3 className="text-xl font-bold text-blue-900">
                                                {record.patientName}
                                            </h3>
                                            <button
                                                onClick={() => handlePrint(record)}
                                                disabled={isPrinting}
                                                className="px-4 py-1.5 bg-blue-600 text-white text-lg font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center gap-2 shrink-0"
                                            >
                                                {isPrinting ? (
                                                    <>
                                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                        Đang in phiếu...
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
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-lg text-slate-600">
                                            <p>
                                                <span className="font-medium">Mã BN:</span>{" "}
                                                <span className="font-semibold text-slate-800">{record.patientCode}</span>
                                            </p>
                                            <p>
                                                <span className="font-medium">Ngày sinh:</span>{" "}
                                                {formatDOB(record.patientDob)}
                                            </p>
                                            <p>
                                                <span className="font-medium">Mã điều trị:</span>{" "}
                                                <span className="font-semibold text-slate-800">{record.treatmentCode}</span>
                                            </p>
                                            <p>
                                                <span className="font-medium">Giới tính:</span>{" "}
                                                {record.patientGenderName}
                                            </p>
                                            <p>
                                                <span className="font-medium">STT:</span>{" "}
                                                <span className="font-semibold text-blue-700">{record.numOrder}</span>
                                            </p>
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-slate-100 text-lg text-slate-600">
                                            <p>
                                                <span className="font-medium">Dịch vụ:</span>{" "}
                                                <span className="font-semibold text-slate-800">{record.serviceName}</span>
                                            </p>
                                            <div className="flex justify-between mt-2">
                                                <p>
                                                    <span className="font-medium">Phòng thực hiện:</span>{" "}
                                                    {record.executeRoomName}
                                                </p>
                                                <p className="font-bold text-blue-700">
                                                    {formatCurrency(record.price)}
                                                </p>
                                            </div>
                                            <p className="mt-2">
                                                <span className="font-medium">Thời gian:</span>{" "}
                                                <span className="font-semibold text-orange-600">{formatInstructionTime(record.intructionTime)}</span>
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Pagination */}
                        {renderPagination()}
                    </>
                )}

                {/* Empty state */}
                {!loading && !initLoading && !error && records.length === 0 && pagination && (
                    <div className="text-center py-12 text-slate-400 text-lg">
                        Không tìm thấy hồ sơ điều trị nào
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
