import type { SessionUser } from "@/lib/doctor-access";

/**
 * Product requirement: `/admin` opens without login.
 * Treat anonymous admin traffic as the system ADMIN user.
 */
export const ADMIN_OPEN_WITHOUT_LOGIN = true;

export const OPEN_ADMIN_USER: SessionUser = {
  id: "ADMIN",
  role: "ADMIN",
};

export function resolveAdminUser(
  sessionUser: SessionUser | null | undefined,
): SessionUser | null {
  if (sessionUser) return sessionUser;
  if (ADMIN_OPEN_WITHOUT_LOGIN) return OPEN_ADMIN_USER;
  return null;
}
