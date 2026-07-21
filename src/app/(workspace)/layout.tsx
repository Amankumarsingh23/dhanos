import { requireUser } from "@/lib/auth/session";
import { EmailVerificationBanner } from "@/components/shared/email-verification-banner";
import { AuthSessionListener } from "@/components/shared/auth-session-listener";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirects to /login if there's no session — nothing in this route group
  // (including the app shell) renders for an unauthenticated visitor. This
  // is a UX convenience, not the security boundary — Row Level Security is.
  // See docs/security-model.md §3.
  const user = await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AuthSessionListener />
      {!user.email_confirmed_at && user.email && (
        <EmailVerificationBanner email={user.email} />
      )}
      {children}
    </div>
  );
}
