// Treatment (Hồ sơ điều trị) Types

export interface TreatmentRecord {
    id: number;
    branchCode: string;
    branchName: string;
    branchAddress: string;
    treatmentCode: string;
    patientName: string;
    patientCode: string;
    patientDob: number;
    patientGenderName: string;
    patientAddress: string;
    patientPhone: string;
    icdCode: string | null;
    icdName: string | null;
    icdSubCode: string | null;
    icdText: string | null;
    hospitalizationReason: string | null;
    serviceReqId: number;
    serviceReqCode: string;
    intructionTime: number;
    numOrder: number;
    requestLoginName: string;
    requestUsername: string;
    executeLoginName: string | null;
    executeUsername: string | null;
    executeRoomCode: string;
    executeRoomName: string;
    executeRoomAddress: string | null;
    requestRoomCode: string;
    requestRoomName: string;
    requestRoomAddress: string | null;
    sereServId: number;
    serviceCode: string;
    serviceName: string;
    amount: number;
    price: number;
}

export interface Pagination {
    total: number;
    page: number;
    limit: number;
    pageCount: number;
    hasNext: boolean;
    hasPrev: boolean;
}

export interface TreatmentListResponse {
    data: TreatmentRecord[];
    pagination: Pagination;
    status: number;
    message: string;
    now: string;
}

export interface TreatmentForPrintResponse {
    data: TreatmentRecord[];
    status: number;
    message: string;
    now: string;
}
