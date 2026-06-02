import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doctor Live Podcast",
  description: "Record doctor video podcast answers from secure interview links.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
