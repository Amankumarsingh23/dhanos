"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/forms/native-select";
import type { ReportFilterKey } from "@/lib/validation/reports";

export type SelectOption = { id: string; label: string };

type ReportFiltersBarProps = {
  relevantFilters: readonly ReportFilterKey[];
  values: {
    dateFrom?: string;
    dateTo?: string;
    personId?: string;
    accountId?: string;
    institutionId?: string;
    categoryId?: string;
    assetClass?: string;
  };
  people: readonly SelectOption[];
  accounts: readonly SelectOption[];
  institutions: readonly SelectOption[];
  categories: readonly SelectOption[];
  /** The label shown above the category select — varies by report ("Category" for expenses, "Policy type" for insurance). */
  categoryLabel: string;
  assetClasses: readonly SelectOption[];
};

/**
 * Renders only the filter controls a report actually declared as relevant
 * (ReportDefinition.relevantFilters) — a filter a report can't act on is
 * never shown, so a household never sets one and wonders why nothing
 * changed. Every control drives the URL via searchParams, matching every
 * other filtered list page in this app (documents, assets, ...).
 */
export function ReportFiltersBar({
  relevantFilters,
  values,
  people,
  accounts,
  institutions,
  categories,
  categoryLabel,
  assetClasses,
}: ReportFiltersBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  if (relevantFilters.length === 0) {
    return null;
  }

  const hasActiveFilter = Object.values(values).some((value) => Boolean(value));

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border p-3">
      {relevantFilters.includes("dateRange") && (
        <>
          <div className="space-y-1">
            <Label htmlFor="dateFrom" className="text-xs">
              From
            </Label>
            <Input
              id="dateFrom"
              type="date"
              className="w-auto"
              value={values.dateFrom ?? ""}
              onChange={(event) => updateParams({ dateFrom: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dateTo" className="text-xs">
              To
            </Label>
            <Input
              id="dateTo"
              type="date"
              className="w-auto"
              value={values.dateTo ?? ""}
              onChange={(event) => updateParams({ dateTo: event.target.value })}
            />
          </div>
        </>
      )}
      {relevantFilters.includes("person") && (
        <div className="space-y-1">
          <Label htmlFor="personId" className="text-xs">
            Person
          </Label>
          <NativeSelect
            id="personId"
            className="w-auto"
            value={values.personId ?? ""}
            onChange={(event) => updateParams({ personId: event.target.value })}
          >
            <option value="">Everyone</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      {relevantFilters.includes("account") && (
        <div className="space-y-1">
          <Label htmlFor="accountId" className="text-xs">
            Account
          </Label>
          <NativeSelect
            id="accountId"
            className="w-auto"
            value={values.accountId ?? ""}
            onChange={(event) => updateParams({ accountId: event.target.value })}
          >
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      {relevantFilters.includes("institution") && (
        <div className="space-y-1">
          <Label htmlFor="institutionId" className="text-xs">
            Institution
          </Label>
          <NativeSelect
            id="institutionId"
            className="w-auto"
            value={values.institutionId ?? ""}
            onChange={(event) =>
              updateParams({ institutionId: event.target.value })
            }
          >
            <option value="">All institutions</option>
            {institutions.map((institution) => (
              <option key={institution.id} value={institution.id}>
                {institution.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      {relevantFilters.includes("category") && (
        <div className="space-y-1">
          <Label htmlFor="categoryId" className="text-xs">
            {categoryLabel}
          </Label>
          <NativeSelect
            id="categoryId"
            className="w-auto"
            value={values.categoryId ?? ""}
            onChange={(event) => updateParams({ categoryId: event.target.value })}
          >
            <option value="">All</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      {relevantFilters.includes("assetClass") && (
        <div className="space-y-1">
          <Label htmlFor="assetClass" className="text-xs">
            Asset class
          </Label>
          <NativeSelect
            id="assetClass"
            className="w-auto"
            value={values.assetClass ?? ""}
            onChange={(event) => updateParams({ assetClass: event.target.value })}
          >
            <option value="">All asset classes</option>
            {assetClasses.map((assetClass) => (
              <option key={assetClass.id} value={assetClass.id}>
                {assetClass.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      {hasActiveFilter && (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
