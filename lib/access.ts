/**
 * Единственное место, где описано, кто что видит и что может делать.
 * Функции чистые: принимают пользователя и задачу, в БД не ходят.
 *
 * Уровни накопительные:
 *   1 исполнитель · 2 руководитель группы · 3 руководитель отдела · 4 админ
 */

export const LEVELS = [1, 2, 3, 4] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_NAME: Record<number, string> = {
  1: "Виконавець",
  2: "Керівник групи",
  3: "Керівник відділу",
  4: "Адмін",
};

export type Grant = { directionId: string; subtypeId: string | null };

export type AccessUser = {
  id: string;
  level: number;
  active?: boolean;
  /** роли вместе с родительскими (у «Фронта» засчитывается «Разработчик») */
  roleIds: string[];
  /** доступ уровня 3 к направлениям */
  grants: Grant[];
  /** подчинённые уровня 2 */
  subordinateIds: string[];
  /** доски с ограниченным доступом, куда человек добавлен */
  boardIds?: string[];
};

export type AccessTask = {
  assigneeId: string;
  creatorId: string;
  directionId: string;
  subtypeId: string | null;
  watcherIds?: string[];
  mentionIds?: string[];
  /** задача на доске-черновике — видна только админам */
  projectDraft?: boolean;
  projectId?: string;
  /** доска открыта всем (false — только выбранным) */
  projectAccessAll?: boolean;
};

/**
 * Есть ли у человека доступ к доске задачи. Без доступа он всё равно видит задачи, где сам участвует
 * (исполнитель, автор, наблюдатель, упомянут) — например, креативу можно дать задачу на любой доске.
 */
export function boardOk(u: AccessUser, t: Pick<AccessTask, "projectId" | "projectAccessAll">): boolean {
  if (isAdmin(u) || t.projectAccessAll !== false) return true;
  return !!t.projectId && (u.boardIds ?? []).includes(t.projectId);
}

/** Доска в списках и сама страница доски. */
export function canViewBoard(u: AccessUser, p: { id: string; accessAll: boolean; isDraft?: boolean }): boolean {
  if (isAdmin(u)) return true;
  if (p.isDraft) return false;
  return p.accessAll || (u.boardIds ?? []).includes(p.id);
}

/** Править доску (название, описание, цвет, доступ): админ или тот, кто её создал. */
export function canEditBoard(u: AccessUser, p: { creatorId: string | null }): boolean {
  return isAdmin(u) || (u.active !== false && !!p.creatorId && p.creatorId === u.id);
}

/** Фильтр Prisma: доски, доступные человеку. */
export function boardScopeWhere(u: AccessUser): object {
  if (isAdmin(u)) return {};
  return { isDraft: false, OR: [{ accessAll: true }, { id: { in: u.boardIds ?? [] } }] };
}

export type DirectionRule = { id: string; roleId: string | null };

export const isAdmin = (u: Pick<AccessUser, "level">) => u.level >= 4;

/** Роли с родителями: дочерняя роль засчитывает родительскую. */
export function expandRoles(roleIds: string[], roles: { id: string; parentId: string | null }[]): string[] {
  const byId = new Map(roles.map((r) => [r.id, r]));
  const out = new Set<string>();
  for (const id of roleIds) {
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 10) {
      out.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    if (!byId.has(id)) out.add(id);
  }
  return [...out];
}

/**
 * Покрывает ли доступ уровня 3 задачу.
 * Грант на направление (subtypeId = null) включает все его подтипы — «Разработка» включает «Фронт».
 * Грант на подтип открывает только задачи с этим подтипом — «Фронт» не открывает остальную разработку.
 */
export function covers(u: Pick<AccessUser, "level" | "grants">, directionId: string, subtypeId: string | null): boolean {
  if (u.level < 3) return false;
  return u.grants.some((g) => g.directionId === directionId && (g.subtypeId === null || g.subtypeId === subtypeId));
}

function isSubordinate(u: AccessUser, userId: string) {
  return u.level >= 2 && u.subordinateIds.includes(userId);
}

