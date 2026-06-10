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
  getDisplayPostProductionStatus,
  type PostProductionStatus,
} from "@/lib/post-production";
import { prisma } from "@/lib/prisma";
import { absoluteUrlFromRequest } from "@/lib/utils";

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

  const doctors = await prisma.doctor.findMany({
    where: {
      interviewToken: { not: null },
      ...(session.user.role === "ADMIN"
        ? {}
        : { createdByEmployeeId: session.user.id }),
    },
    include: {
      recordings: true,
      flyer: { select: { id: true } },
      editedVideo: { select: { storageUrl: true } },
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
      name: doctor.doctorName ?? doctor.doctorCode,
      specialty: doctor.specialty,
      imageUrl: doctor.imageUrl,
      area: doctor.region ?? doctor.empHeadquarters,
      doctorCode: doctor.doctorCode,
      recordingUrl: absoluteUrlFromRequest(
        `/interview/${doctor.interviewToken}`,
        requestHeaders,
      ),
      displayStatus,
      spotifyUrl: doctor.spotifyUrl,
      interviewCompleted: doctor.interviewStatus === "COMPLETED",
      flyerReady: Boolean(doctor.flyer),
      editedVideoLabel: fileLabelFromUrl(doctor.editedVideo?.storageUrl),
    };
  });

  const countByStatus = (status: PostProductionStatus) =>
    rows.filter((row) => row.displayStatus === status).length;

  const processing = countByStatus("PROCESSING");
  const published = countByStatus("SPOTIFY");
  const pending = rows.filter((row) => !row.interviewCompleted).length;

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Doctor Dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Manage doctor profiles, recording links, and podcast statuses.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            href="/dashboard/doctors/new"
          >
            <PlusCircle className="h-4 w-4" />
            Create Doctor
          </Link>
          <SignOutButton variant="dashboard" />
        </div>
      </section>

      <DashboardStats
        pending={pending}
        processing={processing}
        published={published}
        total={rows.length}
      />

      <DashboardDoctorsTable doctors={rows} />
    </div>
  );
}
