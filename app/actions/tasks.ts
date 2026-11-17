"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { loadAccessUser, requireUser, type CurrentUser } from "@/lib/auth";
import { assignDecision, canComment, canExcuseLate, canManageTask, canMoveTask, canViewBoard, canViewTask, canWorkOnTask, deadlineChange, isPriority } from "@/lib/access";
import { moveTaskCore } from "@/lib/taskMove";
import { toAccessTask } from "@/lib/tasks";
import { audit, notify, taskEvent } from "@/lib/audit";
import { cleanLinks, createTaskFromDraft, type TaskDraft } from "@/lib/taskWrite";
import { autoStartTask } from "@/lib/autoStart";
import { resolveSubtype } from "@/lib/subtypeInput";
import { addDays, fromZoned, parseDeadline, startOfDay, zonedParts } from "@/lib/time";
import { fmtDate, priorityMeta } from "@/lib/format";

export type FormState = { error?: string; ok?: string; confirm?: string };

const str = (f: FormData, k: string, max = 10_000) => String(f.get(k) ?? "").trim().slice(0, max);

async function loadAccessTask(id: string) {
  const t = await db.task.findUnique({
    where: { id },
    include: { watchers: { select: { userId: true } }, mentions: { select: { userId: true } }, column: true, project: { select: { isDraft: true, accessAll: true } } },
  });
  return t ? { t, a: toAccessTask(t) } : null;
}

/** Разобрать форму задачи и проверить справочники. */
async function readDraft(form: FormData): Promise<{ draft?: TaskDraft; error?: string }> {
  const title = str(form, "title", 200);
  if (!title) return { error: "Введіть назву" };
  const projectId = str(form, "projectId");
  const directionId = str(form, "directionId");
  const assigneeId = str(form, "assigneeId");
  const priority = str(form, "priority");
  if (!isPriority(priority)) return { error: "Виберіть пріоритет" };
  const project = projectId ? await db.project.findFirst({ where: { id: projectId, archivedAt: null } }) : null;
  if (!project) return { error: "Виберіть проєкт" };
  // ставить задачи можно только на доски, к которым есть доступ (исполнителю доступ не нужен)
  if (!canViewBoard(await requireUser(), project)) return { error: "Немає доступу до цієї дошки" };
  const direction = directionId ? await db.direction.findFirst({ where: { id: directionId, active: true } }) : null;
  if (!direction) return { error: "Виберіть відділ" };
  if (!assigneeId) return { error: "Виберіть виконавця" };
  let deadline: string | null = null;
  if (form.get("noDeadline") !== "1") {
    const d = parseDeadline(str(form, "deadlineDate"), str(form, "deadlineTime"));
    if (!d) return { error: "Вкажіть строк або позначте «без строку»" };
    deadline = d.toISOString();
  }
  let links: { label: string; url: string }[] = [];
  try {
    links = cleanLinks(JSON.parse(str(form, "links", 50_000) || "[]"));
  } catch {
    return { error: "Не вдалося розібрати посилання" };
  }
  const watcherIds = form.getAll("watchers").map(String).filter(Boolean).slice(0, 30);
  // вид работы (HR, Продажа…): кнопка из списка или своё значение; регистр подгоняем под список
  let business: string | null = str(form, "business", 40).replace(/\s+/g, " ") || null;
  if (business) {
    const preset = (await db.businessLine.findMany({ select: { name: true } })).find((b) => b.name.toLocaleLowerCase("uk") === business!.toLocaleLowerCase("uk"));
    if (preset) business = preset.name;
  }
  const parentId = str(form, "parentId") || null;
  // подтип (рекламная сеть) — из списка или вписанный вручную; вписанный попадает в справочник
  const st = await resolveSubtype(form, directionId);
  if (st.error) return { error: st.error };
  const subtypeId = st.subtypeId;
  return {
    draft: {
      title,
      description: str(form, "description", 20_000),
      projectId,
      directionId,
      subtypeId,
      business,
      assigneeId,
      priority,
      deadline,
      parentId,
      links,
      watcherIds,
      asIdea: form.get("asIdea") === "1",
    },
  };
}

async function dropDraft(userId: string, form: FormData) {
  const id = String(form.get("draftId") ?? "");
  if (id) await db.draft.deleteMany({ where: { id, userId } });
}

