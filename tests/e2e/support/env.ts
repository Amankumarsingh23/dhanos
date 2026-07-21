import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal .env.local reader for tests that talk to the Supabase REST API
 * directly (see docs/local-supabase.md's "Test RLS" section, which this
 * mirrors) — avoids depending on an undeclared transitive dotenv package.
 * Test-only; never imported from application code.
 */
function loadEnvLocal(): Record<string, string> {
  const path = resolve(__dirname, "../../../.env.local");
  const values: Record<string, string> = {};

  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return values;
  }

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }

  return values;
}

const envLocal = loadEnvLocal();

function required(name: string): string {
  const value = process.env[name] ?? envLocal[name];
  if (!value) {
    throw new Error(
      `Missing ${name} — expected it in the environment or .env.local (see docs/local-supabase.md).`,
    );
  }
  return value;
}

export const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_PUBLISHABLE_KEY = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
);
