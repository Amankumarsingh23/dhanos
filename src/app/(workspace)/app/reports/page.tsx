import type { Metadata } from "next";
import { SectionStub } from "@/components/shared/section-stub";

export const metadata: Metadata = {
  title: "Reports — DhanOS",
};

export default function ReportsPage() {
  return (
    <SectionStub
      title="Reports"
      description="Generated summaries with explicit data cutoffs."
    />
  );
}
