"use client";

import { useMemo, useState } from "react";

import {
  getDisplayPostProductionStatus,
  type PostProductionStatus,
} from "@/lib/post-production";

export function DoctorProductionCells({
  doctorId,
  hasMergedVideo,
  initialStatus,
  initialSpotifyUrl,
}: {
  doctorId: number;
  hasMergedVideo: boolean;
  initialStatus: PostProductionStatus;
  initialSpotifyUrl: string | null;
}) {
  const [status, setStatus] = useState<PostProductionStatus>(() =>
    getDisplayPostProductionStatus(initialStatus, initialSpotifyUrl),
  );
  const [spotifyUrl, setSpotifyUrl] = useState(initialSpotifyUrl ?? "");
  const [saved, setSaved] = useState(Boolean(initialSpotifyUrl));
  const [editing, setEditing] = useState(!initialSpotifyUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSpotifyUrl = Boolean(spotifyUrl.trim());

  const spotifyPlaceholder = useMemo(() => {
    if (!hasMergedVideo) return "Upload merged video first.";
    return "Paste Spotify episode link here…";
  }, [hasMergedVideo]);

  const canSaveSpotify =
    hasMergedVideo &&
    !saving &&
    (spotifyUrl.trim().length > 0 || (editing && saved));

  async function patch(body: {
    status?: PostProductionStatus;
    spotifyUrl?: string;
  }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/doctors/post-production", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to save");
      }
      setStatus(json.postProductionStatus as PostProductionStatus);
      setSpotifyUrl(json.spotifyUrl ?? "");
      setSaved(Boolean(json.spotifyUrl));
      return json;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save";
      setError(message);
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function saveSpotifyUrl() {
    try {
      await patch({ spotifyUrl });
      setEditing(false);
    } catch {
      // error shown below
    }
  }

  async function saveStatus(next: PostProductionStatus) {
    if (hasSpotifyUrl && (next === "DONE" || next === "PROCESSING")) {
      setError(
        "Remove the Spotify URL first (Edit → clear → Done). Workflow: Processing → Done → Spotify.",
      );
      return;
    }
    const previous = status;
    setStatus(next);
    try {
      await patch({ status: next });
    } catch {
      setStatus(previous);
    }
  }

  return (
    <>
      {/* Spotify URL column */}
      <td className="min-w-[360px]">
        <div className="flex min-w-[320px] flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              className="h-9 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-slate-100 placeholder:text-slate-600"
              disabled={!hasMergedVideo || saving || (!editing && saved)}
              onChange={(e) => setSpotifyUrl(e.target.value)}
              placeholder={spotifyPlaceholder}
              value={spotifyUrl}
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
                disabled={!canSaveSpotify}
                onClick={() => void saveSpotifyUrl()}
                type="button"
              >
                Done
              </button>
            )}
          </div>

          {spotifyUrl && saved ? (
            <a
              className="text-xs font-semibold text-cyan-300 hover:text-cyan-200"
              href={spotifyUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open Spotify
            </a>
          ) : null}
        </div>
      </td>

      {/* Post-production status column */}
      <td className="min-w-[300px]">
        <div className="flex min-w-[260px] flex-col gap-2">
          <select
            className="h-9 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-slate-100"
            disabled={saving}
            onChange={(e) => {
              const next = e.target.value as PostProductionStatus;
              void saveStatus(next);
            }}
            value={status}
          >
            <option disabled={hasSpotifyUrl} value="PROCESSING">
              Processing{hasSpotifyUrl ? " (remove Spotify URL first)" : ""}
            </option>
            <option disabled={!hasMergedVideo || hasSpotifyUrl} value="DONE">
              Done
              {!hasMergedVideo
                ? " (upload merged video first)"
                : hasSpotifyUrl
                  ? " (remove Spotify URL first)"
                  : ""}
            </option>
            <option disabled={!hasMergedVideo || !hasSpotifyUrl} value="SPOTIFY">
              Spotify
              {!hasMergedVideo
                ? " (upload merged video first)"
                : !hasSpotifyUrl
                  ? " (add Spotify URL first)"
                  : ""}
            </option>
          </select>

          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          {saving ? <p className="text-xs text-slate-500">Saving…</p> : null}
          {!hasMergedVideo ? (
            <p className="text-xs text-slate-500">
              Upload merged video first. Then set Done, add Spotify URL, and set Spotify.
            </p>
          ) : hasSpotifyUrl ? (
            <p className="text-xs text-slate-500">
              Spotify URL saved — only Spotify is allowed until you remove the link
              (Processing → Done → Spotify).
            </p>
          ) : null}
        </div>
      </td>
    </>
  );
}
