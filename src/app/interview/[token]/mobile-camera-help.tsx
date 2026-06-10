"use client";

export function MobileCameraHelp({
  token,
  hostname,
}: {
  token: string;
  hostname: string;
}) {
  const interviewPath = `/interview/${token}`;
  const lanHttpsUrl = `https://${hostname}:3000${interviewPath}`;

  return (
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
      <p className="font-semibold">Camera needs HTTPS (Chrome is OK)</p>
      <p className="mt-2 text-amber-800/90">
        <code className="text-amber-950">http://{hostname}</code> cannot use the
        camera. A plain <code className="text-amber-950">https://</code> link will{" "}
        <strong>not open</strong> while you only run{" "}
        <code className="text-amber-950">npm run dev</code> (HTTP only).
      </p>

      <p className="mt-4 font-semibold text-amber-950">Easiest: HTTPS tunnel</p>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-amber-800/90">
        <li>
          PC terminal 1: <code className="text-amber-950">npm run dev</code> (keep
          running)
        </li>
        <li>
          PC terminal 2: <code className="text-amber-950">npm run dev:tunnel</code>
        </li>
        <li>
          Copy the <code className="text-amber-950">https://….loca.lt</code> URL
          from terminal 2, add{" "}
          <code className="break-all text-amber-950">{interviewPath}</code> on your
          phone
        </li>
      </ol>

      <p className="mt-4 font-semibold text-amber-950">Or: HTTPS on Wi‑Fi</p>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-amber-800/90">
        <li>
          Stop <code className="text-amber-950">npm run dev</code>, then run{" "}
          <code className="text-amber-950">npm run dev:https:lan</code> on the PC
        </li>
        <li>On the phone (same Wi‑Fi), open:</li>
      </ol>
      <p className="mt-2 break-all rounded-lg border border-amber-200 bg-white p-2 font-mono text-xs text-amber-950">
        {lanHttpsUrl}
      </p>
      <p className="mt-2 text-xs text-amber-700">
        Tap Advanced → Proceed if Chrome warns about the certificate.
      </p>
    </div>
  );
}
