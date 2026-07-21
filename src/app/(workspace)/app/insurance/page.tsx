import type { Metadata } from "next";
import { SectionStub } from "@/components/shared/section-stub";

export const metadata: Metadata = {
  title: "Insurance — DhanOS",
};

export default function InsurancePage() {
  return (
    <SectionStub
      title="Insurance"
      description="Policies, premiums, coverage, and renewals."
    />
  );
}
