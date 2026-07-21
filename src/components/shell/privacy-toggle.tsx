"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePrivacy } from "@/components/shared/privacy-provider";

/**
 * The hide-balance toggle: flips privacy mode for the whole app. Uses
 * `aria-pressed` so its on/off state is announced; display-only — never
 * writes anything but the 1-bit preference cookie.
 */
export function PrivacyToggle() {
  const { concealed, toggle } = usePrivacy();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-pressed={concealed}
          aria-label={concealed ? "Show balances" : "Hide balances"}
        >
          {concealed ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {concealed ? "Show balances" : "Hide balances"}
      </TooltipContent>
    </Tooltip>
  );
}
