"use client";

import { Copy, Filter, Search, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { DownloadFlyerButton } from "@/components/download-flyer-button";
import { ButtonSpinner } from "@/components/ui/button-loading";
import {
  formatPostProductionStatus,
  type PostProductionStatus,
} from "@/lib/post-production";

export type DashboardDoctorRow = {
  id: number;
  name: string;
  specialty: string | null;
  imageUrl: string | null;
  thumbUrl: string | null;
  area: string | null;
  doctorCode: string;
  mrName: string;
  mrId: string | null;
  interviewStatus: string;
  recordingUrl: string;
  displayStatus: PostProductionStatus;
  spotifyUrl: string | null;
  interviewCompleted: boolean;
  flyerReady: boolean;
  editedVideoLabel: string | null;
  editedVideoUrl: string | null;
  canViewAnswers: boolean;
  showRecordingLink: boolean;
};

const PAGE_SIZE = 5;

type StatusFilter = "ALL" | PostProductionStatus;
type InterviewFilter = "ALL" | "COMPLETED" | "IN_PROGRESS";
type AssetsFilter = "ALL" | "READY" | "PENDING";

const statusBadgeStyles: Record<PostProductionStatus, string> = {
  CREATED: "bg-slate-100 text-slate-700 ring-slate-200",
  PROCESSING: "bg-amber-50 text-amber-700 ring-amber-200",
  DONE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  SPOTIFY: "bg-sky-50 text-sky-700 ring-sky-200",
  REJECTED: "bg-rose-50 text-rose-700 ring-rose-200",
};

function EmptyValue({ children = "—" }: { children?: React.ReactNode }) {
  return <span className="text-slate-400">{children}</span>;
}

function shortUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/+/, "");
    const host = parsed.host.replace(/^www\./, "");
    const combined = `${host}/${path}`;
    return combined.length > 34 ? `${combined.slice(0, 31)}…` : combined;
  } catch {
    return url.length > 34 ? `${url.slice(0, 31)}…` : url;
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
    <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-3">
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
    if (copying) return;
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
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <span className="min-w-0 flex-1 truncate text-xs text-slate-600 sm:text-sm" title={url}>
        {shortUrl(url)}
      </span>
      <button
        aria-label="Copy recording link"
        className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-60"
        disabled={copying}
        onClick={() => void copy()}
        type="button"
      >
        {copying ? <ButtonSpinner className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
      {copied ? (
        <span className="text-[11px] font-medium text-emerald-600">Copied</span>
      ) : null}
    </div>
  );
}

function DoctorAvatar({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={name}
        className="h-11 w-11 rounded-full object-cover ring-1 ring-slate-200"
        src={imageUrl}
      />
    );
  }

  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">
      <User className="h-5 w-5" />
    </div>
  );
}

function RowActions({ doctor }: { doctor: DashboardDoctorRow }) {
  return (
    <div className="flex flex-col items-start gap-2">
      {doctor.canViewAnswers ? (
        <Link
          className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          href={`/dashboard/doctors/${doctor.id}`}
        >
          Review answers
        </Link>
      ) : null}
      <DownloadFlyerButton
        doctorId={doctor.id}
        interviewCompleted={doctor.interviewCompleted}
        ready={doctor.flyerReady}
        variant="dashboard"
      />
    </div>
  );
}

