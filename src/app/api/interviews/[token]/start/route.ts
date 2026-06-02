import { NextResponse } from "next/server";

import { markDoctorInterviewStarted } from "@/lib/interviews";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const doctor = await markDoctorInterviewStarted(token);

  if (!doctor) {
    return NextResponse.json({ error: "Doctor link not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
