"use client";

import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Filter,
  Search,
  User,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { DownloadFlyerButton } from "@/components/download-flyer-button";
import { ButtonSpinner } from "@/components/ui/button-loading";
import { formatPostProductionStatus } from "@/lib/post-production";

export type DashboardDoctorRow = {
  id: number;
  name: string;
  specialty: string | null;
  imageUrl: string | null;
  area: string | null;
  doctorCode: string;
  recordingUrl: string;
  displayStatus: "PROCESSING" | "DONE" | "SPOTIFY";
  spotifyUrl: string | null;
  interviewCompleted: boolean;
  flyerReady: boolean;
  editedVideoLabel: string | null;
};

const PAGE_SIZE = 5;

type StatusFilter = "ALL" | DashboardDoctorRow["displayStatus"];
type InterviewFilter = "ALL" | "COMPLETED" | "IN_PROGRESS";
type AssetsFilter = "ALL" | "READY" | "PENDING";

const statusBadgeStyles: Record<DashboardDoctorRow["displayStatus"], string> = {
  PROCESSING: "bg-amber-50 text-amber-700 ring-amber-200",
  DONE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  SPOTIFY: "bg-sky-50 text-sky-700 ring-sky-200",
};

function shortAssetLabel(label: string, maxLength = 22) {
  if (label.length <= maxLength) {
    return label;
  }
  const ext = label.includes(".") ? label.slice(label.lastIndexOf(".")) : "";
  const base = ext ? label.slice(0, label.length - ext.length) : label;
  const keep = Math.max(8, maxLength - ext.length - 1);
  return `${base.slice(0, keep)}…${ext}`;
}

function FinalAssetsCell({
  doctor,
  compact = false,
}: {
  doctor: DashboardDoctorRow;
  compact?: boolean;
}) {
  if (doctor.editedVideoLabel) {
    return (
      <div className={`min-w-0 space-y-1 ${compact ? "max-w-full" : "max-w-[9rem] sm:max-w-[11rem] lg:max-w-[14rem]"}`}>
        <p
          className="inline-flex min-w-0 items-center gap-1.5 text-sm text-slate-700"
          title={doctor.editedVideoLabel}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span className="truncate">
            {compact
              ? shortAssetLabel(doctor.editedVideoLabel, 28)
              : shortAssetLabel(doctor.editedVideoLabel)}
          </span>
        </p>
        {doctor.spotifyUrl ? (
          <a
            className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-700"
            href={doctor.spotifyUrl}
            rel="noreferrer"
            target="_blank"
          >
            Spotify
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : null}
      </div>
    );
  }

  if (doctor.flyerReady) {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-slate-700">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        Flyer ready
      </p>
    );
  }

  return <p className="text-sm text-slate-400 italic">Pending upload</p>;
}

function shortUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/+/, "");
    const host = parsed.host.replace(/^www\./, "");
    const combined = `${host}/${path}`;
    return combined.length > 28 ? `${combined.slice(0, 25)}...` : combined;
  } catch {
    return url.length > 28 ? `${url.slice(0, 25)}...` : url;
  }
}

function MobileDetailBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

function CopyRecordingLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  async function copy() {
    if (copying) {
      return;
    }

    setCopying(true);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
        {shortUrl(url)}
      </span>
      <button
        aria-label="Copy recording link"
        className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={copying}
        onClick={() => void copy()}
        type="button"
      >
        {copying ? <ButtonSpinner className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
      {copied ? (
        <span className="text-xs font-medium text-emerald-600">Copied</span>
      ) : null}
    </div>
  );
}

