/**
 * Смена статуса (колонки) задачи — общий код для сайта и Telegram-бота (без "server-only").
 * Правила — в lib/access.ts (canMoveTask, canSetColumn); здесь же уведомления о смене статуса.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { canExcuseLate, canMoveTask, canSetColumn, expandRoles, isAssigneeStatus, type AccessTask, type AccessUser } from "@/lib/access";

export type Mover = AccessUser & { name: string };

/** Человек в форме AccessUser — для бота, где нет сессии сайта. */
export async function loadMover(db: PrismaClient, userId: string): Promise<Mover | null> {
  const u = await db.user.findUnique({ where: { id: userId }, include: { roles: true, grants: true, subordinates: true, boards: true } });
  if (!u || !u.active) return null;
  const tree = await db.role.findMany({ select: { id: true, parentId: true } });
  return {
    id: u.id,
    name: u.name,
    level: u.level,
    active: u.active,
    roleIds: expandRoles(u.roles.map((r) => r.roleId), tree),
    grants: u.grants.map((g) => ({ directionId: g.directionId, subtypeId: g.subtypeId })),
    subordinateIds: u.subordinates.map((s) => s.subordinateId),
    boardIds: u.boards.map((b) => b.projectId),
  };
}

async function loadTask(db: PrismaClient, taskId: string) {
  const t = await db.task.findUnique({
    where: { id: taskId },
    include: {
      column: true,
      watchers: { select: { userId: true } },
      mentions: { select: { userId: true } },
      project: { select: { isDraft: true, accessAll: true } },
    },
  });
  if (!t) return null;
  const a: AccessTask = {
    assigneeId: t.assigneeId,
    creatorId: t.creatorId,
    directionId: t.directionId,
    subtypeId: t.subtypeId,
    watcherIds: t.watchers.map((w) => w.userId),
    mentionIds: t.mentions.map((m) => m.userId),
    projectDraft: t.project.isDraft,
    projectId: t.projectId,
    projectAccessAll: t.project.accessAll,
  };
  return { t, a };
}

/** Что можно поставить этой задаче: id колонок. Для выпадающего списка и доски. */
export function allowedColumnIds(u: AccessUser, a: AccessTask, cols: { id: string; name: string; isDone: boolean }[], currentId: string) {
  return cols.filter((c) => c.id === currentId || canSetColumn(u, a, c)).map((c) => c.id);
}

/**
 * Перенести задачу в колонку (и на место между соседями). Комментарий — необязательный:
 * сохраняется в задаче и приходит в Telegram вместе с уведомлением о смене статуса.
 */
export async function moveTaskCore(
  db: PrismaClient,
  user: Mover,
  taskId: string,
  columnId: string,
  opts: { beforeId?: string | null; afterId?: string | null; comment?: string; via?: string; lateOk?: boolean } = {},
): Promise<{ error?: string }> {
  const cur = await loadTask(db, taskId);
  if (!cur || !canMoveTask(user, cur.a)) return { error: "Немає прав переміщати цю картку" };
  const { t, a } = cur;
  const col = await db.boardColumn.findUnique({ where: { id: columnId } });
  if (!col || col.projectId !== t.projectId) return { error: "Колонка не з цього проєкту" };
  const changing = t.columnId !== columnId;
  if (changing && !canSetColumn(user, a, col)) {
    if (col.isDone) return { error: "«Готово» ставить той, хто поставив задачу. Надішліть її на «Перевірку» — постановник прийме роботу" };
    return { error: "Виконавець може поставити лише «Чекає відповіді» або «Перевірка»" };
  }
  const [before, after] = await Promise.all([
    opts.beforeId ? db.task.findUnique({ where: { id: opts.beforeId }, select: { position: true, columnId: true } }) : null,
    opts.afterId ? db.task.findUnique({ where: { id: opts.afterId }, select: { position: true, columnId: true } }) : null,
  ]);
  const b = before?.columnId === columnId ? before.position : null;
  const af = after?.columnId === columnId ? after.position : null;
  const position = b !== null && af !== null ? (b + af) / 2 : b !== null ? b + 1 : af !== null ? af - 1 : 0;
  // «засчитать в срок» при закрытии — только постановщик/админ; вернули из «Готово» — отметка снимается
  const lateOk = col.isDone ? (opts.lateOk && canExcuseLate(user, a) ? true : t.completedAt ? t.lateOk : false) : false;
  await db.task.update({ where: { id: taskId }, data: { columnId, position, completedAt: col.isDone ? (t.completedAt ?? new Date()) : null, lateOk } });
  if (!changing) return {};

  const comment = (opts.comment ?? "").trim().slice(0, 2000);
  await db.taskEvent.create({ data: { taskId, actorId: user.id, type: "column", field: "Статус", fromValue: t.column.name, toValue: opts.via ? `${col.name} (${opts.via})` : col.name } });
  if (lateOk && !t.lateOk) await db.taskEvent.create({ data: { taskId, actorId: user.id, type: "field", field: "Строк", fromValue: "прострочена", toValue: "зараховано вчасно" } });
  if (comment) await db.comment.create({ data: { taskId, authorId: user.id, text: comment } });

  // уведомления: кому и что
  const tail = comment ? `\n💬 ${user.name}: «${comment}»` : "";
  const sends: { userId: string; type: string; text: string }[] = [];
  const selfTask = t.creatorId === t.assigneeId;
  if (!selfTask && user.id === t.assigneeId && isAssigneeStatus(col.name)) {
    // исполнитель сдал на проверку / ждёт ответа → постановщику
    sends.push({ userId: t.creatorId, type: "review", text: `${user.name} → «${col.name}»: ${t.title}\nПотрібно перевірити виконання.${tail}` });
  } else if (col.isDone && user.id !== t.assigneeId) {
    // постановщик (или админ) принял работу → исполнителю
    sends.push({ userId: t.assigneeId, type: "accepted", text: `Задачу прийнято й закрито: ${t.title}${tail}` });
    if (t.creatorId !== user.id) sends.push({ userId: t.creatorId, type: "status", text: `«${t.title}»: ${t.column.name} → ${col.name} (${user.name})${tail}` });
  } else {
    for (const id of [t.assigneeId, t.creatorId]) sends.push({ userId: id, type: "status", text: `«${t.title}»: ${t.column.name} → ${col.name} (${user.name})${tail}` });
  }
  for (const w of a.watcherIds ?? []) sends.push({ userId: w, type: "status", text: `«${t.title}»: ${t.column.name} → ${col.name} (${user.name})${tail}` });
  const seen = new Set<string>([user.id]);
  const rows = sends.filter((s) => (seen.has(s.userId) ? false : (seen.add(s.userId), true)));
  if (rows.length) await db.notification.createMany({ data: rows.map((r) => ({ ...r, taskId })) });
  return {};
}

/** Колонки проекта для кнопок бота: «Проверка», «Готово», «В работе». */
export async function columnsFor(db: PrismaClient, projectId: string) {
  const cols = await db.boardColumn.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } });
  const open = cols.filter((c) => !c.isDone);
  return {
    review: cols.find((c) => c.name.trim().toLowerCase() === "перевірка") ?? cols.find((c) => isAssigneeStatus(c.name)),
    done: cols.find((c) => c.isDone),
    inWork: open.find((c) => c.name.trim().toLowerCase() === "в роботі") ?? open[1] ?? open[0],
  };
}
