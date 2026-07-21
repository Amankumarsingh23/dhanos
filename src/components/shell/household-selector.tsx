"use client";

import { CheckIcon, ChevronsUpDownIcon, HomeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type HouseholdSelectorProps = {
  householdName: string;
};

/**
 * Household selector foundation. Today every user belongs to exactly one
 * household (one owner-membership per user, no invite flow yet — see
 * docs/database-plan.md §2), so this renders the current household and a
 * disabled affordance for future switching rather than a working switcher.
 * When multi-household membership ships, this becomes a real selector and
 * the active-household choice moves into a cookie/profile preference.
 */
export function HouseholdSelector({ householdName }: HouseholdSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 overflow-hidden"
          aria-label={`Household: ${householdName}`}
        >
          <HomeIcon className="text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 truncate text-left">{householdName}</span>
          <ChevronsUpDownIcon
            className="text-muted-foreground size-3.5"
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Your households</DropdownMenuLabel>
        <DropdownMenuItem disabled>
          <CheckIcon aria-hidden="true" />
          <span className="truncate">{householdName}</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled className="text-muted-foreground">
          Multiple households coming later
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
