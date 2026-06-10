"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

import { ButtonLoadingContent } from "@/components/ui/button-loading";

export function SignOutButton({
  variant = "default",
}: {
  variant?: "default" | "dashboard";
}) {
  const [signingOut, setSigningOut] = useState(false);

  const className =
    variant === "dashboard"
      ? "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      : "inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <button
      className={className}
      disabled={signingOut}
      onClick={() => {
        if (signingOut) {
          return;
        }

        setSigningOut(true);
        void signOut({ callbackUrl: "/login" });
      }}
      type="button"
    >
      <ButtonLoadingContent loading={signingOut} loadingText="Signing out…">
        {variant === "dashboard" ? "Logout" : "Sign out"}
      </ButtonLoadingContent>
    </button>
  );
}
