import { getJson } from "./http-utils";
import { HOSPITAL_CODE } from "@/config/hospital";
import type { TreatmentListResponse, TreatmentForPrintResponse } from "../types/treatment";

/**
 * Lấy danh sách hồ sơ điều trị theo ID điều trị để in phiếu khám
 *
 * @param identityNumber - Số CMND/CCCD
 * @param page - Trang hiện tại
 * @param limit - Số bản ghi mỗi trang
 */
export async function getTreatmentRecords(
    identityNumber: string,
    page: number = 1,
    limit: number = 10
): Promise<TreatmentListResponse> {
    return getJson<TreatmentListResponse>(
        `/api/hospitals/${HOSPITAL_CODE}/his-rs/treatment-list-for-print`,
        {
            page,
            limit,
            identityNumber,
        },
        "Không thể tải danh sách hồ sơ điều trị"
    );
}

/**
 * Lấy chi tiết hồ sơ điều trị theo treatmentId để in phiếu khám
 *
 * @param treatmentId - ID điều trị
 */
export async function getTreatmentForPrint(
    treatmentId: string | number
): Promise<TreatmentForPrintResponse> {
    return getJson<TreatmentForPrintResponse>(
        `/api/hospitals/${HOSPITAL_CODE}/his-rs/treatment-for-print`,
        { treatmentId },
        "Không thể tải thông tin phiếu khám"
    );
}
