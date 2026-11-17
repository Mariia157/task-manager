"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { createSession, currentSessionId, destroySession, dummyHash, requireUser, verifyPassword } from "@/lib/auth";
import { clientIp, loginBlockedFor, recordLogin } from "@/lib/loginGuard";
import { audit } from "@/lib/audit";

export type LoginState = { error?: string; login?: string };

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const login = String(form.get("login") ?? "").trim().toLowerCase().slice(0, 80);
  const password = String(form.get("password") ?? "").slice(0, 200);
  const h = await headers();
  const ip = clientIp(h);
  const ua = h.get("user-agent") ?? "";

  // лимит действует на любой введённый логин — так он не выдаёт, существует ли пользователь
  const wait = await loginBlockedFor(login, ip);
  if (wait) return { error: `Забагато невдалих спроб. Спробуйте через ${wait} хв.`, login };

  const user = login ? await db.user.findUnique({ where: { login } }) : null;
  // сравниваем с настоящим bcrypt-хешем всегда: время ответа одинаковое и для несуществующего логина
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  await recordLogin(login, ip, !!user && ok && user.active, ua);
  if (!user || !ok) return { error: "Невірний логін або пароль", login };
  if (!user.active) return { error: "Доступ вимкнено. Зверніться до адміністратора", login };
  await createSession(user.id, form.get("remember") === "1");
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

/** Выйти на одном устройстве из списка в профиле. */
export async function revokeSessionAction(id: string) {
  const user = await requireUser();
  const n = (await db.session.deleteMany({ where: { id, userId: user.id } })).count;
  if (n) await audit(user.id, "session.revoke", "user", user.id, "вихід на іншому пристрої");
  revalidatePath("/profile");
}

/** Выйти на всех устройствах, кроме этого. */
export async function revokeOtherSessionsAction() {
  const user = await requireUser();
  const current = await currentSessionId();
  const n = (await db.session.deleteMany({ where: { userId: user.id, NOT: { id: current ?? "" } } })).count;
  if (n) await audit(user.id, "session.revoke", "user", user.id, `вихід на інших пристроях: ${n}`);
  revalidatePath("/profile");
}
