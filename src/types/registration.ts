// Registration Types and Models

// Patient Type (KIOSK)
export interface PatientType {
    patientTypeId: number;
    patientTypeCode: string;
    patientTypeName: string;
    description: string;
}

// Generic API Response
export interface ApiResponse<T> {
    data: T;
    message?: string;
    success?: boolean;
}

// Hospital Models
export interface Application {
    applicationId: string;
    applicationCode: string;
    applicationName: string;
}

export interface Hospital {
    id: string;
    isActive: boolean;
    hospitalCode: string;
    hospitalName: string;
    dkkHospitalCode: string;
    application: Application[];
    address: string;
    logoUrl: string;
    baseUrl: string;
    apiKey: string;
    guaranteeAmount: string;
}

// Patient Models
export interface PatientInfoModel {
    firstName?: string;
    lastName?: string;
    dob?: string;
    identityNumber?: string;
    genderId?: number;
    nationalCode?: string;
    nationalName?: string;
    ethnicCode?: string;
    ethnicName?: string;
    provinceCode?: string;
    provinceName?: string;
    communeCode?: string;
    communeName?: string;
    address?: string;
    phoneNumber?: string;
    careerCode?: string;
    careerName?: string;
    idNumber?: string;
    mobileNumber?: string;
}

export interface Patient extends PatientInfoModel {
    patientCode?: string;
    fullName?: string;
    isOwner?: boolean;
}

// Branch Models
export interface Branch {
    id: string;
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
    updatedBy?: string;
    version: number;
    isActive: boolean;
    isDeleted: boolean;
    branchCode: string;
    branchName: string;
    address: string;
}

// Specialty Models
export interface Specialty {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    updatedBy?: string;
    version?: number;
    isActive?: boolean;
    isDeleted?: boolean;
    specialtyCode?: string;
    specialtyName?: string;
    order?: number;
    specialtyDescription?: string;
    minAge?: number;
    maxAge?: number;
}

// Doctor Models
export interface Doctor {
    doctorId?: number;
    doctorCode?: string;
    doctorName?: string;
    doctorTitle?: string;
    phoneNumber?: string;
    email?: string;
}

// Clinic Models
export interface Clinic {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    updatedBy?: string;
    version?: number;
    isActive?: boolean;
    isDeleted?: boolean;
    clinicId?: number;
    specialtyId?: string;
    branchId?: string;
    clinicCode?: string;
    clinicName?: string;
}

//Clinic models for kiosk
// export interface ClinicForKiosk {
//     id?: string;
//     createdAt?: string;
//     updatedAt?: string;
//     createdBy?: string;
//     updatedBy?: string;
//     version?: number;
//     isActive?: boolean;
//     isDeleted?: boolean;
//     clinicId?: number;
//     specialtyId?: string;
//     branchId?: string;
//     clinicCode?: string;
//     clinicName?: string;
//     specialty?: Specialty;
//     clinic?: Clinic;
// }

//Service models clinic from kiosk
export interface ServiceClinicForKiosk {
    serviceCode?: string;
    serviceId?: string;
    serviceName?: string;
}

// Registration State
export type AppointmentMethod = 'specialty' | 'doctor' | 'clinic' | null;

export interface RegistrationState {
    currentStep: number;
    selectedHospital: Hospital | null;
    selectedPatient: Patient | null;
    selectedBranch: Branch | null;
    appointmentMethod: AppointmentMethod;
    selectedAppointmentData: Specialty | Doctor | Clinic | null;
}
