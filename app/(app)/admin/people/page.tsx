import Link from "next/link";
import { db } from "@/lib/db";
import { LEVEL_NAME } from "@/lib/access";
import { Avatar } from "@/components/ui/Avatar";
import { IconPlus } from "@/components/icons";

export const metadata = { title: "Люди й доступи · Taskflow" };

const LEVEL_COLOR: Record<number, string> = { 1: "#64748b", 2: "#2563eb", 3: "#7c3aed", 4: "#1d2130" };

export default async function PeoplePage() {
  const people = await db.user.findMany({
    orderBy: [{ active: "desc" }, { level: "desc" }, { name: "asc" }],
    include: {
      roles: { include: { role: true } },
      grants: { include: { direction: true, subtype: true } },
      subordinates: { include: { subordinate: { select: { name: true } } } },
      _count: { select: { assignedTasks: { where: { completedAt: null, archivedAt: null } } } },
    },
  });
  const accessText = (p: (typeof people)[number]) =>
    p.level >= 4
      ? "усе"
      : [
          ...p.grants.map((g) => (g.subtype ? `${g.direction.name}: лише ${g.subtype.name}` : g.direction.name)),
          ...(p.level >= 2 && p.subordinates.length ? [`група: ${p.subordinates.map((s) => s.subordinate.name.split(" ")[0]).join(", ")}`] : []),
        ].join(" · ") || "свої задачі";
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-3">Роль, відділ і рівень доступу — незалежні налаштування.</p>
        <Link href="/admin/people/new" className="btn btn-primary">
          <IconPlus size={17} />
          Працівник
        </Link>
      </div>
      {/* телефон: карточки */}
      <ul className="space-y-3 md:hidden">
        {people.map((p) => (
          <li key={p.id}>
            <Link href={`/admin/people/${p.id}`} className={`card lift block p-4 ${p.active ? "" : "opacity-55"}`}>
              <div className="flex items-center gap-3">
                <Avatar name={p.name} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{p.name}</span>
                  <span className="block text-xs text-ink-3">
                    @{p.login}
                    {!p.active && " · доступ вимкнено"}
                  </span>
                </span>
                <span className="text-right text-sm font-bold">
                  {p._count.assignedTasks}
                  <span className="block text-[0.7rem] font-semibold text-ink-3">відкрито</span>
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="badge" style={{ background: LEVEL_COLOR[p.level] }}>
                  {LEVEL_NAME[p.level]}
                </span>
                {p.roles.map((r) => (
                  <span key={r.roleId} className="rounded-full bg-panel px-2.5 py-1 text-xs font-bold text-ink-2">
                    {r.role.name}
                  </span>
                ))}
              </div>
              <div className="mt-2 text-sm text-ink-2">Доступ: {accessText(p)}</div>
            </Link>
          </li>
        ))}
      </ul>
      <div className="card hidden overflow-hidden md:block">
        <div className="scroll-x">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="bg-panel text-xs font-bold uppercase tracking-wide text-ink-3">
                <th className="px-5 py-3.5">Працівник</th>
                <th className="px-3 py-3.5">Рівень</th>
                <th className="px-3 py-3.5">Ролі</th>
                <th className="px-3 py-3.5">Доступ до</th>
                <th className="px-5 py-3.5 text-right">Відкрито</th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-panel">
              {people.map((p) => (
                <tr key={p.id} className={p.active ? "" : "opacity-55"}>
                  <td className="px-5 py-3">
                    <Link href={`/admin/people/${p.id}`} className="inline-flex items-center gap-3 hover:underline">
                      <Avatar name={p.name} size={34} />
                      <span>
                        <span className="block font-bold">{p.name}</span>
                        <span className="block text-xs text-ink-3">
                          @{p.login}
                          {!p.active && " · доступ вимкнено"}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span className="badge" style={{ background: LEVEL_COLOR[p.level] }}>
                      {LEVEL_NAME[p.level]}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold text-ink-2">{p.roles.map((r) => r.role.name).join(", ") || "—"}</td>
                  <td className="px-3 py-3 text-sm text-ink-2">{accessText(p)}</td>
                  <td className="px-5 py-3 text-right font-bold">{p._count.assignedTasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
