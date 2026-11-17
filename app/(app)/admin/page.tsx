import Link from "next/link";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Адмінка · Taskflow" };

export default async function AdminHome() {
  const [people, inactive, roles, directions, subtypes, projects, pending, audit] = await Promise.all([
    db.user.count({ where: { active: true } }),
    db.user.count({ where: { active: false } }),
    db.role.count(),
    db.direction.count(),
    db.subtype.count(),
    db.project.count({ where: { archivedAt: null } }),
    db.request.count({ where: { status: "PENDING" } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { actor: { select: { name: true } } } }),
  ]);
  const cards = [
    { href: "/admin/people", title: "Люди й доступи", value: people, sub: inactive ? `ще ${inactive} вимкнено` : "усі активні", color: "#2563eb" },
    { href: "/admin/dictionaries", title: "Довідники", value: roles + directions + subtypes, sub: `${roles} ролей · ${directions} відділів · ${subtypes} підтипів`, color: "#7c3aed" },
    { href: "/admin/projects", title: "Проєкти", value: projects, sub: "дошки та їхні колонки", color: "#16a34a" },
    { href: "/requests", title: "Запити", value: pending, sub: "чекають рішення", color: pending ? "#e5283b" : "#64748b" },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card lift relative overflow-hidden p-5">
            <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-15" style={{ background: c.color }} aria-hidden="true" />
            <div className="text-[2.2rem] font-extrabold leading-none" style={{ color: c.color }}>
              {c.value}
            </div>
            <div className="mt-2 font-extrabold">{c.title}</div>
            <div className="text-sm text-ink-3">{c.sub}</div>
          </Link>
        ))}
      </div>
      <section className="card p-5">
        <div className="mb-3 flex items-center">
          <h2 className="text-lg font-extrabold">Останні дії</h2>
          <Link href="/admin/audit" className="ml-auto text-sm font-bold text-ink-3 hover:text-ink">
            Увесь журнал →
          </Link>
        </div>
        <ul className="zebra overflow-hidden rounded-[14px]">
          {audit.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-3 px-4 py-2.5 text-sm">
              <span className="w-28 shrink-0 text-ink-3">{fmtDate(a.createdAt, true)}</span>
              <span className="font-bold">{a.actor?.name ?? "система"}</span>
              <span className="text-ink-2">{a.detail || a.action}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