export async function createTaskAction(_p: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const { draft, error } = await readDraft(form);
  if (!draft) return { error };
  if (draft.parentId) {
    const parent = await loadAccessTask(draft.parentId);
    if (!parent || !canViewTask(user, parent.a)) return { error: "Батьківська задача недоступна" };
  }
  const assignee = await loadAccessUser(draft.assigneeId);
  const direction = await db.direction.findUniqueOrThrow({ where: { id: draft.directionId } });
  if (!assignee) return { error: "Виконавця не знайдено" };
  const decision = assignDecision(user, assignee, direction, draft.subtypeId);
  if (decision === "forbidden") return { error: "Виконавця вимкнено" };

  if (decision === "request") {
    const isCreative = user.roleNames.includes("Креатив") && draft.assigneeId !== user.id;
    const req = await db.request.create({
      data: { type: isCreative ? "ASSIGN" : "REQUEST", requesterId: user.id, payload: JSON.stringify(draft), note: str(form, "note", 1000) },
    });
    await audit(user.id, "request.create", "request", req.id, draft.title);
    const admins = await db.user.findMany({ where: { level: 4, active: true }, select: { id: true } });
    await notify(admins.map((a) => a.id), "request", `${isCreative ? "Призначення" : "Запит на задачу"} від ${user.name}: ${draft.title}`);
    await dropDraft(user.id, form);
    redirect(`/requests?sent=${req.id}`);
  }

  const task = await createTaskFromDraft(draft, user.id);
  await dropDraft(user.id, form);
  redirect(`/tasks/${task.id}`);
}

const FIELD_NAME: Record<string, string> = {
  title: "Назва",
  description: "Опис",
  project: "Проєкт",
  direction: "Відділ",
  subtype: "Підтип",
  business: "Вид роботи",
  assignee: "Виконавець",
  priority: "Пріоритет",
  deadline: "Строк",
};

export async function updateTaskAction(taskId: string, _p: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const cur = await loadAccessTask(taskId);
  if (!cur || !canManageTask(user, cur.a)) return { error: "Немає прав на зміну задачі" };
  const { t } = cur;
  const { draft, error } = await readDraft(form);
  if (!draft) return { error };

  const routingChanged = draft.assigneeId !== t.assigneeId || draft.directionId !== t.directionId || draft.subtypeId !== t.subtypeId;
  if (routingChanged) {
    const assignee = await loadAccessUser(draft.assigneeId);
    const direction = await db.direction.findUniqueOrThrow({ where: { id: draft.directionId } });
    if (!assignee) return { error: "Виконавця не знайдено" };
    const d = assignDecision(user, assignee, direction, draft.subtypeId);
    if (d === "forbidden") return { error: "Виконавця вимкнено" };
    if (d === "request") return { error: "Таке призначення поза вашими правами — його підтверджує адмін. Створіть нову задачу-запит" };
  }

  const newDeadline = draft.deadline ? new Date(draft.deadline) : null;
  // правило переноса считается по приоритету ДО правки — понизить приоритет и перенести одной правкой нельзя
  const move = deadlineChange(user, t.priority, t.deadline, newDeadline);
  if (move === "forbidden") return { error: "Високий пріоритет: перенесення строку неможливе" };
  if (move === "warn" && form.get("confirmMove") !== "1")
    return { confirm: `${priorityMeta(t.priority).label} пріоритет: переносити строк небажано. Перенесення потрапить в історію.` };

  // если проект сменился — задача уходит в стартовую колонку нового проекта
  let columnId = t.columnId;
  if (draft.projectId !== t.projectId) {
    const cols = await db.boardColumn.findMany({ where: { projectId: draft.projectId }, orderBy: { sortOrder: "asc" } });
    const target = t.completedAt ? cols.find((c) => c.isDone) : cols.find((c) => !c.isDone);
    columnId = (target ?? cols[0]).id;
  }

  const names = async () => {
    const [p0, p1, d0, d1, s0, s1, a0, a1] = await Promise.all([
      db.project.findUnique({ where: { id: t.projectId } }),
      db.project.findUnique({ where: { id: draft.projectId } }),
      db.direction.findUnique({ where: { id: t.directionId } }),
      db.direction.findUnique({ where: { id: draft.directionId } }),
      t.subtypeId ? db.subtype.findUnique({ where: { id: t.subtypeId } }) : null,
      draft.subtypeId ? db.subtype.findUnique({ where: { id: draft.subtypeId } }) : null,
      db.user.findUnique({ where: { id: t.assigneeId } }),
      db.user.findUnique({ where: { id: draft.assigneeId } }),
    ]);
    return { p0, p1, d0, d1, s0, s1, a0, a1 };
  };
  const n = await names();
  const changes: [string, string | null, string | null][] = [];
  if (draft.title !== t.title) changes.push(["title", t.title, draft.title]);
  if (draft.description !== t.description) changes.push(["description", null, null]);
  if (draft.projectId !== t.projectId) changes.push(["project", n.p0?.name ?? "", n.p1?.name ?? ""]);
  if (draft.directionId !== t.directionId) changes.push(["direction", n.d0?.name ?? "", n.d1?.name ?? ""]);
  if (draft.subtypeId !== t.subtypeId) changes.push(["subtype", n.s0?.name ?? "—", n.s1?.name ?? "—"]);
  if ((draft.business ?? null) !== t.business) changes.push(["business", t.business ?? "—", draft.business ?? "—"]);
  if (draft.assigneeId !== t.assigneeId) changes.push(["assignee", n.a0?.name ?? "", n.a1?.name ?? ""]);
  if (draft.priority !== t.priority) changes.push(["priority", priorityMeta(t.priority).label, priorityMeta(draft.priority).label]);
  if ((t.deadline?.getTime() ?? null) !== (newDeadline?.getTime() ?? null))
    changes.push(["deadline", t.deadline ? fmtDate(t.deadline, true) : "без строку", newDeadline ? fmtDate(newDeadline, true) : "без строку"]);

  await db.$transaction([
    db.task.update({
      where: { id: taskId },
      data: {
        title: draft.title,
        description: draft.description,
        projectId: draft.projectId,
        columnId,
        directionId: draft.directionId,
        subtypeId: draft.subtypeId,
        business: draft.business ?? null,
        assigneeId: draft.assigneeId,
        priority: draft.priority,
        deadline: newDeadline,
      },
    }),
    db.taskLink.deleteMany({ where: { taskId } }),
    db.taskLink.createMany({ data: (draft.links ?? []).map((l, i) => ({ ...l, taskId, sortOrder: i })) }),
    db.watcher.deleteMany({ where: { taskId } }),
    db.watcher.createMany({ data: [...new Set(draft.watcherIds ?? [])].map((userId) => ({ taskId, userId })) }),
  ]);
  for (const [field, from, to] of changes) await taskEvent(taskId, user.id, "field", FIELD_NAME[field], from, to);
  if (draft.assigneeId !== t.assigneeId) await notify([draft.assigneeId], "assigned", `Вам передано задачу: ${draft.title}`, taskId, user.id);
  redirect(`/tasks/${taskId}`);
}