/** Фильтр Prisma: задачи, которые пользователь видит. */
export function taskScopeWhere(u: AccessUser): object {
  if (isAdmin(u)) return {};
  return { AND: [taskScopeOr(u), { project: { isDraft: false } }] };
}

/**
 * Задачи, которые человек видит «по должности»: подчинённые и отделы по гранту, на доступных досках.
 * Без задач, где он просто постановщик/наблюдатель — по ним строится круг людей в отчётах руководителя
 * (поставил задачу человеку из другого отдела — тот не становится «его» сотрудником в отчётах).
 */
export function staffScopeWhere(u: AccessUser): object | null {
  if (isAdmin(u)) return {};
  const elevated: object[] = [];
  if (u.level >= 2 && u.subordinateIds.length) elevated.push({ assigneeId: { in: u.subordinateIds } });
  if (u.level >= 3)
    for (const g of u.grants) elevated.push(g.subtypeId ? { directionId: g.directionId, subtypeId: g.subtypeId } : { directionId: g.directionId });
  if (!elevated.length) return null;
  return { AND: [{ project: { isDraft: false, OR: [{ accessAll: true }, { id: { in: u.boardIds ?? [] } }] } }, { OR: elevated }] };
}

function taskScopeOr(u: AccessUser): object {
  // участвует сам — видит на любой доске
  const or: object[] = [
    { assigneeId: u.id },
    { creatorId: u.id },
    { watchers: { some: { userId: u.id } } },
    { mentions: { some: { userId: u.id } } },
  ];
  // по должности (подчинённые, отдел) — только на досках, к которым есть доступ
  const elevated: object[] = [];
  if (u.level >= 2 && u.subordinateIds.length) elevated.push({ assigneeId: { in: u.subordinateIds } });
  if (u.level >= 3)
    for (const g of u.grants) elevated.push(g.subtypeId ? { directionId: g.directionId, subtypeId: g.subtypeId } : { directionId: g.directionId });
  if (elevated.length) or.push({ AND: [{ project: { OR: [{ accessAll: true }, { id: { in: u.boardIds ?? [] } }] } }, { OR: elevated }] });
  return { OR: or };
}

export function canViewTask(u: AccessUser, t: AccessTask): boolean {
  if (isAdmin(u)) return true;
  if (t.projectDraft) return false; // доска ещё не опубликована
  return (
    t.assigneeId === u.id ||
    t.creatorId === u.id ||
    (t.watcherIds ?? []).includes(u.id) ||
    (t.mentionIds ?? []).includes(u.id) ||
    (boardOk(u, t) && (isSubordinate(u, t.assigneeId) || covers(u, t.directionId, t.subtypeId)))
  );
}

/**
 * Править, переназначать, архивировать, менять направление.
 * Руководитель (уровень 2+) управляет и задачами, которые поставил сам — в том числе человеку из другого отдела.
 */
export function canManageTask(u: AccessUser, t: AccessTask): boolean {
  if (isAdmin(u)) return true;
  if (t.projectDraft) return false;
  return (
    (boardOk(u, t) && (covers(u, t.directionId, t.subtypeId) || isSubordinate(u, t.assigneeId))) ||
    (t.creatorId === u.id && (t.assigneeId === u.id || u.level >= 2))
  );
}

/** Работать в карточке: колонка (статус), чек-лист, вложения, ссылки. */
export function canWorkOnTask(u: AccessUser, t: AccessTask): boolean {
  if (t.projectDraft && !isAdmin(u)) return false;
  return t.assigneeId === u.id || canManageTask(u, t);
}

/** Статусы, которые может ставить исполнитель чужой задачи: сдать на проверку или ждать ответа. */
export const ASSIGNEE_STATUSES = ["чекає відповіді", "перевірка"];
const norm = (n: string) => n.trim().toLowerCase().replace(/ё/g, "е");
export const isAssigneeStatus = (name: string) => ASSIGNEE_STATUSES.map(norm).includes(norm(name));
export const isReviewStatus = isAssigneeStatus;

