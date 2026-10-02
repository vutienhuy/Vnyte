"use client";

// Bước 4 — chỉ chạy với ĐỐI TƯỢNG BHYT (mục 7.3 + mục 8).
//
//   tra thẻ BHYT → chọn Mã BHYT → lấy giấy tờ kèm theo yêu cầu của mã:
//     requires = REFERRAL   → điền sẵn từ `catalog/last-transfer-in`
//     requires = FOLLOW_UP  → NVYT chọn hồ sơ ở `catalog/follow-ups` (invalidReason = null),
//                             lấy giấy chuyển tuyến tiền điền, gửi followUpTreatmentCode + referralData
//     requires = NONE       → không giấy tờ
//
// Hai lỗi phải hiển thị KHÁC NHAU: 503 (cổng BHXH lỗi — cho thử lại) và 422 (kết luận
// về thẻ). Gộp chung sẽ báo oan "thẻ hỏng" khi chỉ là mạng BHXH chập chờn.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArError, catalogFollowUpReferral, catalogFollowUps, catalogHeinPatientTypes,
  catalogLastTransferIn, insuranceCheck,
} from "@/services/assisted-reception.service";
import { getArError } from "@/constants/assisted-reception-errors";
import {
  ActionBar, Card, GhostButton, PageHead, PrimaryButton, StepBar,
} from "@/components/assisted/FlowShell";
import type {
  FollowUpOption, HeinPatientTypeRule, InsuranceCheckResult, PatientInfoView, ReferralData,
} from "@/types/assisted-reception";

/** Phiếu đã tra thẻ trong phiên chạy này — xem ghi chú ở chỗ dùng bên dưới. */
const checkedReceptions = new Set<string>();

export interface InsuranceSelection {
  heinPatientTypeCode: string;
  referralData: ReferralData | null;
  followUpTreatmentCode: string | null;
}

interface Props {
  receptionId: string;
  /** Làm mới form hành chính khi tra thẻ tự điền thêm ô (nguồn INSURANCE_CARD). */
  onPatientInfoRefreshed: (view: PatientInfoView) => void;
  onDone: (selection: InsuranceSelection) => void;
  onBack: () => void;
  /** Cho NVYT bỏ BHYT chuyển sang đối tượng khác khi thẻ không dùng được. */
  onSwitchPatientType: () => void;
}

