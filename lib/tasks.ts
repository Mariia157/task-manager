import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { assignDecision, canManageTask, canViewTask, canWorkOnTask, isPriority, taskScopeWhere, type AccessTask, type AccessUser } from "@/lib/access";
import { loadAccessUser, roleTree } from "@/lib/auth";
import { expandRoles } from "@/lib/access";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export type TaskFilters = {
  project: string;
  direction: string;
  subtype: string;
  business: string;
  assignee: string;
  priority: string;
  overdue: boolean;
  done: "" | "open" | "done";
  q: string;
  sort: "deadline" | "created" | "priority" | "position";
  archived: boolean;
};

export function parseFilters(sp: SP): TaskFilters {
  const sort = one(sp.sort);
  const done = one(sp.done);
  return {
    project: one(sp.project),
    direction: one(sp.direction),
    subtype: one(sp.subtype),
    business: one(sp.business).slice(0, 40),
    assignee: one(sp.assignee),
    priority: isPriority(one(sp.priority)) ? one(sp.priority) : "",
    overdue: one(sp.overdue) === "1",
    done: done === "open" || done === "done" ? done : "",
    q: one(sp.q).trim().slice(0, 100),
    sort: sort === "created" || sort === "priority" || sort === "position" ? sort : "deadline",
    archived: one(sp.archived) === "1",
  };
}

export function filtersWhere(user: AccessUser, f: TaskFilters, now = new Date()) {
  const and: object[] = [taskScopeWhere(user), { archivedAt: f.archived ? { not: null } : null }];
  if (f.project) and.push({ projectId: f.project });
  if (f.direction) and.push({ directionId: f.direction });
  if (f.subtype) and.push({ subtypeId: f.subtype });
  if (f.business) and.push({ business: f.business });
  if (f.assignee) and.push({ assigneeId: f.assignee });
  if (f.priority) and.push({ priority: f.priority });
  if (f.done === "open") and.push({ completedAt: null });
  if (f.done === "done") and.push({ completedAt: { not: null } });
  if (f.overdue) and.push({ completedAt: null, deadline: { lt: now } });
  return { AND: and };
}

export const cardInclude = {
  project: { select: { id: true, name: true, color: true, isDraft: true, accessAll: true } },
  column: { select: { id: true, name: true, color: true, isDone: true } },
  direction: { select: { id: true, name: true, color: true } },
  subtype: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  checklist: { select: { done: true } },
  children: { select: { completedAt: true, archivedAt: true } },
  parent: { select: { id: true, title: true } },
  watchers: { select: { userId: true } },
  mentions: { select: { userId: true } },
  _count: { select: { comments: true, attachments: true } },
} as const;

