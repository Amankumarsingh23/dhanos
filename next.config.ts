import type { NextConfig } from "next";

/**
 * PROMPT 45 — security hardening. Baseline, low-risk security headers
 * applied to every response. Deliberately *not* including
 * Content-Security-Policy here: a strict CSP needs nonce-based script-src
 * wiring through middleware to work with Next.js's own inline hydration
 * scripts without breaking the app, which is a bigger change than this
 * pass covers safely — see docs/security-review.md's recommendations for
 * why it's a documented follow-up rather than rushed in here. Everything
 * below is purely additive and has no functional risk to any existing
 * page.
 */
const SECURITY_HEADERS = [
  // React already escapes all rendered content by default and this app
  // has zero dangerouslySetInnerHTML/innerHTML usage (verified during
  // the PROMPT 45 review) — clickjacking, not script injection, is what
  // this actually guards against here.
  { key: "X-Frame-Options", value: "DENY" },
  // Stops a browser from MIME-sniffing an uploaded document (Storage
  // bucket content) into something it executes as script/HTML.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Never leak a full URL (which can carry query-string context) to a
  // third-party site a user navigates to from this app; same-origin
  // navigations still get the full referrer for analytics/debugging.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // This app never uses the camera/microphone/geolocation/payment APIs —
  // explicitly disable them so a future dependency compromise can't
  // silently start using one.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
