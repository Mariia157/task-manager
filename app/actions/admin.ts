"use server";

import { revalidatePath } from "next/cache";
import path from "node:path";
import { unlink } from "node:fs/promises";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { SESSION_COOKIE, hashPassword, requireAdmin, requireUser, verifyPassword } from "@/lib/auth";
import { audit, notify, taskEvent } from "@/lib/audit";
import { LEVEL_NAME, canEditBoard } from "@/lib/access";
import { DEFAULT_COLUMNS, SWATCHES } from "@/lib/defaults";

export type AdminState = { error?: string; ok?: string };

const str = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").trim().slice(0, max);
const color = (v: string) => (SWATCHES.includes(v) ? v : SWATCHES[1]);

// ───────────── люди ─────────────

export async function savePersonAction(userId: string | null, _p: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const name = str(form, "name", 100);
  const login = str(form, "login", 40).toLowerCase();
  const password = String(form.get("password") ?? "");
  const level = Number(form.get("level"));
  if (!name) return { error: "Введіть ім’я" };
  if (!/^[a-z0-9_.-]{2,40}$/.test(login)) return { error: "Логін: латиниця, цифри, крапка, дефіс, від 2 символів" };
  if (![1, 2, 3, 4].includes(level)) return { error: "Виберіть рівень доступу" };
  if (!userId && password.length < 8) return { error: "Пароль — від 8 символів" };
  if (userId && password && password.length < 8) return { error: "Новий пароль — від 8 символів" };
  const clash = await db.user.findUnique({ where: { login } });
  if (clash && clash.id !== userId) return { error: "Такий логін уже зайнятий" };

  const roleIds = form.getAll("roles").map(String);
  const subordinateIds = form.getAll("subordinates").map(String).filter((id) => id !== userId);
  let grants: { directionId: string; subtypeId: string | null }[] = [];
  try {
    grants = (JSON.parse(str(form, "grants", 10_000) || "[]") as { directionId: string; subtypeId: string | null }[]).map((g) => ({
      directionId: String(g.directionId),
      subtypeId: g.subtypeId ? String(g.subtypeId) : null,
    }));
  } catch {
    return { error: "Не вдалося розібрати доступи до відділів" };
  }
  if (level === 3 && grants.length === 0) return { error: "Керівнику відділу надайте хоча б один відділ" };
  const active = form.get("active") === "1";
  if (userId === admin.id && (!active || level < 4)) return { error: "Не можна зняти доступ адміна із самого себе" };

  const data = {
    name,
    login,
    level,
    contacts: str(form, "contacts", 300),
    telegram: str(form, "telegram", 64),
    responsibility: str(form, "responsibility", 2000),
    active,
  };
  const before = userId ? await db.user.findUnique({ where: { id: userId } }) : null;
  const id = await db.$transaction(async (tx) => {
    const u = userId
      ? await tx.user.update({ where: { id: userId }, data: { ...data, ...(password ? { passwordHash: await hashPassword(password) } : {}) } })
      : await tx.user.create({ data: { ...data, passwordHash: await hashPassword(password) } });
    await tx.userRole.deleteMany({ where: { userId: u.id } });
    if (roleIds.length) await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: u.id, roleId })) });
    await tx.directionGrant.deleteMany({ where: { userId: u.id } });
    if (level >= 3) for (const g of grants) await tx.directionGrant.create({ data: { userId: u.id, ...g } });
    // доступ к закрытым доскам (открытые всем — не трогаем)
    const closed = (await tx.project.findMany({ where: { accessAll: false }, select: { id: true } })).map((p) => p.id);
    const boardIds = form.getAll("boards").map(String).filter((b) => closed.includes(b));
    await tx.projectMember.deleteMany({ where: { userId: u.id, projectId: { in: closed } } });
    if (boardIds.length) await tx.projectMember.createMany({ data: boardIds.map((projectId) => ({ projectId, userId: u.id })) });
    await tx.subordination.deleteMany({ where: { managerId: u.id } });
    if (level >= 2 && subordinateIds.length) await tx.subordination.createMany({ data: subordinateIds.map((s) => ({ managerId: u.id, subordinateId: s })) });
    // смена пароля или отключение — выкидываем из всех сессий сразу
    if (!active || (userId && password)) await tx.session.deleteMany({ where: { userId: u.id } });
    return u.id;
  });

  const detail = [
    !before && `створено, ${LEVEL_NAME[level]}`,
    before && before.level !== level && `рівень: ${LEVEL_NAME[before.level]} → ${LEVEL_NAME[level]}`,
    before && before.active !== active && (active ? "доступ повернуто" : "доступ відкликано"),
    userId && password && "змінено пароль",
  ]
    .filter(Boolean)
    .join("; ");
  await audit(admin.id, userId ? "user.update" : "user.create", "user", id, `${name} (${login})${detail ? ": " + detail : ""}`);
  redirect(`/admin/people/${id}?saved=1`);
}

