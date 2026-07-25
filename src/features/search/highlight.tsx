/**
 * Safe match highlighting for global search (PROMPT 39). "Safe" means
 * never `dangerouslySetInnerHTML` and never building an HTML string from
 * user input — the query and the record's own text are both untrusted
 * (household-entered) content, so this only ever splits `text` into plain
 * string segments and lets React render each one as an ordinary text node
 * (auto-escaped by construction) inside a `<mark>`. There is no code path
 * here that could interpret matched text as markup.
 */
export function HighlightedText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const trimmed = query.trim();
  if (!trimmed) {
    return <>{text}</>;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);
  if (matchIndex === -1) {
    return <>{text}</>;
  }

  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + trimmed.length);
  const after = text.slice(matchIndex + trimmed.length);

  return (
    <>
      {before}
      <mark className="bg-primary/20 text-foreground rounded-sm px-0.5">
        {match}
      </mark>
      {after}
    </>
  );
}
