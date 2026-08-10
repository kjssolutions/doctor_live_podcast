"use client";

import { getSession, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ButtonLoadingContent } from "@/components/ui/button-loading";

export function LoginForm() {
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

      const callbackUrl = searchParams.get("callbackUrl");
      const session = await getSession();
      const role = String(session?.user?.role ?? "").toUpperCase();
      const isAdmin = role === "ADMIN";

      if (callbackUrl === "/admin" || callbackUrl?.startsWith("/admin/")) {
        if (!isAdmin) {
          setError("Admin login required to open the admin panel.");
          return;
        }
        window.location.assign("/admin");
        return;
      }

      if (callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")) {
        window.location.assign(callbackUrl);
        return;
      }

      window.location.assign(isAdmin ? "/admin" : "/dashboard");
    });
  }

  const fieldClass =
    "mt-2 w-full rounded-lg border border-[#ddd6cb] bg-[#faf8f5] px-4 py-3.5 text-[15px] text-[#1c1917] outline-none transition placeholder:text-[#a8a29e] focus:border-[#1a3a32] focus:bg-white focus:ring-2 focus:ring-[#1a3a32]/15";

  return (
    <form action={onSubmit} className="space-y-5">
      <div>
        <label
          className="block text-[12px] font-semibold tracking-wide text-[#57534e] uppercase"
          htmlFor="username"
        >
          Employee ID
        </label>
        <input
          autoComplete="username"
          className={fieldClass}
          id="username"
          name="username"
          required
        />
      </div>

      <div>
        <label
          className="block text-[12px] font-semibold tracking-wide text-[#57534e] uppercase"
          htmlFor="password"
        >
          Password
        </label>
        <input
          autoComplete="current-password"
          className={fieldClass}
          id="password"
          name="password"
          required
          type="password"
        />
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <button
        className="group relative mt-2 inline-flex w-full min-h-[52px] touch-manipulation items-center justify-center overflow-hidden rounded-lg bg-[#1a3a32] px-4 py-3.5 text-[15px] font-semibold tracking-wide text-white transition hover:bg-[#234f44] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-white/20"
        />
        <ButtonLoadingContent loading={isPending} loadingText="Signing in…">
          Login
        </ButtonLoadingContent>
      </button>
    </form>
  );
}
