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
    <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-left text-sm text-amber-100">
      <p className="font-semibold">Camera needs HTTPS (Chrome is OK)</p>
      <p className="mt-2 text-amber-100/90">
        <code className="text-amber-50">http://{hostname}</code> cannot use the
        camera. A plain <code className="text-amber-50">https://</code> link will{" "}
        <strong>not open</strong> while you only run{" "}
        <code className="text-amber-50">npm run dev</code> (HTTP only).
      </p>

      <p className="mt-4 font-semibold text-amber-50">Easiest: HTTPS tunnel</p>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-amber-100/90">
        <li>
          PC terminal 1: <code className="text-amber-50">npm run dev</code> (keep
          running)
        </li>
        <li>
          PC terminal 2: <code className="text-amber-50">npm run dev:tunnel</code>
        </li>
        <li>
          Copy the <code className="text-amber-50">https://….loca.lt</code> URL
          from terminal 2, add{" "}
          <code className="break-all text-amber-50">{interviewPath}</code> on your
          phone
        </li>
      </ol>

      <p className="mt-4 font-semibold text-amber-50">Or: HTTPS on Wi‑Fi</p>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-amber-100/90">
        <li>
          Stop <code className="text-amber-50">npm run dev</code>, then run{" "}
          <code className="text-amber-50">npm run dev:https:lan</code> on the PC
        </li>
        <li>On the phone (same Wi‑Fi), open:</li>
      </ol>
      <p className="mt-2 break-all rounded-lg bg-black/30 p-2 font-mono text-xs text-amber-50">
        {lanHttpsUrl}
      </p>
      <p className="mt-2 text-xs text-amber-100/80">
        Tap Advanced → Proceed if Chrome warns about the certificate.
      </p>
    </div>
  );
}
