import { describe, expect, it } from "vitest";
import { revisionText, validateEvaluation } from "../src/lib/history";

describe("history", () => {
  it("describes revisions", () => { expect(revisionText(2, true)).toBe("2 revisions required"); expect(revisionText(1, true)).toBe("1 revision required"); expect(revisionText(0, true)).toBe("no revisions"); expect(revisionText(0, false)).toBe("feedback pending"); });
  it("validates evaluations", () => {
    expect(validateEvaluation(4, " Specific ")).toEqual({ rating: 4, comment: "Specific" });
    expect("error" in validateEvaluation(0, "")).toBe(true); expect("error" in validateEvaluation(6, "")).toBe(true); expect("error" in validateEvaluation(3.5, "")).toBe(true);
    expect("error" in validateEvaluation(5, "x".repeat(501))).toBe(true);
  });
});
