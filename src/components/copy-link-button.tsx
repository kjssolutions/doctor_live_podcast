"use client";

import { Copy } from "lucide-react";
import { useState } from "react";

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyLink() {
    setError(null);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        copyWithTextareaFallback(url);
      }

      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const copiedWithFallback = copyWithTextareaFallback(url);
      if (copiedWithFallback) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
        return;
      }

      setError("Copy failed. Select and copy the link text manually.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        className="inline-flex w-[11rem] items-center justify-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
        onClick={copyLink}
        type="button"
      >
        <Copy className="h-4 w-4" />
        {copied ? "Copied" : "Copy link"}
      </button>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}

function copyWithTextareaFallback(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}
