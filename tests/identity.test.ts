import { describe, expect, it } from "vitest";
import { claimsToBePlatform, identityFlags, looksLikeAuthority, normalizeName, signalLines } from "@/lib/engine/identity";
import { clientIp } from "@/lib/ratelimit";

describe("organizer identity signals", () => {
  it("folds look-alike characters, accents and spacing", () => {
    expect(normalizeName("B00k My Pr0test")).toBe("bookmyprotest");
    expect(normalizeName("Café  Workers")).toBe("cafeworkers");
  });
  it("refuses names that present the page as the platform, including look-alike spellings", () => {
    for (const n of ["BookMyProtest", "Book My Protest Team", "B00kMyPr0test official", "BOOKMYPROTEST"]) expect(claimsToBePlatform(n), n).toBe(true);
    for (const n of ["Parents for Safe Schools", "Book Club for Peace", "My Protest Group"]) expect(claimsToBePlatform(n), n).toBe(false);
  });
  it("flags authority-like wording for review without judging the cause", () => {
    for (const n of ["Delhi Police Welfare", "Official Government Notice", "Ministry Staff Union"]) expect(looksLikeAuthority(n), n).toBe(true);
    expect(looksLikeAuthority("Parents for Safe Schools")).toBe(false);
    expect(identityFlags("Delhi Police Welfare", [])).toEqual(["AUTHORITY_LIKE_NAME"]);
  });
  it("flags a name equal or one edit away from another organizer's, but not short or unrelated names", () => {
    expect(identityFlags("Parents for Safe Schools", ["Parents for Safe Schools"])).toEqual(["LOOKALIKE_NAME"]);
    expect(identityFlags("Parents for Safe School", ["Parents for Safe Schools"])).toEqual(["LOOKALIKE_NAME"]);
    expect(identityFlags("Parents 4 Safe Schools", ["Parents for Safe Schools"])).toEqual([]); // two edits away
    expect(identityFlags("AB Clubs", ["AB Club"])).toEqual([]); // short names compare for equality only
    expect(identityFlags("Teachers Union", ["Parents for Safe Schools"])).toEqual([]);
  });
  it("public signals never claim the organizer is verified", () => {
    const lines = signalLines({ nameSelfDeclared: true, emailConfirmed: true, memberSince: "2026-10" }).join(" | ");
    expect(lines).toMatch(/self-declared/);
    expect(lines).toMatch(/Contact email confirmed/);
    expect(lines).toMatch(/October 2026/);
    expect(lines).not.toMatch(/verified organizer|trusted|official organizer/i);
  });
});

describe("client address for rate limiting", () => {
  it("trusts only the entry added by our own proxy, so a forged left-hand value cannot dodge limits", () => {
    expect(clientIp("6.6.6.6, 203.0.113.9", 1)).toBe("203.0.113.9");
    expect(clientIp("1.1.1.1, 6.6.6.6, 203.0.113.9", 1)).toBe("203.0.113.9");
    expect(clientIp("6.6.6.6, 203.0.113.9, 10.0.0.1", 2)).toBe("203.0.113.9");
    expect(clientIp("203.0.113.9", 3)).toBe("203.0.113.9");
    expect(clientIp(null)).toBe("local");
  });
});
