"use client";

// Bước 3 — soát và xác nhận thông tin hành chính (20 trường, mục 7.2).
//
// Hai điểm bắt buộc theo tài liệu:
//   • 4 trường khoá từ lookup (CCCD, họ, tên, ngày sinh) chỉ hiển thị, gửi lại nguyên giá trị.
//   • Lỗi trả về theo TỪNG Ô cùng một lần → tô đỏ đúng ô, không chỉ hiện một câu chung.
//
// Bố cục chia nhóm và mọi ô chữ đều mở bàn phím ảo: máy ở sảnh không có bàn phím vật lý,
// còn 20 ô xếp thành một dải dọc thì NVYT không soát nổi trước mặt bệnh nhân.

import { useCallback, useEffect, useMemo, useState } from "react";
import SearchableSelect from "@/components/ui/SearchableSelect";
import TouchField, { FieldShell } from "@/components/assisted/TouchField";
import {
  ActionBar, Card, GhostButton, PageHead, PrimaryButton, Section, StepBar,
} from "@/components/assisted/FlowShell";
import { FIELD_ERROR_LABEL } from "@/constants/assisted-reception-errors";
import {
  catalogAllCareers, catalogAllCommunes, catalogAllEthnics, catalogAllNationals, catalogAllProvinces,
} from "@/services/assisted-reception.service";
import type {
  PatientFieldError, PatientInfoField, PatientInfoSources, ReceptionPatientInfo,
} from "@/types/assisted-reception";

type CatalogRow = Record<string, unknown>;

/** Danh mục về từ nhiều nguồn (entity camelCase hoặc SDA UPPER_SNAKE) → lấy mã/tên tolerant. */
export function rowCode(row: CatalogRow): string {
  for (const k of Object.keys(row)) {
    if (/code$/i.test(k) || /_CODE$/.test(k)) {
      const v = row[k];
      if (typeof v === "string" && v) return v;
    }
  }
  return String(row.code ?? row.id ?? "");
}

export function rowName(row: CatalogRow): string {
  for (const k of Object.keys(row)) {
    if (/name$/i.test(k) || /_NAME$/.test(k)) {
      const v = row[k];
      if (typeof v === "string" && v) return v;
    }
  }
  return String(row.name ?? rowCode(row));
}

/** YYYY-MM-DD → DD/MM/YYYY cho dễ đọc. */
function vnDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || "—";
}

interface Props {
  info: ReceptionPatientInfo;
  sources: PatientInfoSources;
  /** Lỗi theo ô từ lần xác nhận gần nhất. */
  fieldErrors: PatientFieldError[];
  /** Tuổi < ngưỡng → bắt buộc thêm người thân (mặc định 6, mục 7.2). */
  relativeRequiredUnderAge?: number;
  /**
   * Gợi ý điền sẵn cho các ô backend để trống — lấy từ tài khoản VNyTe / thẻ CCCD ở
   * bước đăng nhập. CHỈ điền vào ô đang rỗng, không bao giờ đè dữ liệu HIS trả về.
   */
  suggest?: Partial<ReceptionPatientInfo>;
  saving?: boolean;
  onConfirm: (info: ReceptionPatientInfo) => void;
  onCancel: () => void;
}

