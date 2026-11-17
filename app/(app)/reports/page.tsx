import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canViewStats } from "@/lib/access";
import { buildReport, buildTeamReport, parsePeriod, presets, reportPeople } from "@/lib/report";
import { teamStatus, teamTaskMeta } from "@/lib/teamReportPdf";
import { dayKey } from "@/lib/time";
import { fmtDate, fmtDuration, fmtTime, isDoneLate, priorityMeta, workDayView } from "@/lib/format";
import { ReportForm } from "@/components/ReportForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";

export const metadata = { title: "Звіти · Taskflow" };

const ru = (k: string) => k.split("-").reverse().join(".");
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ user?: string; from?: string; to?: string }> }) {
  const viewer = await requireUser();
  if (!canViewStats(viewer)) redirect("/");
  const sp = await searchParams;
  const now = new Date();
  const ps = presets(now);
  const people = await reportPeople(viewer);
  const p = parsePeriod(sp.from, sp.to);
  const team = sp.user === "all" && p ? await buildTeamReport(viewer, p, now) : null;
  const report = sp.user && sp.user !== "all" && p ? await buildReport(viewer, sp.user, p, now) : null;
  const month = ps.find((x) => x.id === "month")!;
  const qs = report ? new URLSearchParams({ user: report.person.id, from: report.period.from, to: report.period.to }).toString() : "";

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <div>
        <h1 className="text-[1.9rem] font-extrabold tracking-tight">Звіти</h1>
        <p className="mt-1 text-ink-3">Робота працівника за вибраний період — на екрані й у PDF.</p>
      </div>

      <ReportForm
        people={[
          { value: "all", label: "Усі працівники", hint: `${people.length} осіб — зведений звіт` },
          ...people.map((x) => ({ value: x.id, label: x.name, avatar: x.name, hint: x.roles.map((r) => r.role.name).join(", ") })),
        ]}
        presets={ps}
        today={dayKey(now)}
        initial={{ user: sp.user ?? "", from: p?.period.from ?? month.from, to: p?.period.to ?? month.to }}
      />

      {sp.user && !p && (
        <div role="alert" className="rounded-xl bg-[#ffe6e8] px-4 py-3 text-sm font-semibold text-[#c01428]">
          Невірний період: «з» має бути не пізніше «по», не більше року.
        </div>
      )}
      {sp.user && sp.user !== "all" && p && !report && <EmptyState title="Працівника не знайдено" hint="Або його задачі поза вашим доступом." />}

      {team && (
        <section className="space-y-5">
          <div className="card flex flex-wrap items-center gap-4 p-5">
            <div className="min-w-0 flex-1">
              <div className="text-xl font-extrabold">Усі працівники · {team.rows.length}</div>
              <div className="text-sm text-ink-3">
                {team.period.from === team.period.to ? `за ${ru(team.period.from)}` : `${ru(team.period.from)} — ${ru(team.period.to)}`} · виконані за період, усі
                відкриті зараз і щоденні по днях
              </div>
            </div>
            <a href={`/api/reports/pdf?${new URLSearchParams({ user: "all", from: team.period.from, to: team.period.to })}`} className="btn btn-primary" download>
              Завантажити PDF
            </a>
          </div>
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <Tile label="Виконано" value={team.totals.done} sub={`вчасно ${pct(team.totals.doneOnTime, team.totals.done)}`} color="#16a34a" />
            <Tile label="Із запізненням" value={team.totals.doneLate} color={team.totals.doneLate ? "#f08a0c" : "#7c8090"} />
            <Tile label="Нових задач за період" value={team.totals.assigned} color="#2563eb" />
            <Tile
              label="Відкрито зараз"
              value={team.totals.openNow}
              sub={team.totals.lateNow ? `прострочено ${team.totals.lateNow}` : "без прострочень"}
              color={team.totals.lateNow ? "#e5283b" : "#1d2130"}
            />
          </div>
          {team.work.length > 0 && (
            <div className="card overflow-hidden">
              <h2 className="px-5 pb-2 pt-5 text-lg font-extrabold">
                Робочі дні · {team.work.length} {team.totals.workMinutes > 0 && <span className="font-semibold text-ink-3">· усього {fmtDuration(team.totals.workMinutes * 60000)}</span>}
              </h2>
              <div className="scroll-x">
                <WorkTable rows={team.work.map((w) => ({ id: w.id, name: w.user.name, day: w.day, ...workDayView(w) }))} withName />
              </div>
            </div>
          )}
          <div className="card overflow-hidden">
            <div className="scroll-x">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="bg-panel text-xs font-bold uppercase tracking-wide text-ink-3">
                    <th className="px-4 py-3">Працівник</th>
                    <th className="px-3 py-3">Статус</th>
                    <th className="px-3 py-3">Задача</th>
                    <th className="px-4 py-3">Дедлайн</th>
                  </tr>
                </thead>
                <tbody>
                  {team.tasks.map((t, i) => {
                    const st = teamStatus(t, now);
                    const first = i === 0 || team.tasks[i - 1].assignee.name !== t.assignee.name;
                    return (
                      <tr key={t.id} className={first && i > 0 ? "border-t-2 border-sunken" : ""}>
                        <td className="px-4 py-2.5 align-top font-bold">{first ? t.assignee.name : ""}</td>
                        <td className={`px-3 py-2.5 align-top font-semibold ${st.done ? (st.late ? "text-[#b45f06]" : "text-[#15803d]") : st.late ? "text-[#c01428]" : "text-ink-2"}`}>
                          {st.text}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <Link href={`/tasks/${t.id}`} className="font-bold hover:underline">
                            {t.title}
                          </Link>
                          <div className="text-xs text-ink-3">{teamTaskMeta(t)}</div>
                        </td>
                        <td className={`whitespace-nowrap px-4 py-2.5 align-top ${st.late && !st.done ? "font-bold text-[#c01428]" : "text-ink-2"}`}>
                          {t.deadline ? fmtDate(t.deadline, true) : "без строку"}
                        </td>
                      </tr>
                    );
                  })}
                  {team.tasks.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-5 text-ink-3">
                        Задач за цей період немає.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {report && (
        <section className="space-y-5">
          <div className="card flex flex-wrap items-center gap-4 p-5">
            <Avatar name={report.person.name} size={48} />
            <div className="min-w-0 flex-1">
              <div className="text-xl font-extrabold">{report.person.name}</div>
              <div className="text-sm text-ink-3">
                {report.period.from === report.period.to ? `за ${ru(report.period.from)}` : `${ru(report.period.from)} — ${ru(report.period.to)}`}
                {report.person.roles.length > 0 && ` · ${report.person.roles.join(", ")}`}
              </div>
            </div>
            <a href={`/api/reports/pdf?${qs}`} className="btn btn-primary" download>
              Завантажити PDF
            </a>
          </div>
          {report.partial && <p className="text-sm text-ink-3">До звіту входять лише задачі, які вам видно за рівнем доступу.</p>}

          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <Tile label="Виконано" value={report.summary.done} sub={`вчасно ${pct(report.summary.doneOnTime, report.summary.done)}`} color="#16a34a" />
            <Tile label="Із запізненням" value={report.summary.doneLate} color={report.summary.doneLate ? "#f08a0c" : "#7c8090"} />
            <Tile label="Нових задач за період" value={report.summary.assigned} color="#2563eb" />
            <Tile
              label="Відкрито зараз"
              value={report.summary.openNow}
              sub={report.summary.lateNow ? `прострочено ${report.summary.lateNow}` : "без прострочень"}
              color={report.summary.lateNow ? "#e5283b" : "#1d2130"}
            />
            {report.summary.recurringDays > 0 && (
              <Tile
                label="Щоденні: виконано днів"
                value={`${report.summary.recurringDone} з ${report.summary.recurringDays}`}
                sub={`з них вчасно — ${report.summary.recurringOnTime}`}
                color="#0891b2"
              />
            )}
            {report.summary.workDays > 0 && (
              <Tile label="Робочих днів" value={report.summary.workDays} sub={report.summary.workMinutes ? `усього ${fmtDuration(report.summary.workMinutes * 60000)}` : undefined} color="#0f766e" />
            )}
            <Tile label="Коментарів" value={report.summary.comments} color="#4a4f5f" />
          </div>

          {report.work.length > 0 && (
            <div className="card overflow-hidden">
              <h2 className="px-5 pb-2 pt-5 text-lg font-extrabold">Робочі дні · {report.work.length}</h2>
              <div className="scroll-x">
                <WorkTable rows={report.work.map((w) => ({ id: w.id, name: "", day: w.day, ...workDayView(w) }))} />
              </div>
            </div>
          )}

          <div className="card overflow-hidden">
            <h2 className="px-5 pb-2 pt-5 text-lg font-extrabold">Виконані · {report.done.length}</h2>
            {report.done.length === 0 ? (
              <p className="px-5 pb-5 text-ink-3">За цей період виконаних задач немає.</p>
            ) : (
              <ul className="zebra">
                {report.done.map((t) => {
                  const onTime = !isDoneLate(t);
                  return (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                      <span className="w-28 shrink-0 tabular-nums text-ink-3">{fmtDate(t.completedAt!, true)}</span>
                      <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 font-bold hover:underline">
                        {t.title}
                      </Link>
                      <span className="text-ink-2">
                        {t.project.name} · {t.direction.name} · {priorityMeta(t.priority).label}
                      </span>
                      <span className={`w-24 text-right font-bold ${onTime ? "text-[#15803d]" : "text-[#c01428]"}`}>{onTime ? "вчасно" : "запізнення"}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="card overflow-hidden">
            <h2 className="px-5 pb-2 pt-5 text-lg font-extrabold">Відкриті зараз · {report.open.length}</h2>
            {report.open.length === 0 ? (
              <p className="px-5 pb-5 text-ink-3">Відкритих задач немає.</p>
            ) : (
              <ul className="zebra">
                {report.open.map((t) => {
                  const late = t.deadline && t.deadline < now;
                  return (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                      <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 font-bold hover:underline">
                        {t.title}
                      </Link>
                      <span className="text-ink-2">
                        {t.project.name} · {t.column.name} · {priorityMeta(t.priority).label}
                      </span>
                      <span className={`w-36 text-right font-semibold ${late ? "text-[#c01428]" : "text-ink-2"}`}>
                        {t.deadline ? fmtDate(t.deadline, true) : "без строку"}
                        {late && " · прострочена"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {report.recurring.length > 0 && (
            <div className="card overflow-hidden">
              <h2 className="px-5 pb-2 pt-5 text-lg font-extrabold">
                Щоденні задачі · виконано {report.summary.recurringDone} з {report.summary.recurringDays}
              </h2>
              <ul className="zebra">
                {report.recurring.map((t) => {
                  const pm = priorityMeta(t.priority);
                  const [text, color] = t.completedAt
                    ? isDoneLate(t)
                      ? ["із запізненням", "#b45f06"]
                      : ["вчасно", "#15803d"]
                    : t.archivedAt || (t.deadline && t.deadline < now)
                      ? ["не виконана", "#c01428"]
                      : ["в роботі", "#2563eb"];
                  return (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                      <span className="w-28 shrink-0 tabular-nums text-ink-3">{ru(t.recurringDay!)}</span>
                      <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 font-bold hover:underline">
                        {t.title}
                      </Link>
                      <span className="font-bold" style={{ color: pm.text }}>
                        {pm.label}
                      </span>
                      <span className="text-ink-2">до {t.deadline ? fmtTime(t.deadline) : "—"}</span>
                      <span className="w-28 text-right font-bold" style={{ color }}>
                        {text}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Tile({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm font-semibold text-ink-3">{label}</div>
      <div className="mt-1.5 text-[1.9rem] font-extrabold leading-none" style={{ color }}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-sm text-ink-3">{sub}</div>}
    </div>
  );
}

/** Отметки рабочего дня: дата, место, начало, конец, сколько часов. */
function WorkTable({ rows, withName = false }: { rows: { id: string; name: string; day: string; place: string; start: string; end: string | null; duration: string | null }[]; withName?: boolean }) {
  return (
    <table className="w-full min-w-[560px] text-left text-sm">
      <thead>
        <tr className="bg-panel text-xs font-bold uppercase tracking-wide text-ink-3">
          {withName && <th className="px-4 py-3">Працівник</th>}
          <th className="px-4 py-3">Дата</th>
          <th className="px-3 py-3">Місце</th>
          <th className="px-3 py-3">Початок</th>
          <th className="px-3 py-3">Кінець</th>
          <th className="px-4 py-3">Години</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((w, i) => {
          const first = withName && (i === 0 || rows[i - 1].name !== w.name);
          return (
            <tr key={w.id} className={first && i > 0 ? "border-t-2 border-sunken" : ""}>
              {withName && <td className="px-4 py-2.5 font-bold">{first ? w.name : ""}</td>}
              <td className="px-4 py-2.5 tabular-nums text-ink-2">{ru(w.day)}</td>
              <td className="px-3 py-2.5 font-semibold">{w.place}</td>
              <td className="px-3 py-2.5 tabular-nums">{w.start}</td>
              <td className={`px-3 py-2.5 tabular-nums ${w.end ? "" : "font-semibold text-[#b45f06]"}`}>{w.end ?? "не позначено"}</td>
              <td className="px-4 py-2.5 tabular-nums text-ink-2">{w.duration ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
