"use client";

import { useEffect, useId } from "react";
import { reportClientErrorAction } from "@/lib/observability/actions";

/**
 * Last-resort error boundary — catches an error thrown by the root layout
 * itself (src/app/layout.tsx), which src/app/error.tsx cannot (an error
 * boundary can't catch a throw in its own parent). Next.js requires this
 * file to render its own <html>/<body>, replacing the entire tree, so it
 * deliberately avoids any provider/component that could itself be the
 * thing that just failed — plain markup and inline styles only.
 */
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.5rem", color: "#6b7280" }}>
            DhanOS hit an unexpected error and couldn&apos;t load. Try again, or
            come back later. Reference: {referenceId}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #d1d5db",
              background: "white",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
