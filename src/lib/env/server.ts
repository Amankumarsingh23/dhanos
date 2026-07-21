import "server-only";
import { z } from "zod";
import { clientEnv } from "./client";

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string({ error: "SUPABASE_SERVICE_ROLE_KEY is required" })
    .min(1, "SUPABASE_SERVICE_ROLE_KEY must not be empty"),
});

function parseServerEnv() {
  const result = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid or missing server environment variables:\n${issues}\n\nCheck .env.local against .env.example. This module must never be imported from a Client Component.`,
    );
  }

  return result.data;
}

/**
 * Full configuration, including secrets. The `server-only` import above
 * makes Next.js fail the build if any Client Component (directly or
 * transitively) imports this module — see docs/security-model.md §4.
 */
export const serverEnv = {
  ...clientEnv,
  ...parseServerEnv(),
};
