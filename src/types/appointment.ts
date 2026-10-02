// Appointment Slot Model

import type { Clinic, Doctor } from "./registration";

export interface AppointmentSlotModel {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    updatedBy?: string;
    version?: number;
    isActive?: boolean;
    isDeleted?: boolean;
    slotDate?: string;
    slotTime?: string;
    clinicId?: number;
    doctorId?: number;
    serviceId?: number;
    serviceCode?: string;
    servicePrice?: number;
    maxPatient?: number;
    slotType?: string; // 'MORNING' | 'AFTERNOON'
    isBooked?: boolean;
    serviceName?: string;
    doctorCode?: string;
    doctorName?: string;
    doctorTitle?: string;
    clinicCode?: string;
    clinicName?: string;
    clinic?: Clinic;
    doctor?: Doctor;
}

export interface AppointmentDetailModel {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    updatedBy?: string;
    version?: number;
    isActive?: boolean;
    isDeleted?: boolean;
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
    symptom?: string;
    appointmentCode?: string;
    appointmentSlotId?: string;
    appointmentStatus?: string;
    appointmentNote?: string;
    sourceType?: string;
    confirmBy?: string;
    treatmentCode?: string;
    treatmentId?: string;
    slot?: AppointmentSlotModel;
    doctor?: Doctor;
    clinic?: Clinic;
}
