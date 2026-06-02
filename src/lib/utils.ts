import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function absoluteUrl(path: string) {
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return new URL(path, baseUrl).toString();
}

export function absoluteUrlFromRequest(
  path: string,
  headers: Headers,
  fallbackBaseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000",
) {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto =
    headers.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")
      ? "http"
      : "https");

  const baseUrl = host ? `${proto}://${host}` : fallbackBaseUrl;
  return new URL(path, baseUrl).toString();
}
