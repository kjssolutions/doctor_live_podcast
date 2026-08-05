export type InterviewStatusValue =
  | "DRAFT"
  | "SENT"
  | "OPENED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "EXPIRED"
  | string;

/** Clear labels for MR / admin interview status column. */
export function formatInterviewStatus(status: InterviewStatusValue | null | undefined) {
  switch ((status ?? "SENT").toUpperCase()) {
    case "DRAFT":
      return "Draft";
    case "SENT":
      return "Link sent";
    case "OPENED":
      return "Link opened";
    case "IN_PROGRESS":
      return "Recording";
    case "COMPLETED":
      return "Completed";
    case "EXPIRED":
      return "Expired";
    default:
      return String(status ?? "Link sent").replaceAll("_", " ");
  }
}

export function interviewStatusBadgeClass(
  status: InterviewStatusValue | null | undefined,
) {
  switch ((status ?? "SENT").toUpperCase()) {
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "IN_PROGRESS":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "OPENED":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "EXPIRED":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "DRAFT":
      return "bg-slate-100 text-slate-600 ring-slate-200";
    case "SENT":
    default:
      return "bg-violet-50 text-violet-700 ring-violet-200";
  }
}
