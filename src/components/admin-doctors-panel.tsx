"use client";

import { FolderDown, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { DoctorProductionControls } from "@/components/doctor-production-controls";
import { EditedVideoUpload } from "@/components/edited-video-upload";
import {
  formatInterviewStatus,
  interviewStatusBadgeClass,
} from "@/lib/interview-status";
import type { PostProductionStatus } from "@/lib/post-production";

const PAGE_SIZE = 5;

export type AdminDoctorRow = {
  id: number;
  doctorName: string;
  doctorCode: string;
  specialty: string | null;
  interviewStatus: string;
  mrName: string;
  mrId: string | null;
  imageUrl: string | null;
  thumbUrl: string | null;
  hasMergedVideo: boolean;
  postProductionStatus: PostProductionStatus;
  spotifyUrl: string | null;
  recordings: Array<{
    id: string;
    title: string;
    order: number;
    fileUrl: string;
    downloadUrl: string;
    fileName: string;
  }>;
  editedFileUrl: string;
  editedDownloadUrl: string;
};

function EmptyValue({ children = "—" }: { children?: React.ReactNode }) {
  return <span className="text-slate-400">{children}</span>;
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

function DownloadOnlyLink({
  href,
  label,
  emptyLabel,
}: {
  href: string | null;
  label: string;
  emptyLabel: string;
}) {
  if (!href) {
    return <span className="text-[11px] text-slate-400 italic">{emptyLabel}</span>;
  }

  return (
    <a
      className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
      download
      href={href}
    >
      {label}
    </a>
  );
}

function DoctorPhotoCell({ doctor }: { doctor: AdminDoctorRow }) {
  return (
    <DownloadOnlyLink
      emptyLabel="No photo"
      href={doctor.imageUrl}
      label="Download"
    />
  );
}

function ThumbnailCell({ doctor }: { doctor: AdminDoctorRow }) {
  return (
    <DownloadOnlyLink
      emptyLabel="Not generated"
      href={doctor.thumbUrl}
      label="Download"
    />
  );
}

function AdminRecordingsSection({ doctor }: { doctor: AdminDoctorRow }) {
  const byOrder = new Map(
    doctor.recordings.map((recording) => [recording.order, recording]),
  );

  return (
    <div className="flex min-w-[7.5rem] flex-col gap-1">
      {[1, 2, 3, 4].map((order) => {
        const recording = byOrder.get(order);
        if (!recording) {
          return (
            <span className="text-[11px] text-slate-400" key={order}>
              Q{order}. —
            </span>
          );
        }

        return (
          <a
            className="inline-flex w-fit items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
            download={recording.fileName}
            href={recording.downloadUrl}
            key={recording.id}
          >
            Q{order}. {recording.fileName.endsWith(".mp4") ? "mp4" : "webm"}
          </a>
        );
      })}
      {doctor.recordings.length > 0 ? (
        <a
          className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-md border border-slate-900 bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white transition hover:bg-slate-700"
          download
          href={`/api/recordings/zip?doctorId=${doctor.id}`}
        >
          <FolderDown className="h-3 w-3" />
          All (ZIP)
        </a>
      ) : null}
    </div>
  );
}

function AdminVideoUrlSection({ doctor }: { doctor: AdminDoctorRow }) {
  return (
    <EditedVideoUpload
      doctorId={doctor.id}
      initialUrl={doctor.editedFileUrl}
      key={`${doctor.id}-${doctor.editedFileUrl}`}
      variant="light"
    />
  );
}

function AdminDoctorMobileCard({ doctor }: { doctor: AdminDoctorRow }) {
  return (
    <article className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="border-b border-slate-100 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
            #{doctor.id}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${interviewStatusBadgeClass(doctor.interviewStatus)}`}
          >
            {formatInterviewStatus(doctor.interviewStatus)}
          </span>
        </div>
        <p className="mt-1 text-sm font-medium text-slate-500">{doctor.doctorCode}</p>
        <p className="truncate text-base font-semibold text-slate-900">
          {doctor.doctorName}
        </p>
        <p className="truncate text-sm text-slate-500">
          {doctor.specialty ?? "No specialty"}
        </p>
      </div>

      <MobileDetailBlock label="Details">
        <div className="grid grid-cols-2 gap-3 text-sm text-slate-700">
          <div>
            <p className="mb-1 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
              MR name
            </p>
            <p>{doctor.mrName}</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
              MR ID
            </p>
            <p>{doctor.mrId ?? "—"}</p>
          </div>
        </div>
      </MobileDetailBlock>

      <MobileDetailBlock label="Doctor photo">
        <DoctorPhotoCell doctor={doctor} />
      </MobileDetailBlock>

      <MobileDetailBlock label="Thumbnail">
        <ThumbnailCell doctor={doctor} />
      </MobileDetailBlock>

      <MobileDetailBlock label="Q1–Q4 videos">
        <AdminRecordingsSection doctor={doctor} />
      </MobileDetailBlock>

      <MobileDetailBlock label="Video URL">
        <AdminVideoUrlSection doctor={doctor} />
      </MobileDetailBlock>

      <DoctorProductionControls
        doctorId={doctor.id}
        hasMergedVideo={doctor.hasMergedVideo}
        initialSpotifyUrl={doctor.spotifyUrl}
        initialStatus={doctor.postProductionStatus}
        layout="grid"
      />
    </article>
  );
}

export function AdminDoctorsPanel({ doctors }: { doctors: AdminDoctorRow[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter(
      (doctor) =>
        String(doctor.id).includes(q) ||
        doctor.doctorName.toLowerCase().includes(q) ||
        doctor.doctorCode.toLowerCase().includes(q) ||
        (doctor.specialty?.toLowerCase().includes(q) ?? false) ||
        doctor.mrName.toLowerCase().includes(q) ||
        (doctor.mrId?.toLowerCase().includes(q) ?? false),
    );
  }, [doctors, query]);

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

  const colCount = 12;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2.5 pr-3 pl-10 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search by ID, doctor, code, MR, or specialty…"
            type="search"
            value={query}
          />
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        {pageItems.length === 0 ? (
          <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-14 text-center text-sm text-slate-500 shadow-sm">
            No doctors found.
          </div>
        ) : (
          pageItems.map((doctor) => (
            <AdminDoctorMobileCard doctor={doctor} key={doctor.id} />
          ))
        )}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-[1320px] w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-3 whitespace-nowrap">ID</th>
                <th className="px-3 py-3 whitespace-nowrap">Doctor ID</th>
                <th className="px-3 py-3 whitespace-nowrap">Doctor</th>
                <th className="px-3 py-3 whitespace-nowrap">MR name</th>
                <th className="px-3 py-3 whitespace-nowrap">MR ID</th>
                <th className="px-3 py-3 whitespace-nowrap">Specialty</th>
                <th className="px-3 py-3 whitespace-nowrap">Doctor photo</th>
                <th className="px-3 py-3 whitespace-nowrap">Thumbnail</th>
                <th className="px-3 py-3 whitespace-nowrap">Q1–Q4 videos</th>
                <th className="px-3 py-3 whitespace-nowrap">Video URL</th>
                <th className="px-3 py-3 whitespace-nowrap">Spotify URL</th>
                <th className="px-3 py-3 whitespace-nowrap">Post-production</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-14 text-center text-slate-500"
                    colSpan={colCount}
                  >
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
                    <td className="px-3 py-3.5 font-medium whitespace-nowrap text-slate-800">
                      {doctor.doctorCode}
                    </td>
                    <td className="min-w-[160px] max-w-[200px] px-3 py-3.5">
                      <p className="font-semibold text-slate-900">{doctor.doctorName}</p>
                      <p className="mt-1">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${interviewStatusBadgeClass(doctor.interviewStatus)}`}
                        >
                          {formatInterviewStatus(doctor.interviewStatus)}
                        </span>
                      </p>
                    </td>
                    <td className="max-w-[140px] px-3 py-3.5 text-slate-700">
                      <p className="truncate" title={doctor.mrName}>
                        {doctor.mrName}
                      </p>
                    </td>
                    <td className="px-3 py-3.5 font-mono text-xs whitespace-nowrap text-slate-600">
                      {doctor.mrId ?? <EmptyValue />}
                    </td>
                    <td className="max-w-[140px] px-3 py-3.5 text-slate-600">
                      <p className="truncate" title={doctor.specialty ?? undefined}>
                        {doctor.specialty ?? <EmptyValue />}
                      </p>
                    </td>
                    <td className="px-3 py-3.5">
                      <DoctorPhotoCell doctor={doctor} />
                    </td>
                    <td className="px-3 py-3.5">
                      <ThumbnailCell doctor={doctor} />
                    </td>
                    <td className="px-3 py-3.5">
                      <AdminRecordingsSection doctor={doctor} />
                    </td>
                    <td className="px-3 py-3.5">
                      <AdminVideoUrlSection doctor={doctor} />
                    </td>
                    <DoctorProductionControls
                      doctorId={doctor.id}
                      hasMergedVideo={doctor.hasMergedVideo}
                      initialSpotifyUrl={doctor.spotifyUrl}
                      initialStatus={doctor.postProductionStatus}
                      layout="table"
                    />
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
        <div className="flex items-center gap-2">
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
