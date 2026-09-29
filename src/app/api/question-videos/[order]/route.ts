import { getQuestionVideoRemoteUrl } from "@/lib/question-videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASS_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ order: string }> },
) {
  const { order } = await params;
  const index = Number(order);
  const remoteUrl = getQuestionVideoRemoteUrl(index);
  if (!remoteUrl || !Number.isInteger(index)) {
    return new Response("Question video not found", { status: 404 });
  }

  const upstreamHeaders = new Headers();
  const range = request.headers.get("range");
  if (range) {
    upstreamHeaders.set("Range", range);
  }

  const upstream = await fetch(remoteUrl, {
    headers: upstreamHeaders,
    cache: "force-cache",
  });

  if (!upstream.ok && upstream.status !== 206) {
    return new Response("Question video unavailable", { status: 502 });
  }

  const headers = new Headers();
  for (const name of PASS_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "video/mp4");
  }
  if (!headers.has("Accept-Ranges")) {
    headers.set("Accept-Ranges", "bytes");
  }
  headers.set("Cache-Control", "public, max-age=86400, immutable");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