export function DashboardDoctorsTable({
  doctors,
}: {
  doctors: DashboardDoctorRow[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [interviewFilter, setInterviewFilter] = useState<InterviewFilter>("ALL");
  const [assetsFilter, setAssetsFilter] = useState<AssetsFilter>("ALL");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [page, setPage] = useState(1);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  const hasActiveFilters =
    statusFilter !== "ALL" ||
    interviewFilter !== "ALL" ||
    assetsFilter !== "ALL";

  useEffect(() => {
    if (!showFilterPanel) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        filterPanelRef.current &&
        !filterPanelRef.current.contains(event.target as Node)
      ) {
        setShowFilterPanel(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showFilterPanel]);

  function resetFilters() {
    setStatusFilter("ALL");
    setInterviewFilter("ALL");
    setAssetsFilter("ALL");
    setPage(1);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return doctors.filter((doctor) => {
      const matchesQuery =
        !q ||
        doctor.name.toLowerCase().includes(q) ||
        doctor.doctorCode.toLowerCase().includes(q) ||
        (doctor.area?.toLowerCase().includes(q) ?? false) ||
        (doctor.specialty?.toLowerCase().includes(q) ?? false);

      const matchesStatus =
        statusFilter === "ALL" || doctor.displayStatus === statusFilter;

      const matchesInterview =
        interviewFilter === "ALL" ||
        (interviewFilter === "COMPLETED" && doctor.interviewCompleted) ||
        (interviewFilter === "IN_PROGRESS" && !doctor.interviewCompleted);

      const hasReadyAsset =
        Boolean(doctor.editedVideoLabel) || doctor.flyerReady;
      const matchesAssets =
        assetsFilter === "ALL" ||
        (assetsFilter === "READY" && hasReadyAsset) ||
        (assetsFilter === "PENDING" && !hasReadyAsset);

      return matchesQuery && matchesStatus && matchesInterview && matchesAssets;
    });
  }, [doctors, query, statusFilter, interviewFilter, assetsFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 3;
    let start = Math.max(1, currentPage - 1);
    let end = Math.min(totalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i += 1) {
      pages.push(i);
    }
    return pages;
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pr-3 pl-10 text-sm text-slate-800 outline-none ring-slate-300 placeholder:text-slate-400 focus:ring-2"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search by doctor name, code or area..."
            type="search"
            value={query}
          />
        </div>
        <div className="relative flex items-center gap-2" ref={filterPanelRef}>
          <button
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${
              showFilterPanel || hasActiveFilters
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            onClick={() => setShowFilterPanel((open) => !open)}
            type="button"
          >
            <Filter className="h-4 w-4" />
            Filter
            {hasActiveFilters ? (
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
                ON
              </span>
            ) : null}
          </button>

          {showFilterPanel ? (
            <div className="absolute top-full right-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Filters</p>
                {hasActiveFilters ? (
                  <button
                    className="text-xs font-medium text-sky-600 hover:text-sky-700"
                    onClick={resetFilters}
                    type="button"
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Post-production status
                  </span>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-slate-300 focus:ring-2"
                    onChange={(event) => {
                      setStatusFilter(event.target.value as StatusFilter);
                      setPage(1);
                    }}
                    value={statusFilter}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PROCESSING">Processing</option>
                    <option value="DONE">Done</option>
                    <option value="SPOTIFY">Spotify</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Interview progress
                  </span>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-slate-300 focus:ring-2"
                    onChange={(event) => {
                      setInterviewFilter(event.target.value as InterviewFilter);
                      setPage(1);
                    }}
                    value={interviewFilter}
                  >
                    <option value="ALL">All</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="IN_PROGRESS">In progress</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Final assets
                  </span>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-slate-300 focus:ring-2"
                    onChange={(event) => {
                      setAssetsFilter(event.target.value as AssetsFilter);
                      setPage(1);
                    }}
                    value={assetsFilter}
                  >
                    <option value="ALL">All</option>
                    <option value="READY">Ready</option>
                    <option value="PENDING">Pending upload</option>
                  </select>
                </label>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Mobile: separate card per doctor */}
      <div className="space-y-4 md:hidden">
        {pageItems.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-14 text-center text-sm text-slate-500 shadow-sm">
            No doctors found. Try a different search or create a new doctor link.
          </div>
        ) : (
          pageItems.map((doctor) => (
            <article
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              key={doctor.id}
            >
              <div className="flex gap-3 border-b border-slate-100 pb-3">
                {doctor.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={doctor.name}
                    className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
                    src={doctor.imageUrl}
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                    <User className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-slate-900">
                    {doctor.name}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {doctor.specialty ?? "No specialty"}
                  </p>
                </div>
              </div>

              <MobileDetailBlock label="Area & code">
                <p className="text-sm font-medium text-slate-800">
                  {doctor.area ?? "—"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    {doctor.doctorCode}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${statusBadgeStyles[doctor.displayStatus]}`}
                  >
                    {formatPostProductionStatus(doctor.displayStatus)}
                  </span>
                </div>
              </MobileDetailBlock>

              <MobileDetailBlock label="Recording link">
                <CopyRecordingLink url={doctor.recordingUrl} />
              </MobileDetailBlock>

              <MobileDetailBlock label="Final assets">
                <FinalAssetsCell compact doctor={doctor} />
              </MobileDetailBlock>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                  Actions
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <DownloadFlyerButton
                    doctorId={doctor.id}
                    interviewCompleted={doctor.interviewCompleted}
                    ready={doctor.flyerReady}
                    variant="dashboard"
                  />
                  <Link
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    href={`/dashboard/doctors/${doctor.id}`}
                  >
                    Review
                  </Link>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-5 py-4">Photo</th>
                <th className="px-5 py-4">Doctor Details</th>
                <th className="px-5 py-4">Area &amp; Code</th>
                <th className="px-5 py-4">Recording Link</th>
                <th className="px-5 py-4">Status</th>
                <th className="w-[1%] whitespace-nowrap px-5 py-4">Final Assets</th>
                <th className="px-5 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.length === 0 ? (
                <tr>
                  <td className="px-5 py-14 text-center text-slate-500" colSpan={7}>
                    No doctors found. Try a different search or create a new doctor link.
                  </td>
                </tr>
              ) : (
                pageItems.map((doctor) => (
                  <tr className="align-middle hover:bg-slate-50/70" key={doctor.id}>
                    <td className="px-5 py-4">
                      {doctor.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt={doctor.name}
                          className="h-11 w-11 rounded-full object-cover ring-1 ring-slate-200"
                          src={doctor.imageUrl}
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                          <User className="h-5 w-5" />
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{doctor.name}</p>
                      <p className="mt-0.5 text-slate-500">
                        {doctor.specialty ?? "No specialty"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">
                        {doctor.area ?? "—"}
                      </p>
                      <p className="mt-0.5 inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {doctor.doctorCode}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <CopyRecordingLink url={doctor.recordingUrl} />
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusBadgeStyles[doctor.displayStatus]}`}
                      >
                        {formatPostProductionStatus(doctor.displayStatus)}
                      </span>
                    </td>
                    <td className="w-[1%] max-w-[14rem] px-5 py-4">
                      <FinalAssetsCell doctor={doctor} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <DownloadFlyerButton
                          doctorId={doctor.id}
                          interviewCompleted={doctor.interviewCompleted}
                          ready={doctor.flyerReady}
                          variant="dashboard"
                        />
                        <Link
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          href={`/dashboard/doctors/${doctor.id}`}
                        >
                          Review
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-sm text-slate-500">
          Showing {pageItems.length} of {filtered.length} doctors
        </p>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            type="button"
          >
            Previous
          </button>
          {pageNumbers.map((pageNumber) => (
            <button
              className={`min-w-9 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                pageNumber === currentPage
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
              key={pageNumber}
              onClick={() => setPage(pageNumber)}
              type="button"
            >
              {pageNumber}
            </button>
          ))}
          <button
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            type="button"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
