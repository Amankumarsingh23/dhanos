import { ShieldCheckIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type FinancialPrivacyNoticeProps = {
  title?: string;
  description?: string;
  className?: string;
};

/**
 * A reminder, shown on sensitive screens (balances, net worth, documents),
 * that the data is private to the household and its permitted members —
 * not a substitute for the actual Row Level Security enforcement, just
 * visible reassurance to the user. See docs/security-model.md §3.
 */
export function FinancialPrivacyNotice({
  title = "Visible to your household only",
  description = "This information is private and only visible to members you've added to this household.",
  className,
}: FinancialPrivacyNoticeProps) {
  return (
    <Alert className={cn(className)}>
      <ShieldCheckIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}
