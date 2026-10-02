"use client";

// Bước 5 — chọn phòng khám và công khám (mục 7.5, 7.6).
//
// `patientTypeId` là tham số BẮT BUỘC của cả rooms lẫn services: danh sách khác nhau
// theo đối tượng, nên đổi đối tượng là phải tải lại cả hai (mục 9) — ở đây làm bằng
// cách cho patientTypeId vào dependency của effect, không cache theo receptionId.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArError, listRooms, listServices } from "@/services/assisted-reception.service";
import { getArError } from "@/constants/assisted-reception-errors";
import TouchField from "@/components/assisted/TouchField";
import {
  ActionBar, Card, GhostButton, PageHead, PrimaryButton, StepBar,
} from "@/components/assisted/FlowShell";
import type { ReceptionRoom, ReceptionService } from "@/types/assisted-reception";

const SYMPTOM_MAX = 300; // cột HIS 1000 byte, tiếng Việt tới 3 byte/ký tự

interface Props {
  receptionId: string;
  patientTypeId: number;
  registering?: boolean;
  onRegister: (roomId: number, serviceId: number, symptom: string | null) => void;
  onBack: () => void;
}

export default function RoomServicePanel({
  receptionId, patientTypeId, registering, onRegister, onBack,
}: Props) {
  const [rooms, setRooms] = useState<ReceptionRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [search, setSearch] = useState("");
  const [room, setRoom] = useState<ReceptionRoom | null>(null);

  const [services, setServices] = useState<ReceptionService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [service, setService] = useState<ReceptionService | null>(null);

  const [symptom, setSymptom] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    setLoadingRooms(true);
    setError(null);
    try {
      setRooms(await listRooms(receptionId, patientTypeId));
    } catch (e) {
      setError(getArError((e as ArError).code).message);
      setRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  }, [receptionId, patientTypeId]);

  // Đổi đối tượng → bỏ hẳn lựa chọn cũ rồi tải lại từ đầu.
  useEffect(() => {
    setRoom(null);
    setService(null);
    setServices([]);
    loadRooms();
  }, [loadRooms]);

  // Lọc tại chỗ: danh sách phòng của một cơ sở chỉ vài chục dòng, gọi lại server theo
  // từng phím chỉ làm màn giật mà không thêm kết quả nào.
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) =>
      `${r.roomName} ${r.roomCode} ${r.address ?? ""}`.toLowerCase().includes(q));
  }, [rooms, search]);

  const pickRoom = async (r: ReceptionRoom) => {
    setRoom(r);
    setService(null);
    setLoadingServices(true);
    setError(null);
    try {
      const res = await listServices(receptionId, r.roomId, patientTypeId);
      setServices(res.items);
      // Phòng chỉ có đúng một công khám hợp lệ → chọn sẵn, NVYT khỏi bấm thêm một nhịp.
      if (res.autoSelect && res.items.length === 1) setService(res.items[0]);
    } catch (e) {
      setError(getArError((e as ArError).code).message);
      setServices([]);
    } finally {
      setLoadingServices(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full">
      <StepBar current={4} />
      <PageHead title="Chọn phòng khám" subtitle="Danh sách theo đối tượng đã chọn, cùng cơ sở với máy kiosk" />

      <Card className="space-y-5">
        <div className="flex gap-3">
          <TouchField
            label="Tìm phòng khám"
            className="flex-1"
            value={search}
            onChange={setSearch}
            placeholder="Tên phòng hoặc vị trí"
          />
          {search && (
            <GhostButton onClick={() => setSearch("")} className="self-end mb-0.5">Xoá tìm</GhostButton>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-xl">{error}</div>
        )}

        {loadingRooms ? (
          <p className="text-2xl text-slate-400 text-center py-10">Đang tải danh sách phòng…</p>
        ) : rooms.length === 0 ? (
          // Danh sách rỗng gần như luôn là do HIS chưa cấu hình công khám cho đối tượng
          // này, không phải hết phòng: backend chỉ trả phòng có ít nhất một công khám
          // hợp lệ. Nói thẳng ra để NVYT đổi đối tượng chứ đừng ngồi tìm hay bấm lại.
          <div className="text-center py-10 space-y-4">
            <p className="text-2xl text-slate-500">
              Đối tượng đã chọn chưa có phòng khám nào nhận tại cơ sở này.
            </p>
            <p className="text-xl text-slate-400">
              Thường do công khám của đối tượng chưa được cấu hình trên HIS. Chọn đối tượng khác,
              hoặc hướng dẫn bệnh nhân ra quầy tiếp đón.
            </p>
            <PrimaryButton onClick={onBack}>Chọn đối tượng khác</PrimaryButton>
          </div>
        ) : shown.length === 0 ? (
          <p className="text-2xl text-slate-400 text-center py-10">Không có phòng nào khớp từ khoá.</p>
        ) : (
          <>
            <p className="text-base text-slate-400">{shown.length} phòng</p>
            <div className="grid grid-cols-2 gap-3 max-h-[46vh] overflow-y-auto pr-1">
              {shown.map((r) => {
                const active = room?.roomId === r.roomId;
                return (
                  <button
                    key={r.roomId}
                    type="button"
                    onClick={() => pickRoom(r)}
                    className={`text-left p-4 rounded-2xl border-2 transition ${
                      active ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-blue-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-2xl font-semibold text-slate-800 leading-snug">{r.roomName}</div>
                      {active && <span className="text-blue-600 text-2xl leading-none">✓</span>}
                    </div>
                    <div className="text-lg text-slate-500">{r.address ?? ""}</div>
                    <div className={`text-lg mt-1 ${r.waitingCount > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                      {r.waitingCount > 0 ? `${r.waitingCount} người đang chờ` : "Không phải chờ"}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {room && (
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h3 className="text-2xl font-semibold text-slate-700">Công khám tại {room.roomName}</h3>
            {loadingServices ? (
              <p className="text-xl text-slate-400">Đang tải công khám…</p>
            ) : services.length === 0 ? (
              <p className="text-xl text-amber-700">
                Phòng này chưa có công khám hợp lệ cho đối tượng đã chọn — chọn phòng khác.
              </p>
            ) : (
              <div className="space-y-2">
                {services.map((s) => {
                  const active = service?.serviceId === s.serviceId;
                  return (
                    <button
                      key={s.serviceId}
                      type="button"
                      onClick={() => setService(s)}
                      className={`w-full text-left p-4 rounded-2xl border-2 flex items-center justify-between gap-3 transition ${
                        active ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-blue-300"
                      }`}
                    >
                      <span className="text-xl text-slate-800">{s.serviceName}</span>
                      <span className="text-xl font-semibold text-slate-700 whitespace-nowrap">
                        {s.price?.toLocaleString("vi-VN")} đ
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <TouchField
          label="Lý do khám"
          value={symptom}
          onChange={(v) => setSymptom(v.slice(0, SYMPTOM_MAX))}
          placeholder="VD: Đau đầu, chóng mặt"
          hint={`${symptom.length}/${SYMPTOM_MAX} ký tự — không bắt buộc`}
        />

        <ActionBar>
          <GhostButton onClick={onBack} className="flex-1">Quay lại</GhostButton>
          <div className="flex-[2] flex flex-col">
            <PrimaryButton
              onClick={() => room && service && onRegister(room.roomId, service.serviceId, symptom.trim() || null)}
              disabled={!room || !service || registering}
            >
              {registering ? "Đang gửi sang HIS…" : "Đăng ký khám"}
            </PrimaryButton>
            <p className="text-base text-slate-400 mt-1.5 text-center">
              {room && service
                ? `${room.roomName} · ${service.serviceName}`
                : !room ? "Chọn phòng khám" : "Chọn công khám"}
            </p>
          </div>
        </ActionBar>
      </Card>
    </div>
  );
}
