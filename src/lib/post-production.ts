export type PostProductionStatus = "PROCESSING" | "DONE" | "SPOTIFY";

/** Status label shown to MR / read-only views. */
export function formatPostProductionStatus(status: PostProductionStatus): string {
  if (status === "PROCESSING") return "Processing";
  if (status === "DONE") return "Done";
  return "Spotify";
}

/**
 * Effective status for display: Spotify link always means Spotify on MR dashboard.
 */
export function getDisplayPostProductionStatus(
  status: PostProductionStatus,
  spotifyUrl: string | null | undefined,
): PostProductionStatus {
  if (spotifyUrl?.trim()) return "SPOTIFY";
  if (status === "SPOTIFY") return "DONE";
  return status;
}
