import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Settings > Household members (PROMPT 40 — explicitly a "placeholder").
 * `household_memberships`/roles/status already exist at the schema and RLS
 * layer (see supabase/migrations/20260721051051_household_memberships.sql)
 * and are what every "owner/admin" check in this app enforces — there is
 * just no invite-a-second-person flow built yet (see
 * docs/implementation-status.md's "Family and household members" row).
 * This shows the signed-in member's own role honestly rather than a fake
 * member list or a non-functional "Invite" button.
 */
export function HouseholdMembersSection({
  currentUserRole,
}: {
  currentUserRole: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Household members</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span>You</span>
          <Badge variant="secondary" className="capitalize">
            {currentUserRole}
          </Badge>
        </div>
        <p className="text-muted-foreground text-xs">
          Inviting additional household members isn&rsquo;t available yet —
          this section is a placeholder. The underlying roles
          (owner/admin/editor/viewer) already exist and are what every
          permission check in this app enforces.
        </p>
      </CardContent>
    </Card>
  );
}
