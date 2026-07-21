"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Redirects to /login the moment the browser-side Supabase client observes
 * the session end — a revoked/expired refresh token, or the user signing
 * out in another tab. The server-side checks (middleware, requireUser) only
 * run on navigation, so without this a tab left open past expiry would keep
 * showing stale authenticated UI until the next click. See
 * docs/security-model.md §2.
 */
export function AuthSessionListener() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.push("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
