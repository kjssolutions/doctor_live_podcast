"use client";

import { useMemo, useState } from "react";

import { ButtonLoadingContent } from "@/components/ui/button-loading";
import {
  formatPostProductionStatus,
  getDisplayPostProductionStatus,
  type PostProductionStatus,
} from "@/lib/post-production";

const statusBadgeStyles: Record<PostProductionStatus, string> = {
  PROCESSING: "bg-amber-50 text-amber-700 ring-amber-200",
  DONE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  SPOTIFY: "bg-sky-50 text-sky-700 ring-sky-200",
};

export function DoctorProductionControls({
  doctorId,
  hasMergedVideo,
  initialStatus,
  initialSpotifyUrl,
  layout = "grid",
}: {
  doctorId: number;
  hasMergedVideo: boolean;
  initialStatus: PostProductionStatus;
  initialSpotifyUrl: string | null;
  layout?: "grid" | "table";
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
    return "Paste Spotify episode link…";
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

  const spotifyField = (
    <div className="flex min-w-[280px] flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 outline-none ring-slate-300 focus:ring-2"
          disabled={!hasMergedVideo || saving || (!editing && saved)}
          onChange={(e) => setSpotifyUrl(e.target.value)}
          placeholder={spotifyPlaceholder}
          value={spotifyUrl}
        />
        {saved && !editing ? (
          <button
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSaveSpotify}
            onClick={() => void saveSpotifyUrl()}
            type="button"
          >
            <ButtonLoadingContent loading={saving} loadingText="Saving…">
              Save
            </ButtonLoadingContent>
          </button>
        )}
      </div>
      {spotifyUrl && saved ? (
        <a
          className="text-xs font-medium text-sky-600 hover:text-sky-700"
          href={spotifyUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open Spotify
        </a>
      ) : null}
    </div>
  );

  const statusField = (
    <div className="flex min-w-[240px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${statusBadgeStyles[status]}`}
        >
          {formatPostProductionStatus(status)}
        </span>
        <select
          className="h-9 min-w-[160px] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none ring-slate-300 focus:ring-2"
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
      </div>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      {saving ? <p className="text-xs text-slate-500">Saving…</p> : null}
      {!hasMergedVideo ? (
        <p className="text-xs text-slate-500">
          Upload merged video first. Then set Done, add Spotify URL, and set Spotify.
        </p>
      ) : hasSpotifyUrl ? (
        <p className="text-xs text-slate-500">
          Spotify URL saved — flyer is generated automatically.
        </p>
      ) : null}
    </div>
  );

  if (layout === "table") {
    return (
      <>
        <td className="min-w-[320px] px-4 py-4 align-top">{spotifyField}</td>
        <td className="min-w-[280px] px-4 py-4 align-top">{statusField}</td>
      </>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Spotify URL
        </p>
        <div className="mt-3">{spotifyField}</div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Post-production
        </p>
        <div className="mt-3">{statusField}</div>
      </div>
    </div>
  );
}
