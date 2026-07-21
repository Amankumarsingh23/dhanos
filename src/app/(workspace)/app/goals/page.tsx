import type { Metadata } from "next";
import { SectionStub } from "@/components/shared/section-stub";

export const metadata: Metadata = {
  title: "Goals — DhanOS",
};

export default function GoalsPage() {
  return (
    <SectionStub
      title="Goals"
      description="Savings targets and progress toward them."
    />
  );
}