/**
 * Перенос карточки: колонка + место. Позиция — середина между соседями.
 * Колонка «готово» ставит completedAt, выход из неё — снимает.
 */
export async function moveTaskAction(
  taskId: string,
  columnId: string,
  beforeId: string | null,
  afterId: string | null,
  comment?: string,
  lateOk?: boolean,
): Promise<{ error?: string }> {
  const user = await requireUser();
  const r = await moveTaskCore(db, user, taskId, columnId, { beforeId, afterId, comment, lateOk });
  revalidatePath(`/tasks/${taskId}`);
  return r;
}

/** Перенос на доске «по статусам» (Мои задачи / Все задачи): колонка с таким названием в проекте задачи. */
export async function moveTaskToStatusAction(taskId: string, statusName: string): Promise<{ error?: string }> {
  // сначала права — чтобы по чужому id нельзя было узнать даже название проекта
  const user = await requireUser();
  const cur = await loadAccessTask(taskId);
  if (!cur || !canMoveTask(user, cur.a)) return { error: "Немає прав переміщати цю картку" };
  const t = await db.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true, columnId: true, project: { select: { name: true } } } });
  const col = await db.boardColumn.findFirst({ where: { projectId: t.projectId, name: statusName } });
  if (!col) return { error: `На дошці «${t.project.name}» немає колонки «${statusName}»` };
  if (col.id === t.columnId) return {};
  return moveTaskAction(taskId, col.id, null, null);
}

export async function archiveTaskAction(taskId: string, restore: boolean) {
  const user = await requireUser();
  const cur = await loadAccessTask(taskId);
  if (!cur || !canManageTask(user, cur.a)) throw new Error("Немає прав");
  await db.task.update({ where: { id: taskId }, data: { archivedAt: restore ? null : new Date() } });
  await taskEvent(taskId, user.id, restore ? "restore" : "archive");
  await audit(user.id, restore ? "task.restore" : "task.archive", "task", taskId, cur.t.title);
  revalidatePath(`/tasks/${taskId}`);
}

