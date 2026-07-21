import type { Metadata } from "next";
import { SectionStub } from "@/components/shared/section-stub";

export const metadata: Metadata = {
  title: "Assets — DhanOS",
};

export default function AssetsPage() {
  return (
    <SectionStub
      title="Assets"
      description="Movable and immovable assets and their valuations."
    />
  );
}