export default function InsurancePanel({
  receptionId, onPatientInfoRefreshed, onDone, onBack, onSwitchPatientType,
}: Props) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<InsuranceCheckResult | null>(null);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);

  const [heinCode, setHeinCode] = useState<string | null>(null);
  const [referral, setReferral] = useState<ReferralData | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [followUps, setFollowUps] = useState<FollowUpOption[] | null>(null);
  const [followUpCode, setFollowUpCode] = useState<string | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  /** Ghi chú khi không lấy được giấy chuyển tuyến tiền điền — không chặn luồng. */
  const [followUpNote, setFollowUpNote] = useState<string | null>(null);
  /**
   * Diễn giải Mã BHYT chỉ có ở `catalog/hein-patient-types`; `insurance-check` trả về
   * luật duyệt (code/rightRouteCode/requires) KHÔNG kèm mô tả. Không ghép hai nguồn thì
   * NVYT phải chọn giữa "1.1" và "1.6" mà không có chữ nào để phân biệt.
   */
  const [descByCode, setDescByCode] = useState<Record<string, string>>({});
  /**
   * Mã BHYT đơn vị THỰC SỰ đang dùng — `null` = chưa biết, không lọc gì cả.
   *
   * Hai endpoint trả hai danh sách khác nhau, đo trên prod ngày 29/09:
   *   `insurance-check`            → 9 mã ở CẢ hai viện (chỉ đọc bảng luật trong
   *                                  INSURANCE_APPOINTMENT_CONFIG)
   *   `catalog/hein-patient-types` → bảng luật ∩ HIS_HEIN_PATIENT_TYPE đang hoạt động:
   *                                  79019 còn 4 mã, 01816 còn 6 mã
   *
   * Chỉ cái thứ hai phản ánh việc đơn vị khoá/mở mã bên HIS. Không lọc thì mã đã khoá
   * (vd 1.17 ở BV Nguyễn Thị Thập) vẫn hiện ra cho NVYT chọn, chọn xong HIS mới từ chối.
   * Chính backend định nghĩa catalog là "đang hoạt động ∩ bảng luật" nên lấy nó làm chuẩn.
   */
  const [allowedCodes, setAllowedCodes] = useState<Set<string> | null>(null);
  useEffect(() => {
    catalogHeinPatientTypes()
      .then((rows) => {
        const map: Record<string, string> = {};
        for (const r of rows) if (r.description) map[r.code] = r.description;
        setDescByCode(map);
        // Danh mục rỗng (HIS lỗi, đơn vị chưa cấu hình) → KHÔNG lọc, thà hiện thừa còn
        // hơn khoá sạch màn hình làm NVYT không tiếp đón được ai.
        setAllowedCodes(rows.length ? new Set(rows.map((r) => r.code)) : null);
      })
      .catch(() => { setDescByCode({}); setAllowedCodes(null); });
  }, []);

  // Giữ callback của cha trong ref: cha truyền hàm inline nên MỖI LẦN RENDER là một
  // hàm mới. Nếu để nó vào deps của useCallback/useEffect thì effect chạy lại sau mỗi
  // render → tra thẻ BHYT lặp vô hạn (đo được 236 lần gọi cổng BHXH trong một lần mở
  // màn hình), và mỗi vòng lại ghi đè Mã BHYT mà NVYT vừa chọn.
  const onRefreshRef = useRef(onPatientInfoRefreshed);
  useEffect(() => { onRefreshRef.current = onPatientInfoRefreshed; });

  const runCheck = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await insuranceCheck(receptionId);
      setResult(res);
      setHeinCode(res.suggestedHeinPatientTypeCode);
      if (res.patientInfo) onRefreshRef.current(res.patientInfo);
    } catch (e) {
      const err = e as ArError;
      const info = getArError(err.code);
      setError({
        message: info.preferServerMessage && err.message ? err.message : info.message,
        // 503 = hạ tầng cổng BHXH → cho thử lại; 422 = kết luận về thẻ → phải đổi đối tượng.
        retryable: err.code === "KIOSK_AR_INSURANCE_GATEWAY_UNAVAILABLE",
      });
    } finally {
      setChecking(false);
    }
  }, [receptionId]);

  // Tra thẻ ĐÚNG MỘT LẦN cho mỗi phiếu. Gọi lại chỉ khi NVYT tự bấm "Thử lại" —
  // đây là lệnh đi ra cổng BHXH bên ngoài, không phải dữ liệu rẻ tiền để refetch.
  // Cờ đặt ngoài component (không phải useRef): React StrictMode ở dev mount–unmount–mount
  // lại, ref theo instance sẽ reset và bắn lần hai.
  useEffect(() => {
    if (checkedReceptions.has(receptionId)) return;
    checkedReceptions.add(receptionId);
    runCheck();
  }, [receptionId, runCheck]);

  /** Danh sách bày ra cho NVYT: bỏ những mã đơn vị đã khoá bên HIS (xem allowedCodes). */
  const shownRules: HeinPatientTypeRule[] = (() => {
    const all = result?.heinPatientTypeRules ?? [];
    if (!allowedCodes) return all;
    const kept = all.filter((r) => allowedCodes.has(r.code));
    // Lọc xong mà trắng danh sách thì bảng luật và HIS đang lệch nhau hoàn toàn —
    // hiện lại nguyên bản còn hơn để NVYT không có gì để chọn.
    return kept.length ? kept : all;
  })();

  const rule: HeinPatientTypeRule | undefined =
    shownRules.find((r) => r.code === heinCode);

  // Danh mục về SAU khi tra thẻ (hai lệnh chạy song song): nếu mã đang chọn — kể cả mã
  // 1.1 do backend gợi ý — nằm ngoài danh sách hợp lệ thì bỏ chọn, đừng để NVYT bấm
  // "Tiếp tục" với một mã không còn hiện trên màn hình.
  useEffect(() => {
    if (heinCode && !shownRules.some((r) => r.code === heinCode)) setHeinCode(null);
  }, [heinCode, shownRules]);

  // Đổi Mã BHYT thì bỏ giấy tờ của mã cũ — gửi lẫn sẽ bị backend từ chối.
  const chooseHein = async (code: string) => {
    setHeinCode(code);
    setReferral(null);
    setFollowUpCode(null);
    setFollowUpNote(null);
    const picked = shownRules.find((r) => r.code === code);
    if (picked?.requires === "REFERRAL") {
      setReferralLoading(true);
      try {
        // v1.2: `last-transfer-in` trả kèm khối `referralData` dựng sẵn đúng hình — dùng
        // thẳng. `toReferralData` chỉ còn là đường lùi cho backend chưa lên bản 1.2.
        const row = await catalogLastTransferIn(receptionId);
        setReferral(row ? row.referralData ?? toReferralData(row) : null);
      } catch {
        setReferral(null);
      } finally {
        setReferralLoading(false);
      }
    }
    if (picked?.requires === "FOLLOW_UP") {
      setFollowUpLoading(true);
      try {
        setFollowUps(await catalogFollowUps(receptionId));
      } catch {
        setFollowUps([]);
      } finally {
        setFollowUpLoading(false);
      }
    }
  };

  /**
   * Chọn một hồ sơ hẹn khám lại (mã 1.5) → lấy luôn giấy chuyển tuyến tiền điền của hồ sơ
   * đó (v1.2 mục 8). Endpoint này xác minh lại mã ở server nên cũng là chỗ bắt sớm hồ sơ
   * không hợp lệ, trước khi NVYT đi tiếp tới bước chọn phòng.
   */
  const chooseFollowUp = async (treatmentCode: string) => {
    setFollowUpCode(treatmentCode);
    setReferral(null);
    setReferralLoading(true);
    try {
      const res = await catalogFollowUpReferral(receptionId, treatmentCode);
      setReferral(res?.referralData ?? null);
    } catch (e) {
      // Không chặn luồng: không lấy được form tiền điền thì cứ gửi mỗi
      // followUpTreatmentCode, backend tự dựng lại referralData từ hồ sơ cũ.
      const err = e as ArError;
      setReferral(null);
      setFollowUpNote(getArError(err.code).message);
    } finally {
      setReferralLoading(false);
    }
  };

  const ready =
    !!heinCode &&
    (rule?.requires !== "FOLLOW_UP" || !!followUpCode) &&
    (rule?.requires !== "REFERRAL" || !!referral);

  return (
    <div className="max-w-4xl mx-auto w-full">
      <StepBar current={3} />
      <PageHead title="Thẻ bảo hiểm y tế" subtitle="Tra thẻ và chọn Mã BHYT phù hợp" />

      <Card className="space-y-5">
        {checking && <p className="text-2xl text-slate-500 text-center py-6">Đang tra thẻ BHYT...</p>}

        {error && (
          <div className={`rounded-xl px-4 py-4 text-xl border ${
            error.retryable ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-red-50 border-red-200 text-red-700"
          }`}>
            <p className="mb-3">{error.message}</p>
            <div className="flex gap-3">
              {error.retryable ? (
                <button onClick={runCheck} className="px-5 py-2 rounded-xl bg-amber-500 text-white font-semibold">
                  Thử lại
                </button>
              ) : (
                <button onClick={onSwitchPatientType} className="px-5 py-2 rounded-xl bg-slate-700 text-white font-semibold">
                  Đổi sang đối tượng khác
                </button>
              )}
              <button onClick={onBack} className="px-5 py-2 rounded-xl border border-slate-300 text-slate-600">
                Quay lại
              </button>
            </div>
          </div>
        )}

        {result && (
          <>
            <div className="grid grid-cols-2 gap-4 bg-slate-50 rounded-xl p-4">
              <Info label="Số thẻ" value={result.card.heinCardNumber} />
              <Info label="Nơi ĐKBĐ" value={result.card.registeredOrgName ?? result.card.registeredOrgCode ?? "—"} />
              {/* validFrom/validTo là chuỗi DD/MM/YYYY — hiển thị nguyên, không parse */}
              <Info label="Giá trị từ" value={result.card.validFrom} />
              <Info label="Giá trị đến" value={result.card.validTo} />
              <Info label="Đủ 5 năm liên tục" value={result.card.fiveYearDate ?? "—"} />
              <Info label="Khu vực" value={result.card.areaCode ?? "—"} />
            </div>

            <div className={`rounded-xl px-4 py-3 text-xl ${
              result.routeStatus?.isCorrectRoute ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"
            }`}>
              {result.routeStatus?.isCorrectRoute ? "Đúng tuyến" : "Trái tuyến — NVYT chọn Mã BHYT phù hợp"}
            </div>

            <div>
              <h3 className="text-2xl font-semibold text-slate-700 mb-2">Mã BHYT</h3>
              <div className="grid grid-cols-2 gap-3">
                {shownRules.map((r) => (
                  <button
                    key={r.code}
                    onClick={() => chooseHein(r.code)}
                    className={`text-left p-4 rounded-xl border transition ${
                      heinCode === r.code ? "border-blue-600 bg-blue-50" : "border-slate-200"
                    }`}
                  >
                    <div className="text-2xl font-bold text-slate-800">
                      {r.code}
                      {result.suggestedHeinPatientTypeCode === r.code && (
                        <span className="ml-2 text-base font-normal text-green-600">gợi ý</span>
                      )}
                    </div>
                    <div className="text-lg text-slate-500">{r.description ?? descByCode[r.code] ?? ""}</div>
                    <div className="text-base text-slate-400 mt-1">{requiresLabel(r.requires)}</div>
                  </button>
                ))}
              </div>
            </div>

            {rule?.requires === "REFERRAL" && (
              <div className="border rounded-xl p-4">
                <h4 className="text-2xl font-semibold text-slate-700 mb-2">Giấy chuyển tuyến</h4>
                {referralLoading ? (
                  <p className="text-xl text-slate-500">Đang lấy lần chuyển tuyến gần nhất...</p>
                ) : referral ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Info label="Nơi chuyển đến" value={String(referral.referralDestinationName ?? referral.referralDestinationId ?? "—")} />
                    <Info label="Chẩn đoán" value={String(referral.mainDiagnosisName ?? referral.mainDiagnosisId ?? "—")} />
                    <Info label="Có giá trị từ" value={String(referral.validFrom ?? "—")} />
                    <Info label="Đến" value={String(referral.validOneYear ? "hết năm" : referral.validTo ?? "—")} />
                  </div>
                ) : (
                  <p className="text-xl text-amber-700">
                    Không tìm thấy giấy chuyển tuyến trên hệ thống. Vui lòng chọn mã khác hoặc hướng dẫn
                    bệnh nhân ra quầy để nhập giấy chuyển tuyến bản giấy.
                  </p>
                )}
              </div>
            )}

            {rule?.requires === "FOLLOW_UP" && (
              <div className="border rounded-xl p-4">
                <h4 className="text-2xl font-semibold text-slate-700 mb-2">Phiếu hẹn khám lại</h4>
                {followUpLoading ? (
                  <p className="text-xl text-slate-500">Đang lấy danh sách phiếu hẹn...</p>
                ) : followUps && followUps.length > 0 ? (
                  <div className="space-y-2">
                    {followUps.map((f) => {
                      // v1.2: danh sách trả CẢ hồ sơ không dùng được, kèm lý do — hiện mờ
                      // và nói rõ vì sao, để NVYT khỏi loay hoay với phiếu giấy trên tay.
                      const blocked = !!f.invalidReason;
                      return (
                        <button
                          key={f.treatmentCode}
                          disabled={blocked}
                          onClick={() => chooseFollowUp(f.treatmentCode)}
                          className={`w-full text-left p-4 rounded-xl border transition ${
                            blocked
                              ? "border-slate-200 bg-slate-50 text-slate-400"
                              : followUpCode === f.treatmentCode
                                ? "border-blue-600 bg-blue-50"
                                : "border-slate-200"
                          }`}
                        >
                          <div className="text-xl font-semibold">
                            Hẹn {f.appointmentDate ?? "—"}{f.appointmentTime ? ` ${f.appointmentTime}` : ""}
                          </div>
                          <div className="text-lg text-slate-500">
                            {f.examServiceName ?? ""}{f.appointmentDesc ? ` — ${f.appointmentDesc}` : ""}
                          </div>
                          <div className="text-base text-slate-400">
                            Khám ngày {f.inDate ?? "—"}
                            {f.examRoomName ? ` · ${f.examRoomName}` : ""}
                            {f.icdCode ? ` · ${f.icdCode}${f.icdName ? " " + f.icdName : ""}` : ""}
                          </div>
                          <div className="text-base text-slate-400">Mã hồ sơ: {f.treatmentCode}</div>
                          {blocked && (
                            <div className="text-base text-amber-700 mt-1">Không chọn được: {f.invalidReason}</div>
                          )}
                        </button>
                      );
                    })}
                    {referralLoading && (
                      <p className="text-lg text-slate-400">Đang lấy giấy chuyển tuyến của hồ sơ đã chọn…</p>
                    )}
                    {followUpNote && !referralLoading && (
                      <p className="text-lg text-amber-700">
                        {followUpNote} — vẫn đăng ký được, hệ thống tự dựng giấy chuyển tuyến từ hồ sơ cũ.
                      </p>
                    )}
                    {followUpCode && referral && isBlankReferral(referral) && (
                      <div className="bg-slate-50 rounded-xl p-4 mt-2">
                        <p className="text-lg text-slate-500">
                          Hồ sơ cũ không kèm giấy chuyển tuyến — chỉ gửi số hồ sơ{" "}
                          <span className="text-slate-700 font-medium">
                            {String(referral.referralNumber ?? followUpCode)}
                          </span>. Vẫn đăng ký được bình thường.
                        </p>
                      </div>
                    )}
                    {followUpCode && referral && !isBlankReferral(referral) && (
                      <div className="bg-slate-50 rounded-xl p-4 mt-2">
                        <p className="text-lg text-slate-500 mb-2">
                          Giấy chuyển tuyến kèm theo (tiền điền từ hồ sơ cũ, gửi cùng khi đăng ký)
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <Info label="Số giấy" value={String(referral.referralNumber ?? "—")} />
                          <Info label="Nơi chuyển đến" value={String(referral.referralDestinationName ?? referral.referralDestinationId ?? "—")} />
                          <Info label="Chẩn đoán" value={String(referral.mainDiagnosisName ?? referral.mainDiagnosisId ?? "—")} />
                          <Info label="Có giá trị đến" value={String(referral.validOneYear ? "hết năm" : referral.validTo ?? "—")} />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xl text-amber-700">
                    Không có phiếu hẹn khám lại trong khoảng ngày hẹn. Vui lòng chọn mã khác hoặc
                    hướng dẫn bệnh nhân ra quầy.
                  </p>
                )}
              </div>
            )}

            <ActionBar>
              <GhostButton onClick={onBack} className="flex-1">Quay lại</GhostButton>
              <div className="flex-[2] flex flex-col">
                <PrimaryButton
                  onClick={() => heinCode && onDone({
                    heinPatientTypeCode: heinCode,
                    // v1.2: cả 1.3 lẫn 1.5 đều gửi kèm giấy chuyển tuyến. Mã không cần
                    // giấy tờ (NONE) thì để null, gửi thừa chỉ tổ bị backend soi.
                    referralData: rule?.requires === "NONE" ? null : referral,
                    followUpTreatmentCode: rule?.requires === "FOLLOW_UP" ? followUpCode : null,
                  })}
                  disabled={!ready}
                >
                  Tiếp tục chọn phòng khám
                </PrimaryButton>
                {!ready && (
                  <p className="text-base text-amber-700 mt-1.5 text-center">
                    {!heinCode
                      ? "Chọn Mã BHYT"
                      : rule?.requires === "REFERRAL"
                        ? "Cần giấy chuyển tuyến"
                        : "Chọn phiếu hẹn khám lại"}
                  </p>
                )}
              </div>
            </ActionBar>
          </>
        )}
      </Card>
    </div>
  );
}

