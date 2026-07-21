/**
 * Duplicate-warning heuristics for Institutions (see PROMPT 8: "Warn based
 * on: normalized institution name; website domain; support number. Do not
 * automatically merge."). Pure, synchronous, and DB-agnostic — the caller
 * (src/features/institutions/actions.ts) fetches the household's existing
 * institutions and passes them in; this module never queries anything
 * itself. A match is a *warning* surfaced to the user before creation, not
 * a block — see the `confirmDuplicate` escape hatch on institutionInputSchema.
 */

export type DuplicateMatchReason = "name" | "domain" | "phone";

export type DuplicateCandidate = {
  name: string;
  website?: string | null;
  supportPhone?: string | null;
};

export type ExistingInstitution = {
  id: string;
  name: string;
  website: string | null;
  supportPhone: string | null;
};

export type DuplicateMatch = {
  institutionId: string;
  institutionName: string;
  reasons: DuplicateMatchReason[];
};

// Common legal-entity suffixes stripped before comparison, so "HDFC Bank"
// and "HDFC Bank Ltd." are recognized as the same institution rather than
// only catching byte-for-byte (case-insensitive) duplicates — the DB's own
// unique index on institutions(household_id, lower(name)) already handles
// that exact-match case (see supabase/migrations/20260721060002_institutions.sql).
const LEGAL_SUFFIX_PATTERN =
  /\b(ltd|limited|llc|inc|incorporated|corp|corporation|pvt|private|co|company|plc)\b\.?/gi;

/** Lowercases, strips punctuation and common legal suffixes, and collapses whitespace — for fuzzy name comparison only, never for display. */
export function normalizeInstitutionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(LEGAL_SUFFIX_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extracts a comparable domain from a website value (with or without a protocol/path), stripping a leading "www.". Returns null for an unparseable value. */
export function extractWebsiteDomain(website: string): string | null {
  const trimmed = website.trim();
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const { hostname } = new URL(withProtocol);
    return hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Strips everything but digits and keeps the last 10, so a country-code prefix (or lack of one) doesn't prevent an otherwise-identical number from matching. Returns null when there aren't enough digits to compare meaningfully. */
export function normalizePhoneNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) {
    return null;
  }
  return digits.slice(-10);
}

/**
 * Compares `candidate` against `existing` (a household's current
 * institutions — exclude the institution itself when editing) and returns
 * every existing institution that matches on name, website domain, and/or
 * support phone, along with which of those matched. An empty array means
 * no warning should be shown.
 */
export function findPotentialDuplicates(
  candidate: DuplicateCandidate,
  existing: readonly ExistingInstitution[],
): DuplicateMatch[] {
  const candidateName = normalizeInstitutionName(candidate.name);
  const candidateDomain = candidate.website
    ? extractWebsiteDomain(candidate.website)
    : null;
  const candidatePhone = candidate.supportPhone
    ? normalizePhoneNumber(candidate.supportPhone)
    : null;

  const matches: DuplicateMatch[] = [];

  for (const institution of existing) {
    const reasons: DuplicateMatchReason[] = [];

    if (normalizeInstitutionName(institution.name) === candidateName) {
      reasons.push("name");
    }

    if (candidateDomain && institution.website) {
      const institutionDomain = extractWebsiteDomain(institution.website);
      if (institutionDomain && institutionDomain === candidateDomain) {
        reasons.push("domain");
      }
    }

    if (candidatePhone && institution.supportPhone) {
      const institutionPhone = normalizePhoneNumber(institution.supportPhone);
      if (institutionPhone && institutionPhone === candidatePhone) {
        reasons.push("phone");
      }
    }

    if (reasons.length > 0) {
      matches.push({
        institutionId: institution.id,
        institutionName: institution.name,
        reasons,
      });
    }
  }

  return matches;
}