export function DashboardDoctorsTable({
  doctors,
  showMrColumn = false,
}: {
  doctors: DashboardDoctorRow[];
  showMrColumn?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [interviewFilter, setInterviewFilter] = useState<InterviewFilter>("ALL");
  const [assetsFilter, setAssetsFilter] = useState<AssetsFilter>("ALL");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [page, setPage] = useState(1);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  const showLinkColumn = doctors.some((d) => d.showRecordingLink);

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
        String(doctor.id).includes(q) ||
        doctor.name.toLowerCase().includes(q) ||
        doctor.doctorCode.toLowerCase().includes(q) ||
        doctor.mrName.toLowerCase().includes(q) ||
        (doctor.mrId?.toLowerCase().includes(q) ?? false) ||
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
    for (let i = start; i <= end; i += 1) pages.push(i);
    return pages;
  }, [currentPage, totalPages]);

  const colSpan = 7 + (showMrColumn ? 1 : 0) + (showLinkColumn ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm sm:p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2.5 pr-3 pl-10 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search ID, doctor, code, MR, specialty, or area…"
            type="search"
            value={query}
          />
        </div>
        <div className="relative flex items-center gap-2" ref={filterPanelRef}>
          <button
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
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
            <div className="absolute top-full right-0 z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
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
                    Status
                  </span>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-200"
                    onChange={(event) => {
                      setStatusFilter(event.target.value as StatusFilter);
                      setPage(1);
                    }}
                    value={statusFilter}
                  >
                    <option value="ALL">All statuses</option>
                    <option value="CREATED">Pending</option>
                    <option value="PROCESSING">Processing</option>
                    <option value="DONE">Done</option>
                    <option value="SPOTIFY">Spotify</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Interview
                  </span>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-200"
                    onChange={(event) => {
                      setInterviewFilter(event.target.value as InterviewFilter);
                      setPage(1);
                    }}
                    value={interviewFilter}
                  >
                    <option value="ALL">All</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="IN_PROGRESS">Not completed</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Assets
                  </span>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-200"
                    onChange={(event) => {
                      setAssetsFilter(event.target.value as AssetsFilter);
                      setPage(1);
                    }}
                    value={assetsFilter}
                  >
                    <option value="ALL">All</option>
                    <option value="READY">Ready</option>
                    <option value="PENDING">Pending</option>
                  </select>
                </label>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {pageItems.length === 0 ? (
          <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-14 text-center text-sm text-slate-500 shadow-sm">
            No doctors found.
          </div>
        ) : (
          pageItems.map((doctor) => (
            <article
              className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm"
              key={doctor.id}
            >
              <div className="flex gap-3 border-b border-slate-100 pb-3">
                <DoctorAvatar imageUrl={doctor.imageUrl} name={doctor.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      #{doctor.id}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${statusBadgeStyles[doctor.displayStatus]}`}
                    >
                      {formatPostProductionStatus(doctor.displayStatus)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-slate-500">
                    {doctor.doctorCode}
                  </p>
                  <p className="truncate text-base font-semibold text-slate-900">
                    {doctor.name}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {doctor.specialty ?? "No specialty"}
                  </p>
                </div>
              </div>

              <MobileDetailBlock label="Details">
                <div className="grid grid-cols-2 gap-3 text-sm text-slate-700">
                  <div>
                    <p className="text-[11px] font-medium text-slate-500">Area</p>
                    <p className="truncate">{doctor.area ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-slate-500">MR</p>
                    <p className="truncate">{doctor.mrName}</p>
                    <p className="truncate text-xs text-slate-400">{doctor.mrId}</p>
                  </div>
                </div>
              </MobileDetailBlock>

              {doctor.showRecordingLink ? (
                <MobileDetailBlock label="Recording link">
                  <CopyRecordingLink url={doctor.recordingUrl} />
                </MobileDetailBlock>
              ) : null}

              <RowActions doctor={doctor} />
            </article>
          ))
        )}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-3.5 whitespace-nowrap">ID</th>
                <th className="px-3 py-3.5 whitespace-nowrap">Doctor ID</th>
                <th className="px-3 py-3.5 whitespace-nowrap">Doctor</th>
                {showMrColumn ? (
                  <th className="px-3 py-3.5 whitespace-nowrap">MR</th>
                ) : null}
                <th className="px-3 py-3.5 whitespace-nowrap">Specialty</th>
                <th className="px-3 py-3.5 whitespace-nowrap">Area</th>
                <th className="px-3 py-3.5 whitespace-nowrap">Status</th>
                {showLinkColumn ? (
                  <th className="px-3 py-3.5 whitespace-nowrap">Recording link</th>
                ) : null}
                <th className="px-3 py-3.5 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.length === 0 ? (
                <tr>
                  <td className="px-4 py-14 text-center text-slate-500" colSpan={colSpan}>
                    No doctors found.
                  </td>
                </tr>
              ) : (
                pageItems.map((doctor) => (
                  <tr
                    className="align-top transition-colors odd:bg-white even:bg-slate-50/40 hover:bg-slate-50"
                    key={doctor.id}
                  >
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <span className="inline-flex min-w-8 items-center justify-center rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white">
                        {doctor.id}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 font-medium whitespace-nowrap text-slate-700">
                      {doctor.doctorCode}
                    </td>
                    <td className="min-w-[200px] px-3 py-3.5">
                      <div className="flex items-center gap-3">
                        <DoctorAvatar imageUrl={doctor.imageUrl} name={doctor.name} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">
                            {doctor.name}
                          </p>
                        </div>
                      </div>
                    </td>
                    {showMrColumn ? (
                      <td className="max-w-[140px] px-3 py-3.5 text-slate-600">
                        <p className="truncate font-medium text-slate-800">{doctor.mrName}</p>
                        <p className="truncate text-xs text-slate-400">{doctor.mrId}</p>
                      </td>
                    ) : null}
                    <td className="max-w-[140px] px-3 py-3.5 text-slate-600">
                      <p className="truncate" title={doctor.specialty ?? undefined}>
                        {doctor.specialty ?? <EmptyValue />}
                      </p>
                    </td>
                    <td className="max-w-[120px] px-3 py-3.5 text-slate-600">
                      <p className="truncate" title={doctor.area ?? undefined}>
                        {doctor.area ?? <EmptyValue />}
                      </p>
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusBadgeStyles[doctor.displayStatus]}`}
                      >
                        {formatPostProductionStatus(doctor.displayStatus)}
                      </span>
                    </td>
                    {showLinkColumn ? (
                      <td className="min-w-[220px] px-3 py-3.5">
                        {doctor.showRecordingLink ? (
                          <CopyRecordingLink url={doctor.recordingUrl} />
                        ) : (
                          <EmptyValue />
                        )}
                      </td>
                    ) : null}
                    <td className="px-3 py-3.5">
                      <RowActions doctor={doctor} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-sm text-slate-500">
          Showing {pageItems.length} of {filtered.length} doctors
          {filtered.length !== doctors.length
            ? ` (filtered from ${doctors.length})`
            : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            type="button"
          >
            Previous
          </button>
          {pageNumbers.map((pageNumber) => (
            <button
              className={`min-w-9 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
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
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
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
