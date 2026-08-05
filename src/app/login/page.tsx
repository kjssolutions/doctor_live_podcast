import { Suspense } from "react";

import { LoginForm } from "@/app/login/login-form";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#f7f5f1] px-4 py-12 sm:px-6">
      {/* Soft paper-tone atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_10%_0%,#ebe6dc_0%,transparent_50%),radial-gradient(ellipse_70%_50%_at_100%_100%,#e4ece8_0%,transparent_45%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#1a3a32]/25 to-transparent"
      />

      <section className="relative w-full max-w-[26rem]">
        <div className="overflow-hidden rounded-[1.35rem] border border-[#d9d3c8]/80 bg-white shadow-[0_24px_60px_-28px_rgba(26,58,50,0.35)]">
          {/* Brand bar */}
          <div className="border-b border-[#ece7df] bg-gradient-to-br from-[#1a3a32] to-[#234f44] px-6 py-8 text-center sm:px-8 sm:py-9">
            <h1 className="text-[1.45rem] font-semibold tracking-tight text-white sm:text-[1.7rem]">
              Doctor Live Podcast
            </h1>
          </div>

          <div className="px-6 py-7 sm:px-8 sm:py-8">
            <Suspense
              fallback={
                <div className="h-44 animate-pulse rounded-xl bg-[#f3efe8]" />
              }
            >
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}
