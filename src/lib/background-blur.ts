/**
 * MediaPipe selfie segmentation + canvas compositing for background blur.
 * Preview and MediaRecorder share this path via canvas.captureStream.
 *
 * iOS Safari notes:
 * - GPU MediaPipe masks are broken → always CPU
 * - Canvas 2D `filter: blur()` is unreliable → CPU box-blur instead
 * - Prefer same-origin WASM under /mediapipe/wasm
 * - Avoid destination-atop/source-in on the capture canvas (Safari bugs)
 */
import {
  FilesetResolver,
  ImageSegmenter,
  type ImageSegmenterResult,
} from "@mediapipe/tasks-vision";

const CDN_WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const SELFIE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

const PERSON_THRESHOLD = 0.45;

export type BackgroundBlurSession = {
  ensureReady: () => Promise<void>;
  isReady: () => boolean;
  dispose: () => void;
  drawPortraitFrame: (options: {
    dest: CanvasRenderingContext2D;
    sourceVideo: HTMLVideoElement;
    destWidth: number;
    destHeight: number;
    blurEnabled: boolean;
  }) => void;
};

/** iPhone / iPad (including desktop-mode iPadOS). */
export function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/** Android phones/tablets (Chrome WebView included). */
export function isAndroidDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}

function wasmRoot() {
  if (typeof window === "undefined") return CDN_WASM_ROOT;
  // Same-origin WASM avoids CDN/CORS flakes on iOS Safari.
  return `${window.location.origin}/mediapipe/wasm`;
}

function coverCropRect(
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
) {
  const scale = Math.max(destWidth / sourceWidth, destHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  return {
    drawWidth,
    drawHeight,
    offsetX: (destWidth - drawWidth) / 2,
    offsetY: (destHeight - drawHeight) / 2,
  };
}

function drawMirroredCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
) {
  const { drawWidth, drawHeight, offsetX, offsetY } = coverCropRect(
    sourceWidth,
    sourceHeight,
    destWidth,
    destHeight,
  );
  ctx.save();
  ctx.translate(destWidth, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(source, offsetX, offsetY, drawWidth, drawHeight);
  ctx.restore();
}

/** Separable box blur — works on iOS where ctx.filter blur does not. */
function boxBlurImageData(imageData: ImageData, radius: number) {
  const r = Math.max(1, Math.floor(radius));
  const { width, height, data } = imageData;
  const tmp = new Uint8ClampedArray(data.length);
  const size = r * 2 + 1;

  // Horizontal
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let kx = -r; kx <= r; kx++) {
        const xx = Math.min(width - 1, Math.max(0, x + kx));
        const i = (y * width + xx) * 4;
        sr += data[i];
        sg += data[i + 1];
        sb += data[i + 2];
        sa += data[i + 3];
      }
      const o = (y * width + x) * 4;
      tmp[o] = sr / size;
      tmp[o + 1] = sg / size;
      tmp[o + 2] = sb / size;
      tmp[o + 3] = sa / size;
    }
  }

  // Vertical
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let ky = -r; ky <= r; ky++) {
        const yy = Math.min(height - 1, Math.max(0, y + ky));
        const i = (yy * width + x) * 4;
        sr += tmp[i];
        sg += tmp[i + 1];
        sb += tmp[i + 2];
        sa += tmp[i + 3];
      }
      const o = (y * width + x) * 4;
      data[o] = sr / size;
      data[o + 1] = sg / size;
      data[o + 2] = sb / size;
      data[o + 3] = sa / size;
    }
  }
}

