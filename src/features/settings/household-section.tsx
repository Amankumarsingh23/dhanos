"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NativeSelect } from "@/components/forms/native-select";
import { FormErrorMessage } from "@/components/forms/form-error-message";
import {
  updateHouseholdSettingsSchema,
  type UpdateHouseholdSettingsInput,
} from "@/lib/validation/settings";
import { updateHouseholdSettingsAction } from "./actions";
import type { Household } from "@/lib/households/permissions";

type HouseholdSectionProps = {
  household: Household;
  /** Only owner/admin (canManageHousehold) can submit — viewer/editor see every field read-only. RLS backs this up independently. */
  canManage: boolean;
};

/** Settings > Household (PROMPT 40): name, base currency, financial month, timezone (drives every due-date computation — reminders, recurring, SIPs), and default goal assumptions. Owner/admin only. */
export function HouseholdSection({
  household,
  canManage,
}: HouseholdSectionProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const timezones = useMemo(() => {
    const supported =
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : [];
    // See ProfileSection's identical guard: ICU's canonical list can use a
    // different (still-valid) IANA alias than what's stored (e.g.
    // "Asia/Calcutta" vs. "Asia/Kolkata").
    return supported.includes(household.timezone)
      ? supported
      : [household.timezone, ...supported];
  }, [household.timezone]);

  const currencyCodes = useMemo(() => {
    if (typeof Intl.supportedValuesOf === "function") {
      return Intl.supportedValuesOf("currency");
    }
    return [household.base_currency_code];
  }, [household.base_currency_code]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateHouseholdSettingsInput>({
    resolver: zodResolver(updateHouseholdSettingsSchema),
    defaultValues: {
      name: household.name,
      baseCurrencyCode: household.base_currency_code,
      timezone: household.timezone,
      financialMonthStartDay: household.financial_month_start_day,
      defaultGoalAnnualInflationRate: household.default_goal_annual_inflation_rate,
      defaultGoalAnnualExpectedReturn: household.default_goal_annual_expected_return,
    },
  });

  function onSubmit(values: UpdateHouseholdSettingsInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await updateHouseholdSettingsAction(household.id, values);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Household settings updated");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Household</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        {!canManage && (
          <p className="text-muted-foreground text-xs">
            Only the household&rsquo;s owner or an admin can change these
            settings — you can view them, not edit them.
          </p>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="householdName">Household name</Label>
            <Input
              id="householdName"
              disabled={!canManage}
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            <FormErrorMessage message={errors.name?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="baseCurrencyCode">Base currency</Label>
              <NativeSelect
                id="baseCurrencyCode"
                disabled={!canManage}
                aria-invalid={!!errors.baseCurrencyCode}
                {...register("baseCurrencyCode")}
              >
                {currencyCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.baseCurrencyCode?.message} />
              <p className="text-muted-foreground text-xs">
                Used to filter/label net-worth and dashboard rollups — never
                converts a stored account or transaction amount. An account
                in a different currency is excluded from these totals, not
                converted (this app has no FX conversion engine).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="householdTimezone">Timezone</Label>
              <NativeSelect
                id="householdTimezone"
                disabled={!canManage}
                aria-invalid={!!errors.timezone}
                {...register("timezone")}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.timezone?.message} />
              <p className="text-muted-foreground text-xs">
                Drives every shared due-date computation — reminders, EMI
                and SIP due dates, and the financial month boundary below.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="financialMonthStartDay">
              Financial month starts on day
            </Label>
            <Input
              id="financialMonthStartDay"
              type="number"
              min={1}
              max={28}
              disabled={!canManage}
              aria-invalid={!!errors.financialMonthStartDay}
              {...register("financialMonthStartDay", { valueAsNumber: true })}
            />
            <FormErrorMessage
              message={errors.financialMonthStartDay?.message}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="defaultGoalAnnualInflationRate">
                Default goal inflation assumption
              </Label>
              <Input
                id="defaultGoalAnnualInflationRate"
                type="number"
                step="0.001"
                disabled={!canManage}
                aria-invalid={!!errors.defaultGoalAnnualInflationRate}
                {...register("defaultGoalAnnualInflationRate", {
                  valueAsNumber: true,
                })}
              />
              <FormErrorMessage
                message={errors.defaultGoalAnnualInflationRate?.message}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="defaultGoalAnnualExpectedReturn">
                Default goal expected-return assumption
              </Label>
              <Input
                id="defaultGoalAnnualExpectedReturn"
                type="number"
                step="0.001"
                disabled={!canManage}
                aria-invalid={!!errors.defaultGoalAnnualExpectedReturn}
                {...register("defaultGoalAnnualExpectedReturn", {
                  valueAsNumber: true,
                })}
              />
              <FormErrorMessage
                message={errors.defaultGoalAnnualExpectedReturn?.message}
              />
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            Decimals, e.g. 0.06 for 6%/year. Only prefills a brand-new
            goal&rsquo;s own assumption fields — never changes an
            already-created goal&rsquo;s stored assumption, and never a
            guaranteed return (see the Money Classroom&rsquo;s Risk topic).
          </p>
          {canManage && (
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save household settings"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