/**
 * Можно ли поставить задаче колонку (статус).
 * - постановщик и админ — любую; только они закрывают задачу («Готово»);
 * - исполнитель чужой задачи — только «Ждёт ответа» и «Проверка»;
 * - своя задача себе (постановщик = исполнитель) — любую;
 * - руководители исполнителя — любую, кроме «Готово».
 */
export function canSetColumn(u: AccessUser, t: AccessTask, col: { name: string; isDone: boolean }): boolean {
  if (isAdmin(u) || t.creatorId === u.id) return !t.projectDraft || isAdmin(u);
  if (col.isDone) return false;
  if (t.assigneeId === u.id) return isAssigneeStatus(col.name);
  return canManageTask(u, t);
}

/** «Засчитать в срок» (снять опоздание): тот, кто закрывает задачу, — постановщик или админ. */
export function canExcuseLate(u: AccessUser, t: AccessTask): boolean {
  if (isAdmin(u)) return true;
  return !t.projectDraft && t.creatorId === u.id;
}

/** Двигать карточку вообще (хотя бы в одну колонку): исполнитель, постановщик, руководитель. */
export function canMoveTask(u: AccessUser, t: AccessTask): boolean {
  return canWorkOnTask(u, t) || (t.creatorId === u.id && canViewTask(u, t));
}

/** Комментировать может каждый, кто видит задачу (наблюдатели и упомянутые тоже). */
export function canComment(u: AccessUser, t: AccessTask): boolean {
  return canViewTask(u, t);
}

/** У исполнителя есть роль, которую требует направление. Айти (roleId = null) — любому. */
export function roleFits(assignee: Pick<AccessUser, "roleIds">, d: DirectionRule): boolean {
  return d.roleId === null || assignee.roleIds.includes(d.roleId);
}

export type AssignDecision = "direct" | "request" | "forbidden";

/**
 * Можно ли поставить задачу напрямую.
 * «request» — задача уходит админу на подтверждение (назначение Креативом, запрос сотрудника).
 * Руководитель (уровень 2+) ставит напрямую любому сотруднику, если роль подходит отделу задачи, —
 * в том числе человеку из другой группы/отдела. Видит он при этом только задачи, которые поставил сам,
 * а не все задачи этого человека (видимость — taskScopeWhere / canViewTask).
 */
export function assignDecision(
  u: AccessUser,
  assignee: AccessUser,
  d: DirectionRule,
  subtypeId: string | null,
): AssignDecision {
  if (assignee.active === false) return "forbidden";
  if (isAdmin(u)) return "direct";
  if (covers(u, d.id, subtypeId)) return "direct"; // исключения из правил роли — в своём направлении
  const self = assignee.id === u.id;
  const own = self || u.level >= 2;
  if (own && roleFits(assignee, d)) return "direct";
  return "request";
}

export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const isPriority = (v: unknown): v is Priority => typeof v === "string" && (PRIORITIES as readonly string[]).includes(v);

/**
 * Перенесення строку: високий — не можна (крім адміна), середній — можна з позначкою, низький — вільно.
 * Перше встановлення строку перенесенням не вважається.
 */
export function deadlineChange(u: Pick<AccessUser, "level">, priority: string, from: Date | null, to: Date | null): "ok" | "warn" | "forbidden" {
  const same = (from?.getTime() ?? null) === (to?.getTime() ?? null);
  if (same || from === null) return "ok";
  if (priority === "HIGH") return isAdmin(u) ? "warn" : "forbidden";
  if (priority === "MEDIUM") return "warn";
  return "ok";
}

export const canViewStats = (u: AccessUser) => u.level >= 2;
export const canAdmin = (u: Pick<AccessUser, "level">) => isAdmin(u);
/** Ежедневную задачу заводят руководители (на тех, кому могут ставить задачи напрямую) и админ. */
export const canManageRecurring = (u: AccessUser) => u.level >= 2;
