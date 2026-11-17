import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { currentSessionId, requireUser } from "@/lib/auth";
import { LEVEL_NAME } from "@/lib/access";
import { logoutAction } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/Avatar";
import { ProfileForm } from "@/components/ProfileForm";
import { TelegramCard } from "@/components/TelegramCard";
import { SessionsCard } from "@/components/SessionsCard";
import { IconLogout } from "@/components/icons";

export const metadata = { title: "Профіль · Taskflow" };

export default async function ProfilePage() {
  const user = await requireUser();
  const u = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { grants: { include: { direction: true, subtype: true } }, subordinates: { include: { subordinate: { select: { name: true } } } } },
  });
  const [sessions, sid] = await Promise.all([
    db.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
    currentSessionId(),
  ]);
  // одноразовый код для привязки бота — создаём, пока бот не подключён
  const bot = process.env.TELEGRAM_BOT_USERNAME ?? "";
  let code = u.tgLinkCode;
  if (!u.telegramChatId && !code && bot) {
    code = randomBytes(12).toString("base64url");
    await db.user.update({ where: { id: u.id }, data: { tgLinkCode: code } });
  }
  const access =
    user.level >= 4
      ? "Усе"
      : [
          "свої задачі, відстежувані та де вас згадали",
          ...(user.level >= 2 && u.subordinates.length ? [`задачі групи: ${u.subordinates.map((s) => s.subordinate.name).join(", ")}`] : []),
          ...(user.level >= 3 ? u.grants.map((g) => (g.subtype ? `${g.direction.name}: лише ${g.subtype.name}` : `весь відділ «${g.direction.name}»`)) : []),
        ].join("; ");
  return (
    <div className="mx-auto max-w-[720px] space-y-6">
      <div className="card flex items-center gap-4 p-6">
        <Avatar name={user.name} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">{user.name}</h1>
          <div className="text-ink-3">
            @{user.login} · {LEVEL_NAME[user.level]}
            {user.roleNames.length > 0 && ` · ${user.roleNames.join(", ")}`}
          </div>
        </div>
      </div>
      <div className="card space-y-3 p-6">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-ink-3">Що ви бачите</div>
          <div className="mt-1 font-semibold">{access}</div>
        </div>
        {u.responsibility && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-ink-3">Зона відповідальності</div>
            <div className="mt-1 whitespace-pre-wrap">{u.responsibility}</div>
          </div>
        )}
      </div>
      <TelegramCard connected={!!u.telegramChatId} botName={bot || "—"} link={bot && code ? `https://t.me/${bot}?start=${code}` : null} />
      <ProfileForm telegram={u.telegram} notifyDigest={u.notifyDigest} />
      <SessionsCard sessions={sessions.map((s) => ({ ...s, current: s.id === sid }))} />
      <form action={logoutAction} className="lg:hidden">
        <button className="btn btn-soft w-full">
          <IconLogout size={16} />
          Вийти
        </button>
      </form>
    </div>
  );
}
