"use client";

// Bước 6 — phiếu in (mục 7.7/7.10). Backend chỉ trả DỮ LIỆU phiếu, app tự dựng layout in.

import { useState } from "react";
import { buildExamSlipHtml, type ExamSlip } from "@/lib/exam-slip";
import { Card, GhostButton, PrimaryButton, StepBar } from "@/components/assisted/FlowShell";
import { printHtml } from "@/lib/kiosk-print";
import type { ReceptionPatientInfo, ReceptionTicket } from "@/types/assisted-reception";

interface Props {
  ticket: ReceptionTicket;
  patientInfo: ReceptionPatientInfo | null;
  hospitalName?: string;
  onFinish: () => void;
}

/** ReceptionTicket không mang tên/năm sinh bệnh nhân → lấy từ phiếu hành chính đang giữ. */
export function slipFromReceptionTicket(
  t: ReceptionTicket,
  info: ReceptionPatientInfo | null,
  opts: { hospitalName?: string } = {},
): ExamSlip {
  const fullName = info ? `${info.lastName} ${info.firstName}`.trim() : "";
  return {
    hospitalName: opts.hospitalName,
    title: "Phiếu tiếp đón",
    printedAt: formatDateTime(t.registeredAt),
    code: t.treatmentCode ?? undefined,
    patientName: fullName,
    patientCode: t.patientCode ?? undefined,
    gender: info?.genderId === 1 ? "Nữ" : info?.genderId === 2 ? "Nam" : undefined,
    birthYear: info?.dob ? info.dob.slice(0, 4) : undefined,
    serviceName: t.serviceName ?? undefined,
    roomName: [t.roomName, t.roomAddress].filter(Boolean).join(" - ") || undefined,
    numOrder: t.numOrder ?? undefined,
  };
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function TicketPanel({ ticket, patientInfo, hospitalName, onFinish }: Props) {
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const doPrint = async () => {
    setPrinting(true);
    setPrintError(null);
    try {
      await printHtml(buildExamSlipHtml(slipFromReceptionTicket(ticket, patientInfo, { hospitalName })));
    } catch (e) {
      setPrintError((e as Error)?.message || "In thất bại");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto w-full">
      <StepBar current={5} />
      <div className="text-center mb-5">
        <div className="text-6xl mb-2">✅</div>
        <h2 className="text-4xl font-bold text-emerald-700">Đăng ký thành công</h2>
        <p className="text-xl text-slate-400 mt-1">Phát phiếu cho bệnh nhân và hướng dẫn tới phòng khám</p>
      </div>

      <Card className="space-y-4">
        <div className="text-center bg-blue-50 rounded-xl py-6">
          <div className="text-2xl text-slate-500">Số thứ tự</div>
          <div className="text-7xl font-bold text-blue-700">{ticket.numOrder ?? "—"}</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Info label="Mã điều trị" value={ticket.treatmentCode ?? "—"} />
          <Info label="Mã bệnh nhân" value={ticket.patientCode ?? "—"} />
          <Info label="Phòng khám" value={[ticket.roomName, ticket.roomAddress].filter(Boolean).join(" - ") || "—"} />
          <Info label="Công khám" value={ticket.serviceName ?? "—"} />
          <Info label="Đối tượng" value={ticket.patientTypeName ?? "—"} />
          <Info label="Mã BHYT" value={ticket.heinPatientTypeCode ?? "—"} />
          <Info label="NVYT tiếp đón" value={ticket.staffName ?? "—"} />
          <Info label="Thời điểm" value={formatDateTime(ticket.registeredAt)} />
        </div>

        {ticket.notices?.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            {ticket.notices.map((n, i) => (
              <p key={i} className="text-xl text-amber-800">• {n}</p>
            ))}
          </div>
        )}

        {printError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-xl">
            {printError}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <PrimaryButton onClick={doPrint} disabled={printing} className="flex-[2]">
            {printing ? "Đang in…" : "🖨  In phiếu"}
          </PrimaryButton>
          <GhostButton onClick={onFinish} className="flex-1">Tiếp bệnh nhân khác</GhostButton>
        </div>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg text-slate-400">{label}</div>
      <div className="text-xl text-slate-800 font-medium">{value}</div>
    </div>
  );
}
