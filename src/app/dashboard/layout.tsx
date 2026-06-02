import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { authOptions } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link className="text-lg font-bold tracking-tight" href="/dashboard">
            Doctor Live Podcast
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              className="text-sm font-medium text-slate-300 hover:text-white"
              href="/dashboard"
            >
              Dashboard
            </Link>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
