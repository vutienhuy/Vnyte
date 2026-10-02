// Types cho module kiosk-reception (tái khám).
// Nguồn: BMC — Kiosk Reception API v1.0 §4. Trong dự án này, các endpoint
// /kiosk-reception/* được gọi qua gateway-proxy dưới path
// /api/hospitals/{HOSPITAL_CODE}/kiosk-reception/* (xem reception.service.ts).

// Envelope HIS-style: { data, pagination, status, message, now }
export interface HisEnvelope<T> {
  data: T;
  pagination?: unknown;
  status: number;
  message?: string;
  now?: string;
}

// §4.1 / §4.2 — 01 lịch hẹn tái khám (FollowUpItemDto).
export interface FollowUpItem {
  previousTreatmentId: number;
  previousTreatmentCode: string;
  patientId: number;
  patientCode: string;
  patientName: string;
  appointmentCode: string | null;
  appointmentDate: string; // chuỗi "DD/MM/YYYY" — đã format sẵn
  appointmentTime: string; // "HH:mm"
  appointmentDesc: string | null;
  examServiceId: number;
  examServiceName: string;
  examRoomIds: string;
  previousPatientTypeId: number;
  previousPatientTypeName: string;
  hasBhytCard: number; // 1 nếu hồ sơ trước có thẻ BHYT, 0 nếu không
  isAlreadyAttended: boolean; // BN đã có hồ sơ khám trong hôm nay (cảnh báo trùng)
  isAlreadyUsed: boolean; // lịch hẹn đã dùng tạo hồ sơ qua kiosk → disable nút tạo
}

// §4.3 — kết quả tạo hồ sơ khám HIS (create-treatment-from-follow-up).
export interface CreatedTreatmentResult {
  patient: {
    code: string;
    name: string;
    dob: string; // "DD/MM/YYYY"
    genderName: string;
    address: string;
    phone: string;
    cccd: string;
  };
  treatment: {
    id: number;
    code: string;
    inTime: string; // "DD/MM/YYYY HH:mm"
    serviceReqCode: string;
    numOrder: number; // số thứ tự khám tại phòng
    examRoom: {
      code: string;
      name: string;
      address: string;
    };
    executeDepartmentName: string;
    requestRoomName: string;
  };
  service: {
    code: string;
    name: string;
    patientTypeName: string; // Yêu cầu / BHYT / Dịch vụ
    price: number; // tiền khám BN đóng (VND)
  };
  message?: string;
}
