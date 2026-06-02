"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
      onClick={() => signOut({ callbackUrl: "/login" })}
      type="button"
    >
      Sign out
    </button>
  );
}
