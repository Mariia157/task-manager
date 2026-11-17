import { describe, expect, it } from "vitest";
import { dailySeries, personStats, type StatTask } from "@/lib/stats";

// среда, 4 ноября 2026, 12:00 по Киеву (UTC+2)
const now = new Date("2026-11-04T10:00:00Z");
const people = [
  { id: "a", name: "Анна" },
  { id: "b", name: "Борис" },
];

const done = (assigneeId: string, completedAt: string, deadline = "2026-11-30T16:00:00Z"): StatTask => ({
  assigneeId,
  completedAt: new Date(completedAt),
  deadline: new Date(deadline),
});

describe("статистика по працівниках", () => {
  it("межі дня, тижня й місяця за Києвом", () => {
    const tasks = [
      done("a", "2026-11-03T22:30:00Z"), // 04.11 00:30 Киев — сегодня
      done("a", "2026-11-03T21:30:00Z"), // 03.11 23:30 Киев — вчера, эта неделя
      done("a", "2026-11-01T21:59:00Z"), // 01.11 23:59 Киев — воскресенье, прошлая неделя, этот месяц
      done("a", "2026-10-31T21:59:00Z"), // 31.10 23:59 Киев — прошлый месяц
    ];
    const [a] = personStats(people, tasks, now);
    expect(a.today).toBe(1);
    expect(a.week).toBe(2);
    expect(a.month).toBe(3);
  });

  it("вчасно / із запізненням, відкриті та прострочені", () => {
    const tasks: StatTask[] = [
      done("b", "2026-11-02T10:00:00Z", "2026-11-03T16:00:00Z"), // в срок
      done("b", "2026-11-04T09:00:00Z", "2026-11-03T16:00:00Z"), // опоздал
      { assigneeId: "b", completedAt: null, deadline: new Date("2026-11-01T16:00:00Z") },
      { assigneeId: "b", completedAt: null, deadline: new Date("2026-11-20T16:00:00Z") },
    ];
    const [, b] = personStats(people, tasks, now);
    expect(b.month).toBe(2);
    expect(b.monthOnTime).toBe(1);
    expect(b.open).toBe(2);
    expect(b.overdue).toBe(1);
  });

  it("без строку — вчасно; повернули з «Готово» — не закрита", () => {
    const [a] = personStats(people, [{ assigneeId: "a", completedAt: new Date("2026-11-04T08:00:00Z"), deadline: null }], now);
    expect(a.monthOnTime).toBe(1);
  });

  it("повернули з «Готово» — не вважається закритою", () => {
    const [a] = personStats(people, [{ assigneeId: "a", completedAt: null, deadline: now }], now);
    expect(a.month).toBe(0);
  });

  it("люди без задач отримують нулі", () => {
    const res = personStats(people, [], now);
    expect(res.map((r) => r.month)).toEqual([0, 0]);
  });
});

describe("графік по днях", () => {
  it("розкладає закриття по київських днях", () => {
    const s = dailySeries([done("a", "2026-11-03T22:30:00Z"), done("a", "2026-11-03T21:30:00Z"), done("b", "2026-11-03T08:00:00Z")], now, 7);
    expect(s).toHaveLength(7);
    expect(s.at(-1)!.key).toBe("2026-11-04");
    expect(s.at(-1)!.closed).toBe(1);
    expect(s.at(-2)!.closed).toBe(2);
    expect(s[0].key).toBe("2026-10-29");
  });
});