function createSession(): BackgroundBlurSession {
  const ios = isIosDevice();
  const android = isAndroidDevice();
  // Android Chrome struggles with full-rate MediaPipe + canvas encode.
  const segWidth = ios ? 160 : android ? 192 : 256;
  const workMaxWidth = ios ? 360 : android ? 400 : 540;
  const blurRadius = ios ? 6 : android ? 6 : 8;
  const blurPasses = ios ? 2 : 2;
  const segmentEveryNFrames = ios ? 4 : android ? 3 : 1;

  let segmenter: ImageSegmenter | null = null;
  let initPromise: Promise<void> | null = null;
  let disposed = false;
  let lastTimestamp = -1;
  let invertMask = false;
  let invertChecked = false;
  let frameCounter = 0;

  const sharpCanvas = document.createElement("canvas");
  const workCanvas = document.createElement("canvas");
  const blurCanvas = document.createElement("canvas");
  const personCanvas = document.createElement("canvas");
  const maskCanvas = document.createElement("canvas");
  const segCanvas = document.createElement("canvas");
  const maskSourceCanvas = document.createElement("canvas");

  let lastMask: {
    data: Float32Array;
    width: number;
    height: number;
  } | null = null;

  function ensureCanvasSize(canvas: HTMLCanvasElement, w: number, h: number) {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  async function createSegmenter(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
    delegate: "CPU" | "GPU",
  ) {
    return ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: SELFIE_MODEL,
        delegate,
      },
      runningMode: "VIDEO",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  }

  async function loadVision() {
    try {
      return await FilesetResolver.forVisionTasks(wasmRoot());
    } catch {
      return FilesetResolver.forVisionTasks(CDN_WASM_ROOT);
    }
  }

  async function ensureReady() {
    if (disposed) {
      throw new Error("Background blur session was disposed.");
    }
    if (segmenter) return;
    if (!initPromise) {
      initPromise = (async () => {
        const vision = await loadVision();
        let created: ImageSegmenter;

        if (ios) {
          created = await createSegmenter(vision, "CPU");
        } else {
          try {
            created = await createSegmenter(vision, "GPU");
          } catch {
            created = await createSegmenter(vision, "CPU");
          }
        }

        if (disposed) {
          created.close();
          return;
        }
        segmenter = created;
        invertChecked = false;
        invertMask = false;
        frameCounter = 0;
      })().catch((error) => {
        initPromise = null;
        throw error;
      });
    }
    await initPromise;
  }

  function extractPersonConfidence(result: ImageSegmenterResult): {
    data: Float32Array;
    width: number;
    height: number;
  } | null {
    try {
      const masks = result.confidenceMasks;
      if (!masks || masks.length === 0) return null;

      const copyMask = (mask: (typeof masks)[0]) => {
        const floats = mask.getAsFloat32Array();
        const data = new Float32Array(floats.length);
        data.set(floats);
        return { data, width: mask.width, height: mask.height };
      };

      if (masks.length === 1) {
        return copyMask(masks[0]);
      }

      const a = copyMask(masks[0]);
      const b = copyMask(masks[1]);
      const centerMean = (m: {
        data: Float32Array;
        width: number;
        height: number;
      }) => {
        const x0 = Math.floor(m.width * 0.3);
        const x1 = Math.floor(m.width * 0.7);
        const y0 = Math.floor(m.height * 0.2);
        const y1 = Math.floor(m.height * 0.7);
        let sum = 0;
        let count = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            sum += m.data[y * m.width + x] ?? 0;
            count++;
          }
        }
        return count ? sum / count : 0;
      };

      return centerMean(a) > centerMean(b) + 0.15 ? a : b;
    } finally {
      result.close();
    }
  }

  function maybeDetectInvert(mask: {
    data: Float32Array;
    width: number;
    height: number;
  }) {
    if (invertChecked) return;
    invertChecked = true;
    let sum = 0;
    for (let i = 0; i < mask.data.length; i++) sum += mask.data[i];
    if (sum / mask.data.length < 0.15) {
      invertMask = true;
    }
  }

  function personAlphaAt(mask: Float32Array, index: number) {
    const raw = mask[index] ?? 0;
    const value = invertMask ? 1 - raw : raw;
    return value >= PERSON_THRESHOLD ? 1 : 0;
  }

  function updateMaskFromWork(workW: number, workH: number) {
    if (!segmenter) return;

    frameCounter += 1;
    if (lastMask && frameCounter % segmentEveryNFrames !== 0) {
      return;
    }

    const segHeight = Math.max(1, Math.round((segWidth * workH) / workW));
    ensureCanvasSize(segCanvas, segWidth, segHeight);
    const segCtx = segCanvas.getContext("2d", { willReadFrequently: true });
    if (!segCtx) return;

    segCtx.clearRect(0, 0, segWidth, segHeight);
    segCtx.drawImage(workCanvas, 0, 0, segWidth, segHeight);

    let timestamp = performance.now();
    if (timestamp <= lastTimestamp) timestamp = lastTimestamp + 1;
    lastTimestamp = timestamp;

    try {
      const result = segmenter.segmentForVideo(segCanvas, timestamp);
      const mask = extractPersonConfidence(result);
      if (!mask) return;
      maybeDetectInvert(mask);
      lastMask = mask;
    } catch {
      // Keep previous mask.
    }
  }

  function paintPersonMask(destW: number, destH: number) {
    if (!lastMask) return false;

    const { data, width: mw, height: mh } = lastMask;
    ensureCanvasSize(maskSourceCanvas, mw, mh);
    const tmpCtx = maskSourceCanvas.getContext("2d");
    if (!tmpCtx) return false;

    const imageData = tmpCtx.createImageData(mw, mh);
    const pixels = imageData.data;
    for (let i = 0; i < data.length; i++) {
      const a = personAlphaAt(data, i) * 255;
      const o = i * 4;
      pixels[o] = 255;
      pixels[o + 1] = 255;
      pixels[o + 2] = 255;
      pixels[o + 3] = a;
    }
    tmpCtx.putImageData(imageData, 0, 0);

    ensureCanvasSize(maskCanvas, destW, destH);
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return false;
    maskCtx.clearRect(0, 0, destW, destH);
    maskCtx.imageSmoothingEnabled = true;
    maskCtx.drawImage(maskSourceCanvas, 0, 0, destW, destH);
    return true;
  }

  /** CPU blur path used on iOS (and as fallback everywhere). */
  function makeBlurredBackground(workW: number, workH: number) {
    ensureCanvasSize(blurCanvas, workW, workH);
    const blurCtx = blurCanvas.getContext("2d", { willReadFrequently: true });
    if (!blurCtx) return false;

    blurCtx.clearRect(0, 0, workW, workH);
    blurCtx.drawImage(workCanvas, 0, 0);

    if (!ios) {
      // Desktop/Android: fast canvas filter when available.
      blurCtx.filter = `blur(${blurRadius * 2}px)`;
      blurCtx.drawImage(workCanvas, 0, 0);
      blurCtx.filter = "none";
      return true;
    }

    // iOS: Safari often ignores ctx.filter — blur pixels manually.
    const imageData = blurCtx.getImageData(0, 0, workW, workH);
    for (let p = 0; p < blurPasses; p++) {
      boxBlurImageData(imageData, blurRadius);
    }
    blurCtx.putImageData(imageData, 0, 0);
    return true;
  }

  function drawPortraitFrame(options: {
    dest: CanvasRenderingContext2D;
    sourceVideo: HTMLVideoElement;
    destWidth: number;
    destHeight: number;
    blurEnabled: boolean;
  }) {
    const { dest, sourceVideo, destWidth, destHeight, blurEnabled } = options;
    const sourceWidth = sourceVideo.videoWidth || 1280;
    const sourceHeight = sourceVideo.videoHeight || 720;

    ensureCanvasSize(sharpCanvas, destWidth, destHeight);
    const sharpCtx = sharpCanvas.getContext("2d");
    if (!sharpCtx) return;

    sharpCtx.clearRect(0, 0, destWidth, destHeight);
    drawMirroredCover(
      sharpCtx,
      sourceVideo,
      sourceWidth,
      sourceHeight,
      destWidth,
      destHeight,
    );

    if (!blurEnabled || !segmenter) {
      dest.save();
      dest.setTransform(1, 0, 0, 1, 0, 0);
      dest.globalCompositeOperation = "source-over";
      dest.filter = "none";
      dest.globalAlpha = 1;
      dest.clearRect(0, 0, destWidth, destHeight);
      dest.drawImage(sharpCanvas, 0, 0);
      dest.restore();
      return;
    }

    // Work at a smaller size on iOS for CPU blur + segmentation.
    const scale = Math.min(1, workMaxWidth / destWidth);
    const workW = Math.max(1, Math.round(destWidth * scale));
    const workH = Math.max(1, Math.round(destHeight * scale));
    ensureCanvasSize(workCanvas, workW, workH);
    const workCtx = workCanvas.getContext("2d");
    if (!workCtx) return;
    workCtx.clearRect(0, 0, workW, workH);
    workCtx.drawImage(sharpCanvas, 0, 0, workW, workH);

    updateMaskFromWork(workW, workH);
    const hasMask = paintPersonMask(workW, workH);
    if (!hasMask || !lastMask || !makeBlurredBackground(workW, workH)) {
      dest.save();
      dest.globalCompositeOperation = "source-over";
      dest.filter = "none";
      dest.clearRect(0, 0, destWidth, destHeight);
      dest.drawImage(sharpCanvas, 0, 0);
      dest.restore();
      return;
    }

    // Safari-safe composite: blurred BG, then sharp person with alpha mask.
    // Do NOT use source-in / destination-atop on the capture canvas.
    ensureCanvasSize(personCanvas, workW, workH);
    const personCtx = personCanvas.getContext("2d");
    if (!personCtx) return;
    personCtx.clearRect(0, 0, workW, workH);
    personCtx.globalCompositeOperation = "source-over";
    personCtx.drawImage(workCanvas, 0, 0);
    personCtx.globalCompositeOperation = "destination-in";
    personCtx.drawImage(maskCanvas, 0, 0);
    personCtx.globalCompositeOperation = "source-over";

    dest.save();
    dest.setTransform(1, 0, 0, 1, 0, 0);
    dest.globalCompositeOperation = "source-over";
    dest.filter = "none";
    dest.globalAlpha = 1;
    dest.clearRect(0, 0, destWidth, destHeight);
    dest.drawImage(blurCanvas, 0, 0, destWidth, destHeight);
    dest.drawImage(personCanvas, 0, 0, destWidth, destHeight);
    dest.restore();
  }

  return {
    ensureReady,
    isReady: () => segmenter !== null && !disposed,
    dispose: () => {
      disposed = true;
      segmenter?.close();
      segmenter = null;
      initPromise = null;
      lastMask = null;
      invertChecked = false;
      invertMask = false;
      frameCounter = 0;
    },
    drawPortraitFrame,
  };
}

let sharedSession: BackgroundBlurSession | null = null;

export function getBackgroundBlurSession(): BackgroundBlurSession {
  if (!sharedSession) {
    sharedSession = createSession();
  }
  return sharedSession;
}

export function disposeBackgroundBlurSession() {
  sharedSession?.dispose();
  sharedSession = null;
}
