export type PostProductionStatus =
  | "CREATED"
  | "PROCESSING"
  | "DONE"
  | "SPOTIFY"
  | "REJECTED";

/** Statuses editable in admin post-production tooling. */
export type AdminEditableStatus = "PROCESSING" | "DONE" | "SPOTIFY";

/** Status label shown to MR / manager / read-only views. */
export function formatPostProductionStatus(status: PostProductionStatus): string {
  if (status === "CREATED") return "Pending";
  if (status === "PROCESSING") return "Processing";
  if (status === "DONE") return "Done";
  if (status === "REJECTED") return "Rejected";
  return "Spotify";
}

/**
 * Effective status for display: Spotify link always means Spotify on dashboards.
 * CREATED (Pending) / REJECTED pass through unchanged.
 */
export function getDisplayPostProductionStatus(
  status: PostProductionStatus,
  spotifyUrl: string | null | undefined,
): PostProductionStatus {
  if (status === "CREATED" || status === "REJECTED") return status;
  if (spotifyUrl?.trim()) return "SPOTIFY";
  if (status === "SPOTIFY") return "DONE";
  return status;
}
