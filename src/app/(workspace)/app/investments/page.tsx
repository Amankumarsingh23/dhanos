import type { Metadata } from "next";
import { SectionStub } from "@/components/shared/section-stub";

export const metadata: Metadata = {
  title: "Investments — DhanOS",
};

export default function InvestmentsPage() {
  return (
    <SectionStub
      title="Investments"
      description="Holdings, SIP contributions, and valuations."
    />
  );
}
