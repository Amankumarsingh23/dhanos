"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NAV_ITEMS, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { searchAction } from "@/features/search/actions";
import {
  SearchResultsList,
  searchResultDomId,
  useKeyboardNavigableResults,
} from "@/features/search/result-list";
import type {
  SearchResultGroup,
  SearchResultRow,
} from "@/features/search/types";

/** Small enough that a quick-jump palette stays scannable — the full grouped view lives on /app/search (PROMPT 39: "result limits"). */
const PALETTE_LIMIT_PER_ENTITY = 5;
const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

type PaletteItem =
  { kind: "section"; item: NavItem } | { kind: "result"; row: SearchResultRow };

/**
 * Command-search trigger + palette: a header button and a ⌘K / Ctrl+K
 * shortcut open a dialog that searches both navigation sections (instant,
 * in-memory) and every household record type PROMPT 39 names (debounced,
 * server-side, RLS-scoped — see src/features/search/). Grouped results,
 * safe highlighting, and keyboard navigation are shared with the dedicated
 * /app/search page via src/features/search/result-list.tsx, so the two
 * surfaces never drift in behavior.
 */
export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchResultGroup[]>([]);
  const [isSearching, startSearchTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Cancel any pending debounced search on unmount only — not a state sync,
  // a genuine external-timer cleanup, so this stays a plain effect.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    const trimmed = value.trim();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setGroups([]);
      return;
    }
    const requestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(() => {
      startSearchTransition(async () => {
        const result = await searchAction(trimmed, PALETTE_LIMIT_PER_ENTITY);
        // Ignore a stale response that resolved after a newer keystroke.
        if (requestId === requestIdRef.current) {
          setGroups(result);
        }
      });
    }, SEARCH_DEBOUNCE_MS);
  }

  const trimmedQuery = query.trim();
  const isRecordSearch = trimmedQuery.length >= MIN_QUERY_LENGTH;

  const sectionItems = useMemo(
    () =>
      trimmedQuery
        ? NAV_ITEMS.filter((item) =>
            item.label.toLowerCase().includes(trimmedQuery.toLowerCase()),
          )
        : NAV_ITEMS,
    [trimmedQuery],
  );

  const sectionCountInPalette = isRecordSearch
    ? Math.min(3, sectionItems.length)
    : sectionItems.length;

  const paletteItems: PaletteItem[] = useMemo(() => {
    const sections = sectionItems
      .slice(0, isRecordSearch ? 3 : undefined)
      .map((item): PaletteItem => ({ kind: "section", item }));
    if (!isRecordSearch) {
      return sections;
    }
    const results = groups
      .flatMap((group) => group.rows)
      .map((row): PaletteItem => ({ kind: "result", row }));
    return [...sections, ...results];
  }, [sectionItems, isRecordSearch, groups]);

  function closeAndReset() {
    setOpen(false);
    setQuery("");
    setGroups([]);
  }

  function handleSelect(paletteItem: PaletteItem) {
    const href =
      paletteItem.kind === "section"
        ? paletteItem.item.href
        : paletteItem.row.href;
    closeAndReset();
    router.push(href);
  }

  const { activeIndex, setActiveIndex, onKeyDown } =
    useKeyboardNavigableResults(paletteItems, handleSelect);

  function handleViewAllResults() {
    closeAndReset();
    router.push(`/app/search?q=${encodeURIComponent(trimmedQuery)}`);
  }

  const resultActiveIndex = activeIndex - sectionCountInPalette;
  const activePaletteItem = paletteItems[activeIndex];
  const activeDescendantId =
    activePaletteItem?.kind === "result"
      ? searchResultDomId(activePaletteItem.row)
      : activePaletteItem?.kind === "section"
        ? `command-search-section-${activePaletteItem.item.href}`
        : undefined;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        // Button's base class hardcodes shrink-0 (never shrink, so an
        // icon/label pair never gets squished elsewhere) — that's exactly
        // wrong for this one instance, a w-full flex item in the header's
        // narrow-viewport row: shrink-0 + w-full made it refuse to give up
        // its ~288px, overflowing the page horizontally below ~420px wide
        // (PROMPT 44 — real horizontal overflow, not just a chart/table
        // issue). min-w-0 + shrink override that for this button only.
        className="text-muted-foreground w-full min-w-0 shrink justify-start gap-2 sm:w-56"
        onClick={() => setOpen(true)}
      >
        <SearchIcon aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">Search…</span>
        {/* text-muted-foreground on bg-muted (4.34:1) falls just under
            WCAG's 4.5:1 text minimum; text-foreground/70 clears ~7:1 in
            both themes while keeping the same muted look. */}
        <kbd className="bg-muted text-foreground/70 pointer-events-none hidden rounded border px-1 font-mono text-[10px] sm:inline-block">
          ⌘K
        </kbd>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            closeAndReset();
          } else {
            setOpen(next);
          }
        }}
      >
        <DialogContent className="top-[15%] max-h-[70vh] translate-y-0 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Search</DialogTitle>
            <DialogDescription>
              Jump to a section, or search accounts, transactions, people,
              investments, loans, documents, and more across your workspace.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Search everything…"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search"
            aria-activedescendant={activeDescendantId}
          />

          {sectionCountInPalette > 0 && (
            <div>
              <p className="text-muted-foreground px-2 pb-1 text-xs font-medium tracking-wide uppercase">
                Sections
              </p>
              <ul className="space-y-0.5" role="listbox" aria-label="Sections">
                {sectionItems
                  .slice(0, isRecordSearch ? 3 : undefined)
                  .map((item, index) => (
                    <li key={item.href} role="presentation">
                      <button
                        type="button"
                        role="option"
                        id={`command-search-section-${item.href}`}
                        aria-selected={index === activeIndex}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => handleSelect({ kind: "section", item })}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-sm outline-none",
                          index === activeIndex ? "bg-muted" : "hover:bg-muted",
                        )}
                      >
                        <item.icon
                          className="text-muted-foreground size-4"
                          aria-hidden="true"
                        />
                        {item.label}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {isRecordSearch && (
            <>
              {isSearching && groups.length === 0 ? (
                <p className="text-muted-foreground px-2 py-4 text-center text-sm">
                  Searching…
                </p>
              ) : (
                <SearchResultsList
                  groups={groups}
                  query={trimmedQuery}
                  activeIndex={resultActiveIndex}
                  onHoverIndex={(index) =>
                    setActiveIndex(index + sectionCountInPalette)
                  }
                  onSelect={(row) => handleSelect({ kind: "result", row })}
                />
              )}
              {groups.length > 0 && (
                <button
                  type="button"
                  onClick={handleViewAllResults}
                  className="text-muted-foreground hover:text-foreground px-2 py-1.5 text-left text-xs underline-offset-2 hover:underline"
                >
                  View all results for &ldquo;{trimmedQuery}&rdquo; →
                </button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
