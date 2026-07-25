"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  updateProfileSchema,
  isAllowedAvatarMimeType,
  MAX_AVATAR_SIZE_BYTES,
  type UpdateProfileInput,
} from "@/lib/validation/settings";
import {
  prepareAvatarUploadAction,
  removeAvatarAction,
  saveAvatarAction,
  updateProfileAction,
} from "./actions";
import type { Tables } from "@/types/database";

const LOCALES = [
  { code: "en-IN", label: "English (India)" },
  { code: "en-US", label: "English (United States)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "hi-IN", label: "Hindi (India)" },
];

type ProfileSectionProps = {
  profile: Tables<"profiles">;
  avatarUrl: string | null;
};

/** Settings > Profile (PROMPT 40): name, avatar, timezone, locale, and personal default currency — self-scoped, no household role required (RLS: a profile can only ever be updated by its own owner). */
export function ProfileSection({ profile, avatarUrl }: ProfileSectionProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const timezones = useMemo(() => {
    const supported =
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : [];
    // ICU's canonical list can use a different (still-valid) IANA alias
    // than what's stored (e.g. "Asia/Calcutta" vs. "Asia/Kolkata") — always
    // include the current value explicitly so the select never silently
    // falls back to blank/first-option on load.
    return supported.includes(profile.timezone)
      ? supported
      : [profile.timezone, ...supported];
  }, [profile.timezone]);

  const currencyCodes = useMemo(() => {
    if (typeof Intl.supportedValuesOf === "function") {
      return Intl.supportedValuesOf("currency");
    }
    return [profile.default_currency_code];
  }, [profile.default_currency_code]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      fullName: profile.full_name ?? "",
      timezone: profile.timezone,
      locale: profile.locale,
      defaultCurrencyCode: profile.default_currency_code,
    },
  });

  function onSubmit(values: UpdateProfileInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await updateProfileAction(values);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Profile updated");
      router.refresh();
    });
  }

  async function handleAvatarFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!isAllowedAvatarMimeType(file.type)) {
      toast.error("Use a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      toast.error("Image must be 2 MB or smaller.");
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const prepared = await prepareAvatarUploadAction(file.name);
      if (!prepared.ok) {
        toast.error(prepared.error);
        return;
      }
      const browserSupabase = createBrowserClient();
      const { error: uploadError } = await browserSupabase.storage
        .from("avatars")
        .upload(prepared.data.storagePath, file, { contentType: file.type });
      if (uploadError) {
        toast.error("Could not upload the image. Please try again.");
        return;
      }
      const saved = await saveAvatarAction(prepared.data.storagePath);
      if (!saved.ok) {
        await browserSupabase.storage
          .from("avatars")
          .remove([prepared.data.storagePath]);
        toast.error(saved.error);
        return;
      }
      toast.success("Avatar updated");
      router.refresh();
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  function handleRemoveAvatar() {
    startTransition(async () => {
      const result = await removeAvatarAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Avatar removed");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-4">
          <div className="bg-muted size-16 shrink-0 overflow-hidden rounded-full">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived Storage URL, not a static asset Next's image optimizer should cache.
              <img
                src={avatarUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <div className="text-muted-foreground flex size-full items-center justify-center text-lg font-medium">
                {(profile.full_name ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleAvatarFileChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploadingAvatar}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploadingAvatar ? "Uploading…" : "Change avatar"}
            </Button>
            {profile.avatar_path && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={handleRemoveAvatar}
              >
                Remove
              </Button>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Name</Label>
            <Input
              id="fullName"
              aria-invalid={!!errors.fullName}
              {...register("fullName")}
            />
            <FormErrorMessage message={errors.fullName?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="timezone">Timezone</Label>
              <NativeSelect
                id="timezone"
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
                Personal display preference only — your household&rsquo;s
                shared due dates use the timezone set under Household below.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="locale">Locale</Label>
              <NativeSelect
                id="locale"
                aria-invalid={!!errors.locale}
                {...register("locale")}
              >
                {LOCALES.map((locale) => (
                  <option key={locale.code} value={locale.code}>
                    {locale.label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.locale?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="defaultCurrencyCode">
              Personal display currency
            </Label>
            <NativeSelect
              id="defaultCurrencyCode"
              aria-invalid={!!errors.defaultCurrencyCode}
              {...register("defaultCurrencyCode")}
            >
              {currencyCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </NativeSelect>
            <FormErrorMessage message={errors.defaultCurrencyCode?.message} />
            <p className="text-muted-foreground text-xs">
              Affects only how amounts are formatted for you (grouping,
              symbol) — never a stored value. Every account and transaction
              keeps its own actual currency regardless of this setting.
            </p>
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
