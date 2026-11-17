import { describe, expect, it } from "vitest";
import { addDays, dayKey, fromZoned, parseDeadline, startOfDay, startOfMonth, startOfWeek, zonedParts } from "@/lib/time";

describe("час за Києвом", () => {
  it("початок дня взимку (UTC+2) і влітку (UTC+3)", () => {
    expect(startOfDay(new Date("2026-01-15T12:00:00Z")).toISOString()).toBe("2026-01-14T22:00:00.000Z");
    expect(startOfDay(new Date("2026-07-15T12:00:00Z")).toISOString()).toBe("2026-07-14T21:00:00.000Z");
  });

  it("пізній вечір UTC — це вже наступний день у Києві", () => {
    expect(dayKey(new Date("2026-07-15T22:30:00Z"))).toBe("2026-07-16");
  });

  it("тиждень починається в понеділок", () => {
    // 2026-11-08 — воскресенье
    expect(dayKey(startOfWeek(new Date("2026-11-08T10:00:00Z")))).toBe("2026-11-02");
    expect(dayKey(startOfWeek(new Date("2026-11-02T10:00:00Z")))).toBe("2026-11-02");
  });

  it("місяць", () => {
    expect(startOfMonth(new Date("2026-03-20T10:00:00Z")).toISOString()).toBe("2026-02-28T22:00:00.000Z");
  });

  it("перехід на літній час: доба 29.03.2026 триває 23 години", () => {
    const d = startOfDay(new Date("2026-03-29T12:00:00Z"));
    const next = addDays(d, 1);
    expect((next.getTime() - d.getTime()) / 3600000).toBe(23);
    expect(zonedParts(next).h).toBe(0);
  });

  it("перехід на зимовий: 25.10.2026 триває 25 годин", () => {
    const d = startOfDay(new Date("2026-10-25T12:00:00Z"));
    expect((addDays(d, 1).getTime() - d.getTime()) / 3600000).toBe(25);
  });

  it("розбір строку з форми", () => {
    expect(parseDeadline("2026-11-03", "18:00")?.toISOString()).toBe("2026-11-03T16:00:00.000Z");
    expect(parseDeadline("2026-02-31", "18:00")).toBeNull();
    expect(parseDeadline("bad", "18:00")).toBeNull();
    expect(fromZoned(2026, 7, 1, 9, 30).toISOString()).toBe("2026-07-01T06:30:00.000Z");
  });
});
