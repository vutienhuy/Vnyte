"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { formatCurrency, formatDOB } from "@/components/utils/formatters";
import { getPatientList } from "@/services/registration.service";
import { printHtml } from "@/lib/kiosk-print";
import {
  KioskError,
  checkDebt,
  generateQr,
  getDebtsByIdentity,
  getSseToken,
  openPaymentSse,
} from "@/services/payment.service";
import { getPaymentError } from "@/constants/payment-errors";
import type {
  CheckDebtData,
  DebtItem,
  GenerateQrData,
} from "@/types/payment";
import type { Patient } from "@/types/registration";

const QRCode = dynamic(() => import("react-qr-code"), { ssr: false });

type UiState =
  | { kind: "initializing" }
  | { kind: "no-identity" }
  | { kind: "patient-picker"; patients: Patient[] }
  | { kind: "debt-list"; identityNumber: string; patient?: Patient }
  | { kind: "confirm-debt"; identityNumber: string; debt: DebtItem; patient?: Patient }
  | { kind: "confirm-debt-b"; treatmentCode: string; data: CheckDebtData }
  | { kind: "qr-sse"; identityNumber?: string; qr: GenerateQrData; debt?: DebtItem; patient?: Patient }
  | { kind: "success"; qr: GenerateQrData; debt?: DebtItem; paidAt?: string }
  | { kind: "failure"; finalStatus: string; qr?: GenerateQrData }
  | { kind: "error"; code: string; message: string; backTo: "list" | "reset" };

const TIMEOUT_BUFFER_SEC = 15;

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <AppLayout>
          <div className="max-w-4xl mx-auto w-full p-4">
            <InitializingView />
          </div>
        </AppLayout>
      }
    >
      <PaymentPageInner />
    </Suspense>
  );
}

