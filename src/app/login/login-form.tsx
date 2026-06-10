"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ButtonLoadingContent } from "@/components/ui/button-loading";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const result = await signIn("credentials", {
        username: formData.get("username"),
        password: formData.get("password"),
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid employee ID or password.");
        return;
      }

      router.push(searchParams.get("callbackUrl") ?? "/dashboard");
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-5">
      <div>
        <label className="text-sm font-medium text-slate-200" htmlFor="username">
          Employee ID
        </label>
        <input
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none ring-cyan-400/30 placeholder:text-slate-500 focus:ring-4"
          id="username"
          name="username"
          placeholder="F001978"
          required
        />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-200" htmlFor="password">
          Password
        </label>
        <input
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none ring-cyan-400/30 placeholder:text-slate-500 focus:ring-4"
          id="password"
          name="password"
          placeholder="F001978"
          type="password"
          required
        />
      </div>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <button
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        <ButtonLoadingContent loading={isPending} loadingText="Signing in…">
          Sign in
        </ButtonLoadingContent>
      </button>
    </form>
  );
}
