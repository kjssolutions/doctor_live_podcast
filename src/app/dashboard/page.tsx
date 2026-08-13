import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusCircle } from "lucide-react";

import {
  DashboardDoctorsTable,
  type DashboardDoctorRow,
} from "@/components/dashboard-doctors-table";
import { DashboardStats } from "@/components/dashboard-stats";
import { SignOutButton } from "@/components/sign-out-button";
import { authOptions } from "@/lib/auth";
import {
  canCreateDoctor,
  canViewAnswers,
  doctorListWhere,
  sessionAppRole,
} from "@/lib/doctor-access";
import {
  getDisplayPostProductionStatus,
  type PostProductionStatus,
} from "@/lib/post-production";
import { prisma } from "@/lib/prisma";
import { roleLabel } from "@/lib/roles";
import { absoluteUrlFromRequest } from "@/lib/utils";
import { formatDoctorDisplayName } from "@/lib/validations";

export const dynamic = "force-dynamic";

function fileLabelFromUrl(url: string | null | undefined) {
  if (!url) return null;
  const segment = url.split("/").filter(Boolean).pop();
  return segment ?? null;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const requestHeaders = await headers();

  if (!session?.user) {
    redirect("/login");
  }

  const appRole = sessionAppRole(session.user);
  const showCreate = canCreateDoctor(session.user);
  const showAnswers = canViewAnswers(session.user);

  const doctors = await prisma.doctor.findMany({
    where: {
      interviewToken: { not: null },
      ...doctorListWhere(session.user),
    },
    include: {
      recordings: true,
      flyer: { select: { id: true } },
      editedVideo: { select: { storageUrl: true } },
      createdBy: { select: { empName: true, empEmployeeId: true } },
    },
    orderBy: { podcastCreatedAt: "desc" },
  });

  const rows: DashboardDoctorRow[] = doctors.map((doctor) => {
    const displayStatus = getDisplayPostProductionStatus(
      doctor.postProductionStatus,
      doctor.spotifyUrl,
    );

    return {
      id: doctor.id,
      name: doctor.doctorName
        ? formatDoctorDisplayName(doctor.doctorName)
        : doctor.doctorCode,
      specialty: doctor.specialty,
      imageUrl: doctor.imageUrl,
      thumbUrl: doctor.thumbUrl,
      area: doctor.region ?? doctor.empHeadquarters,
      doctorCode: doctor.doctorCode,
      mrName: doctor.createdBy?.empName ?? doctor.createdByEmployeeId ?? "—",
      mrId: doctor.createdByEmployeeId,
      interviewStatus: doctor.interviewStatus ?? "SENT",
      recordingUrl: absoluteUrlFromRequest(
        `/interview/${doctor.interviewToken}`,
        requestHeaders,
      ),
      displayStatus,
      spotifyUrl: doctor.spotifyUrl,
      interviewCompleted: doctor.interviewStatus === "COMPLETED",
      flyerReady: Boolean(doctor.flyer),
      editedVideoLabel: fileLabelFromUrl(doctor.editedVideo?.storageUrl),
      editedVideoUrl: doctor.editedVideo?.storageUrl ?? null,
      canViewAnswers: showAnswers,
      showRecordingLink: showCreate || appRole === "ADMIN",
    };
  });

  const countByStatus = (status: PostProductionStatus) =>
    rows.filter((row) => row.displayStatus === status).length;

  const created = countByStatus("CREATED");
  const processing = countByStatus("PROCESSING");
  const published = countByStatus("SPOTIFY");

  return (
    <div className="space-y-6 sm:space-y-7">
      <header className="flex flex-col gap-4 rounded-xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-5">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Workspace
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {appRole === "SALES" ? "MR Dashboard" : `${roleLabel(appRole)} Dashboard`}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            {appRole === "SALES" ? (
              <>
                <span className="font-semibold text-slate-800">
                  {session.user.name ?? "MR"}
                </span>
                <span className="text-slate-400"> · </span>
              </>
            ) : null}
            <span className="font-medium text-slate-500">
              ID: {session.user.id}
            </span>
            <span className="text-slate-400"> · </span>
            <span className="font-medium text-slate-500">
              {roleLabel(appRole)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {showCreate ? (
            <Link
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              href="/dashboard/doctors/new"
            >
              <PlusCircle className="h-4 w-4" />
              Create Doctor
            </Link>
          ) : null}
          <SignOutButton variant="dashboard" />
        </div>
      </header>

      <DashboardStats
        created={created}
        processing={processing}
        published={published}
        total={rows.length}
      />

      <DashboardDoctorsTable
        doctors={rows}
        showMrColumn={appRole !== "SALES"}
      />
    </div>
  );
}
