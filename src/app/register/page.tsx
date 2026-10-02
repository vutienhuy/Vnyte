"use client";

/** Lưu localStorage an toàn - tự dọn dẹp SDA cache cũ nếu hết quota */
function safeSetStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota exceeded - xóa cache cũ rồi thử lại
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sda_cache_")) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    try {
      localStorage.setItem(key, value);
    } catch {
      // Vẫn đầy - dùng sessionStorage làm fallback
      sessionStorage.setItem(key, value);
    }
  }
}

import { useEffect, useState } from "react";
import {
  getHospitals,
  getPatientList,
  getBranches,
  getAvailableDates,
  getAppointmentSlots,
  getAppointmentDetail,
  getClinicForKiosk,
  getServiceByClinicId,
  createAppoinmentDirect,
  getTypePatientInKiosk,
  getSpecialtyForKiosk,
} from "@/services/registration.service";
// import { getSpecialties, getDoctors, getClinics, createAppointment } from "@/services/registration.service";
import { printRegisteredTreatment } from "@/lib/treatment-print";
import { SHOW_EXAM_FEE } from "@/lib/feature-flags";
import type {
  Hospital,
  Patient,
  Branch,
  PatientInfoModel,
  ServiceClinicForKiosk,
  Clinic,
} from "@/types/registration";
import {
  UserIcon,
  PhoneIcon,
  IdentificationIcon,
  CalendarIcon,
  CheckBadgeIcon,
  MapPinIcon,
  BuildingOffice2Icon,
  UsersIcon,
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import type { AppointmentSlotModel } from "@/types/appointment";
import { formatDOB } from "@/components/utils/formatters";
import AppLayout from "@/components/layout/AppLayout";
import RegistrationStepper from "@/components/ui/RegistrationStepper";
import { useRouter } from 'next/navigation';
import ConfirmDialog from "@/components/ui/ConfirmDialog";
const REGISTRATION_STEPS = [
  // { id: 1, label: "Chọn bệnh viện" },
  { id: 1, label: "Chọn cơ sở khám" },
  { id: 2, label: "Chọn người khám" },
  { id: 3, label: "Chọn phương thức" },
  // { id: 5, label: "Chọn ngày khám" },
  // { id: 6, label: "Chọn giờ khám" },
];


// Kiểu dữ liệu CCCD trả về từ server
interface CccdData {
  maKetQua?: string | null;
  hoTen?: string | null;
  ngaySinh?: string | null;
  gioiTinh?: string | null;
  diaChi?: string | null;
  soCccd?: string | null;
  maGioiTinh?: number | null;
  [key: string]: any;
}

export default function RegisterExam() {
  // State management
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // CCCD mode: bỏ qua step 3 (chọn người khám)
  const [isCccdMode, setIsCccdMode] = useState(false);
  const [cccdData, setCccdData] = useState<CccdData | null>(null);

  // const [hospitals, setHospitals] = useState<Hospital[]>([]);
  // const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);


  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // const [appointmentMethod, setAppointmentMethod] = useState<AppointmentMethod>(null);
  // const [specialties, setSpecialties] = useState<Specialty[]>([]);
  // const [doctors, setDoctors] = useState<Doctor[]>([]);
  // const [clinics, setClinics] = useState<Clinic[]>([]);
  // const [selectedAppointment, setSelectedAppointment] = useState<Specialty | Doctor | Clinic | null>(null);

  // Step 4: NEW Kiosk Flow
  // kioskSubStep: 0 = chọn chuyên khoa, 1 = chọn phòng khám, 2 = chọn dịch vụ, 3 = chọn loại bệnh nhân
  const [kioskSubStep, setKioskSubStep] = useState<0 | 1 | 2 | 3>(0);
  const [kioskSpecialties, setKioskSpecialties] = useState<any[]>([]);
  const [selectedKioskSpecialty, setSelectedKioskSpecialty] = useState<any | null>(null);
  const [kioskClinics, setKioskClinics] = useState<Clinic[]>([]);
  const [selectedKioskClinic, setSelectedKioskClinic] = useState<Clinic | null>(null);
  const [kioskServices, setKioskServices] = useState<ServiceClinicForKiosk[]>([]);
  const [selectedKioskService, setSelectedKioskService] = useState<ServiceClinicForKiosk | null>(null);
  const [kioskPatientTypes, setKioskPatientTypes] = useState<any[]>([]);
  const [selectedKioskPatientType, setSelectedKioskPatientType] = useState<any | null>(null);

  // Step 5: Date Selection
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Step 6: Time Slot Selection
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlotModel | null>(null);
  const [showTimeSheet, setShowTimeSheet] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  // const filteredHospitals = hospitals.filter((hospital) => {
  //   const query = searchQuery.toLowerCase();
  //   return (
  //     hospital.hospitalName.toLowerCase().includes(query) ||
  //     hospital.address.toLowerCase().includes(query)
  //   );
  // });

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const methodTitles = {
    specialty: "Đặt lịch theo chuyên khoa",
    doctor: "Đặt lịch theo bác sĩ",
    clinic: "Đặt lịch theo phòng khám",
  };

  const router = useRouter();


  // Hàm tạo Patient tạm từ dữ liệu CCCD
  const buildPatientFromCccd = (d: CccdData): Patient => {
    const fullName = d.hoTen || "";
    const parts = fullName.trim().split(" ");
    const firstName = parts[parts.length - 1] || "";
    const lastName = parts.slice(0, -1).join(" ") || "";
    const address = d.address || "";
    const nationalCode = d.nationalCode || "";
    const nationalName = d.nationalName || "";
    const ethnicCode = d.ethnicCode || "";
    const ethnicName = d.ethnicName || "";
    const provinceCode = d.provinceCode || "";
    const provinceName = d.provinceName || "";
    const communeCode = d.communeCode || "";
    const communeName = d.communeName || "";

    let dob = d.ngaySinh || "";
    dob = dob.split("/").reverse().join("");
    return {
      patientCode: "",
      firstName,
      lastName,
      fullName,
      dob,
      idNumber: d.soCccd || "",
      genderId: d.maGioiTinh != null ? d.maGioiTinh : (d.gioiTinh === "Nam" ? 2 : 1),
      address: address,
      nationalCode,
      nationalName,
      ethnicCode,
      ethnicName,
      provinceCode,
      provinceName,
      communeCode,
      communeName,
      mobileNumber: "0000000000",
      isOwner: true,
    } as unknown as Patient;
  };

  useEffect(() => {
    const initializeApp = async () => {
      // Kiểm tra xem có dữ liệu CCCD không (luồng CCCD/NFC)
      const cccdRaw = sessionStorage.getItem("cccdPatient");
      if (cccdRaw) {
        try {
          const d: CccdData = JSON.parse(cccdRaw);
          setCccdData(d);
          setIsCccdMode(true);
          const patient = buildPatientFromCccd(d);
          setSelectedPatient(patient);
        } catch {
          // ignore parse error
        }
      }
      await loadBranches();
    };
    initializeApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // const loadHospitals = async () => {
  //   setLoading(true);
  //   setError("");
  //   try {
  //     const response = await getHospitals();
  //     setHospitals(response.data || []);
  //   } catch (err) {
  //     setError("Không thể tải danh sách bệnh viện. Vui lòng thử lại.");
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  // const handleSelectHospital = (hospital: Hospital) => {
  //   setSelectedHospital(hospital);
  // };

  // const handleChangeHospital = () => {
  //   setSelectedHospital(null);
  //   setBranches([]);
  //   setSelectedBranch(null);
  //   setPatients([]);
  //   setSelectedPatient(null);
  //   // setAppointmentMethod(null);
  //   // setSpecialties([]);
  //   // setDoctors([]);
  //   // setClinics([]);
  //   // setSelectedAppointment(null);
  //   setAvailableDates([]);
  //   setSelectedDate(null);
  //   setSelectedSlot(null);
  //   setCurrentStep(1);
  // };

  // const handleContinueFromHospital = async () => {
  //   if (!selectedHospital || loading) {
  //     setError("Vui lòng chọn bệnh viện");
  //     return;
  //   }
  //   setCurrentStep(2);
  //   await loadBranches(selectedHospital);
  // };

  const loadPatients = async () => {
    setLoading(true);
    setError("");
    try {
      const patientCode = localStorage.getItem("patientCode") || "";
      const response = await getPatientList(patientCode);
      const patientList = response.data || [];

      // Identify and sort owner based on patientCode from localStorage
      const processedList = patientList.map(p => ({
        ...p,
        isOwner: p.patientCode === patientCode
      }));

      processedList.sort((a, b) => {
        if (a.isOwner && !b.isOwner) return -1;
        if (!a.isOwner && b.isOwner) return 1;
        return 0;
      });

      setPatients(processedList);

      // Auto select owner
      if (processedList.length > 0) {
        const owner = processedList.find(p => p.isOwner) || processedList[0];
        setSelectedPatient(owner);
      }
    } catch (err) {
      setError("Không thể tải danh sách người thân. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
  };

  const handleContinueFromPatient = async () => {
    if (!selectedPatient || loading) {
      setError("Vui lòng chọn người cần đăng ký khám");
      return;
    }
    setCurrentStep(3);
    await loadKioskSpecialties();
  };

  const loadBranches = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getBranches(
        1,
        100
      );
      const branchList = response.data || [];
      setBranches(branchList);

      if (branchList.length === 1) {
        setSelectedBranch(branchList[0]);
      }
    } catch (err) {
      setError("Không thể tải danh sách cơ sở khám. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBranch = (branch: Branch) => {
    setSelectedBranch(branch);
  };

  const handleContinueFromBranch = async () => {
    if (!selectedBranch || loading) {
      setError("Vui lòng chọn cơ sở khám");
      return;
    }
    if (isCccdMode) {
      // Bỏ qua step 3 (chọn người khám) — dùng thông tin CCCD
      setCurrentStep(3);
      await loadKioskSpecialties();
    } else {
      setCurrentStep(2);
      await loadPatients();
    }
  };

  const loadKioskSpecialties = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getSpecialtyForKiosk();
      setKioskSpecialties(response.data || []);
      setKioskSubStep(0);
    } catch (err) {
      setError("Không thể tải danh sách chuyên khoa. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectKioskSpecialty = async (specialty: any) => {
    setSelectedKioskSpecialty(specialty);
    setSelectedKioskClinic(null);
    setSelectedKioskService(null);
    setSelectedKioskPatientType(null);
    setKioskClinics([]);
    setKioskServices([]);
    if (specialty.id == null) return;
    setLoading(true);
    setError("");
    try {
      const response = await getClinicForKiosk(
        String(specialty.id)
      );
      setKioskClinics(response.data || []);
      setKioskSubStep(1);
    } catch (err) {
      setError("Không thể tải danh sách phòng khám. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectKioskClinic = async (clinic: Clinic) => {
    setSelectedKioskClinic(clinic);
    setSelectedKioskService(null);
    setSelectedKioskPatientType(null);
    if (clinic.clinicId == null) return;
    setLoading(true);
    setError("");
    try {
      const response = await getServiceByClinicId(
        clinic.clinicId
      );
      setKioskServices(response.data || []);
      setKioskSubStep(2);
    } catch (err) {
      setError("Không thể tải danh sách dịch vụ. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectKioskService = async (service: ServiceClinicForKiosk) => {
    setSelectedKioskService(service);
    setSelectedKioskPatientType(null);
    setLoading(true);
    setError("");
    try {
      const response = await getTypePatientInKiosk(
      );
      setKioskPatientTypes(response.data || []);
      setKioskSubStep(3);
    } catch (err) {
      setError("Không thể tải danh sách loại bệnh nhân. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleKioskBack = () => {
    if (kioskSubStep === 3) {
      setKioskSubStep(2);
      setSelectedKioskPatientType(null);
    } else if (kioskSubStep === 2) {
      setKioskSubStep(1);
      setSelectedKioskService(null);
      setKioskServices([]);
    } else if (kioskSubStep === 1) {
      setKioskSubStep(0);
      setSelectedKioskClinic(null);
      setKioskClinics([]);
    } else {
      // go back to step 3 or 2
      handleBack();
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedPatient) {
      setError("Thiếu thông tin cần thiết");
      return;
    }

    setShowConfirmDialog(false);
    setLoading(true);
    setError("");

    try {
      const patientInfo: PatientInfoModel = {
        firstName: selectedPatient.firstName || "",
        lastName: selectedPatient.lastName || "",
        dob: String(selectedPatient.dob || "").substring(0, 8),
        identityNumber: selectedPatient.idNumber || "UNKNOWN",
        genderId: selectedPatient.genderId != null ? Number(selectedPatient.genderId) : 0,
        nationalCode: selectedPatient.nationalCode || "",
        nationalName: selectedPatient.nationalName || "",
        ethnicCode: selectedPatient.ethnicCode || "",
        ethnicName: selectedPatient.ethnicName || "",
        provinceCode: selectedPatient.provinceCode || "",
        provinceName: selectedPatient.provinceName || "",
        communeCode: selectedPatient.communeCode || "",
        communeName: selectedPatient.communeName || "",
        address: selectedPatient.address || "",
        phoneNumber: selectedPatient.mobileNumber || "0000000000",
        careerCode: selectedPatient.careerCode || "00000",
        careerName: selectedPatient.careerName || "Khác",
      };

      const response = await createAppoinmentDirect(
        selectedKioskClinic?.clinicId ?? 0,
        selectedKioskService?.serviceId ?? "",
        selectedKioskPatientType?.patientTypeId ?? 0,
        patientInfo,
        true
      );

      // In phiếu NGAY sau khi tạo thành công (độc lập với việc lấy chi tiết lịch hẹn).
      const printed = await printRegisteredTreatment(
        response.data as Record<string, unknown>,
        selectedPatient?.idNumber || "",
      );

      // Lưu chi tiết lịch hẹn (best-effort, không ảnh hưởng việc in).
      try {
        const appointmentDetail = await getAppointmentDetail(
          selectedPatient.idNumber || "",
          response.data.appointmentCode
        );
        safeSetStorage("lastAppointment", JSON.stringify({
          ...response.data,
          ...appointmentDetail,
          clinic: appointmentDetail?.clinic || selectedKioskClinic,
        }));
      } catch (detailError) {
        console.error("Failed to load appointment detail:", detailError);
        safeSetStorage("lastAppointment", JSON.stringify(response.data));
      }

      // Đã in được phiếu → về trang chủ; chưa in được → sang trang hoàn tất.
      if (printed) {
        router.push('/');
      } else {
        router.push(`/register/completion?appointmentCode=${response.data.appointmentCode}`);
      }

    } catch (err: any) {
      console.error("Registration failed:", err);
      setError(err.message || "Đăng ký khám thất bại. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setError("");
    if (currentStep > 1) {
      if (currentStep === 3) {
        // Reset kiosk sub-steps
        setKioskSubStep(0);
        setSelectedKioskSpecialty(null);
        setKioskSpecialties([]);
        setSelectedKioskClinic(null);
        setSelectedKioskService(null);
        setSelectedKioskPatientType(null);
        setKioskClinics([]);
        setKioskServices([]);
        setKioskPatientTypes([]);
        // Nếu CCCD mode: bỏ qua step 3, quay về step 2
        if (isCccdMode) {
          setCurrentStep(1);
          return;
        }
      }
      setCurrentStep(currentStep - 1);
    }
  };

  // const handleContinueFromAppointment = () => {
  //   if (!selectedAppointment) {
  //     setError("Vui lòng chọn phương thức đặt lịch");
  //     return;
  //   }
  //   setCurrentStep(5);
  //   loadAvailableDates();
  // };

  // const getCheckSpecialtyOrDoctor = () => {
  //   if (appointmentMethod === "specialty") return (selectedAppointment as Specialty)?.specialtyCode || "";
  //   if (appointmentMethod === "doctor") return (selectedAppointment as Doctor)?.doctorCode || "";
  //   if (appointmentMethod === "clinic") return (selectedAppointment as Clinic)?.clinicCode || "";
  //   return "";
  // };

  // const loadAvailableDates = async () => {
  //   if (!selectedHospital) return;
  //   setLoading(true);
  //   setError("");
  //   try {
  //     const specialtyId = appointmentMethod === "specialty" ? (selectedAppointment as Specialty)?.id : undefined;
  //     const doctorId = appointmentMethod === "doctor" ? (selectedAppointment as Doctor)?.doctorId : undefined;
  //     const clinicId = appointmentMethod === "clinic" ? (selectedAppointment as Clinic)?.clinicId : undefined;

  //     const response = await getAvailableDates(
  //       selectedHospital.baseUrl,
  //       selectedHospital.apiKey,
  //       specialtyId,
  //       doctorId,
  //       clinicId,
  //       getCheckSpecialtyOrDoctor()
  //     );
  //     setAvailableDates(response.data || []);
  //   } catch (err) {
  //     setError("Không thể tải danh sách ngày khám. Vui lòng thử lại.");
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const handleDateClick = (date: string) => {
    setSelectedDate(date);
    setShowTimeSheet(true);
  };

  // const handleFinalContinue = () => {
  //   if (!selectedSlot || !selectedDate) {
  //     setError("Vui lòng chọn ngày và giờ khám");
  //     return;
  //   }

  //   if (selectedHospital) {
  //     localStorage.setItem("selectedHospital", JSON.stringify(selectedHospital));
  //   }
  //   if (selectedPatient) {
  //     localStorage.setItem("selectedPatient", JSON.stringify(selectedPatient));
  //   }
  //   if (selectedBranch) {
  //     localStorage.setItem("selectedBranch", JSON.stringify(selectedBranch));
  //   }
  //   if (selectedAppointment && appointmentMethod) {
  //     if (appointmentMethod === "specialty") {
  //       localStorage.setItem("selectedSpecialty", JSON.stringify(selectedAppointment));
  //     } else if (appointmentMethod === "doctor") {
  //       localStorage.setItem("selectedDoctor", JSON.stringify(selectedAppointment));
  //     } else if (appointmentMethod === "clinic") {
  //       localStorage.setItem("selectedClinic", JSON.stringify(selectedAppointment));
  //     }
  //     localStorage.setItem("appointmentMethod", appointmentMethod);
  //   }
  //   if (selectedSlot) {
  //     localStorage.setItem("selectedSlot", JSON.stringify(selectedSlot));
  //   }
  //   if (selectedDate) {
  //     localStorage.setItem("selectedDate", selectedDate);
  //   }

  //   // Xóa CCCD data vì đã hoàn tất đặt lịch
  //   sessionStorage.removeItem("cccdPatient");
  //   window.location.href = "/register/confirm";
  // };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("vi-VN");
  };

  const getWeekday = (dateStr: string) => {
    const date = new Date(dateStr);
    const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    return days[date.getDay()];
  };

  // Hiển thị số bước thực tế
  const totalSteps = isCccdMode ? 3 : 3;
  const displayStep = isCccdMode && currentStep >= 4 ? currentStep - 1 : currentStep;
  const currentStepLabel = REGISTRATION_STEPS.find((s) => s.id === currentStep)?.label;

  const headerContent = (
    <div className="text-center space-y-3 pt-2 pb-4">
      <h1 className="text-3xl font-bold text-slate-800">
        Đăng ký khám bệnh
      </h1>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100">
          <span className="text-lg font-semibold text-blue-700">
            Bước {displayStep}/{totalSteps}
          </span>
          <span className="w-1 h-1 rounded-full bg-blue-300" />
          <span className="text-lg text-slate-600">
            {currentStepLabel}
          </span>
        </div>
        {isCccdMode && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full text-base text-green-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            CCCD: <span className="font-semibold">{cccdData?.hoTen}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        {headerContent}
        <div className="flex items-start justify-center px-4 pb-8">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 max-w-5xl w-full p-6 sm:p-8">
            <div className="mb-8">
              <RegistrationStepper
                steps={REGISTRATION_STEPS}
                currentStep={currentStep}
              />
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-lg flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="min-h-[420px] mb-6">
              {/* {currentStep === 1 && (
                <div>
                  <h3 className="text-2xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <BuildingOffice2Icon className="w-6 h-6 text-blue-700" />
                    Chọn bệnh viện
                  </h3>
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-14 gap-3">
                      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin"></div>
                      <p className="text-lg text-slate-400">Đang tải...</p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex flex-col sm:flex-row gap-3 mb-6">
                        <div className="relative flex-1">
                          <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </span>
                          <input
                            type="text"
                            placeholder="Tìm kiếm theo tên bệnh viện hoặc địa chỉ..."
                            value={searchQuery} // Gán giá trị từ state
                            onChange={(e) => setSearchQuery(e.target.value)} // Cập nhật state khi nhập
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>

                      {/* {filteredHospitals.length === 0 && searchQuery !== "" ? (
                        <div className="text-center py-10 text-slate-500">
                          Không tìm thấy bệnh viện nào phù hợp với "{searchQuery}"
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-h-[500px] overflow-y-auto">
                          {filteredHospitals.map((hospital) => (
                            <div
                              key={hospital.id}
                              onClick={() => handleSelectHospital(hospital)}
                              className={`group h-52 p-4 border rounded-xl cursor-pointer transition-all duration-200 ${selectedHospital?.id === hospital.id
                                ? "border-blue-700 ring-2 ring-blue-100 bg-white"
                                : "border-slate-200 hover:border-blue-300 bg-white shadow-sm"
                                }`}
                            >
                              <div className="flex items-start gap-6 px-4 py-3">
                                <div className="relative flex-shrink-0">
                                  <img
                                    src={hospital.logoUrl || "/benhvien.webp"}
                                    alt={hospital.hospitalName}
                                    className="w-30 h-30 rounded-full object-cover border-2 border-slate-100 shadow-sm"
                                  />
                                </div>

                                <div className="flex-1 min-w-0 flex flex-col justify-center h-32">
                                  <h4 className="font-bold text-slate-800 mb-2 text-lg uppercase leading-tight line-clamp-2">
                                    {hospital.hospitalName}
                                  </h4>
                                  <p className="text-sm text-slate-500 line-clamp-2">
                                    {hospital.address}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between px-4">
                                {hospital.isActive && (
                                  <span className="flex items-center gap-1.5 text-md font-semibold text-blue-700">
                                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                                    Đang hoạt động
                                  </span>
                                )}
                                {
                                  selectedHospital?.id === hospital.id && (
                                    <div className="w-5 h-5 rounded-full bg-blue-700 flex items-center justify-center">
                                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                  )
                                }
                              </div>
                            </div>
                          ))}
                        </div>
                      )}}
                    </div>
                  )}
                </div>
              )} */}

              {currentStep === 2 && !isCccdMode && (
                <div>
                  <h3 className="text-2xl font-semibold text-slate-800 mb-5 flex items-center gap-2">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <UsersIcon className="w-6 h-6 text-blue-800" />
                    </div>
                    Chọn người cần đăng ký khám
                  </h3>
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin"></div>
                      <p className="text-lg text-slate-400">Đang tải danh sách...</p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                      {patients.map((patient, index) => (
                        <div
                          key={index}
                          onClick={() => handleSelectPatient(patient)}
                          className={`group relative p-5 border-2 rounded-xl cursor-pointer transition-all duration-200 ${selectedPatient === patient
                            ? "border-blue-500 bg-blue-50 shadow-md shadow-blue-100"
                            : "border-slate-200 hover:border-blue-300 bg-white hover:shadow-md"
                            }`}
                        >
                          <div className="flex items-start gap-4">
                            <div
                              className={`p-2.5 rounded-xl transition-colors shrink-0 ${selectedPatient === patient
                                ? "bg-blue-700 text-white"
                                : "bg-slate-100 text-slate-500"
                                }`}
                            >
                              <UserIcon className="w-6 h-6" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-bold text-slate-800 text-xl">
                                    {patient.fullName || `${patient.lastName} ${patient.firstName}`}
                                  </h4>
                                  {patient.isOwner && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-100 text-blue-700 text-base font-semibold rounded-full">
                                      <CheckBadgeIcon className="w-4 h-4" />
                                      Chủ TK
                                    </span>
                                  )}
                                </div>

                                {selectedPatient === patient && (
                                  <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="shrink-0 w-8 h-8 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center">
                                    <CalendarIcon className="w-4.5 h-4.5" />
                                  </div>
                                  <div className="overflow-hidden">
                                    <p className="text-sm text-slate-400">Ngày sinh</p>
                                    <p className="text-base font-medium text-slate-700 truncate">{formatDOB(patient.dob) || '---'}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2.5">
                                  <div className="shrink-0 w-8 h-8 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center">
                                    <IdentificationIcon className="w-4.5 h-4.5" />
                                  </div>
                                  <div className="overflow-hidden">
                                    <p className="text-sm text-slate-400">CCCD</p>
                                    <p className="text-base font-medium text-slate-700 truncate">{patient.idNumber || '---'}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2.5">
                                  <div className="shrink-0 w-8 h-8 rounded-lg bg-green-50 text-green-500 flex items-center justify-center">
                                    <PhoneIcon className="w-4.5 h-4.5" />
                                  </div>
                                  <div className="overflow-hidden">
                                    <p className="text-sm text-slate-400">SĐT</p>
                                    <p className="text-base font-medium text-slate-700 truncate">{patient.mobileNumber || '---'}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2.5">
                                  <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${patient.genderId?.toString() === '2' ? 'bg-blue-50 text-blue-500' : 'bg-pink-50 text-pink-500'}`}>
                                    <span className="text-sm font-bold">{patient.genderId?.toString() === '2' ? "Nam" : "Nữ"}</span>
                                  </div>
                                  <div className="overflow-hidden">
                                    <p className="text-sm text-slate-400">Giới tính</p>
                                    <p className="text-base font-medium text-slate-700">{patient.genderId?.toString() === '2' ? "Nam" : "Nữ"}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2.5 col-span-2">
                                  <div className="shrink-0 w-8 h-8 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center">
                                    <MapPinIcon className="w-4.5 h-4.5" />
                                  </div>
                                  <div className="overflow-hidden">
                                    <p className="text-sm text-slate-400">Địa chỉ</p>
                                    <p className="text-base text-slate-600 truncate">
                                      {[patient.address, patient.communeName, patient.provinceName].filter(Boolean).join(", ") || "---"}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {currentStep === 1 && (
                <div>
                  <h3 className="text-2xl font-semibold text-slate-800 mb-5 flex items-center gap-2">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <MapPinIcon className="w-6 h-6 text-blue-800" />
                    </div>
                    Chọn cơ sở khám
                  </h3>
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin"></div>
                      <p className="text-lg text-slate-400">Đang tải danh sách...</p>
                    </div>
                  ) : branches.length === 1 ? (
                    <div className="p-5 border-2 border-blue-400 bg-blue-50 rounded-xl">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-lg text-blue-600 mb-1 font-medium">Tự động chọn cơ sở duy nhất</p>
                          <h4 className="font-bold text-slate-900 text-xl">{branches[0].branchName}</h4>
                          {branches[0].address && <p className="text-lg text-slate-600 mt-1">{branches[0].address}</p>}
                        </div>
                        <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center ml-3 flex-shrink-0">
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                      {branches.map((branch) => (
                        <div
                          key={branch.id}
                          onClick={() => handleSelectBranch(branch)}
                          className={`group p-5 border-2 rounded-xl cursor-pointer transition-all duration-200 ${selectedBranch?.id === branch.id
                            ? "border-blue-500 bg-blue-50 shadow-md shadow-blue-100"
                            : "border-slate-200 hover:border-blue-300 bg-white hover:shadow-md"
                            }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-bold text-slate-900 text-xl">{branch.branchName}</h4>
                              {branch.address && <p className="text-slate-500 mt-1.5 text-lg">{branch.address}</p>}
                            </div>
                            {selectedBranch?.id === branch.id && (
                              <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center ml-3 flex-shrink-0">
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* NEW KIOSK FLOW - Step 3 */}
              {currentStep === 3 && (
                <div>
                  {/* Sub-step breadcrumb */}
                  <div className="flex items-center gap-1.5 mb-6 flex-wrap bg-slate-50 rounded-xl p-3">
                    {[
                      { step: 0, label: "Chuyên khoa" },
                      { step: 1, label: "Phòng khám" },
                      { step: 2, label: "Dịch vụ" },
                      { step: 3, label: "Đối tượng" },
                    ].map((item, idx) => (
                      <div key={item.step} className="flex items-center gap-1.5">
                        {idx > 0 && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                        <div className={`px-3 py-1.5 rounded-lg text-base font-semibold transition-all ${kioskSubStep === item.step
                          ? 'bg-blue-700 text-white shadow-sm'
                          : kioskSubStep > item.step
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-slate-400'
                          }`}>
                          {item.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Sub-step 0: Chọn chuyên khoa */}
                  {kioskSubStep === 0 && (
                    <div>
                      <h3 className="text-2xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Chọn chuyên khoa
                      </h3>
                      {loading ? (
                        <div className="flex justify-center items-center py-12">
                          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin"></div>
                        </div>
                      ) : kioskSpecialties.length === 0 ? (
                        <p className="text-center text-slate-500 py-8">Không có chuyên khoa khả dụng</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto">
                          {kioskSpecialties.filter((s: any) => s.isActive).map((specialty: any) => (
                            <div
                              key={specialty.id}
                              onClick={() => handleSelectKioskSpecialty(specialty)}
                              className={`group p-4 border rounded-xl cursor-pointer transition-all duration-200 ${selectedKioskSpecialty?.id === specialty.id
                                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                                : 'border-slate-200 hover:border-blue-300 bg-white hover:bg-slate-50'
                                }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-slate-800 text-2xl leading-snug">{specialty.specialtyName}</h4>
                                  {specialty.specialtyDescription && (
                                    <p className="text-xl text-slate-500 mt-1">{specialty.specialtyDescription}</p>
                                  )}
                                  {specialty.specialtyCode && (
                                    <p className="text-xl text-slate-500 mt-1">Mã: {specialty.specialtyCode}</p>
                                  )}
                                </div>
                                {selectedKioskSpecialty?.id === specialty.id && (
                                  <div className="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sub-step 1: Chọn phòng khám */}
                  {kioskSubStep === 1 && (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          Chọn phòng khám
                        </h3>
                        <button
                          onClick={handleKioskBack}
                          className="px-3 py-1.5 text-xl bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <ArrowPathIcon className="w-5 h-5" />
                          Đổi chuyên khoa
                        </button>
                      </div>
                      {selectedKioskSpecialty && (
                        <div className="flex flex-wrap items-center gap-2.5 mb-4">
                          <span className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full">
                            <span className="text-base text-slate-400">Chuyên khoa:</span>
                            <span className="text-base font-semibold text-slate-700">{selectedKioskSpecialty.specialtyName}</span>
                          </span>
                        </div>
                      )}
                      {loading ? (
                        <div className="flex justify-center items-center py-12">
                          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin"></div>
                        </div>
                      ) : kioskClinics.length === 0 ? (
                        <p className="text-center text-slate-500 py-8">Không có phòng khám khả dụng</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto">
                          {kioskClinics.filter((c) => c.isActive).map((clinic) => (
                            <div
                              key={clinic.id}
                              onClick={() => handleSelectKioskClinic(clinic)}
                              className={`group p-4 border rounded-xl cursor-pointer transition-all duration-200 ${selectedKioskClinic?.id === clinic.id
                                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                                : 'border-slate-200 hover:border-blue-300 bg-white hover:bg-slate-50'
                                }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-slate-800 text-2xl leading-snug">{clinic.clinicName}</h4>
                                  {clinic.clinicCode && (
                                    <p className="text-xl text-slate-500 mt-0.5 flex items-center gap-1">
                                      Mã: {clinic.clinicCode}
                                    </p>
                                  )}
                                </div>
                                {selectedKioskClinic?.id === clinic.id && (
                                  <div className="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sub-step 2: Chọn dịch vụ */}
                  {kioskSubStep === 2 && (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          Chọn dịch vụ
                        </h3>
                        <button
                          onClick={handleKioskBack}
                          className="px-3 py-1.5 text-xl bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <ArrowPathIcon className="w-5 h-5" />
                          Đổi phòng khám
                        </button>
                      </div>
                      {(selectedKioskSpecialty || selectedKioskClinic) && (
                        <div className="flex flex-wrap items-center gap-2.5 mb-4">
                          {selectedKioskSpecialty && (
                            <span className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full">
                              <span className="text-base text-slate-400">Chuyên khoa:</span>
                              <span className="text-base font-semibold text-slate-700">{selectedKioskSpecialty.specialtyName}</span>
                            </span>
                          )}
                          {selectedKioskSpecialty && selectedKioskClinic && (
                            <span className="text-lg text-slate-300">›</span>
                          )}
                          {selectedKioskClinic && (
                            <span className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full">
                              <span className="text-base text-slate-400">Phòng khám:</span>
                              <span className="text-base font-semibold text-slate-700">{selectedKioskClinic.clinicName}</span>
                            </span>
                          )}
                        </div>
                      )}
                      {loading ? (
                        <div className="flex justify-center items-center py-12">
                          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin"></div>
                        </div>
                      ) : kioskServices.length === 0 ? (
                        <p className="text-center text-slate-500 py-8">Không có dịch vụ khả dụng</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto">
                          {kioskServices.map((service) => (
                            <div
                              key={service.serviceId}
                              onClick={() => handleSelectKioskService(service)}
                              className={`group p-4 border rounded-xl cursor-pointer transition-all duration-200 ${selectedKioskService?.serviceId === service.serviceId
                                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                                : 'border-slate-200 hover:border-blue-300 bg-white hover:bg-slate-50'
                                }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-slate-800 text-xl">{service.serviceName}</h4>
                                  {service.serviceCode && (
                                    <p className="text-xl text-slate-400 mt-0.5">Mã: {service.serviceCode}</p>
                                  )}
                                </div>
                                {selectedKioskService?.serviceId === service.serviceId && (
                                  <div className="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sub-step 3: Chọn loại bệnh nhân */}
                  {kioskSubStep === 3 && (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          Chọn danh sách đối tượng
                        </h3>
                        <button
                          onClick={handleKioskBack}
                          className="px-3 py-1.5 text-xl bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <ArrowPathIcon className="w-5 h-5" />
                          Đổi dịch vụ
                        </button>
                      </div>
                      {/* Inline summary of previous selections */}
                      <div className="flex flex-wrap items-center gap-2.5 mb-4">
                        {selectedKioskClinic && (
                          <span className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full">
                            <span className="text-base text-slate-400">Phòng khám:</span>
                            <span className="text-base font-semibold text-slate-700">{selectedKioskClinic.clinicName}</span>
                          </span>
                        )}
                        {selectedKioskClinic && selectedKioskService && (
                          <span className="text-lg text-slate-300">›</span>
                        )}
                        {selectedKioskService && (
                          <span className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full">
                            <span className="text-base text-slate-400">Dịch vụ:</span>
                            <span className="text-base font-semibold text-slate-700">{selectedKioskService.serviceName}</span>
                          </span>
                        )}
                      </div>
                      {loading ? (
                        <div className="flex justify-center items-center py-12">
                          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin"></div>
                        </div>
                      ) : kioskPatientTypes.length === 0 ? (
                        <p className="text-center text-slate-500 py-8">Không có loại bệnh nhân khả dụng</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[320px] overflow-y-auto">
                          {kioskPatientTypes.map((type: any) => (
                            <div
                              key={type.patientTypeId}
                              onClick={() => setSelectedKioskPatientType(type)}
                              className={`group p-4 border rounded-xl cursor-pointer transition-all duration-200 ${selectedKioskPatientType?.patientTypeId === type.patientTypeId
                                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                                : 'border-slate-200 hover:border-blue-300 bg-white hover:bg-slate-50'
                                }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-slate-800 text-xl">{type.patientTypeName}</h4>
                                  {type.description && (
                                    <p className="text-xl text-slate-500 mt-0.5">{type.description}</p>
                                  )}
                                </div>
                                {selectedKioskPatientType?.patientTypeId === type.patientTypeId && (
                                  <div className="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {currentStep === 5 && (
                <div>
                  <h3 className="text-2xl font-semibold text-slate-800 mb-5 flex items-center gap-2">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <CalendarDaysIcon className="w-6 h-6 text-blue-700" />
                    </div>
                    Chọn ngày khám
                  </h3>

                  <div className="flex flex-wrap items-center gap-2.5 mb-4">
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full">
                      <span className="text-base text-slate-400">Bệnh nhân:</span>
                      <span className="text-base font-semibold text-slate-700">{selectedPatient?.fullName || `${selectedPatient?.lastName} ${selectedPatient?.firstName}`}</span>
                    </span>
                  </div>

                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-14 gap-3">
                      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-700 rounded-full animate-spin"></div>
                      <p className="text-lg text-slate-400">Đang tải...</p>
                    </div>
                  ) : availableDates.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto pb-4">
                      {availableDates.map((date) => (
                        <button
                          key={date}
                          onClick={() => handleDateClick(date)}
                          className={`shrink-0 w-24 p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer ${selectedDate === date
                            ? "border-blue-500 bg-blue-50 shadow-md shadow-blue-100"
                            : "border-slate-200 hover:border-blue-300 bg-white hover:shadow-md"
                            }`}
                        >
                          <div className="text-base text-slate-500 font-medium">{getWeekday(date)}</div>
                          <div className="text-lg font-semibold text-slate-800 mt-1">
                            {formatDate(date).split("/").slice(0, 2).join("/")}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-slate-500 py-8 text-lg">Không có ngày khám khả dụng</p>
                  )}
                </div>
              )}

              {currentStep === 6 && selectedSlot && (
                <div>
                  <h3 className="text-2xl font-semibold text-slate-800 mb-5 flex items-center gap-2">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <ClipboardDocumentCheckIcon className="w-6 h-6 text-blue-700" />
                    </div>
                    Thông tin đã chọn
                  </h3>
                  <div className="p-5 border-2 border-blue-200 bg-blue-50/50 rounded-xl">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-base text-slate-400 mb-0.5">Ngày khám</p>
                        <p className="font-semibold text-slate-800 text-xl">{selectedDate ? formatDate(selectedDate) : ""}</p>
                      </div>
                      <div>
                        <p className="text-base text-slate-400 mb-0.5">Giờ khám</p>
                        <p className="font-semibold text-slate-800 text-xl">{selectedSlot.slotTime}</p>
                      </div>
                    </div>
                    <div className="mb-4">
                      <p className="text-base text-slate-400 mb-0.5">Phòng khám</p>
                      <p className="font-semibold text-slate-800 text-xl">{selectedSlot.clinicName}</p>
                    </div>
                    {SHOW_EXAM_FEE && (
                    <div className="pt-3 border-t border-blue-200">
                      <p className="text-base text-slate-400 mb-0.5">Phí khám</p>
                      <p className="font-bold text-blue-700 text-2xl">
                        {selectedSlot.servicePrice?.toLocaleString("vi-VN")} VNĐ
                      </p>
                    </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              {currentStep > 1 && (
                <button
                  onClick={handleBack}
                  className="flex-1 py-3.5 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-all duration-200 cursor-pointer text-xl border border-slate-200"
                >
                  Quay lại
                </button>
              )}

              {currentStep === 1 && (
                <button
                  onClick={handleContinueFromBranch}
                  disabled={!selectedBranch || loading}
                  className={`flex-1 py-3.5 font-bold rounded-xl transition-all duration-200 text-xl ${selectedBranch && !loading
                    ? "bg-blue-700 text-white hover:bg-blue-800 shadow-lg shadow-blue-200 cursor-pointer active:scale-[0.98]"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                    }`}
                >
                  {loading ? "Đang tải..." : "Tiếp tục"}
                </button>
              )}

              {currentStep === 2 && (
                <button
                  onClick={handleContinueFromPatient}
                  disabled={!selectedPatient || loading}
                  className={`flex-1 py-3.5 font-bold rounded-xl transition-all duration-200 text-xl ${selectedPatient && !loading
                    ? "bg-blue-700 text-white hover:bg-blue-800 shadow-lg shadow-blue-200 cursor-pointer active:scale-[0.98]"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                    }`}
                >
                  {loading ? "Đang tải..." : "Tiếp tục"}
                </button>
              )}

              {currentStep === 3 && kioskSubStep === 3 && (
                <button
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={!selectedKioskPatientType || loading}
                  className={`flex-1 py-3.5 font-bold rounded-xl transition-all duration-200 text-xl ${selectedKioskPatientType && !loading
                    ? "bg-blue-700 text-white hover:bg-blue-800 shadow-lg shadow-blue-200 cursor-pointer active:scale-[0.98]"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                    }`}
                >
                  {loading ? "Đang tạo..." : "Xác nhận đăng ký"}
                </button>
              )}

              <ConfirmDialog
                isOpen={showConfirmDialog}
                onClose={() => setShowConfirmDialog(false)}
                onConfirm={handleConfirmBooking}
                title="Xác nhận đăng ký khám"
                message="Sau khi đăng ký khám thành công, bạn sẽ nhận được thông báo xác nhận. Vui lòng kiểm tra kỹ thông tin trước khi xác nhận."
                confirmText="Xác nhận"
                cancelText="Hủy"
                variant="success"
                icon="check"
              />

            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
