/**
 * Cookie backing privacy mode ("conceal balances"). A cookie rather than
 * localStorage so the server can render the concealed state on first paint —
 * the SSR HTML and the client's first render always agree, which is what
 * keeps privacy mode free of hydration mismatches and of a flash of
 * revealed amounts.
 *
 * The cookie stores only "1"/"0" (concealed or not) — never any financial
 * value. Concealment is purely presentational; database values are never
 * modified (see docs/security-model.md).
 */
export const PRIVACY_COOKIE_NAME = "dhanos-privacy";
export const PRIVACY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
