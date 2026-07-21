"use client";

import { useEffect, useMemo, useState } from "react";
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
import { NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Command-search trigger + palette: a header button and a ⌘K / Ctrl+K
 * shortcut open a dialog that filters the primary navigation and jumps to
 * the chosen section. Search covers navigation only for now — searching
 * actual financial records comes with those modules, and search results
 * must never include raw balances (privacy mode applies everywhere).
 */
export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

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

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return NAV_ITEMS;
    }
    return NAV_ITEMS.filter((item) =>
      item.label.toLowerCase().includes(normalized),
    );
  }, [query]);

  function handleSelect(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-muted-foreground w-full justify-start gap-2 sm:w-56"
        onClick={() => setOpen(true)}
      >
        <SearchIcon aria-hidden="true" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="bg-muted text-muted-foreground pointer-events-none hidden rounded border px-1 font-mono text-[10px] sm:inline-block">
          ⌘K
        </kbd>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery("");
          }
        }}
      >
        <DialogContent className="top-[20%] translate-y-0 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Search</DialogTitle>
            <DialogDescription>
              Jump to a section of your workspace.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Type a section name…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results[0]) {
                event.preventDefault();
                handleSelect(results[0].href);
              }
            }}
            aria-label="Search sections"
          />
          <ul className="max-h-64 space-y-0.5 overflow-y-auto" role="listbox">
            {results.length === 0 && (
              <li className="text-muted-foreground px-2 py-3 text-center text-sm">
                No matching sections.
              </li>
            )}
            {results.map((item) => (
              <li key={item.href}>
                <button
                  type="button"
                  onClick={() => handleSelect(item.href)}
                  className={cn(
                    "hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-3",
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
        </DialogContent>
      </Dialog>
    </>
  );
}
