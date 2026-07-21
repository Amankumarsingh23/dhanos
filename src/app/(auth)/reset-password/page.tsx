import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Set new password — DhanOS",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
