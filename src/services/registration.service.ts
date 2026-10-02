// Registration API Service Layer
// Mọi request đi qua /api/gateway-proxy → Gateway. Xem GATEWAY_MIGRATION_PLAN.md.

import { getJson, postJson } from "./http-utils";
import { HOSPITAL_CODE } from "@/config/hospital";
import type {
    ApiResponse,
    Hospital,
    Patient,
    Branch,
    Specialty,
    Doctor,
    Clinic,
    PatientInfoModel,
    ServiceClinicForKiosk,
} from "../types/registration";

/**
 * Fetch list of hospitals by application
 *
 * Migrate sang Gateway mới (GET /api/hospitals) — xem GATEWAY_MIGRATION_PLAN.md mục Nhóm 1.
 * Response shape Gateway: { success: true, data: HospitalListResponse[] } —
 * shape mỗi item KHÁC type Hospital cũ (thiếu dkkHospitalCode/application/logoUrl/apiKey,
 * có thêm hisBranchCode/cerCaProfileName, đổi logoUrl → fssLogoUrl).
 * Component dùng `hospital.logoUrl` cần đổi sang `fssLogoUrl` hoặc viết adapter.
 */
export async function getHospitals(): Promise<ApiResponse<Hospital[]>> {
    return getJson<ApiResponse<Hospital[]>>(
        "/api/hospitals",
        undefined,
        "Failed to fetch hospitals"
    );
}

/**
 * Fetch patient list (account owner + relatives)
 * @param patientCode - Patient code of account owner
 */
// Migrate sang Gateway: GET /api/patients/me/family (JWT-auth, patientCode lấy từ JWT claims).
// Bỏ param patientCode (signature giữ cho backward compat). Xem GATEWAY_MIGRATION_PLAN.md Nhóm 1.
// Adapter: Gateway trả shape mới (dateOfBirth ISO, identityNumber, phoneNumber).
// UI cũ bind shape legacy (dob yyyyMMdd, idNumber, mobileNumber). Map về legacy để UI không phải sửa.
export async function getPatientList(_patientCode?: string): Promise<ApiResponse<Patient[]>> {
    const res = await getJson<ApiResponse<Record<string, unknown>[]>>(
        "/api/patients/me/family",
        undefined,
        "Failed to fetch patient list"
    );
    const data = (res.data ?? []).map(adaptGatewayPatient);
    return { ...res, data };
}

function adaptGatewayPatient(p: Record<string, unknown>): Patient {
    // dateOfBirth có thể là ISO "1997-02-12T00:00:00" hoặc "19970212" — chuyển về yyyyMMdd cho formatDOB.
    const dobRaw = (p.dateOfBirth as string | undefined) ?? (p.dob as string | undefined);
    let dob: string | undefined;
    if (dobRaw) {
        const iso = dobRaw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        dob = iso ? `${iso[1]}${iso[2]}${iso[3]}` : dobRaw.replace(/-/g, "").slice(0, 8);
    }
    return {
        patientCode: p.patientCode as string | undefined,
        fullName: p.fullName as string | undefined,
        firstName: p.firstName as string | undefined,
        lastName: p.lastName as string | undefined,
        dob,
        idNumber: (p.identityNumber as string | undefined) ?? (p.idNumber as string | undefined),
        identityNumber: p.identityNumber as string | undefined,
        mobileNumber: (p.phoneNumber as string | undefined) ?? (p.mobileNumber as string | undefined),
        phoneNumber: p.phoneNumber as string | undefined,
        genderId: typeof p.genderId === "string" ? Number(p.genderId) : (p.genderId as number | undefined),
        address: p.address as string | undefined,
        provinceCode: p.provinceCode as string | undefined,
        provinceName: p.provinceName as string | undefined,
        communeCode: p.communeCode as string | undefined,
        communeName: p.communeName as string | undefined,
        nationalCode: p.nationalCode as string | undefined,
        nationalName: p.nationalName as string | undefined,
        ethnicCode: p.ethnicCode as string | undefined,
        ethnicName: p.ethnicName as string | undefined,
        careerCode: p.careerCode as string | undefined,
        careerName: p.careerName as string | undefined,
    };
}

/**
 * Fetch branches của bệnh viện. Migrate sang Gateway: GET /api/hospitals/92000/appointment/branch.
 */
