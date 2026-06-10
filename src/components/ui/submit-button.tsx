"use client";

import { useFormStatus } from "react-dom";

import { ButtonLoadingContent } from "@/components/ui/button-loading";

export function SubmitButton({
  children,
  className,
  loadingText = "Saving…",
}: {
  children: React.ReactNode;
  className?: string;
  loadingText?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
      disabled={pending}
      type="submit"
    >
      <ButtonLoadingContent loading={pending} loadingText={loadingText}>
        {children}
      </ButtonLoadingContent>
    </button>
  );
}