/** Окончательное удаление — только админ и только из архива. */
export async function deleteTaskAction(taskId: string) {
  const user = await requireUser();
  if (user.level < 4) throw new Error("Видаляє лише адмін");
  const t = await db.task.findUnique({ where: { id: taskId }, include: { attachments: true } });
  if (!t) redirect("/tasks?archived=1");
  if (!t.archivedAt) throw new Error("Спочатку надішліть задачу в архів");
  await db.task.delete({ where: { id: taskId } });
  for (const a of t.attachments) await unlink(path.join(UPLOAD_DIR, a.storedName)).catch(() => {});
  await audit(user.id, "task.delete", "task", taskId, t.title);
  redirect("/tasks?archived=1");
}

export async function addCommentAction(taskId: string, _p: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const cur = await loadAccessTask(taskId);
  if (!cur || !canComment(user, cur.a)) return { error: "Немає доступу" };
  const text = str(form, "text", 5000);
  if (!text) return { error: "Порожній коментар" };
  await db.comment.create({ data: { taskId, authorId: user.id, text } });
  await autoStartTask(taskId, user.id);
  // @login → упоминание: человек начинает видеть задачу и получает уведомление
  const logins = [...new Set([...text.matchAll(/@([a-z0-9_.-]{2,40})/gi)].map((m) => m[1].toLowerCase()))];
  const mentioned = logins.length ? await db.user.findMany({ where: { login: { in: logins }, active: true }, select: { id: true } }) : [];
  for (const m of mentioned)
    await db.taskMention.upsert({ where: { taskId_userId: { taskId, userId: m.id } }, update: {}, create: { taskId, userId: m.id } });
  await notify(mentioned.map((m) => m.id), "mention", `${user.name} згадав(ла) вас: «${cur.t.title}»`, taskId, user.id);
  const mentionedIds = new Set(mentioned.map((m) => m.id));
  await notify(
    [cur.t.assigneeId, cur.t.creatorId, ...(cur.a.watcherIds ?? [])].filter((id) => !mentionedIds.has(id)),
    "comment",
    `Новий коментар у «${cur.t.title}» від ${user.name}`,
    taskId,
    user.id,
  );
  revalidatePath(`/tasks/${taskId}`);
  return { ok: "1" };
}

async function requireWork(taskId: string): Promise<{ user: CurrentUser; title: string }> {
  const user = await requireUser();
  const cur = await loadAccessTask(taskId);
  if (!cur || !canWorkOnTask(user, cur.a)) throw new Error("Немає прав");
  return { user, title: cur.t.title };
}

export async function addChecklistItemAction(taskId: string, _p: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireWork(taskId);
  const text = str(form, "text", 300);
  if (!text) return { error: "Порожній пункт" };
  const last = await db.checklistItem.findFirst({ where: { taskId }, orderBy: { sortOrder: "desc" } });
  await db.checklistItem.create({ data: { taskId, text, sortOrder: (last?.sortOrder ?? 0) + 1 } });
  await autoStartTask(taskId, user.id);
  await taskEvent(taskId, user.id, "checklist", "Чек-лист", null, `+ ${text}`);
  revalidatePath(`/tasks/${taskId}`);
  return { ok: "1" };
}

export async function toggleChecklistItemAction(itemId: string) {
  const item = await db.checklistItem.findUnique({ where: { id: itemId } });
  if (!item) return;
  const { user } = await requireWork(item.taskId);
  await db.checklistItem.update({ where: { id: itemId }, data: { done: !item.done } });
  await autoStartTask(item.taskId, user.id);
  await taskEvent(item.taskId, user.id, "checklist", "Чек-лист", null, `${item.done ? "☐" : "☑"} ${item.text}`);
  revalidatePath(`/tasks/${item.taskId}`);
}

export async function deleteChecklistItemAction(itemId: string) {
  const item = await db.checklistItem.findUnique({ where: { id: itemId } });
  if (!item) return;
  const { user } = await requireWork(item.taskId);
  await db.checklistItem.delete({ where: { id: itemId } });
  await taskEvent(item.taskId, user.id, "checklist", "Чек-лист", item.text, null);
  revalidatePath(`/tasks/${item.taskId}`);
}

// ── вложения: файлы лежат вне public, отдаются роутом /api/files/[id] с проверкой прав ──
const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const MAX_FILE = 20 * 1024 * 1024;

