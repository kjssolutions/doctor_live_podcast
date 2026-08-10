import type { Prisma } from "@/generated/prisma/client";
import { getAppRole, type AppRole } from "@/lib/roles";

export type SessionUser = {
  id: string;
  role: string;
};

export function sessionAppRole(user: SessionUser): AppRole {
  return getAppRole(user.role);
}

/** Only MR (Sales) can create doctors — not managers or admin. */
export function canCreateDoctor(user: SessionUser): boolean {
  return sessionAppRole(user) === "SALES";
}

export function canAccessAdmin(user: SessionUser): boolean {
  return sessionAppRole(user) === "ADMIN";
}

export function canViewAnswers(user: SessionUser): boolean {
  const role = sessionAppRole(user);
  return role === "2LMANAGER" || role === "3LMANAGER" || role === "ADMIN";
}

/** Prisma where clause for doctors visible to this user. */
export function doctorListWhere(user: SessionUser): Prisma.DoctorWhereInput {
  const role = sessionAppRole(user);

  switch (role) {
    case "ADMIN":
      return {};
    case "SALES":
      return { createdByEmployeeId: user.id };
    case "1LMANAGER":
      return { createdBy: { is: { l1ManagerId: user.id } } };
    case "2LMANAGER":
      return { createdBy: { is: { l2ManagerId: user.id } } };
    case "3LMANAGER":
      return { createdBy: { is: { l3ManagerId: user.id } } };
    default:
      return { createdByEmployeeId: user.id };
  }
}

/** Doctors ready for admin post-production (after all recordings). */
export function approvedForAdminWhere(): Prisma.DoctorWhereInput {
  return {
    postProductionStatus: { in: ["PROCESSING", "DONE", "SPOTIFY"] },
  };
}

export function doctorByIdWhere(
  user: SessionUser,
  doctorId: number,
): Prisma.DoctorWhereInput {
  return {
    id: doctorId,
    ...doctorListWhere(user),
  };
}