/** Передать открытые задачи человека другому (при отключении). Админ не ограничен правилами ролей. */
export async function reassignOpenTasksAction(fromId: string, form: FormData) {
  const admin = await requireAdmin();
  const toId = str(form, "toId");
  const to = await db.user.findFirst({ where: { id: toId, active: true } });
  if (!to) throw new Error("Виберіть активного працівника");
  const tasks = await db.task.findMany({ where: { assigneeId: fromId, completedAt: null, archivedAt: null }, select: { id: true, title: true } });
  const from = await db.user.findUnique({ where: { id: fromId } });
  for (const t of tasks) {
    await db.task.update({ where: { id: t.id }, data: { assigneeId: to.id } });
    await taskEvent(t.id, admin.id, "field", "Виконавець", from?.name ?? "", to.name);
  }
  await notify([to.id], "assigned", `Вам передано задач: ${tasks.length} (від ${from?.name})`, undefined, admin.id);
  await audit(admin.id, "user.reassign", "user", fromId, `${tasks.length} задач → ${to.name}`);
  revalidatePath(`/admin/people/${fromId}`);
}

// ───────────── справочники ─────────────

export async function saveRoleAction(id: string | null, form: FormData) {
  const admin = await requireAdmin();
  const name = str(form, "name", 60);
  if (!name) return;
  const parentId = str(form, "parentId") || null;
  const active = id ? form.get("active") === "1" : true;
  if (id) await db.role.update({ where: { id }, data: { name, parentId: parentId === id ? null : parentId, active } });
  else await db.role.create({ data: { name, parentId, sortOrder: await db.role.count() } });
  await audit(admin.id, id ? "role.update" : "role.create", "role", id, name);
  revalidatePath("/admin/dictionaries");
}

export async function saveDirectionAction(id: string | null, form: FormData) {
  const admin = await requireAdmin();
  const name = str(form, "name", 60);
  if (!name) return;
  const data = {
    name,
    color: color(str(form, "color")),
    roleId: str(form, "roleId") || null,
    subtypeLabel: str(form, "subtypeLabel", 40) || "Підтип",
    active: id ? form.get("active") === "1" : true,
  };
  if (id) await db.direction.update({ where: { id }, data });
  else await db.direction.create({ data: { ...data, sortOrder: await db.direction.count() } });
  await audit(admin.id, id ? "direction.update" : "direction.create", "direction", id, name);
  revalidatePath("/admin/dictionaries");
}

/** Подтип / рекламная сеть. Новая сеть сразу доступна в карточке задачи. */
export async function saveSubtypeAction(directionId: string, id: string | null, form: FormData) {
  const admin = await requireAdmin();
  const name = str(form, "name", 60);
  if (!name) return;
  const active = id ? form.get("active") === "1" : true;
  try {
    if (id) await db.subtype.update({ where: { id }, data: { name, active } });
    else await db.subtype.create({ data: { directionId, name, sortOrder: await db.subtype.count({ where: { directionId } }) } });
  } catch {
    return; // дубль имени в направлении
  }
  await audit(admin.id, id ? "subtype.update" : "subtype.create", "subtype", id, name);
  revalidatePath("/admin/dictionaries");
}

// ───────────── проекты и колонки ─────────────

export async function saveProjectAction(id: string | null, form: FormData) {
  const admin = await requireAdmin();
  const name = str(form, "name", 80);
  if (!name) return;
  const data = { name, color: color(str(form, "color")), description: str(form, "description", 500) };
  try {
    if (id) await db.project.update({ where: { id }, data });
    else
      await db.project.create({
        data: { ...data, sortOrder: await db.project.count(), columns: { create: DEFAULT_COLUMNS.map((c, i) => ({ ...c, sortOrder: i })) } },
      });
  } catch {
    return;
  }
  await audit(admin.id, id ? "project.update" : "project.create", "project", id, name);
  revalidatePath("/admin/projects");
  revalidatePath("/boards");
}