function PaymentPageInner() {
  const [state, setState] = useState<UiState>({ kind: "initializing" });
  const searchParams = useSearchParams();
  const codeFromQuery = searchParams.get("code");

  // Bootstrap: nếu có ?code= → Luồng B (check-debt theo treatmentCode).
  // Ngược lại → Luồng A (lấy identityNumber từ session login).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // --- Luồng B: treatment code từ query ---
      if (codeFromQuery) {
        try {
          const data = await checkDebt(codeFromQuery);
          if (!cancelled) {
            setState({
              kind: "confirm-debt-b",
              treatmentCode: codeFromQuery,
              data,
            });
          }
        } catch (e) {
          if (!cancelled) {
            const code = e instanceof KioskError ? e.code : "";
            const info = getPaymentError(code);
            setState({
              kind: "error",
              code: code || "UNKNOWN",
              message: info.message,
              backTo: "reset",
            });
          }
        }
        return;
      }

      // --- Luồng A: identityNumber từ session login ---
      const cccdRaw = sessionStorage.getItem("cccdPatient");
      if (cccdRaw) {
        try {
          const d = JSON.parse(cccdRaw);
          if (d?.soCccd && !cancelled) {
            setState({ kind: "debt-list", identityNumber: d.soCccd });
            return;
          }
        } catch {
          /* ignore */
        }
      }
      const patientCode = localStorage.getItem("patientCode");
      if (patientCode) {
        try {
          const res = await getPatientList(patientCode);
          const patients = res.data || [];
          if (cancelled) return;

          // Chủ tài khoản = người có patientCode trùng với patientCode đã login.
          // Override isOwner từ API để đảm bảo label hiển thị chuẩn xác.
          const withOwner = patients.map((p) => ({
            ...p,
            isOwner: p.patientCode === patientCode,
          }));

          // Sort: chủ tài khoản lên đầu, còn lại giữ thứ tự API
          const sorted = [...withOwner].sort((a, b) => {
            const ao = a.isOwner ? 1 : 0;
            const bo = b.isOwner ? 1 : 0;
            return bo - ao;
          });

          if (sorted.length === 0) {
            setState({ kind: "no-identity" });
            return;
          }

          // Chỉ 1 người → skip picker, vào thẳng danh sách nợ
          if (sorted.length === 1) {
            const p = sorted[0];
            const idNum = p.idNumber || p.identityNumber;
            if (idNum) {
              setState({ kind: "debt-list", identityNumber: idNum, patient: p });
              return;
            }
            setState({ kind: "no-identity" });
            return;
          }

          // Nhiều người (chủ + người thân) → hiện picker
          setState({ kind: "patient-picker", patients: sorted });
          return;
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setState({ kind: "no-identity" });
    })();
    return () => {
      cancelled = true;
    };
  }, [codeFromQuery]);

  const goToList = useCallback((identityNumber: string) => {
    setState({ kind: "debt-list", identityNumber });
  }, []);

  const handleError = useCallback(
    (err: unknown, backTo: "list" | "reset") => {
      const code = err instanceof KioskError ? err.code : "";
      const info = getPaymentError(code);
      setState({
        kind: "error",
        code: code || "UNKNOWN",
        message: info.message,
        backTo,
      });
    },
    [],
  );

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto w-full p-4 pb-24">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 text-center mb-6">
          Thanh toán viện phí
        </h1>

        {state.kind === "initializing" && <InitializingView />}

        {state.kind === "no-identity" && <NoIdentityView />}

        {state.kind === "patient-picker" && (
          <PatientPickerView
            patients={state.patients}
            onPick={(p) => {
              const idNum = p.idNumber || p.identityNumber;
              if (idNum) {
                setState({ kind: "debt-list", identityNumber: idNum, patient: p });
              }
            }}
          />
        )}

        {state.kind === "debt-list" && (
          <DebtListView
            identityNumber={state.identityNumber}
            patient={state.patient}
            onPick={(debt) =>
              setState({
                kind: "confirm-debt",
                identityNumber: state.identityNumber,
                debt,
                patient: state.patient,
              })
            }
            onError={(e) => handleError(e, "reset")}
          />
        )}

        {state.kind === "confirm-debt" && (
          <ConfirmDebtView
            debt={state.debt}
            onBack={() => goToList(state.identityNumber)}
            onConfirm={async () => {
              try {
                const qr = await generateQr(state.debt.treatmentId);
                setState({
                  kind: "qr-sse",
                  identityNumber: state.identityNumber,
                  qr,
                  debt: state.debt,
                });
              } catch (e) {
                handleError(e, "list");
              }
            }}
          />
        )}

        {state.kind === "confirm-debt-b" && (
          <ConfirmDebtBView
            data={state.data}
            onBack={() => (window.location.href = "/login?redirect=/payment")}
            onConfirm={async () => {
              try {
                const qr = await generateQr(
                  state.data.treatmentId,
                  state.data.transReqId,
                );
                // Dựng pseudo-DebtItem từ check-debt để reuse QR/Success view
                const debt = checkDebtToDebtItem(state.data);
                setState({ kind: "qr-sse", qr, debt });
              } catch (e) {
                handleError(e, "reset");
              }
            }}
          />
        )}

        {state.kind === "qr-sse" && (
          <QrSseView
            qr={state.qr}
            debt={state.debt}
            onPaid={(paidAt) =>
              setState({ kind: "success", qr: state.qr, debt: state.debt, paidAt })
            }
            onFailure={(finalStatus) =>
              setState({ kind: "failure", finalStatus, qr: state.qr })
            }
            onBack={() => {
              // Luồng A có identityNumber → quay về danh sách nợ.
              // Luồng B không có → về login chọn lại.
              if (state.identityNumber) goToList(state.identityNumber);
              else window.location.href = "/login?redirect=/payment";
            }}
            onError={(e) => handleError(e, "list")}
          />
        )}

        {state.kind === "success" && (
          <SuccessView
            qr={state.qr}
            debt={state.debt}
            paidAt={state.paidAt}
            onDone={() => (window.location.href = "/")}
          />
        )}

        {state.kind === "failure" && (
          <FailureView
            finalStatus={state.finalStatus}
            onRetry={() => {
              // Quay về list để user chọn lại
              const raw = sessionStorage.getItem("cccdPatient");
              const id = raw ? (JSON.parse(raw)?.soCccd as string) : "";
              if (id) goToList(id);
              else setState({ kind: "no-identity" });
            }}
          />
        )}

        {state.kind === "error" && (
          <ErrorView
            code={state.code}
            message={state.message}
            onBack={() => {
              const raw = sessionStorage.getItem("cccdPatient");
              const id = raw ? (JSON.parse(raw)?.soCccd as string) : "";
              if (id) goToList(id);
              else setState({ kind: "no-identity" });
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}

// ─── Sub-views ────────────────────────────────────────────────────────────

function InitializingView() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin" />
      <p className="mt-4 text-slate-500 text-lg">Đang tải thông tin...</p>
    </div>
  );
}

function NoIdentityView() {
  return (
    <div className="text-center py-20 space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">
        Không xác định được bệnh nhân
      </h2>
      <p className="text-slate-500 text-lg">
        Vui lòng đăng nhập lại hoặc quét CCCD để tiếp tục.
      </p>
      <button
        onClick={() => (window.location.href = "/login?redirect=/payment")}
        className="mt-2 px-6 py-3 bg-blue-700 text-white text-xl font-semibold rounded-xl hover:bg-blue-800"
      >
        Quay lại đăng nhập
      </button>
    </div>
  );
}

// Chọn bệnh nhân: sau QR login, nếu tài khoản có nhiều người (chủ + người thân)
// → cho chọn ai sẽ thanh toán. Nếu chỉ 1 người thì bootstrap đã skip qua màn này.
function PatientPickerView({
  patients,
  onPick,
}: {
  patients: Patient[];
  onPick: (p: Patient) => void;
}) {
  const displayName = (p: Patient) =>
    p.fullName || `${p.lastName ?? ""} ${p.firstName ?? ""}`.trim() || "(Chưa có tên)";

  const genderLabel = (id?: number) => {
    if (id === 1) return "Nam";
    if (id === 2) return "Nữ";
    return "";
  };

  const fullAddress = (p: Patient) =>
    [p.address, p.communeName, p.provinceName].filter(Boolean).join(", ");

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-800">
          Chọn người bệnh cần thanh toán
        </h2>
        <p className="text-slate-500 text-lg mt-1">
          Bạn có thể thanh toán cho chính mình hoặc người thân
        </p>
      </div>
      <div className="space-y-3">
        {patients.map((p) => {
          const idNum = p.idNumber || p.identityNumber;
          const hasCccd = !!idNum;
          const initial = displayName(p).charAt(0).toUpperCase();
          return (
            <button
              key={p.patientCode || idNum || displayName(p)}
              onClick={() => hasCccd && onPick(p)}
              disabled={!hasCccd}
              className={`w-full text-left bg-white rounded-xl border-l-4 ${
                p.isOwner ? "border-l-blue-600" : "border-l-emerald-500"
              } border border-slate-200 p-4 shadow-sm transition-all ${
                hasCccd
                  ? "hover:bg-slate-50 active:scale-[0.99] cursor-pointer"
                  : "opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold shrink-0 ${
                    p.isOwner
                      ? "bg-blue-100 text-blue-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-bold text-slate-800 truncate">
                      {displayName(p)}
                    </h3>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                        p.isOwner
                          ? "bg-blue-100 text-blue-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {p.isOwner ? "Chủ tài khoản" : "Người thân"}
                    </span>
                  </div>
                  <div className="text-sm text-slate-600 space-y-0.5">
                    {(p.dob || p.genderId) && (
                      <p>
                        {p.dob && <>Ngày sinh: {formatDOB(p.dob)}</>}
                        {p.dob && p.genderId ? "  •  " : ""}
                        {genderLabel(p.genderId) && (
                          <>Giới tính: {genderLabel(p.genderId)}</>
                        )}
                      </p>
                    )}
                    {(p.phoneNumber || p.mobileNumber) && (
                      <p>SĐT: {p.phoneNumber || p.mobileNumber}</p>
                    )}
                    {fullAddress(p) && (
                      <p className="text-slate-500 line-clamp-2">
                        Địa chỉ: {fullAddress(p)}
                      </p>
                    )}
                    {hasCccd ? (
                      <p className="text-slate-400">CCCD: {idNum}</p>
                    ) : (
                      <p className="text-amber-600 font-medium">
                        Chưa cập nhật CCCD, không thanh toán được
                      </p>
                    )}
                  </div>
                </div>
                {hasCccd && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-6 h-6 text-slate-400 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DebtListView({
  identityNumber,
  patient,
  onPick,
  onError,
}: {
  identityNumber: string;
  patient?: Patient;
  onPick: (d: DebtItem) => void;
  onError: (e: unknown) => void;
}) {
  const [debts, setDebts] = useState<DebtItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getDebtsByIdentity(identityNumber, 1, 50);
        if (!cancelled) setDebts(res.data);
      } catch (e) {
        if (!cancelled) onErrorRef.current(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identityNumber]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-4 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
            <div className="h-3 bg-slate-200 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (!debts || debts.length === 0) {
    return (
      <div className="text-center py-20 space-y-3">
        <h2 className="text-2xl font-bold text-slate-800">
          Không có khoản nợ viện phí
        </h2>
        <p className="text-slate-500 text-lg">
          Hiện tại bạn không có hồ sơ điều trị nào cần thanh toán.
        </p>
        <button
          onClick={() => (window.location.href = "/")}
          className="mt-4 px-6 py-3 bg-blue-700 text-white text-xl font-semibold rounded-xl hover:bg-blue-800"
        >
          Về trang chủ
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">
        Chọn hồ sơ cần thanh toán
      </h2>
      {patient && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold shrink-0">
            {(patient.fullName || patient.firstName || "?").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-500 text-sm">Đang thanh toán cho</p>
            <p className="text-slate-800 font-semibold truncate">
              {patient.fullName ||
                `${patient.lastName ?? ""} ${patient.firstName ?? ""}`.trim()}
              {patient.isOwner ? " (Chủ tài khoản)" : " (Người thân)"}
            </p>
          </div>
        </div>
      )}
      <p className="text-slate-500 text-lg">
        Tổng {debts.length} hồ sơ còn nợ viện phí
      </p>
      <div className="space-y-3">
        {debts.map((d) => (
          <button
            key={d.treatmentId}
            onClick={() => onPick(d)}
            className="w-full text-left bg-white rounded-lg border-l-4 border-l-orange-500 border border-slate-200 p-4 shadow-sm hover:bg-orange-50 active:scale-[0.99] transition-all"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="text-xl font-bold text-slate-800">{d.patientName}</h3>
                <p className="text-sm text-slate-500">
                  Mã HS: <b>{d.treatmentCode}</b> • Mã BN: {d.patientCode}
                </p>
              </div>
              <span className="text-2xl font-bold text-orange-600 shrink-0">
                {formatCurrency(d.remainingAmount)}
              </span>
            </div>
            <div className="text-sm text-slate-600 space-y-1">
              {d.icdName && (
                <p>
                  <span className="text-slate-400">Chẩn đoán:</span> {d.icdCode} - {d.icdName}
                </p>
              )}
              <p>
                <span className="text-slate-400">Nhập viện:</span> {d.inTime}
                {d.outTime && <> • <span className="text-slate-400">Ra viện:</span> {d.outTime}</>}
              </p>
              <p className="text-slate-400">
                Đã thanh toán: {formatCurrency(d.totalPaid)} / {formatCurrency(d.totalPatientPrice)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ConfirmDebtView({
  debt,
  onBack,
  onConfirm,
}: {
  debt: DebtItem;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <h2 className="text-2xl font-bold text-slate-800 text-center">
        Xác nhận thanh toán
      </h2>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
        <div className="text-center pb-4 border-b border-slate-100">
          <p className="text-slate-500 text-lg">Số tiền cần thanh toán</p>
          <p className="text-5xl font-bold text-orange-600 mt-2">
            {formatCurrency(debt.remainingAmount)}
          </p>
        </div>
        <Row label="Bệnh nhân" value={debt.patientName} />
        <Row label="Mã BN" value={debt.patientCode} />
        <Row label="Mã hồ sơ" value={debt.treatmentCode} />
        {debt.icdName && <Row label="Chẩn đoán" value={`${debt.icdCode} - ${debt.icdName}`} />}
        <Row label="Nhập viện" value={debt.inTime} />
      </div>
      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={submitting}
          className="flex-1 px-6 py-4 border border-slate-300 text-slate-700 text-xl font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-50"
        >
          Quay lại
        </button>
        <button
          onClick={async () => {
            setSubmitting(true);
            try {
              await onConfirm();
            } finally {
              setSubmitting(false);
            }
          }}
          disabled={submitting}
          className="flex-1 px-6 py-4 bg-blue-700 text-white text-xl font-semibold rounded-xl hover:bg-blue-800 disabled:opacity-50"
        >
          {submitting ? "Đang tạo QR..." : "Tạo mã QR thanh toán"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-lg">
      <span className="text-slate-500 shrink-0">{label}:</span>
      <span className="font-semibold text-slate-800 text-right">{value}</span>
    </div>
  );
}

// Màn xác nhận cho Luồng B. API check-debt giờ trả đầy đủ thông tin bệnh nhân
// và chẩn đoán — hiển thị tương đương Luồng A. Dùng lại transReqId cho
// generateQr (path 2 reuse) để tránh gọi CreateSDO lần 2.
function ConfirmDebtBView({
  data,
  onBack,
  onConfirm,
}: {
  data: CheckDebtData;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  if (!data.hasDebt || data.amount <= 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-10 space-y-5">
        <div className="w-24 h-24 mx-auto rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-14 h-14 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-800">
          Hồ sơ không còn khoản cần thanh toán
        </h2>
        <p className="text-slate-500 text-lg">Mã hồ sơ: {data.treatmentCode}</p>
        {data.patientName && (
          <p className="text-slate-500 text-lg">Bệnh nhân: {data.patientName}</p>
        )}
        <button
          onClick={onBack}
          className="w-full px-6 py-4 bg-blue-700 text-white text-xl font-semibold rounded-xl hover:bg-blue-800"
        >
          Quay lại
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <h2 className="text-2xl font-bold text-slate-800 text-center">
        Xác nhận thanh toán
      </h2>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
        <div className="text-center pb-4 border-b border-slate-100">
          <p className="text-slate-500 text-lg">Số tiền cần thanh toán</p>
          <p className="text-5xl font-bold text-orange-600 mt-2">
            {formatCurrency(data.amount)}
          </p>
        </div>
        <Row label="Bệnh nhân" value={data.patientName} />
        <Row label="Mã BN" value={data.patientCode} />
        <Row label="Ngày sinh" value={data.patientDob} />
        <Row label="Mã hồ sơ" value={data.treatmentCode} />
        {data.icdName && (
          <Row label="Chẩn đoán" value={`${data.icdCode} - ${data.icdName}`} />
        )}
        <Row label="Nhập viện" value={data.inTime} />
        <Row label="Mã giao dịch" value={data.transReqCode} />
      </div>
      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={submitting}
          className="flex-1 px-6 py-4 border border-slate-300 text-slate-700 text-xl font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-50"
        >
          Quay lại
        </button>
        <button
          onClick={async () => {
            setSubmitting(true);
            try {
              await onConfirm();
            } finally {
              setSubmitting(false);
            }
          }}
          disabled={submitting}
          className="flex-1 px-6 py-4 bg-blue-700 text-white text-xl font-semibold rounded-xl hover:bg-blue-800 disabled:opacity-50"
        >
          {submitting ? "Đang tạo QR..." : "Tạo mã QR thanh toán"}
        </button>
      </div>
    </div>
  );
}

// Dựng DebtItem giả từ CheckDebtData để reuse QrSseView + SuccessView + biên nhận.
// Các field không có (totalPatientPrice, oweType, ...) điền giá trị an toàn.
function checkDebtToDebtItem(d: CheckDebtData): DebtItem {
  return {
    treatmentId: d.treatmentId,
    treatmentCode: d.treatmentCode,
    patientCode: d.patientCode,
    patientName: d.patientName,
    patientDob: d.patientDob,
    patientGenderName: d.patientGenderName,
    inTime: d.inTime,
    outTime: d.outTime,
    icdCode: d.icdCode,
    icdName: d.icdName,
    totalPatientPrice: d.amount,
    totalPaid: 0,
    lockingAmount: 0,
    remainingAmount: d.amount,
    oweTypeId: 0,
    oweTypeCode: "",
    oweTypeName: "",
    isFinished: d.isFinished,
    isLockFee: d.isLockFee,
  };
}

function QrSseView({
  qr,
  debt,
  onPaid,
  onFailure,
  onBack,
  onError,
}: {
  qr: GenerateQrData;
  debt?: DebtItem;
  onPaid: (paidAt?: string) => void;
  onFailure: (finalStatus: string) => void;
  onBack: () => void;
  onError: (e: unknown) => void;
}) {
  const [status, setStatus] = useState<string>(qr.status);
  // null = HIS không trả expiredAt → không hiển thị countdown, không tự expire.
  // Chỉ dựa vào SSE 'done' để kết thúc.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() => {
    if (!qr.expiredAt) return null;
    const expire = Date.parse(qr.expiredAt);
    if (!isFinite(expire)) return null;
    return Math.max(
      0,
      Math.floor((expire - Date.now()) / 1000) - TIMEOUT_BUFFER_SEC,
    );
  });
  const esRef = useRef<EventSource | null>(null);
  const onPaidRef = useRef(onPaid);
  const onFailureRef = useRef(onFailure);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onPaidRef.current = onPaid;
    onFailureRef.current = onFailure;
    onErrorRef.current = onError;
  }, [onPaid, onFailure, onError]);

  // Countdown — chỉ chạy khi secondsLeft là số dương
  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const t = setInterval(
      () => setSecondsLeft((s) => (s === null ? null : Math.max(0, s - 1))),
      1000,
    );
    return () => clearInterval(t);
  }, [secondsLeft]);

  // SSE lifecycle với reconnect
  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      try {
        const { token } = await getSseToken();
        if (cancelled) return;

        const es = openPaymentSse(qr.transReqId, token);
        esRef.current = es;

        // HIS gửi event không kèm `event:` field → fire ra `message` event.
        // Phân biệt loại event bằng payload:
        //   có `finalStatus` → done event (kết thúc stream)
        //   có `status`      → status snapshot
        const handleMessage = (e: MessageEvent) => {
          let d: Record<string, unknown>;
          try {
            d = JSON.parse(e.data);
          } catch {
            return;
          }
          if (typeof d.finalStatus === "string") {
            const final = d.finalStatus as string;
            es.close();
            esRef.current = null;
            if (final === "PAID") onPaidRef.current();
            else onFailureRef.current(final);
            return;
          }
          if (typeof d.status === "string") {
            setStatus(d.status);
            if (d.status === "PAID") {
              onPaidRef.current(d.paidAt as string | undefined);
            }
          }
        };

        es.addEventListener("message", handleMessage);
        // Giữ listener cũ cho tương thích nếu backend đổi sang named events
        es.addEventListener("status", handleMessage);
        es.addEventListener("done", handleMessage);

        es.onerror = () => {
          // Reconnect: lấy token mới sau 2s
          es.close();
          esRef.current = null;
          if (!cancelled) {
            reconnectTimer = setTimeout(connect, 2000);
          }
        };
      } catch (e) {
        if (!cancelled) onErrorRef.current(e);
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [qr.transReqId]);

  // HIS không cấp expiredAt → secondsLeft=null, không bao giờ tự expire.
  const expired = secondsLeft !== null && secondsLeft <= 0;
  const showCountdown = secondsLeft !== null && !expired;
  const mm = showCountdown
    ? String(Math.floor(secondsLeft! / 60)).padStart(2, "0")
    : "00";
  const ss = showCountdown
    ? String(secondsLeft! % 60).padStart(2, "0")
    : "00";

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-800 mb-1">
          Quét QR để thanh toán
        </h2>
        <p className="text-slate-500 text-lg">
          Dùng app ngân hàng / ví điện tử của bạn
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6">
        <div className="flex flex-col items-center">
          {expired ? (
            <div className="w-64 h-64 flex flex-col items-center justify-center bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
              <p className="text-slate-600 text-xl font-semibold mb-2">
                Mã QR đã hết hạn
              </p>
              <p className="text-slate-400 text-sm text-center px-4">
                Vui lòng tạo lại yêu cầu thanh toán
              </p>
            </div>
          ) : (
            <div className="bg-white p-3 rounded-xl ring-2 ring-blue-100">
              <QRCode value={qr.qrText} size={240} level="M" />
            </div>
          )}

          <p className="mt-4 text-5xl font-bold text-orange-600">
            {formatCurrency(qr.amount)}
          </p>
          {debt && (
            <p className="mt-1 text-slate-500 text-base">
              {debt.patientName} • {debt.treatmentCode}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold">
              Ngân hàng: {qr.bank}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
              Mã GD: {qr.transReqCode}
            </span>
          </div>

          {showCountdown && (
            <p className="mt-4 text-slate-500 text-lg">
              Thời gian còn lại:{" "}
              <span className="font-bold text-slate-800 tabular-nums">
                {mm}:{ss}
              </span>
            </p>
          )}

          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-slate-700 font-medium">
              Trạng thái: {statusLabel(status)}
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={onBack}
        className="w-full px-6 py-3 border border-slate-300 text-slate-700 text-lg font-semibold rounded-xl hover:bg-slate-50"
      >
        Huỷ và quay lại danh sách
      </button>
    </div>
  );
}

function statusLabel(s: string): string {
  switch (s) {
    case "PENDING":
      return "Đang chờ thanh toán";
    case "PAID":
      return "Đã thanh toán";
    case "EXPIRED":
      return "Hết hạn";
    case "CANCELED":
      return "Đã huỷ";
    case "FAILED":
      return "Thất bại";
    case "TIMEOUT":
      return "Quá thời gian";
    default:
      return s;
  }
}

function SuccessView({
  qr,
  debt,
  paidAt,
  onDone,
}: {
  qr: GenerateQrData;
  debt?: DebtItem;
  paidAt?: string;
  onDone: () => void;
}) {
  const printedRef = useRef(false);

  // Kiosk tự về trang chủ sau 15s để phục vụ BN tiếp theo.
  const homeSeconds = useAutoAction(15, onDone);

  const triggerPrint = useCallback(async () => {
    // In im lặng qua máy in đã cấu hình (kiosk). Web fallback: mở cửa sổ in.
    try {
      await printHtml(buildReceiptHtml(qr, debt, paidAt));
    } catch (e) {
      console.error("Print receipt failed:", e);
    }
  }, [qr, debt, paidAt]);

  // Auto-print 1 lần khi mount
  useEffect(() => {
    if (printedRef.current) return;
    printedRef.current = true;
    triggerPrint();
  }, [triggerPrint]);

  return (
    <div className="max-w-xl mx-auto text-center py-10 space-y-5">
      <div className="w-24 h-24 mx-auto rounded-full bg-green-100 flex items-center justify-center">
        <svg className="w-14 h-14 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-3xl font-bold text-slate-800">Thanh toán thành công</h2>
      <p className="text-4xl font-bold text-green-600">{formatCurrency(qr.amount)}</p>
      <div className="bg-white rounded-xl border border-slate-200 p-4 text-left space-y-2 text-lg">
        {debt && <Row label="Bệnh nhân" value={debt.patientName} />}
        {debt && <Row label="Mã hồ sơ" value={debt.treatmentCode} />}
        <Row label="Mã giao dịch" value={qr.transReqCode} />
        <Row label="Ngân hàng" value={qr.bank} />
        {paidAt && <Row label="Thời điểm" value={new Date(paidAt).toLocaleString("vi-VN")} />}
      </div>
      <p className="text-slate-500 text-base">
        Đang in biên nhận... Nếu không in được, bấm nút bên dưới.
      </p>
      <p className="text-slate-400 text-base">
        Tự động về trang chủ sau <span className="font-bold text-slate-700 tabular-nums">{homeSeconds}s</span>
      </p>
      <div className="flex gap-3">
        <button
          onClick={triggerPrint}
          className="flex-1 px-6 py-4 border border-slate-300 text-slate-700 text-xl font-semibold rounded-xl hover:bg-slate-50"
        >
          In lại biên nhận
        </button>
        <button
          onClick={onDone}
          className="flex-1 px-6 py-4 bg-green-600 text-white text-xl font-semibold rounded-xl hover:bg-green-700"
        >
          Về trang chủ ngay
        </button>
      </div>
    </div>
  );
}

function buildReceiptHtml(
  qr: GenerateQrData,
  debt: DebtItem | undefined,
  paidAt: string | undefined,
): string {
  const amount = qr.amount.toLocaleString("vi-VN");
  const paidText = paidAt
    ? new Date(paidAt).toLocaleString("vi-VN")
    : new Date().toLocaleString("vi-VN");
  const patientName = debt?.patientName || "";
  const patientCode = debt?.patientCode || "";
  const patientDob = debt?.patientDob || "";
  const treatmentCode = debt?.treatmentCode || String(qr.treatmentId);
  const icd = debt?.icdCode
    ? `${debt.icdCode}${debt.icdName ? " - " + debt.icdName : ""}`
    : "";

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8"/>
<title>Biên nhận thanh toán - ${treatmentCode}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Arial', sans-serif; width: 80mm; margin: 0 auto; padding: 3mm 2mm; font-size: 12px; line-height: 1.4; color: #000; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .divider { border-top: 1px dashed #000; margin: 5px 0; }
  .double-divider { border-top: 2px solid #000; margin: 5px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .title { font-size: 16px; font-weight: bold; text-transform: uppercase; margin: 4px 0; }
  .hospital { font-size: 13px; font-weight: bold; text-transform: uppercase; }
  .amount-block { text-align: center; margin: 8px 0; padding: 8px 0; border: 2px solid #000; border-radius: 4px; }
  .amount-label { font-size: 11px; color: #000; }
  .amount-value { font-size: 22px; font-weight: bold; line-height: 1; margin-top: 2px; }
  .info-label { color: #000; font-size: 11px; }
  .info-value { font-weight: bold; }
  .footer { font-size: 10px; color: #000; margin-top: 8px; text-align: center; }
  @media print {
    body { width: 80mm; padding: 2mm; }
    @page { size: 80mm auto; margin: 0; }
  }
</style>
</head>
<body>
  <div class="center hospital">Kiosk Thanh toán VNyTe</div>
  <div class="double-divider"></div>

  <div class="center title">Biên nhận viện phí</div>
  <div class="center" style="font-size:11px; color:#000;">${paidText}</div>

  <div class="amount-block">
    <div class="amount-label">Số tiền đã thanh toán</div>
    <div class="amount-value">${amount} ₫</div>
  </div>

  <div class="divider"></div>
  <div style="margin:4px 0;">
    <div class="row"><span class="info-label">Mã giao dịch:</span> <span class="info-value">${escapeHtml(qr.transReqCode)}</span></div>
    <div class="row"><span class="info-label">Ngân hàng:</span> <span class="info-value">${escapeHtml(qr.bank)}</span></div>
    <div class="row"><span class="info-label">Mã hồ sơ:</span> <span class="info-value">${escapeHtml(treatmentCode)}</span></div>
  </div>

  ${
    patientName
      ? `<div class="divider"></div>
  <div style="margin:4px 0;">
    <div><span class="info-label">Bệnh nhân:</span> <span class="info-value">${escapeHtml(patientName)}</span></div>
    <div class="row"><span><span class="info-label">Mã BN:</span> ${escapeHtml(patientCode)}</span><span><span class="info-label">NS:</span> ${escapeHtml(patientDob)}</span></div>
    ${icd ? `<div><span class="info-label">ICD:</span> ${escapeHtml(icd)}</div>` : ""}
  </div>`
      : ""
  }

  <div class="divider"></div>
  <div class="center" style="margin-top:6px; font-size: 11px;">
    <b>Xin cảm ơn quý khách!</b><br/>
    Vui lòng giữ biên nhận để đối chiếu khi cần.
  </div>

  <div class="footer">In lúc: ${new Date().toLocaleString("vi-VN")}</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function FailureView({
  finalStatus,
  onRetry,
}: {
  finalStatus: string;
  onRetry: () => void;
}) {
  const label = useMemo(() => {
    if (finalStatus === "CANCELED") return "Giao dịch đã bị huỷ";
    if (finalStatus === "TIMEOUT") return "Giao dịch hết thời gian chờ";
    if (finalStatus === "FAILED") return "Giao dịch thất bại";
    return `Giao dịch kết thúc (${finalStatus})`;
  }, [finalStatus]);

  // Kiosk tự động quay lại danh sách hồ sơ sau 10s để reset cho BN tiếp theo.
  const seconds = useAutoAction(10, onRetry);

  return (
    <div className="max-w-xl mx-auto text-center py-10 space-y-5">
      <div className="w-24 h-24 mx-auto rounded-full bg-red-100 flex items-center justify-center">
        <svg className="w-14 h-14 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h2 className="text-3xl font-bold text-slate-800">{label}</h2>
      <p className="text-slate-500 text-lg">
        Vui lòng thử lại hoặc chọn hồ sơ khác.
      </p>
      <p className="text-slate-400 text-base">
        Tự động quay lại sau <span className="font-bold text-slate-700 tabular-nums">{seconds}s</span>
      </p>
      <button
        onClick={onRetry}
        className="w-full px-6 py-4 bg-blue-700 text-white text-xl font-semibold rounded-xl hover:bg-blue-800"
      >
        Thử lại ngay
      </button>
    </div>
  );
}

// Hook: countdown từ `initial` giây về 0. Khi về 0, gọi `action` 1 lần duy nhất.
// Dùng cho kiosk tự-phục-vụ: tự reset về bước trước để phục vụ BN tiếp theo
// khi BN hiện tại bỏ đi mà không thao tác.
function useAutoAction(initial: number, action: () => void): number {
  const [seconds, setSeconds] = useState(initial);
  const actionRef = useRef(action);
  useEffect(() => {
    actionRef.current = action;
  }, [action]);
  useEffect(() => {
    if (seconds <= 0) {
      actionRef.current();
      return;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  return seconds;
}

function ErrorView({
  code,
  message,
  onBack,
}: {
  code: string;
  message: string;
  onBack: () => void;
}) {
  return (
    <div className="max-w-xl mx-auto text-center py-10 space-y-5">
      <div className="w-24 h-24 mx-auto rounded-full bg-amber-100 flex items-center justify-center">
        <svg className="w-14 h-14 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M5 19h14a2 2 0 001.84-2.76l-7-12a2 2 0 00-3.68 0l-7 12A2 2 0 005 19z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-slate-800">Không thể tiếp tục</h2>
      <p className="text-slate-600 text-lg">{message}</p>
      <p className="text-slate-400 text-sm">Mã lỗi: {code}</p>
      <button
        onClick={onBack}
        className="w-full px-6 py-4 bg-blue-700 text-white text-xl font-semibold rounded-xl hover:bg-blue-800"
      >
        Thử lại
      </button>
    </div>
  );
}
