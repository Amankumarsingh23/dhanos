"use client";

import { useState, useTransition } from "react";
import { MailCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resendVerificationAction } from "@/features/auth/actions";

/** Shown after sign-up when email confirmation is required before sign-in. */
export function VerifyEmailNotice({ email }: { email: string }) {
  const [isPending, startTransition] = useTransition();
  const [resent, setResent] = useState(false);

  function handleResend() {
    startTransition(async () => {
      const result = await resendVerificationAction(email);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setResent(true);
      toast.success("Verification email sent.");
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <MailCheckIcon
          className="text-muted-foreground mb-2 size-8"
          aria-hidden="true"
        />
        <CardTitle>
          <h1>Check your email</h1>
        </CardTitle>
        <CardDescription>
          We sent a confirmation link to <strong>{email}</strong>. Click it to
          verify your account before signing in.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <Button
          variant="outline"
          onClick={handleResend}
          disabled={isPending || resent}
        >
          {resent ? "Email sent" : isPending ? "Resending…" : "Resend email"}
        </Button>
      </CardContent>
    </Card>
  );
}