/**
 * Giấy tiền điền của mã 1.5 có thể về gần như rỗng — đo trên Hà Đông: hồ sơ cũ mà lần đó
 * bệnh nhân không đi theo giấy chuyển tuyến thì chỉ có `referralNumber`, còn nơi chuyển
 * đến / chẩn đoán / hạn đều null. Đổ nguyên vào bảng tóm tắt sẽ ra một loạt dấu "—" trông
 * như màn hình hỏng, nên tách riêng thành một câu giải thích.
 */
function isBlankReferral(r: ReferralData): boolean {
  return !r.referralDestinationId && !r.referralDestinationName && !r.mainDiagnosisId && !r.validFrom;
}

function requiresLabel(r: HeinPatientTypeRule["requires"]): string {
  if (r === "REFERRAL") return "Cần giấy chuyển tuyến";
  if (r === "FOLLOW_UP") return "Cần phiếu hẹn khám lại";
  return "Không cần giấy tờ kèm";
}

/** `catalog/last-transfer-in` trả bản ghi HIS → đổ sang đúng tên trường của ReferralData. */
export function toReferralData(row: Record<string, unknown>): ReferralData {
  return {
    validFrom: (row.timeFrom as string) ?? null,
    validTo: (row.timeTo as string) ?? null,
    validOneYear: row.validOneYear === 1 || row.validOneYear === true,
    referralDestinationId: (row.mediOrgCode as string) ?? null,
    referralDestinationName: (row.mediOrgName as string) ?? null,
    mainDiagnosisId: (row.icdCode as string) ?? null,
    mainDiagnosisName: (row.icdName as string) ?? null,
    secondaryDiagnosisText: (row.icdText as string) ?? null,
  };
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg text-slate-400">{label}</div>
      <div className="text-xl text-slate-800 font-medium">{value}</div>
    </div>
  );
}
