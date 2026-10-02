
import { getJson } from "./http-utils";
import { HOSPITAL_CODE } from "@/config/hospital";
import type { ApiResponse } from "../types/registration";
import type { AppointmentDetailModel } from "../types/appointment";

/**
 * Get list of appointments by identity number (via secure proxy)
 * baseUrl và apiKey được xử lý server-side, không truyền từ client
 *
 * @param identityNumber - Patient's identity number (CMND/CCCD)
 * @param page - Page number
 * @param limit - Items per page
 */
// Gateway: GET /api/hospitals/92000/appointment
export async function getAppointments(
    identityNumber: string,
    page: number = 1,
    limit: number = 10
): Promise<ApiResponse<AppointmentDetailModel[]>> {
    return getJson<ApiResponse<AppointmentDetailModel[]>>(
        `/api/hospitals/${HOSPITAL_CODE}/appointment`,
        {
            page,
            limit,
            identityNumber,
        },
        "Failed to fetch appointments"
    );
}
