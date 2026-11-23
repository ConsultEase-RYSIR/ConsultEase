import { describe, it, expect } from "vitest";
import { canSendSummary, canWriteNotes, dateToDue, dayKey, dueToDate, generateSummary, LIMITS, revisionStats, validateSummary } from "../src/lib/notesRules";

const consult = new Date("2026-10-13T06:00:00Z"); // Oct 13, 2:00 PM Manila
const now = new Date("2026-10-13T08:00:00Z");
const ok = (o: any = {}, send = false) => validateSummary({ concerns: "c", feedback: "f", revisions: [], ...o }, consult, send, now);

describe("status gates", () => {
  it("allows notes during and after, sending only after", () => {
    expect(canWriteNotes("IN_CONSULTATION")).toBe(true); expect(canWriteNotes("COMPLETED")).toBe(true);
    for (const s of ["PENDING", "APPROVED", "CHECKED_IN", "NO_SHOW", "CANCELLED"]) expect(canWriteNotes(s)).toBe(false);
    expect(canSendSummary("COMPLETED")).toBe(true); expect(canSendSummary("IN_CONSULTATION")).toBe(false);
  });
});
describe("dates", () => {
  it("round-trips a due date", () => expect(dateToDue(dueToDate("2026-10-18"))).toBe("2026-10-18"));
  it("rejects impossible dates and bad formats", () => { expect(dueToDate("2026-02-31")).toBeNull(); expect(dueToDate("10/18/2026")).toBeNull(); });
  it("uses the Manila day", () => expect(dayKey(new Date("2026-10-12T17:00:00Z"))).toBe("2026-10-13"));
});
describe("revisionStats", () => {
  it("formats", () => { expect(revisionStats(0, 0)).toBe("No revisions required"); expect(revisionStats(1, 0)).toBe("1 revision · 0 completed"); expect(revisionStats(2, 1)).toBe("2 revisions · 1 completed"); });
});
describe("validateSummary", () => {
  it("accepts a normal summary and parses due dates", () => {
    const r: any = ok({ revisions: [{ text: " Add sampling justification ", due: "2026-10-18" }] });
    expect(r.ok).toBe(true); expect(r.value.revisions[0].text).toBe("Add sampling justification"); expect(dateToDue(r.value.revisions[0].dueDate)).toBe("2026-10-18");
  });
  it("drops blank revision rows", () => expect((ok({ revisions: [{ text: "  ", due: null }, { text: "x" }] }) as any).value.revisions).toHaveLength(1));
  it("rejects a due date before the consultation or a year out", () => {
    expect(ok({ revisions: [{ text: "x", due: "2026-10-12" }] }).ok).toBe(false);
    expect(ok({ revisions: [{ text: "x", due: "2028-01-01" }] }).ok).toBe(false);
    expect(ok({ revisions: [{ text: "x", due: "2026-10-13" }] }).ok).toBe(true);
  });
  it("rejects invalid due strings, long text, too many revisions and duplicate ids", () => {
    expect(ok({ revisions: [{ text: "x", due: "soon" }] }).ok).toBe(false);
    expect(ok({ revisions: [{ text: "x".repeat(LIMITS.revisionText + 1) }] }).ok).toBe(false);
    expect(ok({ revisions: Array.from({ length: LIMITS.revisions + 1 }, () => ({ text: "x" })) }).ok).toBe(false);
    expect(ok({ revisions: [{ id: "a", text: "x" }, { id: "a", text: "y" }] }).ok).toBe(false);
  });
  it("rejects wrong shapes", () => { expect(validateSummary(null, consult, false, now).ok).toBe(false); expect(validateSummary({ concerns: 1, feedback: "", revisions: [] }, consult, false, now).ok).toBe(false); });
  it("needs content to send, but not to save a draft", () => {
    expect(ok({ concerns: "", feedback: "" }, true).ok).toBe(false);
    expect(ok({ concerns: "", feedback: "" }, false).ok).toBe(true);
  });
  it("caps concerns and feedback length", () => { expect(ok({ concerns: "x".repeat(LIMITS.concerns + 1) }).ok).toBe(false); expect(ok({ feedback: "x".repeat(LIMITS.feedback + 1) }).ok).toBe(false); });
});
describe("generateSummary", () => {
  const notes = "Sampling method needs justification. Survey instrument is mostly fine but question 7 is leading. Timeline for data gathering looks tight, discussed moving interviews earlier.";
  it("pulls concerns from the sentence subjects", () => expect(generateSummary(notes).concerns).toBe("Sampling method, survey instrument, timeline for data gathering."));
  it("keeps the notes as feedback", () => expect(generateSummary(notes).feedback).toContain("Survey instrument is mostly fine"));
  it("turns instructions into revisions and keeps them out of feedback", () => {
    const g = generateSummary("Methodology is clear. Please add sampling justification to section 3.2. Rewrite survey question 7. The student should merge sections 2.3 and 2.4.");
    expect(g.revisions).toEqual(["Add sampling justification to section 3.2", "Rewrite survey question 7", "The student should merge sections 2.3 and 2.4"]);
    expect(g.feedback).toBe("Methodology is clear.");
  });
  it("handles empty and whitespace notes", () => { expect(generateSummary("")).toEqual({ concerns: "", feedback: "", revisions: [] }); expect(generateSummary("  \n ").revisions).toEqual([]); });
  it("caps concerns at four and ignores very long subjects", () => {
    const g = generateSummary("A is bad. B is bad. C is bad. D is bad. E is bad. " + "x ".repeat(40) + "is long.");
    expect(g.concerns.split(",").length).toBe(4);
  });
});
