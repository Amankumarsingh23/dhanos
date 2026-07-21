"use client";

import { useTransition } from "react";
import { MailWarningIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { resendVerificationAction } from "@/features/auth/actions";

/**
 * Persistent banner shown while the signed-in user's email is unverified —
 * relevant once supabase/config.toml's [auth.email] enable_confirmations is
 * turned on (off in local dev today). See docs/security-model.md §2.
 */
export function EmailVerificationBanner({ email }: { email: string }) {
  const [isPending, startTransition] = useTransition();

  function handleResend() {
    startTransition(async () => {
      const result = await resendVerificationAction(email);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Verification email sent.");
    });
  }

  return (
    <Alert className="rounded-none border-x-0 border-t-0">
      <MailWarningIcon />
      <AlertTitle>Verify your email</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-2">
        <span>
          Please verify <strong>{email}</strong> to keep full access to your
          account.
        </span>
        <Button
          size="xs"
          variant="outline"
          onClick={handleResend}
          disabled={isPending}
        >
          {isPending ? "Sending…" : "Resend email"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