export async function archiveProjectAction(id: string, restore: boolean) {
  const admin = await requireAdmin();
  const p = await db.project.update({ where: { id }, data: { archivedAt: restore ? null : new Date() } });
  await audit(admin.id, restore ? "project.restore" : "project.archive", "project", id, p.name);
  revalidatePath("/admin/projects");
}

export async function saveColumnAction(projectId: string, id: string | null, form: FormData) {
  const admin = await requireAdmin();
  const name = str(form, "name", 40);
  if (!name) return;
  const isDone = form.get("isDone") === "1";
  const data = { name, color: color(str(form, "color")), isDone };
  if (id) await db.boardColumn.update({ where: { id }, data });
  else {
    const last = await db.boardColumn.findFirst({ where: { projectId }, orderBy: { sortOrder: "desc" } });
    await db.boardColumn.create({ data: { ...data, projectId, sortOrder: (last?.sortOrder ?? 0) + 1 } });
  }
  await audit(admin.id, id ? "column.update" : "column.create", "column", id, name);
  revalidatePath("/admin/projects");
}

export async function moveColumnAction(id: string, delta: number) {
  await requireAdmin();
  const col = await db.boardColumn.findUnique({ where: { id } });
  if (!col) return;
  const cols = await db.boardColumn.findMany({ where: { projectId: col.projectId }, orderBy: { sortOrder: "asc" } });
  const i = cols.findIndex((c) => c.id === id);
  const j = i + delta;
  if (j < 0 || j >= cols.length) return;
  [cols[i], cols[j]] = [cols[j], cols[i]];
  await db.$transaction(cols.map((c, k) => db.boardColumn.update({ where: { id: c.id }, data: { sortOrder: k } })));
  revalidatePath("/admin/projects");
}

export async function deleteColumnAction(id: string) {
  const admin = await requireAdmin();
  const count = await db.task.count({ where: { columnId: id } });
  if (count > 0) throw new Error("У колонці є картки — спочатку перенесіть їх");
  const col = await db.boardColumn.delete({ where: { id } });
  await audit(admin.id, "column.delete", "column", id, col.name);
  revalidatePath("/admin/projects");
}

// ───────────── сохранённые виды ─────────────

export async function saveViewAction(form: FormData) {
  const user = await requireUser();
  const name = str(form, "name", 40);
  const query = str(form, "query", 1000).replace(/^\?/, "");
  if (!name || !query) return;
  const shared = user.level >= 4 && form.get("shared") === "1";
  await db.savedView.create({ data: { name, query, userId: shared ? null : user.id, sortOrder: 100 } });
  revalidatePath("/tasks");
  revalidatePath("/boards");
}

export async function deleteViewAction(id: string) {
  const user = await requireUser();
  const v = await db.savedView.findUnique({ where: { id } });
  if (!v || (v.userId !== user.id && !(v.userId === null && user.level >= 4))) return;
  await db.savedView.delete({ where: { id } });
  revalidatePath("/tasks");
  revalidatePath("/boards");
}

// ───────────── профиль ─────────────

export async function updateProfileAction(_p: AdminState, form: FormData): Promise<AdminState> {
  const user = await requireUser();
  const telegram = str(form, "telegram", 64);
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  const data: { telegram: string; notifyDigest: boolean; passwordHash?: string } = { telegram, notifyDigest: form.get("notifyDigest") === "1" };
  if (next) {
    if (next.length < 8) return { error: "Новий пароль — від 8 символів" };
    if (!(await verifyPassword(current, u.passwordHash))) return { error: "Поточний пароль неправильний" };
    data.passwordHash = await hashPassword(next);
  }
  await db.user.update({ where: { id: user.id }, data });
  if (next) {
    // кто знал старый пароль и успел войти — вылетает; текущее устройство остаётся
    const current = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
    const n = (await db.session.deleteMany({ where: { userId: user.id, NOT: { id: current } } })).count;
    await audit(user.id, "user.password", "user", user.id, `змінив пароль сам; вихід на інших пристроях: ${n}`);
  }
  return { ok: next ? "Збережено, пароль змінено. На інших пристроях потрібно увійти знову" : "Збережено" };
}

// ───────────── Telegram ─────────────

