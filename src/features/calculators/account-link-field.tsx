"use client";

import { NativeSelect } from "@/components/forms/native-select";
import { Label } from "@/components/ui/label";
import { minorUnitExponent } from "@/lib/money/currency";

export type LinkableAccount = {
  id: string;
  name: string;
  currencyCode: string;
  currentBalanceMinorUnits: number;
};

type AccountLinkFieldProps = {
  fieldId: string;
  accounts: LinkableAccount[];
  value: string;
  label?: string;
  /** Called with the selected account's id (or "" for standalone) and, when an account was picked, its current balance pre-formatted as a decimal string ready to drop into an amount field. */
  onChange: (accountId: string, prefillAmount: string | null) => void;
};

/**
 * The shared "account-linked calculator" control (PROMPT 20: "standalone
 * and account-linked calculators") — picking a real account prefills the
 * relevant amount field from that account's current calculated balance
 * (see src/lib/calculations/account-balance.ts), but the field stays
 * editable afterward, so a linked calculator is still just a what-if, not
 * a live-bound view of the account.
 */
export function AccountLinkField({
  fieldId,
  accounts,
  value,
  label = "Link to an account (optional)",
  onChange,
}: AccountLinkFieldProps) {
  if (accounts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <NativeSelect
        id={fieldId}
        value={value}
        onChange={(event) => {
          const accountId = event.target.value;
          const account = accounts.find((a) => a.id === accountId);
          if (!account) {
            onChange("", null);
            return;
          }
          const exponent = minorUnitExponent(account.currencyCode);
          const prefillAmount = (
            account.currentBalanceMinorUnits /
            10 ** exponent
          ).toString();
          onChange(accountId, prefillAmount);
        }}
      >
        <option value="">Standalone (no account)</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
