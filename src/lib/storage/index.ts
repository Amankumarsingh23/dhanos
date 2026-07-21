import "server-only";
import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_SIGNED_URL_TTL_SECONDS = 60;

/**
 * Returns a short-lived signed URL for a private Storage object. Documents
 * (statements, policy PDFs, receipts) must never be served from a public
 * bucket or a permanent link — see docs/security-model.md §5.
 */
export async function createSignedDownloadUrl(
  bucket: string,
  path: string,
  expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    throw new AppError(
      "Could not generate a download link for this document.",
      {
        code: "unknown_error",
        cause: error,
      },
    );
  }

  return data.signedUrl;
}