export async function uploadAttachmentAction(taskId: string, _p: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireWork(taskId);
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Виберіть файл" };
  if (files.length > 10) return { error: "Не більше 10 файлів за раз" };
  if (files.reduce((n, f) => n + f.size, 0) > MAX_FILE) return { error: "За один раз — не більше 20 МБ" };
  await mkdir(UPLOAD_DIR, { recursive: true });
  for (const f of files.slice(0, 10)) {
    if (f.size > MAX_FILE) return { error: `«${f.name}» більше за 20 МБ` };
    const storedName = randomBytes(16).toString("hex");
    await writeFile(path.join(UPLOAD_DIR, storedName), Buffer.from(await f.arrayBuffer()));
    const fileName = f.name.replace(/[\\/\0]/g, "_").slice(0, 200) || "file";
    await db.attachment.create({ data: { taskId, uploaderId: user.id, fileName, storedName, size: f.size, mime: f.type || "application/octet-stream" } });
    await taskEvent(taskId, user.id, "attachment", "Файл", null, fileName);
  }
  await autoStartTask(taskId, user.id);
  revalidatePath(`/tasks/${taskId}`);
  return { ok: "1" };
}

export async function deleteAttachmentAction(id: string) {
  const user = await requireUser();
  const a = await db.attachment.findUnique({ where: { id } });
  if (!a) return;
  const cur = await loadAccessTask(a.taskId);
  if (!cur || !(a.uploaderId === user.id ? canWorkOnTask(user, cur.a) : canManageTask(user, cur.a))) throw new Error("Немає прав");
  await db.attachment.delete({ where: { id } });
  await unlink(path.join(UPLOAD_DIR, a.storedName)).catch(() => {});
  await taskEvent(a.taskId, user.id, "attachment", "Файл", a.fileName, null);
  revalidatePath(`/tasks/${a.taskId}`);
}

/** Подписаться / отписаться самому (наблюдатель). */
export async function toggleWatchAction(taskId: string) {
  const user = await requireUser();
  const cur = await loadAccessTask(taskId);
  if (!cur || !canViewTask(user, cur.a)) throw new Error("Немає доступу");
  const key = { taskId_userId: { taskId, userId: user.id } };
  if (await db.watcher.findUnique({ where: key })) await db.watcher.delete({ where: key });
  else await db.watcher.create({ data: { taskId, userId: user.id } });
  revalidatePath(`/tasks/${taskId}`);
}

// ───────── личные напоминания (бот присылает в назначенное время) ─────────

/** Когда напомнить: готовый вариант или своя дата и время (по Киеву). */
function reminderTime(form: FormData, deadline: Date | null, now = new Date()): Date | null {
  const preset = String(form.get("preset") ?? "");
  if (preset === "1h") return new Date(now.getTime() + 3600_000);
  if (preset === "3h") return new Date(now.getTime() + 3 * 3600_000);
  if (preset === "tomorrow") {
    const z = zonedParts(addDays(startOfDay(now), 1));
    return fromZoned(z.y, z.m, z.d, 9, 0);
  }
  if (preset === "beforeDeadline") return deadline ? new Date(deadline.getTime() - 3600_000) : null;
  return parseDeadline(String(form.get("date") ?? ""), String(form.get("time") ?? ""));
}

export async function addReminderAction(taskId: string, _p: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const cur = await loadAccessTask(taskId);
  if (!cur || !canViewTask(user, cur.a)) return { error: "Немає доступу" };
  if (cur.t.completedAt || cur.t.archivedAt) return { error: "Задачу вже закрито" };
  // напомнить исполнителю может тот, кто управляет задачей; иначе — только себе
  const forAssignee = form.get("target") === "assignee";
  if (forAssignee && (!canManageTask(user, cur.a) || cur.t.assigneeId === user.id)) return { error: "Нагадати виконавцю може лише керівник задачі" };
  const userId = forAssignee ? cur.t.assigneeId : user.id;
  const at = reminderTime(form, cur.t.deadline);
  const now = Date.now();
  if (!at) return { error: form.get("preset") === "beforeDeadline" ? "У задачі немає строку" : "Вкажіть дату й час" };
  if (at.getTime() < now + 60_000) return { error: "Час нагадування вже минув" };
  if (at.getTime() > now + 366 * 86400_000) return { error: "Не далі ніж через рік" };
  const active = await db.reminder.count({ where: { taskId, userId, sentAt: null } });
  if (active >= 10) return { error: "Забагато нагадувань по одній задачі" };
  await db.reminder.create({ data: { taskId, userId, creatorId: user.id, remindAt: at, note: str(form, "note", 200) } });
  revalidatePath(`/tasks/${taskId}`);
  return { ok: `Нагадаю ${fmtDate(at, true)}` };
}

