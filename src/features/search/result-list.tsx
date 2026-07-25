"use client";

import { useState } from "react";
import { HighlightedText } from "./highlight";
import type { SearchResultGroup, SearchResultRow } from "./types";

/**
 * Roving-index keyboard navigation (PROMPT 39: "keyboard navigation") over
 * a flat list of results — shared by the header command palette
 * (command-search.tsx) and the dedicated /app/search page so the two never
 * implement ArrowUp/ArrowDown/Home/End/Enter differently. The caller wires
 * `onKeyDown` onto whichever `<input>` actually holds focus (the results
 * themselves are never focused directly — same combobox pattern the
 * existing command palette already used for its single-item Enter case).
 *
 * Resets to index 0 whenever `items` changes identity — following React's
 * own "adjusting state when a prop changes" pattern (a direct render-time
 * setState guarded by a reference comparison) rather than a `useEffect`,
 * since both call sites only ever pass a genuinely new `items` array when
 * the underlying result set actually changed.
 */
export function useKeyboardNavigableResults<T>(
  items: readonly T[],
  onSelect: (item: T) => void,
) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previousItems, setPreviousItems] = useState(items);

  if (items !== previousItems) {
    setPreviousItems(items);
    setActiveIndex(0);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (items.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(items.length - 1);
    } else if (event.key === "Enter") {
      const item = items[activeIndex];
      if (item) {
        event.preventDefault();
        onSelect(item);
      }
    }
  }

  return { activeIndex, setActiveIndex, onKeyDown };
}

export function searchResultDomId(row: SearchResultRow): string {
  return `search-result-${row.entityType}-${row.id}`;
}

type SearchResultsListProps = {
  groups: readonly SearchResultGroup[];
  query: string;
  activeIndex: number;
  onHoverIndex: (index: number) => void;
  onSelect: (row: SearchResultRow) => void;
};

/** Every row across every group, each paired with its flat position — computed once via `.map`'s own index, never a hand-mutated counter. */
function flattenWithIndex(
  groups: readonly SearchResultGroup[],
): { row: SearchResultRow; flatIndex: number }[] {
  const flatRows = groups.flatMap((group) => group.rows);
  return flatRows.map((row, flatIndex) => ({ row, flatIndex }));
}

/**
 * Grouped, highlighted result rendering (PROMPT 39: "grouped results",
 * "safe highlighting"). `activeIndex` is a flat index across every row in
 * every group, in display order — the same order the keyboard hook above
 * steps through, so the highlighted row always matches what Enter would
 * select.
 */
export function SearchResultsList({
  groups,
  query,
  activeIndex,
  onHoverIndex,
  onSelect,
}: SearchResultsListProps) {
  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-6 text-center text-sm">
        No results for &ldquo;{query}&rdquo;.
      </p>
    );
  }

  const indexById = new Map(
    flattenWithIndex(groups).map(({ row, flatIndex }) => [
      `${row.entityType}-${row.id}`,
      flatIndex,
    ]),
  );

  return (
    <div className="space-y-4" role="listbox" aria-label="Search results">
      {groups.map((group) => (
        <div key={group.entityType}>
          <p className="text-muted-foreground px-2 pb-1 text-xs font-medium tracking-wide uppercase">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.rows.map((row) => {
              const flatIndex = indexById.get(`${row.entityType}-${row.id}`) ?? 0;
              const isActive = flatIndex === activeIndex;
              return (
                <li key={`${row.entityType}-${row.id}`}>
                  <a
                    id={searchResultDomId(row)}
                    href={row.href}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => onHoverIndex(flatIndex)}
                    onClick={(event) => {
                      event.preventDefault();
                      onSelect(row);
                    }}
                    className={`flex flex-col gap-0.5 rounded-lg border border-transparent px-2 py-1.5 text-sm outline-none ${
                      isActive ? "bg-muted" : "hover:bg-muted"
                    }`}
                  >
                    <span className="truncate font-medium">
                      <HighlightedText text={row.title} query={query} />
                    </span>
                    {row.subtitle && (
                      <span className="text-muted-foreground truncate text-xs">
                        {row.subtitle}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
