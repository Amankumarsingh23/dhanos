"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormErrorMessage } from "@/components/forms/form-error-message";
import { cn } from "@/lib/utils";
import { onboardingSchema, type OnboardingValues } from "@/lib/validation/auth";
import { completeOnboardingAction } from "@/features/auth/actions";
import type { Tables } from "@/types/database";

const selectClassName = cn(
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:ring-3 md:text-sm",
);

type OnboardingFormProps = {
  profile: Tables<"profiles">;
  /** Prefills from an already-created household when re-visiting onboarding — see docs/security-model.md's onboarding-retry note. */
  household: Tables<"households"> | null;
};

export function OnboardingForm({ profile, household }: OnboardingFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const timezones = useMemo(() => {
    if (typeof Intl.supportedValuesOf === "function") {
      return Intl.supportedValuesOf("timeZone");
    }
    return [profile.timezone];
  }, [profile.timezone]);

  const currencyCodes = useMemo(() => {
    if (typeof Intl.supportedValuesOf === "function") {
      return Intl.supportedValuesOf("currency");
    }
    return [profile.default_currency_code];
  }, [profile.default_currency_code]);

  const locales = [
    { code: "en-IN", label: "English (India)" },
    { code: "en-US", label: "English (United States)" },
    { code: "en-GB", label: "English (United Kingdom)" },
    { code: "hi-IN", label: "Hindi (India)" },
  ];

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      fullName: profile.full_name ?? "",
      householdName: household?.name ?? "",
      timezone: household?.timezone ?? profile.timezone,
      locale: profile.locale,
      baseCurrencyCode:
        household?.base_currency_code ?? profile.default_currency_code,
      financialMonthStartDay: household?.financial_month_start_day ?? 1,
    },
  });

  function onSubmit(values: OnboardingValues) {
    setFormError(null);
    startTransition(async () => {
      const result = await completeOnboardingAction(values);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      router.push("/app");
    });
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>
          <h1>Set up your account</h1>
        </CardTitle>
        <CardDescription>
          Tell us a bit about yourself and your household — you can change any
          of this later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              autoComplete="name"
              aria-invalid={!!errors.fullName}
              aria-describedby={errors.fullName ? "fullName-error" : undefined}
              {...register("fullName")}
            />
            <FormErrorMessage
              id="fullName-error"
              message={errors.fullName?.message}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="householdName">Household name</Label>
            <Input
              id="householdName"
              placeholder="e.g. The Sharma Household"
              aria-invalid={!!errors.householdName}
              aria-describedby={
                errors.householdName ? "householdName-error" : undefined
              }
              {...register("householdName")}
            />
            <FormErrorMessage
              id="householdName-error"
              message={errors.householdName?.message}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="timezone">Timezone</Label>
              <select
                id="timezone"
                className={selectClassName}
                aria-invalid={!!errors.timezone}
                aria-describedby={
                  errors.timezone ? "timezone-error" : undefined
                }
                {...register("timezone")}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <FormErrorMessage
                id="timezone-error"
                message={errors.timezone?.message}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="locale">Locale</Label>
              <select
                id="locale"
                className={selectClassName}
                aria-invalid={!!errors.locale}
                aria-describedby={errors.locale ? "locale-error" : undefined}
                {...register("locale")}
              >
                {locales.map((locale) => (
                  <option key={locale.code} value={locale.code}>
                    {locale.label}
                  </option>
                ))}
              </select>
              <FormErrorMessage
                id="locale-error"
                message={errors.locale?.message}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="baseCurrencyCode">Base currency</Label>
              <select
                id="baseCurrencyCode"
                className={selectClassName}
                aria-invalid={!!errors.baseCurrencyCode}
                aria-describedby={
                  errors.baseCurrencyCode ? "baseCurrencyCode-error" : undefined
                }
                {...register("baseCurrencyCode")}
              >
                {currencyCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <FormErrorMessage
                id="baseCurrencyCode-error"
                message={errors.baseCurrencyCode?.message}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="financialMonthStartDay">
                Financial month starts on
              </Label>
              <Input
                id="financialMonthStartDay"
                type="number"
                min={1}
                max={28}
                aria-invalid={!!errors.financialMonthStartDay}
                aria-describedby={
                  errors.financialMonthStartDay
                    ? "financialMonthStartDay-error"
                    : undefined
                }
                {...register("financialMonthStartDay", { valueAsNumber: true })}
              />
              <FormErrorMessage
                id="financialMonthStartDay-error"
                message={errors.financialMonthStartDay?.message}
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Saving…" : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