export async function deleteReminderAction(id: string) {
  const user = await requireUser();
  const r = await db.reminder.findUnique({ where: { id } });
  if (!r || (r.userId !== user.id && r.creatorId !== user.id)) return;
  await db.reminder.delete({ where: { id } });
  revalidatePath(`/tasks/${r.taskId}`);
}

// ───────── черновики задач: видны только автору, без проверок и уведомлений ─────────

const DRAFT_FIELDS = ["title", "description", "projectId", "directionId", "subtypeId", "subtypeNew", "business", "assigneeId", "priority", "deadlineDate", "deadlineTime", "noDeadline", "links", "parentId", "note", "asIdea"];

export async function saveTaskDraftAction(draftId: string | null, form: FormData) {
  const user = await requireUser();
  const data: Record<string, unknown> = {};
  for (const k of DRAFT_FIELDS) data[k] = str(form, k, k === "description" ? 20_000 : k === "links" ? 50_000 : 1000);
  data.watchers = form.getAll("watchers").map(String).slice(0, 30);
  const title = String(data.title || "").slice(0, 200);
  const payload = JSON.stringify(data);
  const own = draftId ? await db.draft.findFirst({ where: { id: draftId, userId: user.id } }) : null;
  if (own) await db.draft.update({ where: { id: own.id }, data: { title, payload } });
  else {
    if ((await db.draft.count({ where: { userId: user.id } })) >= 100) throw new Error("Забагато чернеток — видаліть непотрібні");
    await db.draft.create({ data: { userId: user.id, title, payload } });
  }
  revalidatePath("/drafts");
  redirect("/drafts?saved=1");
}

export async function deleteDraftAction(id: string) {
  const user = await requireUser();
  await db.draft.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/drafts");
}

/**
 * Запрос на согласовании: админ правит задачу (название, описание, исполнителя, срок, доску…) и сразу одобряет.
 * Поля проверяются так же, как при обычном создании; автор запроса получает «Одобрено с правками».
 */
export async function approveEditedRequestAction(requestId: string, _p: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.level < 4) return { error: "Рішення ухвалює адмін" };
  const req = await db.request.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") return { error: "Запит уже розглянуто" };
  const { draft, error } = await readDraft(form);
  if (!draft) return { error };
  const assignee = await db.user.findUnique({ where: { id: draft.assigneeId } });
  if (!assignee?.active) return { error: "Виконавця вимкнено" };
  const note = str(form, "decisionNote", 1000);
  const task = await createTaskFromDraft(draft, req.requesterId, true);
  await db.request.update({
    where: { id: requestId },
    // сохраняем исправленный вариант — в истории запроса видно, что одобрили
    data: { status: "APPROVED", decidedById: user.id, decidedAt: new Date(), decisionNote: note || "схвалено з правками", taskId: task.id, payload: JSON.stringify(draft) },
  });
  await taskEvent(task.id, user.id, "field", "Погодження", null, `схвалено з правками (${user.name})`);
  await audit(user.id, "request.approve", "request", requestId, `${draft.title} — з правками`);
  await notify([req.requesterId], "request", `Схвалено з правками: ${draft.title}${note ? ` — ${note}` : ""}`, task.id, user.id);
  revalidatePath("/requests");
  redirect(`/tasks/${task.id}`);
}

/**
 * «Засчитать в срок»: задачу сделали вовремя, но статус поменяли позже — в отчётах и статистике она не опоздание.
 * Постановщик или админ; только для закрытой задачи. value=false — вернуть отметку «с опозданием».
 */
export async function setLateOkAction(taskId: string, value: boolean): Promise<{ error?: string }> {
  const user = await requireUser();
  const cur = await loadAccessTask(taskId);
  if (!cur || !canExcuseLate(user, cur.a)) return { error: "Зарахувати вчасно може той, хто поставив задачу, або адмін" };
  if (!cur.t.completedAt) return { error: "Спочатку закрийте задачу" };
  if (cur.t.lateOk === value) return {};
  await db.task.update({ where: { id: taskId }, data: { lateOk: value } });
  await taskEvent(taskId, user.id, "field", "Строк", value ? "із запізненням" : "зараховано вчасно", value ? "зараховано вчасно" : "із запізненням");
  revalidatePath(`/tasks/${taskId}`);
  return {};
}
