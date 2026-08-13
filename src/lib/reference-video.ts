/**
 * Shared reference / demo video for the doctor interview link.
 * Production uses Spaces CDN (not bundled in deploy.tar).
 * Local fallback: public/Videos/intas-demo.mp4
 */
const SPACES_REFERENCE_VIDEO =
  "https://scivision.sgp1.cdn.digitaloceanspaces.com/doctor_live_podcast/reference/intas-demo.mp4";

export const REFERENCE_VIDEO_SRC =
  process.env.NEXT_PUBLIC_REFERENCE_VIDEO_URL?.trim() || SPACES_REFERENCE_VIDEO;
