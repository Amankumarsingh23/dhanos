import { describe, expect, it } from "vitest";
import {
  extractWebsiteDomain,
  findPotentialDuplicates,
  normalizeInstitutionName,
  normalizePhoneNumber,
} from "./duplicate-detection";

describe("normalizeInstitutionName", () => {
  it("lowercases and trims", () => {
    expect(normalizeInstitutionName("  HDFC Bank  ")).toBe("hdfc bank");
  });

  it("strips common legal suffixes", () => {
    expect(normalizeInstitutionName("HDFC Bank Ltd.")).toBe("hdfc bank");
    expect(normalizeInstitutionName("Acme Pvt Ltd")).toBe("acme");
    expect(normalizeInstitutionName("Acme Inc")).toBe("acme");
  });

  it("collapses punctuation and repeated whitespace", () => {
    expect(normalizeInstitutionName("HDFC,  Bank!!")).toBe("hdfc bank");
  });
});

describe("extractWebsiteDomain", () => {
  it("extracts a domain from a bare hostname", () => {
    expect(extractWebsiteDomain("hdfcbank.com")).toBe("hdfcbank.com");
  });

  it("extracts a domain from a full URL with a path", () => {
    expect(extractWebsiteDomain("https://www.hdfcbank.com/personal")).toBe(
      "hdfcbank.com",
    );
  });

  it("strips a leading www.", () => {
    expect(extractWebsiteDomain("http://www.example.com")).toBe("example.com");
  });

  it("returns null for an unparseable value", () => {
    expect(extractWebsiteDomain("")).toBeNull();
  });
});

describe("normalizePhoneNumber", () => {
  it("strips formatting characters and keeps the last 10 digits", () => {
    expect(normalizePhoneNumber("+91 1800-266-4332")).toBe("8002664332");
  });

  it("keeps only the last 10 digits, ignoring a country-code prefix", () => {
    expect(normalizePhoneNumber("+91-8002664332")).toBe(
      normalizePhoneNumber("08002664332"),
    );
  });

  it("returns null when there aren't enough digits", () => {
    expect(normalizePhoneNumber("12345")).toBeNull();
  });
});

describe("findPotentialDuplicates", () => {
  const existing = [
    {
      id: "inst-1",
      name: "HDFC Bank",
      website: "https://www.hdfcbank.com",
      supportPhone: "+91 1800 266 4332",
    },
    {
      id: "inst-2",
      name: "ICICI Bank",
      website: "https://www.icicibank.com",
      supportPhone: null,
    },
  ];

  it("matches on normalized name", () => {
    const matches = findPotentialDuplicates(
      { name: "HDFC Bank Ltd." },
      existing,
    );
    expect(matches).toEqual([
      {
        institutionId: "inst-1",
        institutionName: "HDFC Bank",
        reasons: ["name"],
      },
    ]);
  });

  it("matches on website domain even with a different name", () => {
    const matches = findPotentialDuplicates(
      { name: "HDFC MobileBanking", website: "hdfcbank.com/app" },
      existing,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.institutionId).toBe("inst-1");
    expect(matches[0]?.reasons).toContain("domain");
  });

  it("matches on support phone regardless of formatting", () => {
    const matches = findPotentialDuplicates(
      { name: "Something Else", supportPhone: "018002664332" },
      existing,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.reasons).toContain("phone");
  });

  it("can match on more than one reason at once", () => {
    const matches = findPotentialDuplicates(
      {
        name: "HDFC Bank",
        website: "https://hdfcbank.com",
        supportPhone: "1800 266 4332",
      },
      existing,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.reasons.sort()).toEqual(["domain", "name", "phone"]);
  });

  it("returns no matches for a genuinely new institution", () => {
    const matches = findPotentialDuplicates(
      { name: "Fidelity Investments", website: "fidelity.com" },
      existing,
    );
    expect(matches).toEqual([]);
  });

  it("returns no matches against an empty list", () => {
    expect(findPotentialDuplicates({ name: "HDFC Bank" }, [])).toEqual([]);
  });
});