export async function getBranches(
    page: number = 1,
    limit: number = 100
): Promise<ApiResponse<Branch[]>> {
    return getJson<ApiResponse<Branch[]>>(
        `/api/hospitals/${HOSPITAL_CODE}/appointment/branch`,
        { page, limit },
        "Failed to fetch branches"
    );
}

/**
 * Fetch specialties with patient info — Gateway: POST /api/hospitals/92000/appointment/specialty
 */
export async function getSpecialties(
    patientInfo: PatientInfoModel
): Promise<ApiResponse<Specialty[]>> {
    return postJson<ApiResponse<Specialty[]>>(
        `/api/hospitals/${HOSPITAL_CODE}/appointment/specialty`,
        { patientInfo },
        "Failed to fetch specialties"
    );
}

/**
 * Fetch doctors with patient info — Gateway: POST /api/hospitals/92000/appointment/doctor
 */
export async function getDoctors(
    patientInfo: PatientInfoModel
): Promise<ApiResponse<Doctor[]>> {
    return postJson<ApiResponse<Doctor[]>>(
        `/api/hospitals/${HOSPITAL_CODE}/appointment/doctor`,
        { patientInfo },
        "Failed to fetch doctors"
    );
}

/**
 * Fetch clinics with patient info — Gateway: POST /api/hospitals/92000/appointment/clinic
 */
export async function getClinics(
    patientInfo: PatientInfoModel
): Promise<ApiResponse<Clinic[]>> {
    return postJson<ApiResponse<Clinic[]>>(
        `/api/hospitals/${HOSPITAL_CODE}/appointment/clinic`,
        { patientInfo },
        "Failed to fetch clinics"
    );
}

/**
 * Fetch available dates — Gateway: GET /api/hospitals/92000/appointment/slot-dates
 */
export async function getAvailableDates(
    specialtyId?: string,
    doctorId?: number,
    clinicId?: number,
    checkSpecialtyOrDoctor?: string
): Promise<ApiResponse<string[]>> {
    const params: Record<string, string | number> = {
        _checkSpecialtyOrDoctor: checkSpecialtyOrDoctor || "",
    };

    if (specialtyId) params.specialtyId = specialtyId;
    if (doctorId) params.doctorId = doctorId;
    if (clinicId) params.clinicId = clinicId;

    return getJson<ApiResponse<string[]>>(
        `/api/hospitals/${HOSPITAL_CODE}/appointment/slot-dates`,
        params,
        "Failed to fetch available dates"
    );
}

/**
 * Fetch appointment slots — Gateway: GET /api/hospitals/92000/appointment/slots
 */
export async function getAppointmentSlots(
    slotDate: string,
    specialtyId?: string,
    doctorId?: number,
    clinicId?: number,
    checkSpecialtyOrDoctor?: string
): Promise<ApiResponse<any[]>> {
    const params: Record<string, string | number> = {
        slotDate,
        _checkSpecialtyOrDoctor: checkSpecialtyOrDoctor || "",
    };

    if (specialtyId) params.specialtyId = specialtyId;
    if (doctorId) params.doctorId = doctorId;
    if (clinicId) params.clinicId = clinicId;

    return getJson<ApiResponse<any[]>>(
        `/api/hospitals/${HOSPITAL_CODE}/appointment/slots`,
        params,
        "Failed to fetch appointment slots"
    );
}

/**
 * Create appointment — Gateway: POST /api/hospitals/92000/appointment/create
 */
export async function createAppointment(
    appointmentSlotId: string,
    symptom: string,
    patientInfo: PatientInfoModel,
    branchId: string
): Promise<ApiResponse<any>> {
    return postJson<ApiResponse<any>>(
        `/api/hospitals/${HOSPITAL_CODE}/appointment/create`,
        {
            appointmentSlotId,
            symptom,
            patientInfo,
            branchId,
        },
        "Failed to create appointment"
    );
}

/**
 * Get specialty for Kiosk — Gateway: GET /api/hospitals/92000/appointment/specialty-kiosk (AllowAnonymous)
 */
export async function getSpecialtyForKiosk(): Promise<ApiResponse<Specialty[]>> {
    return getJson<ApiResponse<Specialty[]>>(
        `/api/hospitals/${HOSPITAL_CODE}/appointment/specialty-kiosk`,
        {},
        "Failed to fetch specialties"
    );
}

/**
 * Get clinic for kiosk — Gateway: GET /api/hospitals/92000/appointment/clinic-kiosk (AllowAnonymous)
 */
