import { Loader2 } from "lucide-react";

export function ButtonSpinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 aria-hidden className={`animate-spin ${className}`} />;
}

export function ButtonLoadingContent({
  loading,
  loadingText,
  children,
}: {
  loading: boolean;
  loadingText: string;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <>
        <ButtonSpinner />
        {loadingText}
      </>
    );
  }

  return <>{children}</>;
}
