"use client";

import { useEffect, useRef } from "react";
import { usePrivacy } from "@/components/shared/privacy-provider";

const SESSION_FLAG = "dhanos-dashboard-launch-concealed";

/**
 * "Concealed dashboard on launch" (Settings > Privacy — PROMPT 40). Forces
 * the dashboard to render concealed the first time it's visited in a
 * browser session (sessionStorage-scoped, so a refresh doesn't re-trigger
 * it), regardless of the privacy cookie's last value — then defers
 * entirely to the normal toggle for the rest of the session. Renders
 * nothing itself; it only calls the existing PrivacyProvider's setConcealed
 * once, the same mechanism the header's PrivacyToggle already uses.
 */
export function ConcealDashboardOnLaunch({ enabled }: { enabled: boolean }) {
  const { setConcealed } = usePrivacy();
  const applied = useRef(false);

  useEffect(() => {
    if (!enabled || applied.current) {
      return;
    }
    if (window.sessionStorage.getItem(SESSION_FLAG) === "1") {
      applied.current = true;
      return;
    }
    applied.current = true;
    window.sessionStorage.setItem(SESSION_FLAG, "1");
    setConcealed(true);
  }, [enabled, setConcealed]);

  return null;
}
