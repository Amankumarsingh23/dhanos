"use client";

import { cn } from "@/lib/utils";
import { usePrivacy } from "@/components/shared/privacy-provider";

const MASK = "••••••";

type SensitiveAmountProps = {
  /**
   * The already-formatted display string (e.g. from formatMoney). Kept as a
   * string prop deliberately: formatting stays server-side, and this
   * component's only job is to show or conceal it. Never pass this value
   * into document titles, metadata, or console logs — it renders in the
   * page body only.
   */
  value: string;
  className?: string;
};

/**
 * Renders a sensitive financial amount, replaced by a mask while privacy
 * mode is on. Concealment is purely presentational (the underlying data is
 * untouched); screen readers get an explicit "Amount hidden" rather than
 * reading out dots.
 */
export function SensitiveAmount({ value, className }: SensitiveAmountProps) {
  const { concealed } = usePrivacy();

  if (concealed) {
    return (
      <span data-sensitive="concealed" className={cn(className)}>
        <span aria-hidden="true">{MASK}</span>
        <span className="sr-only">Amount hidden</span>
      </span>
    );
  }

  return (
    <span data-sensitive="revealed" className={cn(className)}>
      {value}
    </span>
  );
}
