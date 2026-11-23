import { describe, it, expect } from "vitest";
import { groupItems, groupLabel, parsePage, parseReadRequest, safeHref } from "../src/lib/notificationRules";

const now = new Date("2026-10-13T06:00:00Z"); // Oct 13, 2:00 PM Manila
describe("safeHref", () => {
  it("allows same-site paths", () => { expect(safeHref("/student/history")).toBe("/student/history"); expect(safeHref("/student/queue?a=1")).toBe("/student/queue?a=1"); });
  it("blocks other sites and odd values", () => {
    for (const h of ["https://evil.com", "//evil.com", "javascript:alert(1)", "/\\evil.com", "student/history", "", "/a\nb", null, undefined, 5]) expect(safeHref(h)).toBeNull();
  });
});
describe("groupLabel", () => {
  it("uses the Manila day", () => {
    expect(groupLabel(new Date("2026-10-13T00:30:00Z"), now)).toBe("Today");     // 8:30 AM Manila
    expect(groupLabel(new Date("2026-10-12T17:00:00Z"), now)).toBe("Today");     // 1:00 AM Manila Oct 13
    expect(groupLabel(new Date("2026-10-12T15:00:00Z"), now)).toBe("Yesterday"); // 11 PM Manila Oct 12
    expect(groupLabel(new Date("2026-10-05T06:00:00Z"), now)).toBe("Earlier");
  });
});
describe("groupItems", () => {
  it("keeps order and drops empty groups", () => {
    const a = { createdAt: new Date("2026-10-13T05:00:00Z") }, b = { createdAt: new Date("2026-10-01T05:00:00Z") };
    const g = groupItems([a, b], now);
    expect(g.map((x) => x.label)).toEqual(["Today", "Earlier"]); expect(g[0].items[0]).toBe(a);
  });
});
describe("parsePage", () => {
  it("is safe on bad input", () => { expect(parsePage(undefined)).toBe(1); expect(parsePage("0")).toBe(1); expect(parsePage("-3")).toBe(1); expect(parsePage("abc")).toBe(1); expect(parsePage("99999")).toBe(1); expect(parsePage("3")).toBe(3); });
});
describe("parseReadRequest", () => {
  it("accepts all or one id", () => { expect(parseReadRequest({ all: true })).toEqual({ all: true }); expect(parseReadRequest({ id: "abc" })).toEqual({ id: "abc" }); });
  it("rejects everything else", () => {
    for (const b of [null, "x", {}, { all: "yes" }, { id: "" }, { id: 5 }, { id: "x".repeat(41) }]) expect(parseReadRequest(b)).toBeNull();
  });
});
