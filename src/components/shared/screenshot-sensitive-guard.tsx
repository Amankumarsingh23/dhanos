"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * "Screenshot-sensitive mode" (Settings > Privacy — PROMPT 40). Honest
 * scope: no web API can prevent an OS-level screenshot or screen
 * recording — this only blurs the app's content whenever the browser tab
 * loses focus or visibility (switching apps/tabs, a screen-share starting),
 * as a shoulder-surfing/incidental-exposure deterrent. The Settings copy
 * must never claim more than this.
 */
export function ScreenshotSensitiveGuard({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [obscured, setObscured] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function updateFromVisibility() {
      setObscured(document.hidden);
    }
    function onBlur() {
      setObscured(true);
    }
    function onFocus() {
      setObscured(document.hidden);
    }

    document.addEventListener("visibilitychange", updateFromVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", updateFromVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled]);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className={obscured ? "pointer-events-none blur-xl select-none" : ""}>
        {children}
      </div>
      {obscured && (
        <div className="bg-background/95 fixed inset-0 z-50 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">
            Content hidden while this tab isn&rsquo;t in focus — screenshot-sensitive mode
          </p>
        </div>
      )}
    </div>
  );
}
