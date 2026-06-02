import { Suspense } from "react";

import { LoginForm } from "@/app/login/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="grid w-full max-w-5xl gap-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-cyan-950/30 md:grid-cols-[1.1fr_0.9fr] md:p-10">
        <div className="flex flex-col justify-between rounded-2xl bg-cyan-400 p-8 text-slate-950">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em]">
              Doctor Live Podcast
            </p>
            <h1 className="mt-8 text-4xl font-bold tracking-tight md:text-5xl">
              Capture expert doctor answers for polished video podcasts.
            </h1>
          </div>
          <p className="mt-10 text-base text-slate-800">
            MR users create secure links, doctors record guided answers, and
            teams review clips for manual podcast production.
          </p>
        </div>
        <div className="flex flex-col justify-center p-2 md:p-6">
          <div className="mb-8">
            <p className="text-sm font-medium text-cyan-300">Employee Login</p>
            <h2 className="mt-2 text-3xl font-semibold">Welcome back</h2>
            <p className="mt-3 text-sm text-slate-400">
              Sign in with your employee ID and password. Example: F001978 /
              F001978
            </p>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
