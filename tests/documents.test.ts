import { describe, expect, it } from "vitest";
import { cleanName, formatSize, MAX_BYTES, validateName } from "../src/lib/documentsRules";
import { hasSignature, pdfPageCount, precheck } from "../src/lib/documentsServer";

const pdf = (pages: number, tail = "%%EOF") => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Pages /Kids [2 0 R] /Count ${pages} >> endobj\n${"x".repeat(3000)}\n${tail}`);

describe("upload rules", () => {
  it("accepts PDF and DOCX only", () => { expect(validateName("a.PDF", 10)).toEqual({ ext: "pdf" }); expect(validateName("a.docx", 10)).toEqual({ ext: "docx" }); expect("error" in validateName("a.exe", 10)).toBe(true); });
  it("rejects empty and oversized files", () => { expect("error" in validateName("a.pdf", 0)).toBe(true); expect("error" in validateName("a.pdf", MAX_BYTES + 1)).toBe(true); });
  it("strips paths from file names", () => expect(cleanName("C:\\files\\..\\ch3.pdf")).toBe("ch3.pdf"));
  it("formats sizes", () => { expect(formatSize(1887437)).toBe("1.8 MB"); expect(formatSize(300000)).toBe("293 KB"); });
});
describe("pre-check", () => {
  it("passes a complete PDF and counts pages", () => { const c = precheck(pdf(42), "pdf"); expect(c.every((x) => x.ok)).toBe(true); expect(c.map((x) => x.label)).toContain("42 pages found"); });
  it("warns on an incomplete PDF", () => expect(precheck(pdf(3, ""), "pdf").some((x) => !x.ok)).toBe(true));
  it("warns on a password-protected PDF", () => expect(precheck(Buffer.concat([pdf(2), Buffer.from("/Encrypt")]), "pdf").some((x) => x.label.startsWith("Password"))).toBe(true));
  it("checks DOCX structure", () => { expect(precheck(Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.from("word/document.xml"), Buffer.alloc(3000)]), "docx").every((x) => x.ok)).toBe(true); expect(precheck(Buffer.alloc(3000), "docx").some((x) => !x.ok)).toBe(true); });
  it("rejects files that aren't what they claim", () => { expect(hasSignature(Buffer.from("MZ....."), "pdf")).toBe(false); expect(hasSignature(Buffer.from("PK\u0003\u0004abc"), "docx")).toBe(true); expect(pdfPageCount(Buffer.from("nothing"))).toBe(0); });
});
