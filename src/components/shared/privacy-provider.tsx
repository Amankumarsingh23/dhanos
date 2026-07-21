"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  PRIVACY_COOKIE_MAX_AGE_SECONDS,
  PRIVACY_COOKIE_NAME,
} from "@/lib/privacy/constants";

type PrivacyContextValue = {
  /** True when privacy mode is on and sensitive amounts must be concealed. */
  concealed: boolean;
  toggle: () => void;
  setConcealed: (concealed: boolean) => void;
};

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

/**
 * Application-level privacy mode ("hide balances"). Display-only: toggling
 * it writes a 1-bit preference cookie and re-renders — it never touches
 * database values. `initialConcealed` comes from the server layout reading
 * the same cookie, so SSR output and the client's first render agree (no
 * hydration mismatch, no flash of revealed amounts).
 */
export function PrivacyProvider({
  initialConcealed,
  children,
}: {
  initialConcealed: boolean;
  children: ReactNode;
}) {
  const [concealed, setConcealedState] = useState(initialConcealed);

  const setConcealed = useCallback((next: boolean) => {
    setConcealedState(next);
    document.cookie = `${PRIVACY_COOKIE_NAME}=${next ? "1" : "0"}; path=/; max-age=${PRIVACY_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  }, []);

  const toggle = useCallback(() => {
    setConcealedState((previous) => {
      const next = !previous;
      document.cookie = `${PRIVACY_COOKIE_NAME}=${next ? "1" : "0"}; path=/; max-age=${PRIVACY_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ concealed, toggle, setConcealed }),
    [concealed, toggle, setConcealed],
  );

  return (
    <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
  );
}

export function usePrivacy(): PrivacyContextValue {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error("usePrivacy must be used within a PrivacyProvider.");
  }
  return context;
}