const PRIO = { HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>;

/** Поиск делаем в JS: LIKE в SQLite не понимает регистр кириллицы. */
export async function listTasks(user: AccessUser, f: TaskFilters, now = new Date(), take = 500) {
  const rows = await db.task.findMany({ where: filtersWhere(user, f, now), include: cardInclude, take: 2000 });
  const q = f.q.toLocaleLowerCase("uk");
  const list = q ? rows.filter((t) => t.title.toLocaleLowerCase("uk").includes(q) || t.description.toLocaleLowerCase("uk").includes(q)) : rows;
  const far = 8.64e15;
  list.sort((a, b) => {
    if (f.sort === "position") return a.position - b.position;
    if (f.sort === "created") return b.createdAt.getTime() - a.createdAt.getTime();
    if (f.sort === "priority") return PRIO[a.priority] - PRIO[b.priority] || (a.deadline?.getTime() ?? far) - (b.deadline?.getTime() ?? far);
    // по дедлайну: открытые раньше закрытых, без срока — в конце
    const da = a.completedAt ? 1 : 0;
    const db_ = b.completedAt ? 1 : 0;
    return da - db_ || (a.deadline?.getTime() ?? far) - (b.deadline?.getTime() ?? far);
  });
  return list.slice(0, take);
}

export type TaskCardData = Awaited<ReturnType<typeof listTasks>>[number];

export function toAccessTask(t: {
  assigneeId: string;
  creatorId: string;
  directionId: string;
  subtypeId: string | null;
  watchers?: { userId: string }[];
  mentions?: { userId: string }[];
  projectId?: string;
  project?: { isDraft: boolean; accessAll?: boolean } | null;
}): AccessTask {
  return {
    assigneeId: t.assigneeId,
    creatorId: t.creatorId,
    directionId: t.directionId,
    subtypeId: t.subtypeId,
    watcherIds: t.watchers?.map((w) => w.userId) ?? [],
    mentionIds: t.mentions?.map((m) => m.userId) ?? [],
    projectDraft: t.project?.isDraft ?? false,
    projectId: t.projectId,
    projectAccessAll: t.project?.accessAll ?? true,
  };
}

/** Карточка целиком — или null, если не видна (наружу отдаём 404). */
export async function getTaskForUser(user: AccessUser, id: string) {
  const t = await db.task.findUnique({
    where: { id },
    include: {
      ...cardInclude,
      creator: { select: { id: true, name: true } },
      watchers: { select: { userId: true, user: { select: { id: true, name: true } } } },
      links: { orderBy: { sortOrder: "asc" } },
      attachments: { orderBy: { createdAt: "asc" }, include: { uploader: { select: { name: true } } } },
      checklist: { orderBy: { sortOrder: "asc" } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } },
      events: { orderBy: { createdAt: "desc" }, take: 60, include: { actor: { select: { name: true } } } },
      children: { include: cardInclude, orderBy: { createdAt: "asc" } },
      recurring: { select: { id: true, dueTime: true } },
      reminders: {
        where: { sentAt: null, OR: [{ userId: user.id }, { creatorId: user.id }] },
        orderBy: { remindAt: "asc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
  if (!t) return null;
  const a = toAccessTask(t);
  if (!canViewTask(user, a)) return null;
  return { task: t, canManage: canManageTask(user, a), canWork: canWorkOnTask(user, a) };
}

/** Справочники для форм и фильтров. */
export const getDicts = cache(async () => {
  const [directions, projects, people, roles, businessLines, customBusiness] = await Promise.all([
    db.direction.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { subtypes: { where: { active: true }, orderBy: { sortOrder: "asc" } }, role: { select: { name: true } } },
    }),
    db.project.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, include: { columns: { orderBy: { sortOrder: "asc" } } } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { roles: { include: { role: true } } } }),
    db.role.findMany({ orderBy: { sortOrder: "asc" } }),
    db.businessLine.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.task.findMany({ where: { business: { not: null }, archivedAt: null }, select: { business: true }, distinct: ["business"], take: 50 }),
  ]);
  const presetNames = new Set(businessLines.map((b) => b.name));
  // вписанные вручную значения — подсказками после основных
  const business = {
    presets: businessLines.map((b) => ({ name: b.name, color: b.color })),
    custom: customBusiness.map((t) => t.business!).filter((n) => !presetNames.has(n)).sort((a, b) => a.localeCompare(b, "uk")),
  };
  return { directions, projects, people, roles, business };
});

/** Люди, которых пользователь видит в фильтрах: админ — всех, остальные — из видимых задач + себя. */
export async function filterPeople(user: AccessUser) {
  const { people } = await getDicts();
  if (user.level >= 4) return people;
  const ids = await db.task.findMany({ where: taskScopeWhere(user), select: { assigneeId: true }, distinct: ["assigneeId"] });
  const set = new Set([user.id, ...ids.map((i) => i.assigneeId), ...user.subordinateIds]);
  return people.filter((p) => set.has(p.id));
}

/**
 * Матрица «кого куда можно поставить» для подсказок в форме:
 * ключ `${personId}|${directionId}|${subtypeId}` → direct / request.
 */
export async function assignMatrix(user: AccessUser) {
  const { people, directions } = await getDicts();
  const tree = await roleTree();
  const full = await Promise.all(people.map((p) => loadAccessUser(p.id)));
  const out: Record<string, "direct" | "request" | "forbidden"> = {};
  for (const p of full) {
    if (!p) continue;
    const pa = { ...p, roleIds: expandRoles(p.roleIds, tree) };
    for (const d of directions)
      for (const s of [null, ...d.subtypes.map((x) => x.id)]) out[`${p.id}|${d.id}|${s ?? ""}`] = assignDecision(user, pa, { id: d.id, roleId: d.roleId }, s);
  }
  return out;
}

export function progress(children: { completedAt: Date | null; archivedAt: Date | null }[]) {
  const live = children.filter((c) => !c.archivedAt);
  return { done: live.filter((c) => c.completedAt).length, total: live.length };
}
