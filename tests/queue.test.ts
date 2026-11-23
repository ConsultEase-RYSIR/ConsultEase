import { describe, expect, it } from "vitest";
import { checkInWindow, manualCode, progressSteps } from "../src/lib/queueRules";

const start = new Date("2026-10-13T06:00:00Z");
describe("check-in window", () => {
  it("opens 10 min early online and closes after the grace period", () => {
    const w = checkInWindow(start, 5, true);
    expect(start.getTime() - w.opensAt.getTime()).toBe(10 * 60000);
    expect(w.closesAt.getTime() - start.getTime()).toBe(5 * 60000);
  });
  it("lets a QR code be verified 30 min early", () => expect(start.getTime() - checkInWindow(start, 5, false).opensAt.getTime()).toBe(30 * 60000));
});
describe("progress steps", () => {
  it("marks approved face-to-face as waiting for check-in", () => {
    const s = progressSteps("APPROVED", false);
    expect(s.map((x) => x.state)).toEqual(["done", "done", "current", "todo", "todo"]);
  });
  it("skips QR issued for online", () => expect(progressSteps("CHECKED_IN", true).map((x) => x.label)).not.toContain("QR issued"));
  it("ends at in consultation", () => expect(progressSteps("IN_CONSULTATION", false).at(-1)?.state).toBe("current"));
});
describe("manual code", () => it("is the first 8 characters, upper-cased", () => expect(manualCode("abcdef0123456789")).toBe("ABCDEF01")));

import { rowState } from "../src/lib/queueRules";
describe("row state", () => {
  const t = new Date("2026-10-13T06:00:00Z"), before = new Date(t.getTime() - 60000), after = new Date(t.getTime() + 60000);
  it("is waiting before the start and late after it", () => { expect(rowState("APPROVED", t, before)).toBe("waiting"); expect(rowState("APPROVED", t, after)).toBe("late"); });
  it("maps the other statuses", () => { expect(rowState("CHECKED_IN", t, after)).toBe("ready"); expect(rowState("IN_CONSULTATION", t, after)).toBe("serving"); expect(rowState("NO_SHOW", t, after)).toBe("noshow"); });
});
