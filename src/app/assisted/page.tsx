"use client";

// Luồng "Tiếp đón có hỗ trợ" — NVYT đứng máy KIOSK đăng ký khám cho bệnh nhân,
// GỒM CẢ ĐỐI TƯỢNG BHYT (luồng tự phục vụ ở /register chỉ đăng ký được dịch vụ).
//
// Thứ tự gọi API theo tich-hop-kiosk-tiep-don-co-ho-tro.md mục 5:
//   login → lookup → patient-info (GET/PUT) → [BHYT: insurance-check → mã BHYT + giấy tờ]
//   → rooms → services → register → ticket → logout

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import StaffLoginPanel from "@/components/assisted/StaffLoginPanel";
import CccdReadPanel from "@/components/assisted/CccdReadPanel";
import PatientInfoPanel from "@/components/assisted/PatientInfoPanel";
import InsurancePanel, { type InsuranceSelection } from "@/components/assisted/InsurancePanel";
import RoomServicePanel from "@/components/assisted/RoomServicePanel";
import TicketPanel from "@/components/assisted/TicketPanel";
import ReconcilePanel from "@/components/assisted/ReconcilePanel";
import { getArError, isKnownArCode, type ArErrorAction } from "@/constants/assisted-reception-errors";
import { ASSISTED_RECEPTION_ONLY } from "@/lib/feature-flags";
import { Card, GhostButton, PageHead, StepBar } from "@/components/assisted/FlowShell";
import { takePendingIdentity, type PatientSuggest } from "@/lib/assisted-identity";
import {
  ArError, cancelReception, confirmPatientInfo, getStaffIdleTimeout, getStaffName, getStaffToken, lookup,
  register, staffLogout,
} from "@/services/assisted-reception.service";
import type {
  AlreadyRegisteredDetails, CccdPayload, IdentityConflictDetails, PatientFieldError, PatientInfoSources,
  PatientTypeOption, ReceptionPatientInfo, ReceptionTicket, RegisterPayload,
} from "@/types/assisted-reception";

type Step =
  | "login" | "cccd" | "info" | "patient-type" | "insurance" | "room"
  | "ticket" | "unknown" | "blocked";

/**
 * Mặc định CHỐT CUỐI khi không biết ngưỡng của viện — trùng mặc định phía backend.
 * Đây là con số phải hiếm khi nhìn thấy; thấy 5:00 trên máy là dấu hiệu viện chưa đặt
 * `session.idleTimeoutSeconds` trong KIOSK_ASSISTED_RECEPTION_CONFIG.
 */
const FALLBACK_IDLE_SECONDS = 300;

