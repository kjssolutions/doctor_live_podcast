"use client";

import { ImagePlus, Trash2, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type DoctorPhotoCropperProps = {
  name?: string;
  required?: boolean;
};

const OUTPUT_SIZE = 640;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/**
 * Simple circular cropper: pick a photo, drag to reframe, zoom, then the
 * cropped square JPEG is submitted as the form file field.
 */
export function DoctorPhotoCropper({
  name = "image",
  required = false,
}: DoctorPhotoCropperProps) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("doctor-photo.jpg");
  const [zoom, setZoom] = useState(1.2);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    };
  }, [sourceUrl]);

  useEffect(() => {
    if (!sourceUrl || !ready || !naturalSize.w) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx || !imageRef.current || !viewportRef.current) return;

      const viewport = viewportRef.current.clientWidth;
      const baseScale =
        Math.max(viewport / naturalSize.w, viewport / naturalSize.h) * zoom;
      const drawW = naturalSize.w * baseScale;
      const drawH = naturalSize.h * baseScale;
      const drawX = (viewport - drawW) / 2 + offset.x;
      const drawY = (viewport - drawH) / 2 + offset.y;

      // Map viewport crop circle → output square.
      const scaleOut = OUTPUT_SIZE / viewport;
      ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(
        imageRef.current,
        drawX * scaleOut,
        drawY * scaleOut,
        drawW * scaleOut,
        drawH * scaleOut,
      );
      ctx.restore();

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (cancelled || !blob || !hiddenInputRef.current) return;

      const file = new File([blob], fileName.replace(/\.\w+$/, "") + ".jpg", {
        type: "image/jpeg",
      });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      hiddenInputRef.current.files = transfer.files;
    })();

    return () => {
      cancelled = true;
    };
  }, [sourceUrl, ready, zoom, offset, naturalSize, fileName]);

  function onPickFile(file: File | undefined) {
    if (!file) return;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setFileName(file.name || "doctor-photo.jpg");
    setSourceUrl(URL.createObjectURL(file));
    setZoom(1.2);
    setOffset({ x: 0, y: 0 });
    setReady(false);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!sourceUrl) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setOffset({
      x: dragStartRef.current.ox + (event.clientX - dragStartRef.current.x),
      y: dragStartRef.current.oy + (event.clientY - dragStartRef.current.y),
    });
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  }

  function clearPhoto() {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(null);
    setReady(false);
    setOffset({ x: 0, y: 0 });
    setZoom(1.2);
    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = "";
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <input
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        id="doctor-photo-picker"
        onChange={(event) => onPickFile(event.target.files?.[0])}
        ref={fileInputRef}
        type="file"
      />

      {/* Cropped file actually submitted with the form */}
      <input
        accept="image/jpeg"
        className="hidden"
        name={name}
        ref={hiddenInputRef}
        required={required}
        type="file"
      />

      {!sourceUrl ? (
        <label
          className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80 px-4 py-10 text-center transition hover:border-[#1a3a32]/35 hover:bg-[#1a3a32]/[0.03] sm:py-12"
          htmlFor="doctor-photo-picker"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#1a3a32] shadow-sm ring-1 ring-slate-200 transition group-hover:scale-105">
            <ImagePlus className="h-6 w-6" />
          </span>
          <p className="mt-4 text-sm font-semibold text-slate-800">
            Upload doctor photo
          </p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
            JPG, PNG, or WebP. Tap to choose a clear face photo, then crop.
          </p>
          <span className="mt-4 inline-flex items-center rounded-xl bg-[#1a3a32] px-4 py-2 text-xs font-semibold text-white shadow-sm">
            Choose photo
          </span>
        </label>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium leading-relaxed text-slate-600 sm:text-sm">
              Drag to center the face, then adjust zoom. The circle is what
              appears on the podcast thumbnail.
            </p>
            <label
              className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              htmlFor="doctor-photo-picker"
            >
              Change photo
            </label>
          </div>

          <div
            className={`relative mx-auto aspect-square w-full max-w-[min(100%,280px)] overflow-hidden rounded-full border-[3px] border-[#1a3a32] bg-slate-200 shadow-[0_0_0_6px_rgba(26,58,50,0.08)] touch-none ${
              dragging ? "cursor-grabbing" : "cursor-grab"
            }`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            ref={viewportRef}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Crop preview"
              className="pointer-events-none absolute max-w-none select-none"
              draggable={false}
              onLoad={(event) => {
                const img = event.currentTarget;
                setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                setReady(true);
              }}
              ref={imageRef}
              src={sourceUrl}
              style={
                ready && viewportRef.current
                  ? (() => {
                      const viewport = viewportRef.current!.clientWidth;
                      const baseScale =
                        Math.max(
                          viewport / naturalSize.w,
                          viewport / naturalSize.h,
                        ) * zoom;
                      const drawW = naturalSize.w * baseScale;
                      const drawH = naturalSize.h * baseScale;
                      return {
                        width: drawW,
                        height: drawH,
                        left: (viewport - drawW) / 2 + offset.x,
                        top: (viewport - drawH) / 2 + offset.y,
                      };
                    })()
                  : { opacity: 0 }
              }
            />
          </div>

          <label className="mt-5 flex items-center gap-3 text-sm text-slate-600">
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <ZoomIn className="h-3.5 w-3.5" />
              Zoom
            </span>
            <input
              className="w-full accent-[#1a3a32]"
              max={MAX_ZOOM}
              min={MIN_ZOOM}
              onChange={(event) => setZoom(Number(event.target.value))}
              step={0.05}
              type="range"
              value={zoom}
            />
          </label>

          <button
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 transition hover:text-rose-700"
            onClick={clearPhoto}
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove photo
          </button>
        </div>
      )}
    </div>
  );
}
