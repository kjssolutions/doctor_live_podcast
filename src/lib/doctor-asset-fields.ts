/** Denormalized doctor/MR fields stored on asset and recording rows for easy DB reading. */
export type DoctorAssetSnapshot = {
  doctorId: number;
  doctorCode: string;
  doctorName: string | null;
  employeeId: string | null;
};

export function doctorAssetSnapshot(doctor: {
  id: number;
  doctorCode: string;
  doctorName: string | null;
  createdByEmployeeId: string | null;
}): DoctorAssetSnapshot {
  return {
    doctorId: doctor.id,
    doctorCode: doctor.doctorCode,
    doctorName: doctor.doctorName,
    employeeId: doctor.createdByEmployeeId,
  };
}