/** Chỉ nhận số dương; mọi thứ khác (undefined, "abc", 0, âm) coi như không biết. */
function validIdle(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export default function AssistedReceptionPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("login");
  const [staffName, setStaffName] = useState("");
  /**
   * Ngưỡng không-thao-tác, lấy TỪ `idleTimeoutSeconds` của lần đăng nhập (mục 6).
   * Khi trang mở lại giữa phiên thì lấy lại từ sessionStorage — xem effect khôi phục
   * phiên bên dưới; mặc định ở đây chỉ dùng lúc chưa có ai đăng nhập.
   */
  const [idleTimeout, setIdleTimeout] = useState(FALLBACK_IDLE_SECONDS);

  const [receptionId, setReceptionId] = useState<string | null>(null);
  const [patientInfo, setPatientInfo] = useState<ReceptionPatientInfo | null>(null);
  const [sources, setSources] = useState<PatientInfoSources>({});
  const [fieldErrors, setFieldErrors] = useState<PatientFieldError[]>([]);
  const [patientTypes, setPatientTypes] = useState<PatientTypeOption[]>([]);
  const [patientType, setPatientType] = useState<PatientTypeOption | null>(null);
  const [insurance, setInsurance] = useState<InsuranceSelection | null>(null);
  const [ticket, setTicket] = useState<ReceptionTicket | null>(null);
  const [retryAfter, setRetryAfter] = useState(0);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; action: ArErrorAction; details?: unknown } | null>(null);
  /** Lý do phiên trước kết thúc — hiện lại trên màn đăng nhập để NVYT biết vì sao bị đẩy ra. */
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  /** Mốc hết thời gian không thao tác; dùng cho cả tự đăng xuất lẫn đồng hồ đếm ngược. */
  const [idleDeadline, setIdleDeadline] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  /** Dữ liệu CCCD lần gần nhất — để đối chiếu khi lệch hồ sơ và để quay lại sửa. */
  const [lastCccd, setLastCccd] = useState<CccdPayload | null>(null);
  /** Mở lại bước đọc CCCD ở chế độ nhập tay, giữ nguyên dữ liệu đã gõ. */
  const [editCccd, setEditCccd] = useState(false);

  /**
   * Danh tính mang sang từ bước đăng nhập bệnh nhân ở /register/choose (quét CCCD hoặc
   * tài khoản VNyTe). Có sẵn thì bỏ hẳn bước đọc thẻ: đăng nhập NVYT xong là `lookup`
   * luôn. Lấy một lần lúc mở trang, giữ trong ref để lần "Tiếp bệnh nhân khác" sau đó
   * quay về đọc thẻ như thường.
   */
  const pendingRef = useRef(takePendingIdentity());
  const suggestRef = useRef<PatientSuggest>(pendingRef.current?.suggest ?? {});

  /**
   * Khôi phục phiên khi trang được mở lại trong cùng tab: NVYT bấm "Về trang chủ" rồi
   * vào đăng ký cho người tiếp theo, hoặc F5 trên máy kiosk.
   *
   * PHẢI khôi phục cả ngưỡng thời gian, không chỉ tên NVYT. Thiếu nó thì màn hình vẫn
   * hiện đúng tên người đang trực nhưng đồng hồ đếm lại từ mặc định 5 phút, trong khi
   * phiên thật của viện là 50 phút — đúng lỗi chụp được ở BV Nguyễn Thị Thập: bệnh nhân
   * đầu 48:46, sang bệnh nhân sau còn 4:59.
   */
  useEffect(() => {
    if (getStaffToken()) {
      setStaffName(getStaffName() || "");
      const saved = getStaffIdleTimeout();
      if (saved != null) setIdleTimeout(saved);
      setStep("cccd");
    }
  }, []);

  const resetPatient = useCallback(() => {
    setReceptionId(null);
    setPatientInfo(null);
    setSources({});
    setFieldErrors([]);
    setPatientTypes([]);
    setPatientType(null);
    setInsurance(null);
    setTicket(null);
    setRetryAfter(0);
    setNotice(null);
  }, []);

  const backToLogin = useCallback(() => {
    resetPatient();
    setStaffName("");
    setStep("login");
  }, [resetPatient]);

  /** Xử lý chung mọi lỗi API: mã lỗi quyết định app đi đâu (mục 6 + 11). */
  const handleError = useCallback((e: unknown): ArErrorAction => {
    const err = e as ArError;
    const info = getArError(err.code);
    let message = info.preferServerMessage && err.message ? err.message : info.message;
    let action = info.action;

    // Tài liệu mục 6: MỌI 401 đều nghĩa là phiên NVYT đã chết, bất kể mã lỗi cụ thể.
    // Không phải 401 nào cũng mang mã KIOSK_SESSION_* — token hỏng bị chặn sớm chỉ trả
    // `ERROR / Unauthorized`, rơi vào nhánh mặc định và đẩy NVYT vào màn "lỗi không xác
    // định" không có đường ra, trong khi việc cần làm chỉ là đăng nhập lại.
    if (err.status === 401 && action !== "back-to-idle") {
      action = "back-to-login";
      if (!isKnownArCode(err.code)) {
        message = "Phiên làm việc không còn hiệu lực. Vui lòng đăng nhập lại tài khoản HIS.";
      }
    }

    // Xung đột danh tính có HAI nguyên nhân rất khác nhau, câu mặc định của backend
    // ("thông tin không khớp") chỉ đúng một nửa và làm NVYT đi soát lại CCCD vô ích khi
    // thực ra thông tin khớp hoàn toàn, chỉ là HIS có nhiều hồ sơ trùng cho cùng CCCD.
    if (err.code === "KIOSK_AR_PATIENT_IDENTITY_CONFLICT") {
      const rows = (err.details as IdentityConflictDetails | null)?.hisPatients ?? [];
      if (rows.length > 1) {
        message = `CCCD này đang gắn với ${rows.length} hồ sơ bệnh nhân trên HIS. `
          + "KIOSK không được tự chọn một hồ sơ (chọn nhầm là gắn đợt khám sang người khác). "
          + "Vui lòng hướng dẫn bệnh nhân ra quầy tiếp đón để gộp hồ sơ.";
      }
    }
    setNotice({ message, action, details: err.details });

    if (action === "back-to-login" || action === "back-to-idle") {
      setSessionNotice(message);
      backToLogin();
      return action;
    }
    if (action === "restart-draft") { resetPatient(); setStep("cccd"); return action; }
    if (action === "contact-tech" || action === "contact-staff") setStep("blocked");
    if (action === "reconcile") { setRetryAfter(0); setStep("unknown"); }
    return action;
  }, [backToLogin, resetPatient]);

  // --- Thời gian chờ phía app ---
  // Backend tự đóng phiên sau idleTimeoutSeconds. App KHÔNG gọi `me` theo timer để
  // "giữ phiên" — làm vậy sẽ vô hiệu hoá hẳn idle timeout (mục 6). Thay vào đó app tự
  // đếm không-thao-tác và chủ động logout, đúng tinh thần "gọi logout khi về màn chờ".
  const firedRef = useRef(false);
  useEffect(() => {
    if (step === "login") { setIdleDeadline(null); setSecondsLeft(null); return; }
    firedRef.current = false;
    const arm = () => setIdleDeadline(Date.now() + Math.max(idleTimeout, 60) * 1000);
    arm();
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown"];
    events.forEach((ev) => window.addEventListener(ev, arm));
    return () => events.forEach((ev) => window.removeEventListener(ev, arm));
  }, [step, idleTimeout]);

  useEffect(() => {
    if (idleDeadline == null) return;
    const tick = () => {
      const left = Math.ceil((idleDeadline - Date.now()) / 1000);
      setSecondsLeft(left > 0 ? left : 0);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true; // chỉ bắn một lần dù interval còn chạy thêm nhịp
        setSessionNotice("Đã quá thời gian không thao tác, phiên tự đóng. Vui lòng đăng nhập lại.");
        staffLogout().finally(backToLogin);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [idleDeadline, backToLogin]);

  // --- Các bước ---

  const doLookup = async (payload: CccdPayload) => {
    setBusy(true);
    setNotice(null);
    setLastCccd(payload);
    try {
      const res = await lookup(payload);
      setReceptionId(res.receptionId);
      setPatientInfo(res.patientInfo);
      setSources(res.sources);
      setPatientTypes(res.patientTypes);
      setFieldErrors([]);
      pendingRef.current = null; // đã dùng xong danh tính mang sang
      setStep("info");
    } catch (e) {
      const action = handleError(e);
      // GIỮ danh tính khi lỗi là do phiên NVYT chết (hết hạn, bị thu hồi, đăng nhập đè):
      // NVYT đăng nhập lại xong phải tra tiếp ngay, chứ bắt quét lại thẻ thì vô lý —
      // bệnh nhân đã đăng nhập bằng CCCD/QR ở đầu luồng rồi.
      // Lỗi khác (lệch hồ sơ, trùng đăng ký trong ngày…) thì bỏ, để NVYT tự xử tay và
      // không lặp lại đúng một lệnh gọi sẽ hỏng y như cũ.
      if (action !== "back-to-login" && action !== "back-to-idle") pendingRef.current = null;
    } finally {
      setBusy(false);
    }
  };

  // Vừa bước sang màn đọc thẻ mà đã có danh tính mang từ /register/choose sang thì
  // tra luôn, không bắt quét lại. Cả hai lối vào (mở lại trang khi còn phiên, và vừa
  // đăng nhập NVYT xong) đều đi qua step "cccd" nên chỉ cần một chỗ này.
  // `editCccd` = NVYT chủ động bấm "Sửa lại thông tin" → tôn trọng, không tự tra đè.
  useEffect(() => {
    if (step !== "cccd" || editCccd) return;
    const p = pendingRef.current;
    if (!p) return;
    doLookup(p.payload);
    // doLookup đọc state qua setter nên không cần vào deps; thêm vào chỉ gây chạy lại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, editCccd]);

  const doConfirmInfo = async (info: ReceptionPatientInfo) => {
    if (!receptionId) return;
    setBusy(true);
    setNotice(null);
    setFieldErrors([]);
    try {
      const view = await confirmPatientInfo(receptionId, info);
      setPatientInfo(view.patientInfo);
      setSources(view.sources);
      setStep("patient-type");
    } catch (e) {
      const err = e as ArError;
      if (err.fields.length > 0) {
        // Mọi ô lỗi trả cùng một lần → tô hết, không bắt NVYT sửa từng vòng.
        setFieldErrors(err.fields);
        setNotice({ message: getArError(err.code).message, action: "fix-fields" });
      } else {
        handleError(e);
      }
    } finally {
      setBusy(false);
    }
  };

  const choosePatientType = (t: PatientTypeOption) => {
    setPatientType(t);
    setInsurance(null);
    // Đối tượng không BHYT TUYỆT ĐỐI không gửi mã BHYT/giấy tờ (mục 7.7).
    setStep(t.isInsurance ? "insurance" : "room");
  };

  const doRegister = async (roomId: number, serviceId: number, symptom: string | null) => {
    if (!receptionId || !patientType) return;
    setBusy(true);
    setNotice(null);

    const payload: RegisterPayload = { patientTypeId: patientType.id, roomId, serviceId, symptom };
    if (patientType.isInsurance && insurance) {
      payload.heinPatientTypeCode = insurance.heinPatientTypeCode;
      // v1.2: mã 1.5 gửi CẢ HAI — `followUpTreatmentCode` (server tự dựng followUpData từ
      // hồ sơ cũ) và `referralData` là form giấy chuyển tuyến NVYT vừa xem/sửa. TUYỆT ĐỐI
      // không gửi khối `followUpData` nhập tay: KIOSK luôn bị từ chối (FOLLOW_UP_REQUIRED).
      if (insurance.referralData) payload.referralData = insurance.referralData;
      if (insurance.followUpTreatmentCode) payload.followUpTreatmentCode = insurance.followUpTreatmentCode;
    }

    try {
      const t = await register(receptionId, payload);
      setTicket(t);
      setStep("ticket");
    } catch (e) {
      const err = e as ArError;
      /**
       * `register` là lệnh GHI, và là lệnh duy nhất trong luồng có thể tạo hồ sơ thật
       * trên HIS. Mọi kiểu hỏng KHÔNG cho biết rõ kết quả đều phải đi đường đối soát
       * (mục 10), tuyệt đối không được báo "lỗi, thử lại" — HIS có thể đã tạo hồ sơ
       * rồi, NVYT gửi lại là bệnh nhân có hai lượt khám.
       *
       * Ngoài 409 UNKNOWN của vnyte còn hai kiểu nữa, đều đo được trên máy thật:
       *   • KIOSK_AR_UPSTREAM_TIMEOUT — Gateway chờ HIS quá hạn
       *   • KIOSK_AR_UPSTREAM_INVALID — lớp edge trước vnyte cắt ngang, trả trang lỗi
       *     chữ thường ("error code: 502") thay vì JSON
       * Cả hai đều xảy ra SAU khi lệnh đã rời máy kiosk, nên kết quả là không biết.
       *
       * Đối soát an toàn cả khi hồ sơ chưa từng tới vnyte: lúc đó phiếu còn DRAFT,
       * `reconcile` trả 409 NOT_RECONCILABLE và NVYT gửi lại bình thường.
       */
      const ambiguous =
        err.code === "KIOSK_AR_RECEPTION_UNKNOWN" ||
        err.code === "KIOSK_AR_UPSTREAM_TIMEOUT" ||
        err.code === "KIOSK_AR_UPSTREAM_INVALID" ||
        err.status === 502 || err.status === 504;
      if (ambiguous) {
        const retry = (err.details as { retryAfterSeconds?: number } | null)?.retryAfterSeconds ?? 0;
        setRetryAfter(retry);
        setStep("unknown");
        setNotice(null);
        return;
      }
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  /** Xong một bệnh nhân: đóng phiên sạch rồi về màn đăng nhập cho NVYT tiếp theo (mục 9). */
  const finishPatient = async () => {
    // Sang bệnh nhân khác: bỏ danh tính mang từ luồng đăng nhập, nếu không máy sẽ tra
    // lại đúng người vừa xong.
    pendingRef.current = null;
    resetPatient();
    setStep("cccd");
  };

  /** Đóng phiên sạch. `goHome=false` = đổi người trực: ở lại màn đăng nhập NVYT. */
  const endSession = async (goHome: boolean) => {
    setBusy(true);
    try {
      await staffLogout();
    } finally {
      setBusy(false);
      backToLogin();
      if (goHome) router.push("/");
    }
  };

  const abortDraft = async () => {
    if (receptionId) {
      // Phiếu còn DRAFT/FAILED thì huỷ cho sạch; đã gửi HIS thì backend từ chối — bỏ qua.
      try { await cancelReception(receptionId); } catch { /* không chặn luồng */ }
    }
    pendingRef.current = null;
    resetPatient();
    setStep("cccd");
  };

  return (
    <AppLayout showBackButton={!ASSISTED_RECEPTION_ONLY} backHref="/">
      <div className="flex-1 px-4 py-6">
        {step !== "login" && (
          <div className="max-w-5xl mx-auto mb-5 flex items-center justify-between gap-4 bg-white/80 backdrop-blur rounded-2xl px-5 py-3 shadow-sm">
            <span className="flex items-center gap-3 text-xl text-slate-500">
              <span className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xl font-bold">
                {(staffName || "?").trim().slice(-1).toUpperCase()}
              </span>
              <span>
                <span className="block text-base text-slate-400 leading-none">Nhân viên tiếp đón</span>
                <b className="text-slate-700">{staffName || "—"}</b>
              </span>
            </span>
            <div className="flex items-center gap-4">
              {/* Đếm ngược để NVYT biết phiên sắp tự đóng, khỏi bị đẩy ra giữa chừng */}
              {secondsLeft != null && (
                <span
                  className={`text-lg px-3 py-1.5 rounded-full ${
                    secondsLeft <= 60 ? "bg-red-50 text-red-600 font-semibold" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  Phiên còn {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                </span>
              )}
              <button
                onClick={() => endSession(false)}
                disabled={busy}
                className="text-lg px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:border-slate-300"
              >
                Đổi người trực
              </button>
              <button onClick={() => endSession(true)} disabled={busy} className="text-lg text-slate-400 hover:text-slate-600">
                Thoát
              </button>
            </div>
          </div>
        )}

        {notice && step !== "blocked" && (
          <div className="max-w-5xl mx-auto mb-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-xl">
            {notice.message}
            <AlreadyRegisteredHint details={notice.details} />
          </div>
        )}

        {step === "login" && (
          <StaffLoginPanel
            notice={sessionNotice}
            onSuccess={(name, idle) => {
              setSessionNotice(null);
              setStaffName(name);
              // Login không trả số hợp lệ thì GIỮ con số đang có, đừng tụt về mặc định:
              // thà đếm theo ngưỡng cũ của viện còn hơn tự ý rút phiên xuống 5 phút.
              const ok = validIdle(idle);
              if (ok != null) {
                setIdleTimeout(ok);
              }
              setStep("cccd");
            }}
          />
        )}

        {step === "cccd" && (
          <CccdReadPanel
            onRead={doLookup}
            loading={busy}
            initial={editCccd ? lastCccd : null}
          />
        )}

        {step === "info" && patientInfo && (
          <PatientInfoPanel
            info={patientInfo}
            sources={sources}
            suggest={suggestRef.current}
            fieldErrors={fieldErrors}
            saving={busy}
            onConfirm={doConfirmInfo}
            onCancel={abortDraft}
          />
        )}

        {step === "patient-type" && (
          <div className="max-w-3xl mx-auto w-full">
            <StepBar current={3} />
            <PageHead
              title="Đối tượng khám"
              subtitle="Bệnh nhân khám theo bảo hiểm y tế hay tự chi trả?"
            />
            {/*
              Danh sách này do ĐƠN VỊ cấu hình (patientTypeIds), không phải app tự bịa ra,
              nên ngoài BHYT thường có cả các đối tượng tự chi trả. Chúng PHẢI có mặt: khi
              tra thẻ ra kết quả không dùng được, `onSwitchPatientType` đưa NVYT quay về
              đúng màn này để chuyển bệnh nhân sang tự chi trả — bỏ đi là đứt luồng.
              Tách hai nhóm có tiêu đề để NVYT không tưởng app hiểu sai ý mình.
            */}
            <Card className="space-y-3">
              {(() => {
                const bhyt = patientTypes.filter((t) => t.isInsurance);
                const selfPay = patientTypes.filter((t) => !t.isInsurance);
                const row = (t: PatientTypeOption, note: string) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => choosePatientType(t)}
                    className="w-full text-left p-5 rounded-2xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 transition flex items-center justify-between gap-4"
                  >
                    <span>
                      <span className="block text-3xl font-semibold text-slate-800">{t.name}</span>
                      <span className="block text-lg text-slate-400 mt-0.5">{note}</span>
                    </span>
                    <span className="text-3xl text-slate-300">›</span>
                  </button>
                );
                return (
                  <>
                    {bhyt.map((t) => row(t, "Tra thẻ BHYT ở bước sau"))}
                    {selfPay.length > 0 && (
                      <>
                        <p className="text-xl text-slate-400 pt-3 pb-1">
                          Không dùng bảo hiểm — bệnh nhân tự chi trả
                        </p>
                        {selfPay.map((t) => row(t, "Không tra thẻ, sang chọn phòng khám luôn"))}
                      </>
                    )}
                  </>
                );
              })()}
              <GhostButton onClick={abortDraft} className="w-full">Huỷ phiếu</GhostButton>
            </Card>
          </div>
        )}

        {step === "insurance" && receptionId && (
          <InsurancePanel
            receptionId={receptionId}
            onPatientInfoRefreshed={(view) => {
              setPatientInfo(view.patientInfo);
              setSources(view.sources);
            }}
            onDone={(sel) => { setInsurance(sel); setStep("room"); }}
            onBack={() => setStep("patient-type")}
            onSwitchPatientType={() => { setInsurance(null); setStep("patient-type"); }}
          />
        )}

        {step === "room" && receptionId && patientType && (
          <RoomServicePanel
            receptionId={receptionId}
            patientTypeId={patientType.id}
            registering={busy}
            onRegister={doRegister}
            onBack={() => setStep(patientType.isInsurance ? "insurance" : "patient-type")}
          />
        )}

        {step === "unknown" && receptionId && (
          <ReconcilePanel
            receptionId={receptionId}
            initialRetryAfterSeconds={retryAfter}
            onSuccess={(t) => { setTicket(t); setStep("ticket"); }}
            onFailed={() => {
              setNotice({
                message: "HIS xác nhận chưa tạo hồ sơ. Vui lòng chọn lại phòng/công khám và gửi lại.",
                action: "reload-list",
              });
              setStep("room");
            }}
          />
        )}

        {step === "ticket" && ticket && (
          <TicketPanel ticket={ticket} patientInfo={patientInfo} onFinish={finishPatient} />
        )}

        {step === "blocked" && (
          <Card className="max-w-2xl mx-auto text-center space-y-5">
            <div className="text-6xl">⚠️</div>
            <p className="text-2xl text-slate-700">{notice?.message}</p>
            <AlreadyRegisteredHint details={notice?.details} />
            <IdentityConflictHint details={notice?.details} entered={lastCccd} />
            {/* Lệch hồ sơ do gõ sai (hay gặp nhất: gõ tên không dấu) thì phải cho sửa
                tại chỗ, không bắt bỏ cuộc — chỉ khi HIS có NHIỀU hồ sơ trùng CCCD mới
                thật sự hết đường ở KIOSK. */}
            {canRetryCccd(notice) && (
              <button
                onClick={() => { pendingRef.current = null; resetPatient(); setEditCccd(true); setStep("cccd"); }}
                className="w-full py-4 rounded-xl bg-blue-700 text-white font-bold text-2xl"
              >
                Sửa lại thông tin
              </button>
            )}
            <button
              onClick={() => { pendingRef.current = null; resetPatient(); setLastCccd(null); setEditCccd(false); setStep("cccd"); }}
              className={`w-full py-4 rounded-xl font-bold text-2xl ${
                canRetryCccd(notice) ? "border border-slate-300 text-slate-700" : "bg-blue-700 text-white"
              }`}
            >
              Tiếp bệnh nhân khác
            </button>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

/**
 * Liệt kê hồ sơ HIS đang trùng CCCD. NVYT đọc đúng mã hồ sơ cho quầy tiếp đón gộp,
 * khỏi phải tra lại từ đầu — và nhìn danh sách là hiểu ngay vì sao KIOSK không đi tiếp được.
 */
function IdentityConflictHint({ details, entered }: { details?: unknown; entered?: CccdPayload | null }) {
  const rows = (details as IdentityConflictDetails | null)?.hisPatients;
  if (!rows?.length) return null;
  return (
    <div className="text-left bg-slate-50 border border-slate-200 rounded-xl p-4">
      {/* Đặt cạnh nhau để NVYT thấy ngay chỗ lệch — thường chỉ là thiếu dấu tiếng Việt */}
      {entered && rows.length === 1 && (
        <p className="text-xl text-slate-800 mb-3">
          Bạn đã nhập: <b>{entered.fullName}</b> — {isoToVn(entered.dob)}
        </p>
      )}
      <p className="text-lg text-slate-500 mb-2">Hồ sơ trên HIS đang gắn CCCD này:</p>
      <ul className="space-y-1">
        {rows.map((p) => (
          <li key={p.patientCode} className="text-xl text-slate-800">
            • <b>{p.patientCode}</b> — {p.fullName}
            {p.dob ? ` — ${formatHisDob(p.dob)}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Chỉ cho sửa lại khi hồ sơ HIS là DUY NHẤT (lệch do gõ); trùng nhiều hồ sơ thì phải ra quầy. */
function canRetryCccd(notice: { details?: unknown } | null): boolean {
  const rows = (notice?.details as IdentityConflictDetails | null)?.hisPatients;
  return !!rows && rows.length === 1;
}

/** YYYY-MM-DD → DD/MM/YYYY. */
function isoToVn(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** HIS trả ngày sinh dạng số YYYYMMDDHHmmss — đổi sang DD/MM/YYYY cho NVYT đọc. */
function formatHisDob(dob: string): string {
  const s = String(dob);
  if (s.length < 8) return s;
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

/** KIOSK_AR_ALREADY_REGISTERED_TODAY trả kèm lượt đăng ký cũ — hiện ra để NVYT giải thích ngay. */
function AlreadyRegisteredHint({ details }: { details?: unknown }) {
  const d = details as AlreadyRegisteredDetails | null;
  if (!d?.treatmentCode && !d?.roomName) return null;
  return (
    <div className="mt-2 text-lg text-slate-600">
      Lượt đã đăng ký: <b>{d.treatmentCode ?? "—"}</b>
      {d.roomName ? ` — ${d.roomName}` : ""}
      {d.numOrder != null ? ` — STT ${d.numOrder}` : ""}
    </div>
  );
}