/** Отвязать бота от себя (или админ — от сотрудника). */
export async function disconnectTelegramAction(userId: string | null) {
  const user = await requireUser();
  const target = userId && user.level >= 4 ? userId : user.id;
  await db.user.update({ where: { id: target }, data: { telegramChatId: null, tgLinkCode: null } });
  await audit(user.id, "user.telegram", "user", target, "бот відв'язано");
  revalidatePath("/profile");
  revalidatePath(`/admin/people/${target}`);
}

// ───────────── виды работы (HR, Продажа, …) ─────────────

/** Основные виды работы (кнопки в форме задачи). Переименование обновляет и уже размеченные задачи. */
export async function saveBusinessLineAction(id: string | null, form: FormData) {
  const admin = await requireAdmin();
  const name = str(form, "name", 40).replace(/\s+/g, " ");
  if (!name) return;
  const data = { name, color: color(str(form, "color")), active: id ? form.get("active") === "1" : true };
  try {
    if (id) {
      const before = await db.businessLine.findUnique({ where: { id } });
      await db.businessLine.update({ where: { id }, data });
      if (before && before.name !== name) await db.task.updateMany({ where: { business: before.name }, data: { business: name } });
    } else await db.businessLine.create({ data: { ...data, sortOrder: await db.businessLine.count() } });
  } catch {
    return; // дубль названия
  }
  await audit(admin.id, id ? "business.update" : "business.create", "business", id, name);
  revalidatePath("/admin/dictionaries");
}

// ───────────── доски: создание и удаление прямо со страницы «Доски» ─────────────

export type BoardState = { error?: string; ok?: boolean };

/** Новая доска со стандартными колонками → сразу открываем её. */
export async function createBoardAction(_p: BoardState, form: FormData): Promise<BoardState> {
  const admin = await requireAdmin();
  const name = str(form, "name", 80).replace(/\s+/g, " ");
  if (!name) return { error: "Введіть назву дошки" };
  if (await db.project.findUnique({ where: { name } })) return { error: "Дошка з такою назвою вже є (можливо, в архіві)" };
  const p = await db.project.create({
    data: {
      name,
      color: color(str(form, "color")),
      description: str(form, "description", 500),
      isDraft: form.get("draft") === "1",
      accessAll: form.get("access") === "all",
      creatorId: admin.id,
      sortOrder: await db.project.count(),
      columns: { create: DEFAULT_COLUMNS.map((c, i) => ({ ...c, sortOrder: i })) },
      members:
        form.get("access") === "all"
          ? undefined
          : { create: [...new Set(form.getAll("members").map(String))].filter(Boolean).map((userId) => ({ userId })) },
    },
  });
  await audit(admin.id, "project.create", "project", p.id, `${name}${p.isDraft ? " (чернетка)" : ""}`);
  revalidatePath("/boards");
  redirect(`/boards/${p.id}`);
}

/**
 * Удалить доску НАСОВСЕМ вместе с задачами, комментариями, файлами и ежедневными задачами.
 * Подтверждение — точное название доски. Вместо удаления можно отправить в архив.
 */
export async function deleteBoardAction(id: string, _p: BoardState, form: FormData): Promise<BoardState> {
  const admin = await requireAdmin();
  const p = await db.project.findUnique({ where: { id } });
  if (!p) redirect("/boards");
  if (str(form, "confirm", 80).trim() !== p.name) return { error: "Назва не збігається — дошку не видалено" };
  const files = await db.attachment.findMany({ where: { task: { projectId: id } }, select: { storedName: true } });
  const tasks = await db.task.count({ where: { projectId: id } });
  await db.$transaction([
    db.recurringTask.deleteMany({ where: { projectId: id } }),
    // комментарии, файлы, чек-листы, история и напоминания удаляются каскадом вместе с задачами
    db.task.deleteMany({ where: { projectId: id } }),
    db.project.delete({ where: { id } }), // колонки — каскадом
  ]);
  const dir = path.join(process.cwd(), "data", "uploads");
  for (const f of files) await unlink(path.join(dir, f.storedName)).catch(() => {});
  await audit(admin.id, "project.delete", "project", id, `${p.name}: видалено задач ${tasks}, файлів ${files.length}`);
  revalidatePath("/boards");
  revalidatePath("/admin/projects");
  redirect("/boards");
}

