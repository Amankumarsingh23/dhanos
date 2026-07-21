const MAILPIT_URL = "http://127.0.0.1:54324";

type MailpitSearchResult = { messages: Array<{ ID: string }> };
type MailpitMessage = { Text?: string };

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mailpit request failed: ${response.status} ${url}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Polls the local Supabase stack's Mailpit inbox (see docs/local-supabase.md)
 * for an email to `email` and returns the first http(s) link found in its
 * plain-text body. Drives the real signup-confirmation/password-reset flow
 * end to end against a real (local) mail sink, rather than stubbing it out.
 */
export async function waitForEmailLink(
  email: string,
  {
    timeoutMs = 20_000,
    intervalMs = 500,
  }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const search = await fetchJson<MailpitSearchResult>(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );

    const latest = search.messages.at(-1);
    if (latest) {
      const message = await fetchJson<MailpitMessage>(
        `${MAILPIT_URL}/api/v1/message/${latest.ID}`,
      );
      // Supabase's default email template wraps the link as "( url )" with
      // surrounding spaces inside the parens — don't require them to be absent.
      const match = /\(\s*(https?:\/\/[^\s)]+)\s*\)/.exec(message.Text ?? "");
      if (match?.[1]) {
        return match[1];
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for an email to ${email}`);
}
