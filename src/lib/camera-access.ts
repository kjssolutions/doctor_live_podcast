/** Why getUserMedia may be missing (common on mobile Chrome over http:// LAN). */
export function describeCameraBlocker(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const mediaDevices = navigator.mediaDevices;
  if (mediaDevices && typeof mediaDevices.getUserMedia === "function") {
    return null;
  }

  if (!window.isSecureContext) {
    return (
      "Camera is blocked on http:// (Chrome is OK). " +
      "Easiest: keep npm run dev, then in a second PC terminal run npm run dev:tunnel " +
      "and open the https tunnel URL on your phone. " +
      "Or stop dev and run npm run dev:https:lan, then open the https:// Wi-Fi link."
    );
  }

  return (
    "This browser does not expose the camera API here. " +
    "Update Chrome, or try Safari on iOS."
  );
}
