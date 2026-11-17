import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canExcuseLate, canMoveTask, canViewBoard, canViewTask, isAdmin } from "@/lib/access";
import { allowedColumnIds } from "@/lib/taskMove";
import { getTaskForUser, progress, toAccessTask } from "@/lib/tasks";
import { closedAfterDeadline, deadlineHint, fmtDate, isOverdue } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { RichText } from "@/components/RichText";
import { BusinessChip, ColumnBadge, DirectionChip, OverdueBadge, PriorityBadge } from "@/components/task/bits";
import { TaskCard } from "@/components/task/TaskCard";
import { ReminderBox } from "@/components/task/ReminderBox";
import { dayKey } from "@/lib/time";
import { autoStartTask } from "@/lib/autoStart";
import { ArchiveButton, Attachments, Checklist, ColumnPicker, CommentBox, DeleteForeverButton, LateOkButton, WatchButton } from "@/components/task/parts";
import { IconArrowLeft, IconChat, IconChecklist, IconClip, IconEdit, IconLink, IconPlus, IconRepeat, IconTree } from "@/components/icons";

const EVENT_TEXT: Record<string, string> = {
  created: "створив(ла) задачу",
  column: "змінив(ла) статус",
  field: "змінив(ла)",
  archive: "відправив(ла) в архів",
  restore: "повернув(ла) з архіву",
  checklist: "чек-лист",
  attachment: "вкладення",
  subtask: "додав(ла) підзадачу",
};

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  // исполнитель открыл задачу из «Идеи» — она сама переходит в «В работе»
  await autoStartTask(id, user.id, { onOpen: true });
  const found = await getTaskForUser(user, id);
  if (!found) notFound();
  const { task: t, canManage, canWork } = found;
  const now = new Date();
  const [columns, people, me] = await Promise.all([
    db.boardColumn.findMany({ where: { projectId: t.projectId }, orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ where: { active: true }, select: { login: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findUnique({ where: { id: user.id }, select: { telegramChatId: true } }),
  ]);
  const mentionNames = Object.fromEntries(people.map((p) => [p.login, p.name]));
  const late = isOverdue(t, now);
  const excuse = canExcuseLate(user, toAccessTask(t));
  const hint = deadlineHint(t.deadline, !!t.completedAt, now);
  // подзадачи показываем только видимые этому человеку
  const kids = t.children.filter((c) => !c.archivedAt);
  const visibleKids = kids.filter((c) => canViewTask(user, toAccessTask(c)));
  const prog = progress(t.children);
  const watching = t.watchers.some((w) => w.userId === user.id);
  const deletable = t.attachments.filter((a) => (a.uploaderId === user.id ? canWork : canManage)).map((a) => a.id);

  return (
    <div className="mx-auto max-w-[1180px]">
      {canViewBoard(user, t.project) ? (
        <Link href={`/boards/${t.projectId}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-ink">
          <IconArrowLeft size={16} />
          {t.project.name}
        </Link>
      ) : (
        <Link href="/my" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-ink">
          <IconArrowLeft size={16} />
          Мої задачі
        </Link>
      )}

      {t.archivedAt && (
        <div className="mb-4 rounded-xl bg-sunken px-4 py-3 text-sm font-semibold text-ink-2">
          Задача в архіві з {fmtDate(t.archivedAt, true)}. На дошках і в списках її не видно.
        </div>
      )}

      <div className="card p-4 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <ColumnBadge c={t.column} size="lg" />
          {late && <OverdueBadge />}
          {t.business && <BusinessChip name={t.business} size="md" />}
          <PriorityBadge p={t.priority} size="md" />
          <DirectionChip d={t.direction} subtype={t.subtype} size="md" />
          {t.recurring && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-panel px-3 text-sm font-bold text-ink-2">
              <IconRepeat size={14} />
              Щоденна · до {t.recurring.dueTime}
            </span>
          )}
        </div>
        <h1 className="mt-3 text-[1.45rem] font-extrabold leading-tight tracking-tight sm:mt-4 sm:text-[2rem]">{t.title}</h1>
        {t.parent && (
          <Link href={`/tasks/${t.parent.id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-ink">
            <IconTree size={14} />
            Підзадача для «{t.parent.title}»
          </Link>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {canMoveTask(user, toAccessTask(t)) && !t.archivedAt && (() => {
            const ids = allowedColumnIds(user, toAccessTask(t), columns, t.columnId);
            if (ids.length < 2) return null;
            const assigneeOnly = t.assigneeId === user.id && t.creatorId !== user.id && !isAdmin(user);
            return (
              <ColumnPicker
                taskId={t.id}
                value={t.columnId}
                columns={columns.filter((c) => ids.includes(c.id))}
                canExcuse={excuse && late}
                hint={assigneeOnly ? "Зробили — поставте «Перевірка», є питання — «Чекає відповіді». Закриє задачу той, хто її поставив." : undefined}
              />
            );
          })()}
          {canManage && (
            <Link href={`/tasks/${t.id}/edit`} className="btn btn-soft btn-sm">
              <IconEdit size={15} />
              Змінити
            </Link>
          )}
          {t.assigneeId !== user.id && <WatchButton taskId={t.id} watching={watching} />}
          {canManage && <ArchiveButton taskId={t.id} archived={!!t.archivedAt} />}
          {isAdmin(user) && t.archivedAt && <DeleteForeverButton taskId={t.id} />}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-[1fr_330px] lg:grid-rows-[auto_1fr] lg:items-start">
        <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <Section title="Опис">
            {t.description ? <RichText text={t.description} className="leading-relaxed text-ink-2" /> : <p className="text-ink-3">Без опису</p>}
          </Section>

          {t.links.length > 0 && (
            <Section title="Посилання" icon={<IconLink size={17} />}>
              <ul className="grid gap-2 sm:grid-cols-2">
                {t.links.map((l) => (
                  <li key={l.id}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="lift flex items-center gap-3 rounded-[14px] bg-panel p-3 hover:bg-white hover:shadow-[var(--shadow)]">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-[#1d4ed8] shadow-sm">
                        <IconLink size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-extrabold">{l.label}</span>
                        <span className="block truncate text-xs text-ink-3">{l.url.replace(/^https?:\/\//, "")}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Чек-лист" icon={<IconChecklist size={17} />}>
            {t.checklist.length === 0 && !canWork ? (
              <p className="text-ink-3">Пунктів немає</p>
            ) : (
              <Checklist taskId={t.id} items={t.checklist} canEdit={canWork && !t.archivedAt} />
            )}
          </Section>

          <Section
            title={`Підзадачі${prog.total ? ` · ${prog.done} з ${prog.total}` : ""}`}
            icon={<IconTree size={17} />}
            action={
              !t.archivedAt && (
                <Link href={`/tasks/new?parent=${t.id}`} className="btn btn-soft btn-sm">
                  <IconPlus size={15} />
                  Підзадача
                </Link>
              )
            }
          >
            {prog.total > 0 && (
              <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full bg-[#16a34a]" style={{ width: `${(prog.done / prog.total) * 100}%` }} />
              </div>
            )}
            {visibleKids.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleKids.map((c) => (
                  <TaskCard key={c.id} t={{ ...c, parent: null }} now={now} />
                ))}
              </div>
            ) : (
              <p className="text-ink-3">{kids.length ? "Підзадачі є, але ви їх не бачите" : "Складену задачу можна розбити на підзадачі з різними виконавцями"}</p>
            )}
            {visibleKids.length > 0 && visibleKids.length < kids.length && (
              <p className="mt-3 text-sm text-ink-3">Ще {kids.length - visibleKids.length} — поза вашим доступом</p>
            )}
          </Section>

          <Section title="Файли" icon={<IconClip size={17} />}>
            {t.attachments.length === 0 && !canWork ? (
              <p className="text-ink-3">Файлів немає</p>
            ) : (
              <Attachments taskId={t.id} items={t.attachments} canUpload={canWork && !t.archivedAt} deletableIds={deletable} />
            )}
          </Section>

          <Section title={`Коментарі${t.comments.length ? ` · ${t.comments.length}` : ""}`} icon={<IconChat size={17} />}>
            <div className="space-y-3">
              {t.comments.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <Avatar name={c.author.name} size={36} />
                  <div className="min-w-0 flex-1 rounded-[16px] bg-panel px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-bold">{c.author.name}</span>
                      <span className="text-xs text-ink-3">{fmtDate(c.createdAt, true)}</span>
                    </div>
                    <RichText text={c.text} mentions={mentionNames} className="mt-1 text-ink-2" />
                  </div>
                </div>
              ))}
            </div>
            <div className={t.comments.length ? "mt-5" : ""}>
              <CommentBox taskId={t.id} people={people} />
            </div>
          </Section>
        </div>

        {/* на телефоне — сразу под шапкой, компактной сеткой; на компьютере — справа */}
        <aside className="card order-first grid grid-cols-2 gap-x-4 gap-y-4 p-5 lg:order-none lg:col-start-2 lg:row-start-1 lg:grid-cols-1">
            <Field label="Виконавець">
              <Person name={t.assignee.name} />
            </Field>
            <Field label="Строк">
              {t.deadline ? (
                <>
                  <div className="font-bold">{fmtDate(t.deadline, true)}</div>
                  {hint.text && (
                    <div className={`text-sm font-semibold ${hint.tone === "late" ? "text-[#c01428]" : hint.tone === "soon" ? "text-[#b45f06]" : "text-ink-3"}`}>{hint.text}</div>
                  )}
                </>
              ) : (
                <div className="font-bold text-ink-3">Без строку</div>
              )}
            </Field>
            {t.completedAt && (
              <Field label="Виконана">
                <div className={`font-bold ${closedAfterDeadline(t) && !t.lateOk ? "text-[#b45f06]" : "text-[#15803d]"}`}>{fmtDate(t.completedAt, true)}</div>
                {closedAfterDeadline(t) && (
                  <>
                    <div className={`text-sm font-semibold ${t.lateOk ? "text-[#15803d]" : "text-[#b45f06]"}`}>{t.lateOk ? "зараховано вчасно" : "із запізненням"}</div>
                    {excuse && <LateOkButton taskId={t.id} lateOk={t.lateOk} />}
                  </>
                )}
              </Field>
            )}
            <Field label="Проєкт">
              {canViewBoard(user, t.project) ? (
                <Link href={`/boards/${t.projectId}`} className="inline-flex items-center gap-2 font-bold hover:underline">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.project.color }} />
                  {t.project.name}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-2 font-bold">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.project.color }} />
                  {t.project.name}
                </span>
              )}
            </Field>
            <Field label="Автор задачі">
              <Person name={t.creator.name} />
            </Field>
            <Field label="Спостерігачі">
              {t.watchers.length ? (
                <div className="space-y-2">
                  {t.watchers.map((w) => (
                    <Person key={w.userId} name={w.user.name} />
                  ))}
                </div>
              ) : (
                <div className="text-ink-3">Ні</div>
              )}
            </Field>
            <Field label="Створена">
              <div className="font-semibold text-ink-2">{fmtDate(t.createdAt, true)}</div>
            </Field>
        </aside>

          <div className="space-y-4 sm:space-y-6 lg:col-start-2 lg:row-start-2">
          {!t.completedAt && !t.archivedAt && (
            <section className="card p-5">
              <h2 className="mb-3 font-extrabold">Нагадування</h2>
              <ReminderBox
                taskId={t.id}
                reminders={t.reminders}
                meId={user.id}
                canRemindAssignee={canManage && t.assigneeId !== user.id}
                assigneeName={t.assignee.name}
                hasDeadline={!!t.deadline}
                today={dayKey(now)}
                botConnected={!!me?.telegramChatId}
                fmt={Object.fromEntries(t.reminders.map((r) => [r.id, fmtDate(r.remindAt, true)]))}
              />
            </section>
          )}
          <section className="card p-5">
            <h2 className="mb-3 font-extrabold">Історія</h2>
            <ol className="space-y-3">
              {t.events.map((e) => (
                <li key={e.id} className="text-sm">
                  <div>
                    <span className="font-bold">{e.actor.name}</span> <span className="text-ink-2">{EVENT_TEXT[e.type] ?? e.type}</span>
                    {e.field && e.type !== "column" && e.type !== "checklist" && e.type !== "attachment" && <span className="font-semibold"> «{e.field}»</span>}
                  </div>
                  {(e.fromValue || e.toValue) && (
                    <div className="mt-0.5 text-ink-2">
                      {e.fromValue && <span className="text-ink-3 line-through">{e.fromValue}</span>}
                      {e.fromValue && e.toValue && " → "}
                      {e.toValue && <span className="font-semibold">{e.toValue}</span>}
                    </div>
                  )}
                  <div className="text-xs text-ink-3">{fmtDate(e.createdAt, true)}</div>
                </li>
              ))}
            </ol>
          </section>
          </div>
      </div>
    </div>
  );
}

function Section({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        {icon && <span className="text-ink-3">{icon}</span>}
        <h2 className="min-w-0 text-lg font-extrabold">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-3">{label}</div>
      {children}
    </div>
  );
}

function Person({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={name} size={30} />
      <span className="font-bold">{name}</span>
    </div>
  );
}
