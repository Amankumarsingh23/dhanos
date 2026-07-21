import {
  ArrowLeftRightIcon,
  BanknoteIcon,
  Building2Icon,
  FileTextIcon,
  GemIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  PieChartIcon,
  ScaleIcon,
  SettingsIcon,
  ShieldIcon,
  TargetIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

/**
 * The authenticated app's primary navigation — shared by the sidebar,
 * mobile nav, and command palette so all three always agree. Deliberately
 * limited to launched sections: unfinished advanced modules (SIPs, staking,
 * lending, monthly closing, projections, decision journal, literacy) are
 * not listed until they ship — see docs/implementation-status.md §3.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboardIcon },
  { label: "People", href: "/app/people", icon: UsersIcon },
  { label: "Institutions", href: "/app/institutions", icon: Building2Icon },
  { label: "Cash Flow", href: "/app/cash-flow", icon: ArrowLeftRightIcon },
  { label: "Accounts", href: "/app/accounts", icon: LandmarkIcon },
  { label: "Investments", href: "/app/investments", icon: PieChartIcon },
  { label: "Debts", href: "/app/debts", icon: ScaleIcon },
  { label: "Insurance", href: "/app/insurance", icon: ShieldIcon },
  { label: "Assets", href: "/app/assets", icon: GemIcon },
  { label: "Goals", href: "/app/goals", icon: TargetIcon },
  { label: "Documents", href: "/app/documents", icon: FileTextIcon },
  { label: "Reports", href: "/app/reports", icon: BanknoteIcon },
  { label: "Settings", href: "/app/settings", icon: SettingsIcon },
] as const;

/**
 * True when `pathname` is on `href`'s section. "/app" (Dashboard) matches
 * only exactly — otherwise it would be marked active on every route.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/app") {
    return pathname === "/app";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