export async function getClinicForKiosk(
    specialtyId: string,
    page: number = 1,
    limit: number = 10,
): Promise<ApiResponse<Clinic[]>> {
    return getJson<ApiResponse<Clinic[]>>(
        `/api/hospitals/${HOSPITAL_CODE}/appointment/clinic-kiosk`,
        { page, limit, specialtyId },
        "Failed to fetch clinics"
    );
}

/**
 * Get service by clinic ID. Migrate sang Gateway: GET /api/hospitals/92000/his-rs/service-by-clinic.
 */
export async function getServiceByClinicId(
    clinicId: number,
    page: number = 1,
    limit: number = 10
): Promise<ApiResponse<ServiceClinicForKiosk[]>> {
    return getJson<ApiResponse<ServiceClinicForKiosk[]>>(
        `/api/hospitals/${HOSPITAL_CODE}/his-rs/service-by-clinic`,
        { clinicId, page, limit },
        "Failed to fetch services"
    );
}

/**
 * Create appointment direct (kiosk flow) — Gateway: POST /api/hospitals/92000/appointment/create-direct
 */
export async function createAppoinmentDirect(
    clinicId: number,
    serviceId: string,
    patientTypeId: number,
    patientInfo: PatientInfoModel,
    confirmCreate: boolean = true,
): Promise<ApiResponse<any>> {
    return postJson<ApiResponse<any>>(
        `/api/hospitals/${HOSPITAL_CODE}/appointment/create-direct`,
        {
            clinicId,
            serviceId,
            patientTypeId,
            patientInfo,
            confirmCreate,
        },
        "Failed to create appointment"
    );
}

/**
 * Get appointment detail — Gateway: GET /api/hospitals/92000/appointment
 */
export async function getAppointmentDetail(
    identityNumber: string,
    appointmentCode: string
): Promise<any | null> {
    try {
        const response = await getJson<ApiResponse<any[]>>(
            `/api/hospitals/${HOSPITAL_CODE}/appointment`,
            {
                page: 1,
                limit: 10,
                identityNumber,
            },
            "Failed to fetch appointment detail"
        );

        if (response.data && response.data.length > 0) {
            const appointment = response.data.find(
                (item) => item.appointmentCode === appointmentCode
            ) || response.data[0];

            return appointment;
        }

        return null;
    } catch (error) {
        console.error("Error loading appointment detail:", error);
        return null;
    }
}

/**
 * Delete/Cancel appointment by ID — Gateway: DELETE /api/hospitals/92000/appointment/{id}
 */
export async function deleteAppointment(
    appointmentId: string
): Promise<ApiResponse<any>> {
    const { deleteJson } = await import("./http-utils");

    return deleteJson<ApiResponse<any>>(
        `/api/hospitals/${HOSPITAL_CODE}/appointment/${appointmentId}`,
        "Failed to cancel appointment"
    );
}

/**
 * Get Type Patient In KIOSK — Gateway: GET /api/hospitals/92000/his-module/patient-types-for-kiosk
 */
export async function getTypePatientInKiosk(
    page: number = 1,
    limit: number = 10
): Promise<ApiResponse<any[]>> {
    return getJson<ApiResponse<any[]>>(
        `/api/hospitals/${HOSPITAL_CODE}/his-module/patient-types-for-kiosk`,
        { page, limit },
        "Failed to fetch type patient in kiosk"
    );
}

/**
 * Register HIS Treatment — Gateway: POST /api/hospitals/92000/appointment/register-his-treatment
 */
export async function registerHisTreatment(
    appointmentId: string,
    patientTypeId: number
): Promise<ApiResponse<any>> {
    return postJson<ApiResponse<any>>(
        `/api/hospitals/${HOSPITAL_CODE}/appointment/register-his-treatment`,
        {
            appointmentId,
            patientTypeId,
        },
        "Failed to register HIS treatment"
    );
}

/**
 * LocalStorage helpers for hospital data
 */
export const hospitalStorage = {
    save: (hospital: Hospital) => {
        if (typeof window !== "undefined") {
            localStorage.setItem("selectedHospital", JSON.stringify(hospital));
        }
    },
    get: (): Hospital | null => {
        if (typeof window !== "undefined") {
            const data = localStorage.getItem("selectedHospital");
            return data ? JSON.parse(data) : null;
        }
        return null;
    },
    clear: () => {
        if (typeof window !== "undefined") {
            localStorage.removeItem("selectedHospital");
        }
    },
};