/** Lấp các ô backend để trống bằng gợi ý; ô nào HIS/CCCD đã có thì giữ nguyên. */
function withSuggest(
  info: ReceptionPatientInfo,
  suggest?: Partial<ReceptionPatientInfo>,
): ReceptionPatientInfo {
  if (!suggest) return info;
  const out = { ...info };
  for (const [k, v] of Object.entries(suggest) as Array<[keyof ReceptionPatientInfo, unknown]>) {
    if (v == null || v === "") continue;
    if (out[k] == null || out[k] === "") (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export default function PatientInfoPanel({
  info, sources, fieldErrors, relativeRequiredUnderAge = 6, saving, suggest, onConfirm, onCancel,
}: Props) {
  const [form, setForm] = useState<ReceptionPatientInfo>(() => withSuggest(info, suggest));
  const [provinces, setProvinces] = useState<CatalogRow[]>([]);
  const [communes, setCommunes] = useState<CatalogRow[]>([]);
  const [ethnics, setEthnics] = useState<CatalogRow[]>([]);
  const [nationals, setNationals] = useState<CatalogRow[]>([]);
  const [careers, setCareers] = useState<CatalogRow[]>([]);
  const [loadingCommunes, setLoadingCommunes] = useState(false);

  // `info` đổi khi tra thẻ BHYT điền thêm ô (nguồn INSURANCE_CARD) — gợi ý vẫn chỉ lấp
  // chỗ trống, không đè thứ backend vừa trả về.
  useEffect(() => setForm(withSuggest(info, suggest)), [info, suggest]);

  // Tải TRỌN danh mục (service tự lật trang + nhớ theo phiên): quốc tịch 252 dòng,
  // nghề nghiệp 785 — lấy mỗi trang đầu 100 thì thiếu đúng những mục hay dùng nhất
  // (vd "Việt Nam" không nằm trong 100 quốc tịch đầu).
  useEffect(() => {
    catalogAllProvinces().then(setProvinces).catch(() => setProvinces([]));
    catalogAllEthnics().then(setEthnics).catch(() => setEthnics([]));
    catalogAllNationals().then(setNationals).catch(() => setNationals([]));
    catalogAllCareers().then(setCareers).catch(() => setCareers([]));
  }, []);

  // Xã/phường phụ thuộc tỉnh: đổi tỉnh phải tải lại, nếu không sẽ dính lỗi NOT_IN_PROVINCE.
  const loadCommunes = useCallback((provinceCode: string | null) => {
    if (!provinceCode) { setCommunes([]); return; }
    setLoadingCommunes(true);
    catalogAllCommunes(provinceCode)
      .then(setCommunes)
      .catch(() => setCommunes([]))
      .finally(() => setLoadingCommunes(false));
  }, []);

  useEffect(() => { loadCommunes(form.provinceCode); }, [form.provinceCode, loadCommunes]);

  const errorOf = useMemo(() => {
    const map = new Map<PatientInfoField, string>();
    for (const e of fieldErrors) map.set(e.field, FIELD_ERROR_LABEL[e.code] ?? e.code);
    return map;
  }, [fieldErrors]);

  const age = useMemo(() => {
    if (!form.dob) return null;
    const born = new Date(form.dob);
    if (Number.isNaN(born.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - born.getFullYear();
    const m = now.getMonth() - born.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < born.getDate())) a -= 1;
    return a;
  }, [form.dob]);

  const relativeRequired = age !== null && age < relativeRequiredUnderAge;

  const set = <K extends PatientInfoField>(key: K, value: ReceptionPatientInfo[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const pick = (rows: CatalogRow[], code: string | null) =>
    rows.find((r) => rowCode(r) === code) ?? null;

  /** Ô bắt buộc còn trống — nói trước còn thiếu gì, thay vì bấm xong mới nhận lỗi từ server. */
  const missing = useMemo(() => {
    const req: Array<[PatientInfoField, string]> = [
      ["genderId", "Giới tính"], ["ethnicCode", "Dân tộc"], ["nationalCode", "Quốc tịch"],
      ["careerCode", "Nghề nghiệp"], ["provinceCode", "Tỉnh/Thành phố"], ["communeCode", "Xã/Phường"],
    ];
    if (relativeRequired) req.push(["relativeType", "Quan hệ người thân"], ["relativeName", "Tên người thân"]);
    return req.filter(([k]) => form[k] == null || form[k] === "").map(([, label]) => label);
  }, [form, relativeRequired]);

  const identityError =
    errorOf.get("identityNumber") || errorOf.get("lastName") || errorOf.get("firstName") || errorOf.get("dob");

  return (
    <div className="max-w-5xl mx-auto w-full">
      <StepBar current={2} />
      <PageHead
        title="Thông tin hành chính"
        subtitle="Soát lại trước khi gửi HIS — ô gắn nhãn “Mặc định” cần kiểm kỹ"
      />

      <Card className="space-y-7">
        {fieldErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <p className="text-xl text-red-700 font-medium">
              Còn {fieldErrors.length} ô chưa hợp lệ — xem các ô viền đỏ bên dưới.
            </p>
          </div>
        )}

        {/* Bốn trường khoá từ CCCD gom thành thẻ tóm tắt, tách khỏi vùng nhập để NVYT
            không mất công thử sửa thứ mà backend sẽ từ chối. */}
        <div className="bg-slate-50 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-base text-slate-400 mb-1">Bệnh nhân — lấy từ CCCD, không sửa được</div>
              <div className="text-3xl font-bold text-slate-800">
                {`${form.lastName} ${form.firstName}`.trim() || "—"}
              </div>
              <div className="text-xl text-slate-500 mt-1">
                {vnDate(form.dob)}
                {age != null && <span className="text-slate-400"> · {age} tuổi</span>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-base text-slate-400 mb-1">Số CCCD</div>
              <div className="text-2xl font-semibold tracking-wide text-slate-700">{form.identityNumber}</div>
            </div>
          </div>
          {identityError && (
            <p className="text-lg text-red-600 mt-3">
              Thông tin định danh không khớp phiếu — đọc lại CCCD để tạo phiếu mới.
            </p>
          )}
        </div>

        <Section title="Nhân khẩu">
          <div className="grid grid-cols-2 gap-5">
            <FieldShell label="Giới tính" required source={sources.genderId} error={errorOf.get("genderId")}>
              <div className="flex gap-2">
                {[{ id: 2, t: "Nam" }, { id: 1, t: "Nữ" }, { id: 3, t: "Khác" }].map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => set("genderId", g.id)}
                    className={`flex-1 min-h-[64px] rounded-2xl text-2xl border-2 transition ${
                      form.genderId === g.id
                        ? "bg-blue-700 text-white border-blue-700"
                        : "border-slate-200 text-slate-600 hover:border-blue-300"
                    }`}
                  >
                    {g.t}
                  </button>
                ))}
              </div>
            </FieldShell>

            <TouchField
              label="Số điện thoại"
              mode="number"
              maxLength={10}
              value={form.phone ?? ""}
              onChange={(v) => set("phone", v || null)}
              placeholder="0xxxxxxxxx"
              source={sources.phone}
              error={errorOf.get("phone")}
              hint="10 số, bắt đầu bằng 0"
            />

            <FieldShell label="Dân tộc" required source={sources.ethnicCode} error={errorOf.get("ethnicCode")}>
              <SearchableSelect touchSize
                label="" placeholder="Chọn dân tộc" items={ethnics}
                value={pick(ethnics, form.ethnicCode)}
                getKey={rowCode} getLabel={rowName}
                onChange={(r) => set("ethnicCode", r ? rowCode(r) : null)}
              />
            </FieldShell>

            <FieldShell label="Quốc tịch" required source={sources.nationalCode} error={errorOf.get("nationalCode")}>
              <SearchableSelect touchSize
                label="" placeholder="Chọn quốc tịch" items={nationals}
                value={pick(nationals, form.nationalCode)}
                getKey={rowCode} getLabel={rowName}
                onChange={(r) => set("nationalCode", r ? rowCode(r) : null)}
              />
            </FieldShell>

            <FieldShell
              label="Nghề nghiệp" required source={sources.careerCode} error={errorOf.get("careerCode")}
              className="col-span-2"
            >
              <SearchableSelect touchSize
                label="" placeholder="Chọn nghề nghiệp" items={careers}
                value={pick(careers, form.careerCode)}
                getKey={rowCode} getLabel={rowName}
                onChange={(r) => set("careerCode", r ? rowCode(r) : null)}
              />
            </FieldShell>
          </div>
        </Section>

        <Section title="Địa chỉ">
          <div className="grid grid-cols-2 gap-5">
            <FieldShell label="Tỉnh/Thành phố" required source={sources.provinceCode} error={errorOf.get("provinceCode")}>
              <SearchableSelect touchSize
                label="" placeholder="Chọn tỉnh/thành" items={provinces}
                value={pick(provinces, form.provinceCode)}
                getKey={rowCode} getLabel={rowName}
                onChange={(r) => {
                  // Đổi tỉnh thì bỏ xã cũ — giữ lại sẽ gửi đi cặp mã không khớp.
                  setForm((f) => ({ ...f, provinceCode: r ? rowCode(r) : null, communeCode: null }));
                }}
              />
            </FieldShell>

            <FieldShell label="Xã/Phường" required source={sources.communeCode} error={errorOf.get("communeCode")}>
              <SearchableSelect touchSize
                label="" placeholder={form.provinceCode ? "Chọn xã/phường" : "Chọn tỉnh trước"}
                items={communes} loading={loadingCommunes} disabled={!form.provinceCode}
                value={pick(communes, form.communeCode)}
                getKey={rowCode} getLabel={rowName}
                onChange={(r) => set("communeCode", r ? rowCode(r) : null)}
              />
            </FieldShell>

            <TouchField
              label="Địa chỉ chi tiết" vietnamese
              className="col-span-2"
              value={form.address ?? ""}
              onChange={(v) => set("address", v || null)}
              placeholder="Số nhà, đường, thôn/xóm"
              source={sources.address}
              error={errorOf.get("address")}
            />
          </div>
        </Section>

        <Section title="Thông tin thêm" note="không bắt buộc">
          <div className="grid grid-cols-2 gap-5">
            <TouchField
              label="Nơi làm việc" vietnamese
              value={form.workPlace ?? ""}
              onChange={(v) => set("workPlace", v || null)}
              source={sources.workPlace}
              error={errorOf.get("workPlace")}
            />
            <TouchField
              label="Nơi cấp CCCD" vietnamese
              value={form.issuePlace ?? ""}
              onChange={(v) => set("issuePlace", v || null)}
              source={sources.issuePlace}
              error={errorOf.get("issuePlace")}
            />
          </div>
        </Section>

        <Section
          title="Người thân"
          note={relativeRequired ? `bắt buộc — bệnh nhân dưới ${relativeRequiredUnderAge} tuổi` : "không bắt buộc"}
        >
          <div className="grid grid-cols-2 gap-5">
            <TouchField
              label="Quan hệ" vietnamese required={relativeRequired}
              value={form.relativeType ?? ""}
              onChange={(v) => set("relativeType", v || null)}
              placeholder="Bố / Mẹ / Người giám hộ"
              source={sources.relativeType}
              error={errorOf.get("relativeType")}
            />
            <TouchField
              label="Họ tên người thân" vietnamese required={relativeRequired}
              value={form.relativeName ?? ""}
              onChange={(v) => set("relativeName", v || null)}
              source={sources.relativeName}
              error={errorOf.get("relativeName")}
            />
            <TouchField
              label="CCCD người thân" mode="number" maxLength={12}
              value={form.relativeIdentityNumber ?? ""}
              onChange={(v) => set("relativeIdentityNumber", v || null)}
              source={sources.relativeIdentityNumber}
              error={errorOf.get("relativeIdentityNumber")}
            />
            <TouchField
              label="Điện thoại người thân" mode="number" maxLength={10}
              value={form.relativePhone ?? ""}
              onChange={(v) => set("relativePhone", v || null)}
              source={sources.relativePhone}
              error={errorOf.get("relativePhone")}
            />
            <TouchField
              label="Địa chỉ người thân" vietnamese className="col-span-2"
              value={form.relativeAddress ?? ""}
              onChange={(v) => set("relativeAddress", v || null)}
              source={sources.relativeAddress}
              error={errorOf.get("relativeAddress")}
            />
          </div>
        </Section>

        <ActionBar>
          <GhostButton onClick={onCancel} className="flex-1">Huỷ phiếu</GhostButton>
          <div className="flex-[2] flex flex-col">
            <PrimaryButton onClick={() => onConfirm(form)} disabled={saving || missing.length > 0}>
              {saving ? "Đang lưu..." : "Xác nhận thông tin"}
            </PrimaryButton>
            {missing.length > 0 && (
              <p className="text-base text-amber-700 mt-1.5 text-center">Còn thiếu: {missing.join(", ")}</p>
            )}
          </div>
        </ActionBar>
      </Card>
    </div>
  );
}
