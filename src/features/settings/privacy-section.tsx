"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NativeSelect } from "@/components/forms/native-select";
import { usePrivacy } from "@/components/shared/privacy-provider";
import { updatePrivacyPreferencesAction } from "./actions";
import type { Tables } from "@/types/database";

type PrivacySectionProps = {
  profile: Tables<"profiles">;
};

const INACTIVITY_TIMEOUT_OPTIONS = [
  { value: "", label: "Off" },
  { value: "5", label: "5 minutes" },
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
];

function CheckboxRow({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <input
        id={id}
        type="checkbox"
        className="border-input mt-0.5 size-4 rounded"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <div className="min-w-0">
        <Label htmlFor={id} className="font-medium">
          {label}
        </Label>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
    </div>
  );
}

/** Settings > Privacy (PROMPT 40): live hide-balances toggle plus five persisted preferences, all self-scoped to the signed-in user's own profile. */
export function PrivacySection({ profile }: PrivacySectionProps) {
  const router = useRouter();
  const { concealed, toggle } = usePrivacy();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const [defaultConcealed, setDefaultConcealed] = useState(
    profile.privacy_default_concealed,
  );
  const [concealDashboardOnLaunch, setConcealDashboardOnLaunch] = useState(
    profile.privacy_conceal_dashboard_on_launch,
  );
  const [screenshotSensitiveMode, setScreenshotSensitiveMode] = useState(
    profile.privacy_screenshot_sensitive_mode,
  );
  const [inactivityTimeoutMinutes, setInactivityTimeoutMinutes] = useState(
    profile.privacy_inactivity_timeout_minutes,
  );
  const [notificationsIncludeAmounts, setNotificationsIncludeAmounts] =
    useState(profile.notifications_include_amounts);

  function save(overrides: Partial<{
    defaultConcealed: boolean;
    concealDashboardOnLaunch: boolean;
    screenshotSensitiveMode: boolean;
    inactivityTimeoutMinutes: number | null;
    notificationsIncludeAmounts: boolean;
  }>) {
    setFormError(null);
    const next = {
      privacyDefaultConcealed: overrides.defaultConcealed ?? defaultConcealed,
      privacyConcealDashboardOnLaunch:
        overrides.concealDashboardOnLaunch ?? concealDashboardOnLaunch,
      privacyScreenshotSensitiveMode:
        overrides.screenshotSensitiveMode ?? screenshotSensitiveMode,
      privacyInactivityTimeoutMinutes:
        overrides.inactivityTimeoutMinutes !== undefined
          ? overrides.inactivityTimeoutMinutes
          : inactivityTimeoutMinutes,
      notificationsIncludeAmounts:
        overrides.notificationsIncludeAmounts ?? notificationsIncludeAmounts,
    };
    startTransition(async () => {
      const result = await updatePrivacyPreferencesAction(next);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Privacy preferences saved");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {formError && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between border-b py-3">
          <div>
            <p className="text-sm font-medium">Hide balances (right now)</p>
            <p className="text-muted-foreground text-xs">
              Conceals every amount in the app immediately, for this browser.
              The same toggle as the header&rsquo;s privacy button.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={toggle}>
            {concealed ? "Reveal" : "Hide"}
          </Button>
        </div>

        <CheckboxRow
          id="privacyDefaultConcealed"
          label="Default to concealed on a new device"
          description="When you sign in on a browser that's never set this preference before, start with balances hidden rather than revealed."
          checked={defaultConcealed}
          disabled={isPending}
          onChange={(checked) => {
            setDefaultConcealed(checked);
            save({ defaultConcealed: checked });
          }}
        />

        <CheckboxRow
          id="privacyConcealDashboardOnLaunch"
          label="Always start the dashboard concealed"
          description="The dashboard shows the most numbers on one page — force it hidden the first time you open it each session, even if the rest of the app isn't concealed. You can still reveal it with the toggle."
          checked={concealDashboardOnLaunch}
          disabled={isPending}
          onChange={(checked) => {
            setConcealDashboardOnLaunch(checked);
            save({ concealDashboardOnLaunch: checked });
          }}
        />

        <CheckboxRow
          id="privacyScreenshotSensitiveMode"
          label="Screenshot-sensitive mode"
          description="Blurs the app whenever this browser tab loses focus (switching apps, a screen share starting). This does not and cannot prevent an actual OS-level screenshot or recording — no browser can do that."
          checked={screenshotSensitiveMode}
          disabled={isPending}
          onChange={(checked) => {
            setScreenshotSensitiveMode(checked);
            save({ screenshotSensitiveMode: checked });
          }}
        />

        <div className="flex items-start justify-between gap-4 border-t py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Inactivity timeout</p>
            <p className="text-muted-foreground text-xs">
              Not yet enforced — this is saved for a future automatic
              sign-out feature. Choosing a value today doesn&rsquo;t sign you
              out yet.
            </p>
          </div>
          <NativeSelect
            className="w-32 shrink-0"
            aria-label="Inactivity timeout"
            disabled={isPending}
            value={inactivityTimeoutMinutes?.toString() ?? ""}
            onChange={(event) => {
              const minutes =
                event.target.value === "" ? null : Number(event.target.value);
              setInactivityTimeoutMinutes(minutes);
              save({ inactivityTimeoutMinutes: minutes });
            }}
          >
            {INACTIVITY_TIMEOUT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <CheckboxRow
          id="notificationsIncludeAmounts"
          label="Include amounts in notifications"
          description="Applies to future email/push notifications only — no notification-sending feature exists in this app yet. Turning this off is saved now so it's ready once one does."
          checked={notificationsIncludeAmounts}
          disabled={isPending}
          onChange={(checked) => {
            setNotificationsIncludeAmounts(checked);
            save({ notificationsIncludeAmounts: checked });
          }}
        />
      </CardContent>
    </Card>
  );
}
