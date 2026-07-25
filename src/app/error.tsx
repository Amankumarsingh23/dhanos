"use client";

import { useEffect, useId } from "react";
import { ErrorState } from "@/components/shared/error-state";
import { reportClientErrorAction } from "@/lib/observability/actions";

/**
 * Client error boundary (see docs/observability.md) — catches any render
 * error below the root layout that no page-level try/catch handled.
 * `error.digest` is the reference code Next.js itself already generates
 * for a server-side rendering error; a client-thrown error has none, so a
 * fresh one is generated here purely so the user has *something* to quote
 * to support, correlated in the log via the request/user context
 * reportClientErrorAction adds server-side instead.
 *
 * Never renders `error.message` itself — it's an arbitrary string from
 * wherever the throw happened and might echo back something it shouldn't;
 * the fallback copy is always the same fixed, safe text.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const fallbackId = useId();
  const referenceId = error.digest ?? fallbackId;

  useEffect(() => {
    void reportClientErrorAction({
      message: error.message,
      digest: error.digest,
      pathname: window.location.pathname,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <ErrorState
        title="Something went wrong"
        description={`We hit an unexpected error and couldn't load this page. Try again, or come back later. Reference: ${referenceId}`}
        onRetry={reset}
        headingLevel="h2"
      />
    </div>
  );
}
