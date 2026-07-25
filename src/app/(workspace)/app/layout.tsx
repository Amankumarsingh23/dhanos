import { cookies } from "next/headers";
import { requireOnboardedUser } from "@/lib/auth/session";
import { requireHousehold } from "@/lib/households/permissions";
import { PRIVACY_COOKIE_NAME } from "@/lib/privacy/constants";
import { PrivacyProvider } from "@/components/shared/privacy-provider";
import { ScreenshotSensitiveGuard } from "@/components/shared/screenshot-sensitive-guard";
import { PrivacyToggle } from "@/components/shell/privacy-toggle";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { MobileNav } from "@/components/shell/mobile-nav";
import { UserMenu } from "@/components/shell/user-menu";
import { HouseholdSelector } from "@/components/shell/household-selector";
import { CommandSearch } from "@/components/shell/command-search";

/**
 * The authenticated app shell: desktop sidebar, mobile sheet nav, header
 * with command search / privacy toggle / user menu. Gated here (not just
 * per page) so no nested route can render the shell without a session,
 * a completed profile, and a household.
 *
 * Privacy mode's initial value is read from its cookie *on the server* so
 * SSR HTML and the client's first render agree — this is what keeps
 * toggled-on privacy mode surviving a hard refresh without a flash of
 * revealed amounts or a hydration mismatch.
 */
export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireOnboardedUser();
  const { user, household } = await requireHousehold();

  const cookieStore = await cookies();
  const privacyCookie = cookieStore.get(PRIVACY_COOKIE_NAME);
  // No cookie yet (first visit on this browser/device) falls back to the
  // profile's own "default privacy mode" preference (Settings > Privacy —
  // PROMPT 40) rather than always starting revealed.
  const initialConcealed =
    privacyCookie !== undefined
      ? privacyCookie.value === "1"
      : profile.privacy_default_concealed;

  return (
    <PrivacyProvider initialConcealed={initialConcealed}>
      <ScreenshotSensitiveGuard
        enabled={profile.privacy_screenshot_sensitive_mode}
      >
        <div className="flex min-h-full flex-1">
          <aside className="border-border bg-muted/20 sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-4 border-r p-3 lg:flex">
            <div className="flex h-10 items-center px-2.5">
              <span className="text-foreground text-sm font-semibold">
                DhanOS
              </span>
            </div>
            <HouseholdSelector householdName={household.name} />
            <SidebarNav />
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="border-border bg-background sticky top-0 z-40 border-b">
              <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
                <MobileNav />
                <span className="text-foreground text-sm font-semibold lg:hidden">
                  DhanOS
                </span>
                <div className="flex-1" />
                <CommandSearch />
                <PrivacyToggle />
                <UserMenu
                  fullName={profile.full_name ?? "Member"}
                  email={user.email ?? ""}
                />
              </div>
            </header>
            {children}
          </div>
        </div>
      </ScreenshotSensitiveGuard>
    </PrivacyProvider>
  );
}
