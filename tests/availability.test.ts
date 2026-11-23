import { describe, it, expect } from "vitest";
import { findConflicts, generateSlots, dayError, manilaParts, nextDateKey, type DayInput } from "../src/lib/availability";

const day = (o: Partial<DayInput> = {}): DayInput => ({ weekday: 2, enabled: true, startMin: 780, endMin: 960, faceToFace: true, online: false, ...o });
const appt = (o = {}) => ({ id: "a", studentName: "Lea", weekday: 2, startMin: 840, endMin: 870, mode: "FACE_TO_FACE" as const, dateKey: "2026-10-13", ...o });

describe("availability", () => {
  it("generates slots that fit fully inside the window", () => {
    expect(generateSlots(780, 960, 30)).toEqual([780, 810, 840, 870, 900, 930]);
    expect(generateSlots(780, 840, 45)).toEqual([780]);
  });
  it("flags bad windows", () => {
    expect(dayError(day({ endMin: 780 }), 30)).toMatch(/after/);
    expect(dayError(day({ endMin: 800 }), 30)).toMatch(/shorter/);
    expect(dayError(day({ faceToFace: false }), 30)).toMatch(/mode/);
    expect(dayError(day({ enabled: false, endMin: 0 }), 30)).toBeNull();
  });
  it("detects conflicts with existing consultations", () => {
    expect(findConflicts([day()], [appt()])).toHaveLength(0);
    expect(findConflicts([day({ startMin: 900 })], [appt()])).toHaveLength(1);
    expect(findConflicts([day({ endMin: 850 })], [appt()])).toHaveLength(1);
    expect(findConflicts([day({ enabled: false })], [appt()])).toHaveLength(1);
    expect(findConflicts([day()], [appt({ mode: "ONLINE" })])).toHaveLength(1);
  });
  it("uses Manila time", () => {
    expect(manilaParts(new Date("2026-10-13T06:00:00Z"))).toEqual({ weekday: 2, min: 840, dateKey: "2026-10-13" });
    expect(manilaParts(new Date("2026-10-12T17:00:00Z")).dateKey).toBe("2026-10-13");
  });
  it("finds the next date for a weekday", () => {
    expect(nextDateKey(2, "2026-10-13", 600, 960)).toBe("2026-10-13");
    expect(nextDateKey(2, "2026-10-13", 1000, 960)).toBe("2026-10-20");
    expect(nextDateKey(1, "2026-10-13", 0, 960)).toBe("2026-10-19");
  });
});
