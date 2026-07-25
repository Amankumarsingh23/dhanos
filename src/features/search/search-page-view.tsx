"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  SearchResultsList,
  useKeyboardNavigableResults,
} from "./result-list";
import type { SearchResultGroup } from "./types";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

/**
 * The dedicated /app/search page's interactive shell (PROMPT 39: "search
 * page"). Results themselves are server-rendered (the page.tsx Server
 * Component reads `?q=` and calls searchHousehold directly — no client-side
 * data fetching happens here); typing debounces a `router.replace` that
 * updates `?q=`, which re-renders the Server Component with fresh, still
 * RLS-scoped results. Keyboard navigation and highlighting are the exact
 * same shared components the header command palette uses.
 */
export function SearchPageView({
  initialQuery,
  groups,
}: {
  initialQuery: string;
  groups: SearchResultGroup[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [previousInitialQuery, setPreviousInitialQuery] = useState(initialQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A fresh server render (a new `initialQuery`, e.g. from a direct link or
  // back/forward navigation) should replace the local draft — React's own
  // "adjusting state when a prop changes" pattern, not a useEffect.
  if (initialQuery !== previousInitialQuery) {
    setPreviousInitialQuery(initialQuery);
    setQuery(initialQuery);
  }

  function handleChange(value: string) {
    setQuery(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      const trimmed = value.trim();
      router.replace(
        trimmed ? `/app/search?q=${encodeURIComponent(trimmed)}` : "/app/search",
      );
    }, DEBOUNCE_MS);
  }

  const trimmedQuery = query.trim();
  // Memoized so identity only changes when `groups` itself does — the
  // keyboard-nav hook resets its active index whenever this array's
  // reference changes, which must track real new results, not every
  // keystroke's re-render.
  const flatRows = useMemo(
    () => groups.flatMap((group) => group.rows),
    [groups],
  );
  const { activeIndex, setActiveIndex, onKeyDown } = useKeyboardNavigableResults(
    flatRows,
    (row) => router.push(row.href),
  );

  return (
    <div className="max-w-2xl space-y-4">
      <Input
        autoFocus
        placeholder="Search everything…"
        value={query}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Search"
      />
      {trimmedQuery.length > 0 && trimmedQuery.length < MIN_QUERY_LENGTH && (
        <p className="text-muted-foreground text-sm">
          Keep typing — at least {MIN_QUERY_LENGTH} characters.
        </p>
      )}
      {trimmedQuery.length >= MIN_QUERY_LENGTH && (
        <SearchResultsList
          groups={groups}
          query={trimmedQuery}
          activeIndex={activeIndex}
          onHoverIndex={setActiveIndex}
          onSelect={(row) => router.push(row.href)}
        />
      )}
    </div>
  );
}
