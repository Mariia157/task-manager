import "server-only";
import { db } from "@/lib/db";
import { notify, taskEvent } from "@/lib/audit";

/**
 * Автоматически «В работе»: когда исполнитель берётся за задачу (открыл карточку, написал комментарий,
 * отметил чек-лист, приложил файл), а она ещё в первой колонке доски — переносим в «В работе».
 * Только исполнитель, только из стартовой колонки; уже передвинутые вручную задачи не трогаем.
 */
export async function autoStartTask(taskId: string, userId: string, opts: { onOpen?: boolean } = {}): Promise<boolean> {
  const t = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      assigneeId: true,
      creatorId: true,
      columnId: true,
      projectId: true,
      completedAt: true,
      archivedAt: true,
      project: { select: { isDraft: true } },
      watchers: { select: { userId: true } },
    },
  });
  if (!t || t.assigneeId !== userId || t.completedAt || t.archivedAt || t.project.isDraft) return false;
  // своя задача себе: при одном открытии оставляем в «Идее» — человек мог завести её на потом
  if (opts.onOpen && t.creatorId === userId) return false;
  const cols = await db.boardColumn.findMany({ where: { projectId: t.projectId }, orderBy: { sortOrder: "asc" } });
  const start = cols[0];
  if (!start || start.isDone || t.columnId !== start.id) return false;
  // «В работе» по названию, иначе — следующая не «готовая» колонка после стартовой
  const target = cols.find((c) => c.name.trim().toLowerCase() === "в роботі" && !c.isDone) ?? cols.slice(1).find((c) => !c.isDone);
  if (!target) return false;
  const first = await db.task.findFirst({ where: { columnId: target.id }, orderBy: { position: "asc" }, select: { position: true } });
  // условие на колонку в where — чтобы два одновременных запроса не перенесли дважды
  const moved = await db.task.updateMany({ where: { id: taskId, columnId: start.id }, data: { columnId: target.id, position: (first?.position ?? 1) - 1 } });
  if (!moved.count) return false;
  await taskEvent(taskId, userId, "column", "Статус", start.name, `${target.name} (автоматично)`);
  const who = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await notify([t.creatorId, ...t.watchers.map((w) => w.userId)], "status", `${who?.name ?? "Виконавець"} взяв(ла) в роботу: ${t.title}`, taskId, userId);
  return true;
}
