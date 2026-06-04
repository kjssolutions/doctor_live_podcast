/** Read duration from a video file in the browser (seconds, rounded). */
export function getVideoDurationFromFile(file: File): Promise<number | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    const finish = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };

    video.onloadedmetadata = () => {
      const seconds = video.duration;
      if (!Number.isFinite(seconds) || seconds <= 0) {
        finish(null);
        return;
      }
      finish(Math.max(1, Math.round(seconds)));
    };

    video.onerror = () => finish(null);
    video.src = url;
  });
}
