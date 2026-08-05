export type AppRole =
  | "ADMIN"
  | "SALES"
  | "1LMANAGER"
  | "2LMANAGER"
  | "3LMANAGER";

/** Normalize Employee.role / designation into an app role. */
export function normalizeAppRole(
  role?: string | null,
  designation?: string | null,
): AppRole {
  const des = (designation ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (des === "ADMIN") return "ADMIN";

  const raw = (role ?? designation ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (raw === "ADMIN") return "ADMIN";
  if (raw === "3LMANAGER" || raw === "3LM" || raw.startsWith("3L")) {
    return "3LMANAGER";
  }
  if (raw === "2LMANAGER" || raw === "2LM" || raw.startsWith("2L")) {
    return "2LMANAGER";
  }
  if (raw === "1LMANAGER" || raw === "1LM" || raw.startsWith("1L")) {
    return "1LMANAGER";
  }
  if (raw === "SALES" || raw === "MR") return "SALES";

  return "SALES";
}

export function getAppRole(role: string | undefined | null): AppRole {
  if (role === "ADMIN") return "ADMIN";
  if (role === "SALES" || role === "MR") return "SALES";
  if (role === "1LMANAGER") return "1LMANAGER";
  if (role === "2LMANAGER") return "2LMANAGER";
  if (role === "3LMANAGER") return "3LMANAGER";
  return normalizeAppRole(role);
}

export function roleLabel(role: AppRole): string {
  if (role === "ADMIN") return "Admin";
  if (role === "1LMANAGER") return "1L Manager";
  if (role === "2LMANAGER") return "2L Manager";
  if (role === "3LMANAGER") return "3L Manager";
  return "Sales";
}
