"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavItemActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Route-aware primary navigation list — used by both the desktop sidebar
 * and the mobile sheet. `aria-current="page"` marks the active item for
 * assistive tech; every link is a plain anchor, so keyboard Tab/Enter
 * behavior needs no extra handling.
 */
export function SidebarNav({
  onNavigate,
}: {
  /** Called after a link is activated — the mobile sheet closes itself with this. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary">
      <ul className="space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-visible:border-ring focus-visible:ring-ring/50 flex items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:ring-3",
                  active
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
