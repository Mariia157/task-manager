import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { deviceLabel } from "@/lib/device";

export const metadata = { title: "Журнал дій · Taskflow" };

const ACTION: Record<string, string> = {
  "user.create": "Створено працівника",
  "user.update": "Змінено працівника",
  "user.password": "Зміна пароля",
  "user.reassign": "Передача задач",
  "role.create": "Нова роль",
  "role.update": "Змінено роль",
  "direction.create": "Новий відділ",
  "direction.update": "Змінено відділ",
  "subtype.create": "Новий підтип",
  "subtype.update": "Змінено підтип",
  "project.create": "Новий проєкт",
  "project.update": "Змінено проєкт",
  "project.archive": "Проєкт в архів",
  "project.restore": "Проєкт з архіву",
  "project.delete": "Дошку видалено",
  "project.publish": "Дошку опубліковано",
  "project.access": "Доступ до дошки",
  "column.create": "Нова колонка",
  "column.update": "Змінено колонку",
  "column.delete": "Видалено колонку",
  "request.create": "Запит на задачу",
  "request.approve": "Запит схвалено",
  "request.reject": "Запит відхилено",
  "task.archive": "Задача в архів",
  "task.restore": "Задача з архіву",
  "task.delete": "Задачу видалено",
  "recurring.create": "Нова щоденна задача",
  "recurring.update": "Змінено щоденну задачу",
  "recurring.delete": "Видалено щоденну задачу",
  seed: "Демо-дані",
  "session.revoke": "Вихід із пристроїв",
  "report.pdf": "PDF-звіт",
  "workplace.create": "Нове місце роботи",
  "workplace.update": "Змінено місце роботи",
  "business.create": "Новий вид роботи",
  "business.update": "Змінено вид роботи",
  "user.telegram": "Telegram відв’язано",
};

const dayAgo = () => new Date(Date.now() - 86400_000);

export default async function AuditPage() {
  const since = dayAgo();
  const [rows, logins, failed24] = await Promise.all([
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 300, include: { actor: { select: { name: true } } } }),
    db.loginAttempt.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    db.loginAttempt.count({ where: { ok: false, createdAt: { gt: since } } }),
  ]);
  return (
    <div className="space-y-6">
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 pb-2 pt-5">
        <h2 className="flex-1 text-lg font-extrabold">Входи</h2>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${failed24 ? "bg-[#ffe6e8] text-[#c01428]" : "bg-panel text-ink-3"}`}>
          помилок за добу: {failed24}
        </span>
      </div>
      <ul className="zebra">
        {logins.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
            <span className="w-28 shrink-0 tabular-nums text-ink-3">{fmtDate(l.createdAt, true)}</span>
            <span className={`w-20 shrink-0 font-bold ${l.ok ? "text-[#15803d]" : "text-[#c01428]"}`}>{l.ok ? "вхід" : "помилка"}</span>
            <span className="w-36 shrink-0 truncate font-semibold">{l.login || "—"}</span>
            <span className="w-36 shrink-0 tabular-nums text-ink-2">{l.ip}</span>
            <span className="min-w-0 flex-1 truncate text-ink-3">{deviceLabel(l.userAgent).name}</span>
          </li>
        ))}
        {logins.length === 0 && <li className="px-5 py-3 text-sm text-ink-3">Поки порожньо</li>}
      </ul>
    </section>
    <section className="card overflow-hidden">
      <h2 className="px-5 pb-2 pt-5 text-lg font-extrabold">Дії</h2>
      <ul className="zebra">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
            <span className="w-28 shrink-0 tabular-nums text-ink-3">{fmtDate(r.createdAt, true)}</span>
            <span className="flex w-48 shrink-0 items-center gap-2 font-bold">
              {r.actor && <Avatar name={r.actor.name} size={24} />}
              {r.actor?.name ?? "система"}
            </span>
            <span className="w-44 shrink-0 font-semibold">{ACTION[r.action] ?? r.action}</span>
            <span className="min-w-0 flex-1 text-ink-2">{r.detail}</span>
          </li>
        ))}
      </ul>
    </section>
    </div>
  );
}
