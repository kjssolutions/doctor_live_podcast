"use client";

import { useMemo, useState } from "react";

export function DoctorSpotifyUrlControls({
  doctorId,
  hasMergedVideo,
  initialSpotifyUrl,
}: {
  doctorId: number;
  hasMergedVideo: boolean;
  initialSpotifyUrl: string | null;
}) {
  const [value, setValue] = useState(initialSpotifyUrl ?? "");
  const [saved, setSaved] = useState(Boolean(initialSpotifyUrl));
  const [editing, setEditing] = useState(!initialSpotifyUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeholder = useMemo(() => {
    if (!hasMergedVideo) return "Upload merged video first.";
    return "Paste Spotify episode link here…";
  }, [hasMergedVideo]);

  const canSubmit = hasMergedVideo && value.trim().length > 0 && !saving;

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/doctors/post-production", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId,
          spotifyUrl: value,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to save");
      }
      setValue(json.spotifyUrl ?? "");
      setSaved(Boolean(json.spotifyUrl));
      setEditing(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-w-[320px] flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          className="h-9 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-slate-100 placeholder:text-slate-600"
          disabled={!hasMergedVideo || saving || (!editing && saved)}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          value={value}
        />

        {saved && !editing ? (
          <button
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10"
            disabled={saving}
            onClick={() => {
              setEditing(true);
              setError(null);
            }}
            type="button"
          >
            Edit
          </button>
        ) : (
          <button
            className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSubmit}
            onClick={() => void submit()}
            type="button"
          >
            Done
          </button>
        )}
      </div>

      {value && saved ? (
        <a
          className="text-xs font-semibold text-cyan-300 hover:text-cyan-200"
          href={value}
          rel="noreferrer"
          target="_blank"
        >
          Open Spotify
        </a>
      ) : null}

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      {saving ? <p className="text-xs text-slate-500">Saving…</p> : null}
    </div>
  );
}

