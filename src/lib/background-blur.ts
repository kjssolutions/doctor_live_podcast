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
const LOCAL_SELFIE_MODEL = "/models/selfie_segmenter.tflite";
const CDN_SELFIE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

// Soft edge: confidence below LOW is background, above HIGH is person, smooth ramp between.
const EDGE_LOW = 0.3;
const EDGE_HIGH = 0.7;
const MASK_FEATHER_RADIUS = 1;
// How much of the previous mask to keep; lower when a pixel changes a lot (movement).
const MASK_KEEP_STILL = 0.55;
const MASK_KEEP_MOVING = 0.15;
const CPU_BLUR_DOWNSCALE = 6;
const CPU_BLUR_RADIUS = 2;

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

/** Desktop Safari and some WebViews ignore ctx.filter, which would leave the background sharp. */
function supportsCanvasFilter() {
  if (typeof document === "undefined") return false;
  if (!("filter" in CanvasRenderingContext2D.prototype)) return false;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 3;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 3, 1);
    ctx.fillStyle = "#fff";
    ctx.fillRect(1, 0, 1, 1);
    const probe = document.createElement("canvas");
    probe.width = 3;
    probe.height = 1;
    const probeCtx = probe.getContext("2d", { willReadFrequently: true });
    if (!probeCtx) return false;
    probeCtx.filter = "blur(1px)";
    probeCtx.drawImage(canvas, 0, 0);
    // A working blur spreads the white centre pixel into its black neighbour.
    return probeCtx.getImageData(0, 0, 1, 1).data[0] > 0;
  } catch {
    return false;
  }
}

function localWasmRoot() {
  // Same-origin WASM avoids CDN/CORS flakes on iOS Safari.
  return `${window.location.origin}/mediapipe/wasm`;
}

/** FilesetResolver never fetches, so a missing file only surfaces later — probe first. */
async function isReachable(url: string) {
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveAssetSources() {
  const [localWasmOk, localModelOk] = await Promise.all([
    isReachable(`${localWasmRoot()}/vision_wasm_internal.wasm`),
    isReachable(LOCAL_SELFIE_MODEL),
  ]);

  const sources: { wasmRoot: string; model: string }[] = [
    {
      wasmRoot: localWasmOk ? localWasmRoot() : CDN_WASM_ROOT,
      model: localModelOk ? LOCAL_SELFIE_MODEL : CDN_SELFIE_MODEL,
    },
  ];
  if (localWasmOk || localModelOk) {
    sources.push({ wasmRoot: CDN_WASM_ROOT, model: CDN_SELFIE_MODEL });
  }
  return sources;
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

/** Single-channel separable box blur (running sums) used to feather the mask edge. */
function featherMask(
  values: Float32Array,
  tmp: Float32Array,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.max(1, Math.floor(radius));
  const size = r * 2 + 1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let k = -r; k <= r; k++) {
      sum += values[row + Math.min(width - 1, Math.max(0, k))];
    }
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / size;
      const out = Math.max(0, x - r);
      const inn = Math.min(width - 1, x + r + 1);
      sum += values[row + inn] - values[row + out];
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) {
      sum += tmp[Math.min(height - 1, Math.max(0, k)) * width + x];
    }
    for (let y = 0; y < height; y++) {
      values[y * width + x] = sum / size;
      const out = Math.max(0, y - r);
      const inn = Math.min(height - 1, y + r + 1);
      sum += tmp[inn * width + x] - tmp[out * width + x];
    }
  }
}

