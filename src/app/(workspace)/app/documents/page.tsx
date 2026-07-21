import type { Metadata } from "next";
import { SectionStub } from "@/components/shared/section-stub";

export const metadata: Metadata = {
  title: "Documents — DhanOS",
};

export default function DocumentsPage() {
  return (
    <SectionStub
      title="Documents"
      description="Statements, policies, and receipts attached to your records."
    />
  );
}
