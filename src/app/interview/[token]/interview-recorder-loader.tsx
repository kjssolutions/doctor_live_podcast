"use client";

import dynamic from "next/dynamic";

import type { ComponentProps } from "react";

const InterviewRecorder = dynamic(
  () =>
    import("@/app/interview/[token]/interview-recorder").then(
      (mod) => mod.InterviewRecorder,
    ),
  {
    ssr: false,
    loading: () => (
      <section className="mx-auto flex min-h-[100dvh] max-w-xl items-center justify-center px-6 text-center">
        <p className="text-sm text-slate-400">Loading interview…</p>
      </section>
    ),
  },
);

export function InterviewRecorderLoader(
  props: ComponentProps<typeof InterviewRecorder>,
) {
  return <InterviewRecorder {...props} />;
}