function createSession(): BackgroundBlurSession {
  const ios = isIosDevice();
  const android = isAndroidDevice();
  // The selfie model always runs at 256px, so a smaller input only loses edge detail.
  const segWidth = 256;
  // Background-only work size (it gets blurred anyway); the person is composited at full size.
  const workMaxWidth = ios ? 360 : android ? 400 : 540;
  const blurRadius = ios ? 6 : android ? 6 : 8;
  const blurPasses = 2;
  // Android Chrome struggles with full-rate MediaPipe + canvas encode.
  const segmentEveryNFrames = ios ? 3 : android ? 2 : 1;
  const useCanvasFilter = !ios && supportsCanvasFilter();

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
  const segCanvas = document.createElement("canvas");
  const maskSourceCanvas = document.createElement("canvas");
  const smallBlurCanvas = document.createElement("canvas");

  /** Person probability (already oriented), smoothed over time. */
  let smoothMask: {
    data: Float32Array;
    width: number;
    height: number;
  } | null = null;
  let maskImageDirty = false;
  let alphaBuffer = new Float32Array(0);
  let featherBuffer = new Float32Array(0);
  let maskImageData: ImageData | null = null;

  function ensureCanvasSize(canvas: HTMLCanvasElement, w: number, h: number) {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  async function createSegmenter(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
    model: string,
    delegate: "CPU" | "GPU",
  ) {
    return ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: model,
        delegate,
      },
      runningMode: "VIDEO",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  }

  async function createFromSource(source: { wasmRoot: string; model: string }) {
    const vision = await FilesetResolver.forVisionTasks(source.wasmRoot);
    // iOS GPU masks are broken; Android/desktop GPU can fail on some drivers.
    if (ios) {
      return createSegmenter(vision, source.model, "CPU");
    }
    try {
      return await createSegmenter(vision, source.model, "GPU");
    } catch {
      return createSegmenter(vision, source.model, "CPU");
    }
  }

  async function ensureReady() {
    if (disposed) {
      throw new Error("Background blur session was disposed.");
    }
    if (segmenter) return;
    if (!initPromise) {
      initPromise = (async () => {
        const sources = await resolveAssetSources();
        let created: ImageSegmenter | null = null;
        let lastError: unknown = null;
        for (const source of sources) {
          try {
            created = await createFromSource(source);
            break;
          } catch (error) {
            lastError = error;
          }
        }
        if (!created) {
          throw lastError ?? new Error("Background blur could not load.");
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
    // The doctor sits in the middle of the portrait frame; the top corners are background.
    // Only decide once the frame clearly shows that (a black first frame is ambiguous).
    const { data, width, height } = mask;
    const regionMean = (x0: number, x1: number, y0: number, y1: number) => {
      let sum = 0;
      let count = 0;
      for (let y = Math.floor(y0); y < Math.floor(y1); y++) {
        for (let x = Math.floor(x0); x < Math.floor(x1); x++) {
          sum += data[y * width + x] ?? 0;
          count++;
        }
      }
      return count ? sum / count : 0;
    };
    const center = regionMean(width * 0.35, width * 0.65, height * 0.3, height * 0.7);
    const corners =
      (regionMean(0, width * 0.15, 0, height * 0.15) +
        regionMean(width * 0.85, width, 0, height * 0.15)) /
      2;
    if (Math.abs(center - corners) < 0.3) return;
    invertChecked = true;
    invertMask = center < corners;
  }

  function blendIntoSmoothMask(mask: {
    data: Float32Array;
    width: number;
    height: number;
  }) {
    const { data, width, height } = mask;

    if (
      !smoothMask ||
      smoothMask.width !== width ||
      smoothMask.height !== height
    ) {
      const oriented = new Float32Array(data.length);
      for (let i = 0; i < data.length; i++) {
        oriented[i] = invertMask ? 1 - data[i] : data[i];
      }
      smoothMask = { data: oriented, width, height };
      maskImageDirty = true;
      return;
    }

    const prev = smoothMask.data;
    for (let i = 0; i < prev.length; i++) {
      const next = invertMask ? 1 - data[i] : data[i];
      const keep = Math.abs(next - prev[i]) > 0.5 ? MASK_KEEP_MOVING : MASK_KEEP_STILL;
      prev[i] = prev[i] * keep + next * (1 - keep);
    }
    maskImageDirty = true;
  }

  function updateMaskFromWork(workW: number, workH: number) {
    if (!segmenter) return;

    frameCounter += 1;
    if (smoothMask && frameCounter % segmentEveryNFrames !== 0) {
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
      blendIntoSmoothMask(mask);
    } catch {
      // Keep previous mask.
    }
  }

  /** Rebuilds the small alpha mask image only when a new segmentation arrived. */
  function paintPersonMask() {
    if (!smoothMask) return false;
    if (!maskImageDirty) return true;

    const { data, width: mw, height: mh } = smoothMask;
    ensureCanvasSize(maskSourceCanvas, mw, mh);
    const tmpCtx = maskSourceCanvas.getContext("2d");
    if (!tmpCtx) return false;

    if (alphaBuffer.length !== data.length) {
      alphaBuffer = new Float32Array(data.length);
      featherBuffer = new Float32Array(data.length);
    }
    const alpha = alphaBuffer;
    const span = EDGE_HIGH - EDGE_LOW;
    for (let i = 0; i < data.length; i++) {
      const t = Math.min(1, Math.max(0, (data[i] - EDGE_LOW) / span));
      alpha[i] = t * t * (3 - 2 * t);
    }
    featherMask(alpha, featherBuffer, mw, mh, MASK_FEATHER_RADIUS);

    if (
      !maskImageData ||
      maskImageData.width !== mw ||
      maskImageData.height !== mh
    ) {
      maskImageData = tmpCtx.createImageData(mw, mh);
      maskImageData.data.fill(255);
    }
    const pixels = maskImageData.data;
    for (let i = 0; i < alpha.length; i++) {
      pixels[i * 4 + 3] = alpha[i] * 255;
    }
    tmpCtx.putImageData(maskImageData, 0, 0);
    maskImageDirty = false;
    return true;
  }

  /** CPU blur path used on iOS (and as fallback everywhere). */
  function makeBlurredBackground(workW: number, workH: number) {
    ensureCanvasSize(blurCanvas, workW, workH);
    const blurCtx = blurCanvas.getContext("2d", { willReadFrequently: true });
    if (!blurCtx) return false;

    blurCtx.clearRect(0, 0, workW, workH);
    blurCtx.drawImage(workCanvas, 0, 0);

    if (useCanvasFilter) {
      blurCtx.filter = `blur(${blurRadius * 2}px)`;
      blurCtx.drawImage(workCanvas, 0, 0);
      blurCtx.filter = "none";
      return true;
    }

    // iOS / desktop Safari: ctx.filter is ignored — blur a downscaled copy on the
    // CPU, then scale it back up (cheap enough for phones, and a stronger blur).
    const smallW = Math.max(1, Math.round(workW / CPU_BLUR_DOWNSCALE));
    const smallH = Math.max(1, Math.round(workH / CPU_BLUR_DOWNSCALE));
    ensureCanvasSize(smallBlurCanvas, smallW, smallH);
    const smallCtx = smallBlurCanvas.getContext("2d", { willReadFrequently: true });
    if (!smallCtx) return false;
    smallCtx.imageSmoothingEnabled = true;
    smallCtx.drawImage(workCanvas, 0, 0, smallW, smallH);
    const imageData = smallCtx.getImageData(0, 0, smallW, smallH);
    for (let p = 0; p < blurPasses; p++) {
      boxBlurImageData(imageData, CPU_BLUR_RADIUS);
    }
    smallCtx.putImageData(imageData, 0, 0);

    blurCtx.imageSmoothingEnabled = true;
    blurCtx.imageSmoothingQuality = "high";
    blurCtx.clearRect(0, 0, workW, workH);
    blurCtx.drawImage(smallBlurCanvas, 0, 0, workW, workH);
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
    const hasMask = paintPersonMask();
    if (!hasMask || !makeBlurredBackground(workW, workH)) {
      dest.save();
      dest.globalCompositeOperation = "source-over";
      dest.filter = "none";
      dest.clearRect(0, 0, destWidth, destHeight);
      dest.drawImage(sharpCanvas, 0, 0);
      dest.restore();
      return;
    }

    // Safari-safe composite: blurred BG, then the full-resolution sharp person with a
    // smoothly upscaled alpha mask. Do NOT use source-in / destination-atop on the capture canvas.
    ensureCanvasSize(personCanvas, destWidth, destHeight);
    const personCtx = personCanvas.getContext("2d");
    if (!personCtx) return;
    personCtx.clearRect(0, 0, destWidth, destHeight);
    personCtx.globalCompositeOperation = "source-over";
    personCtx.drawImage(sharpCanvas, 0, 0);
    personCtx.globalCompositeOperation = "destination-in";
    personCtx.imageSmoothingEnabled = true;
    personCtx.imageSmoothingQuality = "high";
    personCtx.drawImage(maskSourceCanvas, 0, 0, destWidth, destHeight);
    personCtx.globalCompositeOperation = "source-over";

    dest.save();
    dest.setTransform(1, 0, 0, 1, 0, 0);
    dest.globalCompositeOperation = "source-over";
    dest.filter = "none";
    dest.globalAlpha = 1;
    dest.clearRect(0, 0, destWidth, destHeight);
    dest.imageSmoothingEnabled = true;
    dest.drawImage(blurCanvas, 0, 0, destWidth, destHeight);
    dest.drawImage(personCanvas, 0, 0);
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
      smoothMask = null;
      maskImageDirty = false;
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
