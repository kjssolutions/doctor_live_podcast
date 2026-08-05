"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ButtonLoadingContent } from "@/components/ui/button-loading";

export function EditedVideoUpload({
  doctorId,
  initialUrl = "",
  variant = "default",
}: {
  doctorId: number;
  initialUrl?: string;
  variant?: "default" | "light";
}) {
  const isLight = variant === "light";
  const router = useRouter();
  const hasSavedUrl = Boolean(initialUrl.trim());
  const [editing, setEditing] = useState(!hasSavedUrl);
  const [url, setUrl] = useState(initialUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (isSaving) {
      return;
    }

    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please paste a video URL first.");
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/admin/edited-videos/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId, url: trimmed }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error || `Save failed (${response.status}).`);
      }

      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  if (hasSavedUrl && !editing) {
    return (
      <div className="w-[220px] space-y-1.5">
        <p
          className={`truncate text-[11px] font-medium ${isLight ? "text-slate-700" : "text-slate-200"}`}
          title={initialUrl}
        >
          {initialUrl}
        </p>
        <button
          className={
            isLight
              ? "inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              : "inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-100 hover:bg-white/10"
          }
          onClick={() => {
            setUrl(initialUrl);
            setError(null);
            setEditing(true);
          }}
          type="button"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="w-[240px] space-y-2">
      <input
        className={
          isLight
            ? "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
            : "w-full rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-white/20"
        }
        disabled={isSaving}
        onChange={(event) => setUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
        }}
        placeholder="Paste video URL…"
        type="url"
        value={url}
      />
      <div className="flex flex-wrap gap-1.5">
        <button
          className={
            isLight
              ? "inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              : "inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          }
          disabled={isSaving || !url.trim()}
          onClick={() => void save()}
          type="button"
        >
          <ButtonLoadingContent loading={isSaving} loadingText="Saving…">
            Save
          </ButtonLoadingContent>
        </button>
        {hasSavedUrl ? (
          <button
            className={
              isLight
                ? "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                : "inline-flex items-center justify-center rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-60"
            }
            disabled={isSaving}
            onClick={() => {
              setUrl(initialUrl);
              setError(null);
              setEditing(false);
            }}
            type="button"
          >
            Cancel
          </button>
        ) : null}
      </div>
      {error ? (
        <p className={`text-xs ${isLight ? "text-rose-600" : "text-rose-300"}`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