/** Опубликовать доску-черновик: её видят все, исполнители получают уведомления о своих задачах. */
export async function publishBoardAction(id: string) {
  const admin = await requireAdmin();
  const p = await db.project.update({ where: { id }, data: { isDraft: false } });
  const open = await db.task.findMany({ where: { projectId: id, completedAt: null, archivedAt: null }, select: { id: true, title: true, assigneeId: true } });
  for (const t of open) await notify([t.assigneeId], "assigned", `Нова задача: ${t.title}`, t.id, admin.id);
  await audit(admin.id, "project.publish", "project", id, `${p.name}: опубліковано, задач ${open.length}`);
  revalidatePath(`/boards/${id}`);
  revalidatePath("/boards");
}

/** Новая доска прямо из формы задачи: возвращает её, чтобы сразу выбрать в списке. */
export async function createBoardInlineAction(name: string, draft: boolean): Promise<{ error?: string; board?: { value: string; label: string; color: string } }> {
  const admin = await requireAdmin();
  const n = name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!n) return { error: "Введіть назву" };
  if (await db.project.findUnique({ where: { name: n } })) return { error: "Дошка з такою назвою вже є" };
  const c = SWATCHES[(await db.project.count()) % SWATCHES.length];
  const p = await db.project.create({
    data: { name: n, color: c, isDraft: draft, creatorId: admin.id, sortOrder: await db.project.count(), columns: { create: DEFAULT_COLUMNS.map((x, i) => ({ ...x, sortOrder: i })) } },
  });
  await audit(admin.id, "project.create", "project", p.id, `${n}${draft ? " (чернетка)" : ""}`);
  revalidatePath("/boards");
  return { board: { value: p.id, label: draft ? `${n} · чернетка` : n, color: p.color } };
}

/** Кто может править доску: админ или её создатель. */
async function requireBoardEditor(projectId: string) {
  const user = await requireUser();
  const p = await db.project.findUnique({ where: { id: projectId } });
  if (!p || !canEditBoard(user, p)) throw new Error("Немає прав на цю дошку");
  return { user, p };
}

/** Изменить доску: название, описание, цвет и доступ. Админ или создатель доски. */
export async function updateBoardAction(projectId: string, _p: BoardState, form: FormData): Promise<BoardState> {
  const { user, p } = await requireBoardEditor(projectId);
  const name = str(form, "name", 80).replace(/\s+/g, " ");
  if (!name) return { error: "Введіть назву дошки" };
  if (name !== p.name && (await db.project.findUnique({ where: { name } }))) return { error: "Дошка з такою назвою вже є (можливо, в архіві)" };
  await db.project.update({ where: { id: projectId }, data: { name, description: str(form, "description", 500), color: color(str(form, "color")) } });
  await applyBoardAccess(projectId, form, user.id);
  await audit(user.id, "project.update", "project", projectId, name !== p.name ? `«${p.name}» → «${name}»` : name);
  revalidatePath(`/boards/${projectId}`);
  revalidatePath("/boards");
  revalidatePath("/admin/projects");
  return { ok: true };
}

/** Доступ: «все» или выбранные. Создатель-не-админ всегда остаётся в списке, иначе потеряет свою доску. */
async function applyBoardAccess(projectId: string, form: FormData, keepId?: string) {
  const accessAll = form.get("access") === "all";
  const ids = [...new Set(form.getAll("members").map(String))];
  const editor = keepId ? await db.user.findUnique({ where: { id: keepId }, select: { level: true } }) : null;
  if (keepId && editor && editor.level < 4 && !ids.includes(keepId)) ids.push(keepId);
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true } }) : [];
  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { accessAll } });
    await tx.projectMember.deleteMany({ where: { projectId } });
    if (!accessAll && users.length) await tx.projectMember.createMany({ data: users.map((u) => ({ projectId, userId: u.id })) });
  });
  return { accessAll, count: users.length };
}

/** Доступ к доске: всем сотрудникам или только выбранным (админы видят все доски всегда). */
export async function setBoardAccessAction(projectId: string, form: FormData) {
  const { user, p } = await requireBoardEditor(projectId);
  const r = await applyBoardAccess(projectId, form, user.id);
  await audit(user.id, "project.access", "project", projectId, `${p.name}: ${r.accessAll ? "усі працівники" : `вибрані (${r.count})`}`);
  revalidatePath(`/boards/${projectId}`);
  revalidatePath("/boards");
  revalidatePath("/admin/projects");
}
