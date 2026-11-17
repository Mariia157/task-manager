import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { expandRoles, type AccessUser } from "@/lib/access";

export const SESSION_COOKIE = "sid";
/** метка «запомнено» — по ней proxy продлевает cookie; значение — день последнего продления */
export const REMEMBER_COOKIE = "sr";
/** «Запомнить это устройство»: неделя, каждый заход продлевает срок */
export const REMEMBER_DAYS = 7;
/** без галочки: cookie живёт до закрытия браузера, на сервере — не дольше 12 часов */
const SHORT_HOURS = 12;

export type CurrentUser = AccessUser & {
  name: string;
  login: string;
  /** собственные роли без родительских — для подписи */
  roleNames: string[];
};

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

/**
 * Настоящий bcrypt-хеш случайной строки — для сравнения, когда логина нет.
 * Невалидный хеш bcrypt отбрасывает мгновенно, и по времени ответа было видно, что логина нет.
 */
let dummy: Promise<string> | null = null;
export function dummyHash() {
  dummy ??= bcrypt.hash(randomBytes(16).toString("hex"), 10);
  return dummy;
}

export const cookieBase = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" });

export async function createSession(userId: string, remember: boolean) {
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + (remember ? REMEMBER_DAYS * 86400_000 : SHORT_HOURS * 3600_000));
  const userAgent = ((await headers()).get("user-agent") ?? "").slice(0, 300);
  await db.session.create({ data: { id, userId, expiresAt, persistent: remember, userAgent } });
  const jar = await cookies();
  if (remember) {
    jar.set(SESSION_COOKIE, id, { ...cookieBase(), expires: expiresAt });
    jar.set(REMEMBER_COOKIE, new Date().toISOString().slice(0, 10), { ...cookieBase(), expires: expiresAt });
  } else {
    // без expires — браузер удалит cookie при закрытии
    jar.set(SESSION_COOKIE, id, cookieBase());
    jar.delete(REMEMBER_COOKIE);
  }
}

export async function currentSessionId() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function destroySession() {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) await db.session.deleteMany({ where: { id } });
  jar.delete(SESSION_COOKIE);
  jar.delete(REMEMBER_COOKIE);
}

/** Все роли с родителями — нужны, чтобы «Фронт» засчитывал «Разработчика». */
export const roleTree = cache(() => db.role.findMany({ select: { id: true, parentId: true } }));

/** Загрузить человека в форме AccessUser (для проверки назначения). */
export async function loadAccessUser(id: string): Promise<AccessUser | null> {
  const u = await db.user.findUnique({
    where: { id },
    include: { roles: true, grants: true, subordinates: true, boards: true },
  });
  if (!u) return null;
  return {
    id: u.id,
    level: u.level,
    active: u.active,
    roleIds: expandRoles(u.roles.map((r) => r.roleId), await roleTree()),
    grants: u.grants.map((g) => ({ directionId: g.directionId, subtypeId: g.subtypeId })),
    subordinateIds: u.subordinates.map((s) => s.subordinateId),
    boardIds: u.boards.map((b) => b.projectId),
  };
}

/** Текущий пользователь или null. Кэшируется на время одного запроса. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const session = await db.session.findUnique({
    where: { id },
    include: {
      user: { include: { roles: { include: { role: true } }, grants: true, subordinates: true, boards: true } },
    },
  });
  // отключённый сотрудник теряет доступ сразу — даже с живой сессией
  const now = Date.now();
  if (!session || session.expiresAt.getTime() < now || !session.user.active) return null;
  // продление «запомненной» сессии и отметка «был в сети» — не чаще раза в 10 минут
  if (now - session.lastSeenAt.getTime() > 10 * 60_000) {
    await db.session.update({
      where: { id },
      data: { lastSeenAt: new Date(now), ...(session.persistent ? { expiresAt: new Date(now + REMEMBER_DAYS * 86400_000) } : {}) },
    });
  }
  const u = session.user;
  return {
    id: u.id,
    name: u.name,
    login: u.login,
    level: u.level,
    active: u.active,
    roleIds: expandRoles(u.roles.map((r) => r.roleId), await roleTree()),
    roleNames: u.roles.map((r) => r.role.name),
    grants: u.grants.map((g) => ({ directionId: g.directionId, subtypeId: g.subtypeId })),
    subordinateIds: u.subordinates.map((s) => s.subordinateId),
    boardIds: u.boards.map((b) => b.projectId),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.level < 4) redirect("/");
  return u;
}
