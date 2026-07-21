import type { Metadata } from "next";
import { SectionStub } from "@/components/shared/section-stub";

export const metadata: Metadata = {
  title: "Settings — DhanOS",
};

export default function SettingsPage() {
  return (
    <SectionStub
      title="Settings"
      description="Household, membership, and preference management."
    />
  );
}
