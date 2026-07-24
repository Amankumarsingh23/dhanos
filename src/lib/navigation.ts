import {
  AlarmClockIcon,
  ArrowLeftRightIcon,
  BanknoteIcon,
  Building2Icon,
  CalculatorIcon,
  CalendarClockIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  GaugeIcon,
  GemIcon,
  HandCoinsIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  NotebookPenIcon,
  PieChartIcon,
  ReceiptIcon,
  RepeatIcon,
  ScaleIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
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
 * limited to launched sections: unfinished advanced modules (SIPs and
 * staking live under Investments rather than their own item; literacy
 * content) are not listed until they ship — see
 * docs/implementation-status.md §3.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboardIcon },
  { label: "Net Worth", href: "/app/net-worth", icon: GaugeIcon },
  { label: "People", href: "/app/people", icon: UsersIcon },
  { label: "Institutions", href: "/app/institutions", icon: Building2Icon },
  { label: "Accounts", href: "/app/accounts", icon: LandmarkIcon },
  { label: "Income", href: "/app/income", icon: TrendingUpIcon },
  { label: "Expenses", href: "/app/expenses", icon: ReceiptIcon },
  { label: "Transfers", href: "/app/transfers", icon: RepeatIcon },
  { label: "Recurring", href: "/app/recurring", icon: CalendarClockIcon },
  { label: "Cash Flow", href: "/app/cash-flow", icon: ArrowLeftRightIcon },
  { label: "Investments", href: "/app/investments", icon: PieChartIcon },
  { label: "Calculators", href: "/app/calculators", icon: CalculatorIcon },
  { label: "Debts", href: "/app/debts", icon: ScaleIcon },
  { label: "Lending", href: "/app/lending", icon: HandCoinsIcon },
  { label: "Liabilities", href: "/app/liabilities", icon: ScrollTextIcon },
  { label: "Insurance", href: "/app/insurance", icon: ShieldIcon },
  { label: "Assets", href: "/app/assets", icon: GemIcon },
  {
    label: "Money Drains",
    href: "/app/money-drains",
    icon: TrendingDownIcon,
  },
  { label: "Goals", href: "/app/goals", icon: TargetIcon },
  {
    label: "Emergency Fund",
    href: "/app/emergency-fund",
    icon: LifeBuoyIcon,
  },
  {
    label: "Monthly Closing",
    href: "/app/monthly-closing",
    icon: ClipboardCheckIcon,
  },
  { label: "Documents", href: "/app/documents", icon: FileTextIcon },
  { label: "Reminders", href: "/app/reminders", icon: AlarmClockIcon },
  { label: "Reports", href: "/app/reports", icon: BanknoteIcon },
  {
    label: "Decision Journal",
    href: "/app/decisions",
    icon: NotebookPenIcon,
  },
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
