/**
 * Создание карточек ежедневных задач. Без "server-only": вызывается и из Next, и из процесса бота (scripts/bot.ts).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, fromZoned, zonedParts } from "@/lib/time";

/** День недели по Киеву: 1 = пн … 7 = вс */
export function kyivWeekday(d: Date): number {
  const z = zonedParts(d);
  const wd = new Date(Date.UTC(z.y, z.m - 1, z.d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Идемпотентно: уникальный ключ (recurringId, recurringDay). Возвращает число созданных карточек. */
export async function ensureRecurringCore(db: PrismaClient, now = new Date()) {
  const today = dayKey(now);
  const wd = String(kyivWeekday(now));
  // невыполненные карточки прошлых дней уходят в архив: доска не копит пропуски,
  // а на странице «Ежедневные задачи» они остаются отметкой «не выполнено»
  await db.task.updateMany({
    where: { recurringId: { not: null }, recurringDay: { lt: today }, completedAt: null, archivedAt: null },
    data: { archivedAt: now },
  });
  const list = await db.recurringTask.findMany({
    where: { active: true, assignee: { active: true }, project: { archivedAt: null, isDraft: false } },
    include: { project: { include: { columns: { orderBy: { sortOrder: "asc" } } } } },
  });
  let made = 0;
  for (const r of list) {
    if (!r.weekdays.includes(wd)) continue;
    const exists = await db.task.findUnique({ where: { recurringId_recurringDay: { recurringId: r.id, recurringDay: today } }, select: { id: true } });
    if (exists) continue;
    // задача дня — сразу «В работе» (по названию, иначе вторая открытая колонка)
    const open = r.project.columns.filter((c) => !c.isDone);
    const col = open.find((c) => c.name.trim().toLowerCase() === "в роботі") ?? open[1] ?? open[0] ?? r.project.columns[0];
    if (!col) continue;
    const z = zonedParts(now);
    const [h, mi] = r.dueTime.split(":").map(Number);
    try {
      const t = await db.task.create({
        data: {
          title: r.title,
          description: r.description,
          projectId: r.projectId,
          columnId: col.id,
          position: -now.getTime() / 1000, // наверх колонки
          directionId: r.directionId,
          subtypeId: r.subtypeId,
          assigneeId: r.assigneeId,
          creatorId: r.assigneeId,
          priority: r.priority,
          deadline: fromZoned(z.y, z.m, z.d, h || 9, mi || 0),
          recurringId: r.id,
          recurringDay: today,
          events: { create: [{ actorId: r.assigneeId, type: "created", toValue: "щоденна" }] },
        },
      });
      await db.notification.create({
        data: { userId: r.assigneeId, type: "recurring", taskId: t.id, text: `Задача на сьогодні: ${r.title} — до ${r.dueTime}` },
      });
      made++;
    } catch {
      // параллельный процесс успел создать — это нормально
    }
  }
  return made;
}
