import { z } from "zod";

/**
 * What the client is allowed to tell the server about a caught render
 * error (src/app/error.tsx / src/app/global-error.tsx). Deliberately
 * narrow and length-capped: an Error thrown deep in a component tree can
 * carry an arbitrary message, so this is treated as untrusted free text,
 * never logged verbatim without the same redact()/truncation the server
 * applies to every other error message (see docs/observability.md).
 */
export const clientErrorReportSchema = z.object({
  message: z.string().max(500),
  digest: z.string().max(200).optional(),
  pathname: z.string().max(300),
});

export type ClientErrorReportInput = z.infer<typeof clientErrorReportSchema>;
