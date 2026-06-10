"use client";

import { Search, User } from "lucide-react";
import { useMemo, useState } from "react";

import { DoctorProductionControls } from "@/components/doctor-production-controls";
import { EditedVideoDeleteButton } from "@/components/edited-video-delete-button";
import { EditedVideoUpload } from "@/components/edited-video-upload";
import { RecordingDeleteButton } from "@/components/recording-delete-button";
import { RecordingModalPlayer } from "@/components/recording-modal-player";
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
  hasMergedVideo: boolean;
  postProductionStatus: PostProductionStatus;
  spotifyUrl: string | null;
  recordings: Array<{
    id: string;
    title: string;
    fileUrl: string;
    downloadUrl: string;
  }>;
  editedFileUrl: string;
  editedDownloadUrl: string;
};

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

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      href={href}
    >
      {children}
    </a>
  );
}

function AdminRecordingsSection({
  doctor,
  layout = "stack",
}: {
  doctor: AdminDoctorRow;
  layout?: "stack" | "grid";
}) {
  if (doctor.recordings.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic">No submitted recordings yet.</p>
    );
  }

  return (
    <div className={layout === "grid" ? "grid gap-2 md:grid-cols-2" : "space-y-2"}>
      {doctor.recordings.map((recording) => (
        <div
          className="rounded-lg border border-slate-200 bg-white p-3"
          key={recording.id}
        >
          <p className="text-xs font-semibold text-slate-700">{recording.title}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <RecordingModalPlayer
              downloadUrl={recording.downloadUrl}
              fileUrl={recording.fileUrl}
              title={recording.title}
              variant="light"
            />
            <ActionLink href={recording.downloadUrl}>Download</ActionLink>
            <RecordingDeleteButton
              doctorLabel={doctor.doctorName}
              questionLabel={recording.title}
              recordingId={recording.id}
              variant="light"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminMergedVideoSection({ doctor }: { doctor: AdminDoctorRow }) {
  if (doctor.hasMergedVideo) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="text-xs font-semibold text-slate-700">Uploaded merged video</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <RecordingModalPlayer
            downloadUrl={doctor.editedDownloadUrl}
            fileUrl={doctor.editedFileUrl}
            title={`${doctor.doctorName} — merged video`}
            variant="light"
          />
          <ActionLink href={doctor.editedDownloadUrl}>Download</ActionLink>
          <EditedVideoDeleteButton
            doctorId={doctor.id}
            doctorLabel={doctor.doctorName}
            variant="light"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3">
      <p className="text-xs text-slate-500">Upload the final edited/merged clip.</p>
      <div className="mt-3">
        <EditedVideoUpload doctorId={doctor.id} variant="light" />
      </div>
    </div>
  );
}

function AdminDoctorMobileCard({ doctor }: { doctor: AdminDoctorRow }) {
  return (
    <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex gap-3 border-b border-slate-100 pb-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">
          <User className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-slate-900">
            {doctor.doctorName}
          </p>
          <p className="truncate text-sm text-slate-500">
            {doctor.specialty ?? "No specialty"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Interview: {doctor.interviewStatus.replace("_", " ")}
          </p>
        </div>
      </div>

      <MobileDetailBlock label="MR & doctor">
        <div className="space-y-1 text-sm text-slate-700">
          <p>
            <span className="font-medium text-slate-600">MR:</span> {doctor.mrName}
          </p>
          <p>
            <span className="font-medium text-slate-600">MR ID:</span>{" "}
            {doctor.mrId ?? "—"}
          </p>
          <p>
            <span className="font-medium text-slate-600">Doctor ID:</span>{" "}
            {doctor.doctorCode}
          </p>
        </div>
      </MobileDetailBlock>

      <MobileDetailBlock label="Q1–Q4 videos">
        <AdminRecordingsSection doctor={doctor} />
      </MobileDetailBlock>

      <MobileDetailBlock label="Merged video">
        <AdminMergedVideoSection doctor={doctor} />
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pr-3 pl-10 text-sm text-slate-800 outline-none ring-slate-300 placeholder:text-slate-400 focus:ring-2"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search by doctor, code, MR, or specialty…"
            type="search"
            value={query}
          />
        </div>
      </div>

      {/* Mobile: separate card per doctor */}
      <div className="space-y-4 md:hidden">
        {pageItems.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-14 text-center text-sm text-slate-500 shadow-sm">
            No doctors found.
          </div>
        ) : (
          pageItems.map((doctor) => (
            <AdminDoctorMobileCard doctor={doctor} key={doctor.id} />
          ))
        )}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">MR</th>
                <th className="px-4 py-3">MR ID</th>
                <th className="px-4 py-3">Doctor</th>
                <th className="px-4 py-3">Doctor ID</th>
                <th className="px-4 py-3">Specialty</th>
                <th className="px-4 py-3">Q1–Q4 videos</th>
                <th className="px-4 py-3">Merged video</th>
                <th className="px-4 py-3">Spotify URL</th>
                <th className="px-4 py-3">Post-production</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.length === 0 ? (
                <tr>
                  <td className="px-4 py-14 text-center text-slate-500" colSpan={9}>
                    No doctors found.
                  </td>
                </tr>
              ) : (
                pageItems.map((doctor) => (
                  <tr className="align-top hover:bg-slate-50/60" key={doctor.id}>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-700">
                      {doctor.mrName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                      {doctor.mrId ?? "—"}
                    </td>
                    <td className="min-w-[200px] px-4 py-4">
                      <p className="font-semibold text-slate-900">{doctor.doctorName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Status: {doctor.interviewStatus.replace("_", " ")}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-700">
                      {doctor.doctorCode}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                      {doctor.specialty ?? "—"}
                    </td>
                    <td className="min-w-[480px] px-4 py-4">
                      <AdminRecordingsSection doctor={doctor} layout="grid" />
                    </td>
                    <td className="min-w-[300px] px-4 py-4">
                      <AdminMergedVideoSection doctor={doctor} />
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

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-sm text-slate-500">
          Showing {pageItems.length} of {filtered.length} doctors
          {filtered.length !== doctors.length
            ? ` (filtered from ${doctors.length})`
            : ""}
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
