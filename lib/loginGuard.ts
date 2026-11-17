import "server-only";
import { db } from "@/lib/db";

/** Окно и пороги защиты от подбора пароля. */
export const WINDOW_MIN = 15;
export const MAX_PER_LOGIN = 5;
export const MAX_PER_IP = 20;

/**
 * IP клиента. На сервере стоим за nginx, который ПЕРЕЗАПИСЫВАЕТ X-Forwarded-For / X-Real-IP
 * (proxy_set_header X-Real-IP $remote_addr) — иначе заголовок можно подделать и обойти лимит по IP.
 * Лимит по логину от подделки IP не зависит.
 */
export function clientIp(h: Headers): string {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || "local").slice(0, 64);
}

/** Сколько минут ждать (0 — можно входить). Считаются только неудачные попытки в окне. */
export async function loginBlockedFor(login: string, ip: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - WINDOW_MIN * 60_000);
  // по логину считаем ошибки только после последнего удачного входа
  const lastOk = await db.loginAttempt.findFirst({ where: { login, ok: true, createdAt: { gt: since } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const loginSince = lastOk ? lastOk.createdAt : since;
  const [byLogin, byIp] = await Promise.all([
    db.loginAttempt.findMany({ where: { login, ok: false, createdAt: { gt: loginSince } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.loginAttempt.findMany({ where: { ip, ok: false, createdAt: { gt: since } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const wait = (list: { createdAt: Date }[], max: number) => {
    if (list.length < max) return 0;
    // блок снимается, когда самая старая из «лишних» попыток выйдет из окна
    const key = list[list.length - max].createdAt.getTime() + WINDOW_MIN * 60_000;
    return Math.max(1, Math.ceil((key - now.getTime()) / 60_000));
  };
  return Math.max(wait(byLogin, MAX_PER_LOGIN), wait(byIp, MAX_PER_IP));
}

export async function recordLogin(login: string, ip: string, ok: boolean, userAgent: string) {
  await db.loginAttempt.create({ data: { login: login.slice(0, 80), ip, ok, userAgent: userAgent.slice(0, 300) } });
  // журнал храним 90 дней
  if (Math.random() < 0.02) await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400_000) } } });
}
