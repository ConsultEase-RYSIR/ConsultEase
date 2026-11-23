import { describe, expect, it } from "vitest";
import { checkReview, checklist, pagesFromChecks } from "../src/lib/documentReview";

const d = (requirement: string, status: string, required = true) => ({ requirement, required, status, storageKey: status === "MISSING" ? null : "uploads/x.pdf" });
describe("checklist", () => {
  it("names attached and missing required files", () => { const c = checklist([d("Chapter 3 draft", "SUBMITTED"), d("Consultation form", "MISSING"), d("Notes", "MISSING", false)]); expect(c.ok).toBe(false); expect(c.label).toBe("Required checklist: Chapter 3 draft attached, Consultation form still missing"); });
  it("passes when all required files are attached", () => expect(checklist([d("A", "SUBMITTED"), d("B", "MISSING", false)]).ok).toBe(true));
});
describe("pages", () => { it("reads the page count from the pre-check", () => { expect(pagesFromChecks([{ ok: true, label: "42 pages found" }])).toBe(42); expect(pagesFromChecks([{ ok: true, label: "Opens correctly" }])).toBe(0); }); });
describe("review rules", () => {
  it("needs a comment to request a revision", () => { expect(checkReview("revise", "", "SUBMITTED")).toMatch(/comment/); expect(checkReview("revise", "Add page numbers", "UNDER_REVIEW")).toBeNull(); });
  it("allows marking reviewed without a comment", () => expect(checkReview("reviewed", "", "UNDER_REVIEW")).toBeNull());
  it("blocks actions on missing files", () => { expect(checkReview("reviewed", "", "MISSING")).not.toBeNull(); expect(checkReview("revise", "x", "MISSING")).not.toBeNull(); });
  it("lets a professor change their mind", () => { expect(checkReview("revise", "More detail", "REVIEWED")).toBeNull(); expect(checkReview("reviewed", "", "NEEDS_FIX")).toBeNull(); });
});
