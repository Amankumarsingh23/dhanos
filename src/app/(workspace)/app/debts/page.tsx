import type { Metadata } from "next";
import { SectionStub } from "@/components/shared/section-stub";

export const metadata: Metadata = {
  title: "Debts — DhanOS",
};

export default function DebtsPage() {
  return (
    <SectionStub
      title="Debts"
      description="Loans, EMIs, and other obligations."
    />
  );
}
