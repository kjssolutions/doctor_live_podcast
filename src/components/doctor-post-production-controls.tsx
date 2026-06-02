"use client";

import { useState } from "react";

type Status = "PROCESSING" | "DONE" | "SPOTIFY";

export function DoctorPostProductionControls({
  doctorId,
  hasMergedVideo,
  initialStatus,
}: {
  doctorId: number;
  hasMergedVideo: boolean;
  initialStatus: Status;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: { status?: Status }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/doctors/post-production", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId,
          status: next.status ?? status,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to save");
      }
      setStatus(json.postProductionStatus as Status);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-w-[260px] flex-col gap-2">
      <div className="flex items-center gap-2">
        <select
          className="h-9 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-slate-100"
          disabled={saving}
          onChange={(e) => {
            const next = e.target.value as Status;
            setStatus(next);
            void save({ status: next });
          }}
          value={status}
        >
          <option value="PROCESSING">Processing</option>
          <option disabled={!hasMergedVideo} value="DONE">
            Done{!hasMergedVideo ? " (upload merged video first)" : ""}
          </option>
          <option disabled={!hasMergedVideo} value="SPOTIFY">
            Spotify{!hasMergedVideo ? " (upload merged video first)" : ""}
          </option>
        </select>
      </div>

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      {saving ? <p className="text-xs text-slate-500">Saving…</p> : null}
      {!hasMergedVideo ? (
        <p className="text-xs text-slate-500">
          Upload merged video first. After that you can set Done/Spotify.
        </p>
      ) : null}
    </div>
  );
}

