import { signOutAction } from "@/features/auth/actions";
import { ResponsiveContainer } from "@/components/layout/responsive-container";
import { Button } from "@/components/ui/button";

/**
 * Onboarding gets a deliberately minimal header (brand + sign out) rather
 * than the full app shell — there's no household context to navigate yet.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-border border-b">
        <ResponsiveContainer
          size="wide"
          className="flex h-14 items-center justify-between"
        >
          <span className="text-foreground text-sm font-semibold">DhanOS</span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </ResponsiveContainer>
      </header>
      {children}
    </div>
  );
}
