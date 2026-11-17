"use client";

import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { saveTaskDraftAction, type FormState } from "@/app/actions/tasks";
import { createBoardInlineAction } from "@/app/actions/admin";
import { Select } from "@/components/ui/Select";
import { DateField } from "@/components/ui/DateField";
import { TimeField } from "@/components/ui/TimeField";
import { AutoTextarea } from "@/components/ui/AutoTextarea";
import { Avatar } from "@/components/ui/Avatar";
import { IconAlert, IconFlag, IconPlus, IconX } from "@/components/icons";
import { PRIORITY_META } from "@/lib/format";

type Dir = { id: string; name: string; color: string; subtypeLabel: string; roleName: string | null; subtypes: { id: string; name: string }[] };
type Person = { id: string; name: string; roles: string };

export type TaskFormInitial = {
  title: string;
  description: string;
  projectId: string;
  directionId: string;
  subtypeId: string;
  /** вписанный вручную подтип (рекламная сеть), когда subtypeId = "__new" */
  subtypeNew?: string;
  business: string;
  assigneeId: string;
  priority: string;
  date: string;
  time: string;
  noDeadline: boolean;
  links: { label: string; url: string }[];
  watcherIds: string[];
  parentId: string;
  /** при создании: положить в «Идею», а не сразу «В работе» */
  asIdea?: boolean;
};

const LINK_PRESETS = ["Сайт", "Канал", "Бот", "Група", "Документ", "Макет"];

export function TaskForm({
  action,
  initial,
  projects,
  directions,
  people,
  matrix,
  today,
  parent,
  cancelHref,
  submitLabel,
  allowRequest = true,
  business,
  draftId = "",
  canCreateBoard = false,
  extra,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  initial: TaskFormInitial;
  projects: { value: string; label: string; color: string }[];
  directions: Dir[];
  people: Person[];
  /** `${personId}|${directionId}|${subtypeId}` → direct / request / forbidden */
  matrix: Record<string, string>;
  today: string;
  parent: { id: string; title: string } | null;
  cancelHref: string;
  submitLabel: string;
  /** при создании — запрос админу; при правке такое назначение просто запрещено */
  allowRequest?: boolean;
  /** виды работы (HR, Продажа, …): основные кнопками + вписанные раньше вручную */
  business: { presets: { name: string; color: string }[]; custom: string[] };
  /** открыт черновик: при создании задачи он удалится */
  draftId?: string;
  /** админ может создать доску прямо отсюда */
  canCreateBoard?: boolean;
  /** дополнительный блок перед кнопками (например, комментарий к решению) */
  extra?: React.ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);
  const [directionId, setDirectionId] = useState(initial.directionId);
  const [subtypeId, setSubtypeId] = useState(initial.subtypeId);
  const [subtypeNew, setSubtypeNew] = useState(initial.subtypeNew ?? "");
  const [assigneeId, setAssigneeId] = useState(initial.assigneeId);
  const [priority, setPriority] = useState(initial.priority);
  const [noDeadline, setNoDeadline] = useState(initial.noDeadline);
  const [links, setLinks] = useState(initial.links);
  const [watchers, setWatchers] = useState<string[]>(initial.watcherIds);
  const [projectList, setProjectList] = useState(projects);
  const [projectId, setProjectId] = useState(initial.projectId);
  const [newBoard, setNewBoard] = useState<{ open: boolean; name: string; draft: boolean; error: string; busy: boolean }>({
    open: false,
    name: "",
    draft: false,
    error: "",
    busy: false,
  });
  const [savingDraft, setSavingDraft] = useState(false);
  const [asIdea, setAsIdea] = useState(!!initial.asIdea);

  async function createBoard() {
    setNewBoard((b) => ({ ...b, busy: true, error: "" }));
    const r = await createBoardInlineAction(newBoard.name, newBoard.draft);
    if (r.board) {
      setProjectList((l) => [...l, r.board!]);
      setProjectId(r.board.value);
      setNewBoard({ open: false, name: "", draft: false, error: "", busy: false });
    } else setNewBoard((b) => ({ ...b, busy: false, error: r.error ?? "Не вдалося" }));
  }

  /** Черновик: сохраняем всё, что заполнено, без проверок — видно только автору. */
  function saveDraft() {
    if (!form.current) return;
    const fd = new FormData(form.current);
    setSavingDraft(true);
    startTransition(() => saveTaskDraftAction(draftId || null, fd));
  }
  const [biz, setBiz] = useState(initial.business);
  const isPreset = business.presets.some((b) => b.name === biz);
  const [ownBiz, setOwnBiz] = useState(!!initial.business && !business.presets.some((b) => b.name === initial.business));

  const dir = directions.find((d) => d.id === directionId);
  // вписанный вручную подтип ещё не в справочнике — права как у «не указано»
  const decision = (pid: string) => matrix[`${pid}|${directionId}|${subtypeId === "__new" ? "" : subtypeId}`];
  const routingChanged = assigneeId !== initial.assigneeId || directionId !== initial.directionId || subtypeId !== initial.subtypeId;
  const outOfRights = !!assigneeId && decision(assigneeId) === "request" && (allowRequest || routingChanged);
  const needsApproval = allowRequest && outOfRights;
  const blocked = !allowRequest && outOfRights;

  // отправляем сами, чтобы React не сбрасывал поля формы, если сервер вернул ошибку
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  return (
    <form ref={form} onSubmit={submit} className="space-y-5">
      <input type="hidden" name="parentId" value={initial.parentId} />
      {draftId && <input type="hidden" name="draftId" value={draftId} />}
      <input type="hidden" name="links" value={JSON.stringify(links)} />
      {parent && (
        <div className="panel px-4 py-3 text-sm">
          <span className="text-ink-3">Підзадача для </span>
          <Link href={`/tasks/${parent.id}`} className="font-bold underline decoration-2 underline-offset-2">
            {parent.title}
          </Link>
        </div>
      )}

      <div className="card space-y-5 p-5 sm:p-7">
        <div>
          <label className="label" htmlFor="title">Назва</label>
          <input id="title" name="title" className="field text-lg font-semibold" required maxLength={200} defaultValue={initial.title} autoFocus={!initial.title} />
        </div>
        <div>
          <label className="label" htmlFor="description">Опис</label>
          <AutoTextarea id="description" name="description" minRows={4} maxRows={18} maxLength={20000} defaultValue={initial.description} placeholder="Що зробити, критерії готовності" />
        </div>

        <div>
          <span className="label">Вид роботи</span>
          <input type="hidden" name="business" value={biz} />
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Вид роботи">
            {business.presets.map((b) => {
              const on = biz === b.name;
              return (
                <button
                  key={b.name}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setOwnBiz(false);
                    setBiz(on ? "" : b.name);
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition-all hover:-translate-y-0.5"
                  style={on ? { background: b.color, color: "#fff", boxShadow: `0 6px 14px ${b.color}55` } : { background: "var(--sunken)", color: "var(--ink-2)" }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? "#fff" : b.color }} />
                  {b.name}
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={ownBiz}
              onClick={() => {
                setOwnBiz(!ownBiz);
                if (isPreset || ownBiz) setBiz("");
              }}
              className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-bold transition-all hover:-translate-y-0.5 ${ownBiz ? "bg-ink text-white" : "bg-sunken text-ink-2"}`}
            >
              ✎ Свій
            </button>
          </div>
          {ownBiz && (
            <div className="mt-2.5 sm:max-w-[50%]">
              <input
                className="field"
                list="business-custom"
                maxLength={40}
                autoFocus
                placeholder="Впишіть вид роботи"
                aria-label="Свій вид роботи"
                value={isPreset ? "" : biz}
                onChange={(e) => setBiz(e.target.value)}
              />
              <datalist id="business-custom">
                {business.custom.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="projectId">Проєкт (дошка)</label>
            <Select id="projectId" name="projectId" options={projectList} value={projectId} onChange={setProjectId} required placeholder="Виберіть проєкт" searchPlaceholder="Знайти дошку…" />
            {canCreateBoard &&
              (newBoard.open ? (
                <div className="mt-2 space-y-2 rounded-[14px] bg-panel p-3">
                  <input
                    autoFocus
                    value={newBoard.name}
                    maxLength={80}
                    onChange={(e) => setNewBoard((b) => ({ ...b, name: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        createBoard();
                      }
                    }}
                    placeholder="Назва нової дошки"
                    aria-label="Назва нової дошки"
                    className="field"
                  />
                  <label className="flex items-center gap-2 text-sm font-semibold text-ink-2">
                    <input type="checkbox" checked={newBoard.draft} onChange={(e) => setNewBoard((b) => ({ ...b, draft: e.target.checked }))} className="h-4 w-4 accent-[#1d2130]" />
                    чернетка — поки бачать лише адміни
                  </label>
                  {newBoard.error && <div className="text-sm font-semibold text-[#c01428]">{newBoard.error}</div>}
                  <div className="flex gap-2">
                    <button type="button" onClick={createBoard} disabled={newBoard.busy || !newBoard.name.trim()} className="btn btn-primary btn-sm">
                      Створити дошку
                    </button>
                    <button type="button" onClick={() => setNewBoard((b) => ({ ...b, open: false, error: "" }))} className="btn btn-soft btn-sm">
                      Скасувати
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setNewBoard((b) => ({ ...b, open: true }))} className="mt-1.5 pl-1 text-sm font-bold text-ink-3 hover:text-ink">
                  + Нова дошка
                </button>
              ))}
          </div>
          <div>
            <label className="label" htmlFor="assigneeId">Виконавець</label>
            <Select
              id="assigneeId"
              name="assigneeId"
              value={assigneeId}
              onChange={setAssigneeId}
              required
              placeholder="Кому"
              searchPlaceholder="Знайти людину…"
              emptyText="Нікого не знайдено"
              options={people.map((p) => ({
                value: p.id,
                label: p.name,
                avatar: p.name,
                hint: [p.roles, decision(p.id) === "request" ? "на підтвердження адміну" : ""].filter(Boolean).join(" · "),
              }))}
            />
          </div>
        </div>

        <div>
          <span className="label">Відділ</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Відділ">
            {directions.map((d) => {
              const on = d.id === directionId;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setDirectionId(d.id);
                    setSubtypeId("");
                  }}
                  className="inline-flex h-11 items-center gap-2 rounded-[14px] px-4 text-[0.95rem] font-bold transition-all hover:-translate-y-0.5"
                  style={on ? { background: d.color, color: "#fff", boxShadow: `0 6px 16px ${d.color}55` } : { background: "var(--sunken)", color: "var(--ink-2)" }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? "#fff" : d.color }} />
                  {d.name}
                </button>
              );
            })}
          </div>
          <input type="hidden" name="directionId" value={directionId} />
          {dir && (
            <p className="mt-2 text-sm text-ink-3">
              {dir.roleName ? `Виконавець — за роллю «${dir.roleName}».` : "Можна призначити будь-якому працівнику."}
            </p>
          )}
        </div>

        {dir && dir.subtypes.length > 0 && (
          <div className="sm:max-w-[50%]">
            <label className="label" htmlFor="subtypeId">{dir.subtypeLabel}</label>
            <Select
              id="subtypeId"
              name="subtypeId"
              value={subtypeId}
              onChange={setSubtypeId}
              options={[{ value: "", label: "Не вказано" }, ...dir.subtypes.map((s) => ({ value: s.id, label: s.name })), { value: "__new", label: "✎ Вписати вручну" }]}
            />
            {subtypeId === "__new" && (
              <input
                name="subtypeNew"
                className="field mt-2.5"
                maxLength={60}
                autoFocus
                required
                placeholder={`Впишіть: ${dir.subtypeLabel.toLowerCase()}`}
                aria-label={`${dir.subtypeLabel} — вручну`}
                value={subtypeNew}
                onChange={(e) => setSubtypeNew(e.target.value)}
              />
            )}
          </div>
        )}
        {(!dir || dir.subtypes.length === 0) && <input type="hidden" name="subtypeId" value="" />}
      </div>

      <div className="card space-y-5 p-5 sm:p-7">
        <div>
          <span className="label">Пріоритет</span>
          <div className="grid gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Пріоритет">
            {(Object.keys(PRIORITY_META) as (keyof typeof PRIORITY_META)[]).map((p) => {
              const m = PRIORITY_META[p];
              const on = priority === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPriority(p)}
                  className="rounded-[16px] p-3.5 text-left transition-all hover:-translate-y-0.5"
                  style={on ? { background: m.color, color: "#fff", boxShadow: `0 8px 20px ${m.color}55` } : { background: m.soft, color: m.text }}
                >
                  <span className="flex items-center gap-1.5 font-extrabold">
                    <IconFlag size={15} />
                    {m.label}
                  </span>
                  <span className="mt-1 block text-[0.8rem] font-medium leading-snug opacity-90">{m.hint}</span>
                </button>
              );
            })}
          </div>
          <input type="hidden" name="priority" value={priority} />
        </div>

        <div>
          <span className="label">Строк</span>
          <div className="flex flex-wrap items-start gap-2.5">
            {!noDeadline && (
              <>
                <div className="min-w-[220px] flex-[2_1_240px]">
                  <DateField
                    name="deadlineDate"
                    defaultValue={initial.date || today}
                    today={today}
                    locale="uk"
                    required
                    labels={{ today: "Сьогодні", tomorrow: "Завтра", week: "За тиждень", prev: "Попередній місяць", next: "Наступний місяць" }}
                  />
                </div>
                <div className="w-[130px]">
                  <TimeField name="deadlineTime" defaultValue={initial.time || "18:00"} ariaLabel="Час" />
                </div>
              </>
            )}
            <button
              type="button"
              aria-pressed={noDeadline}
              onClick={() => setNoDeadline(!noDeadline)}
              className={`h-[2.85rem] rounded-[14px] px-4 text-sm font-bold transition-all ${noDeadline ? "bg-ink text-white" : "bg-sunken text-ink-2 hover:bg-[#e0dbd2]"}`}
            >
              Без строку
            </button>
            {noDeadline && <input type="hidden" name="noDeadline" value="1" />}
          </div>
        </div>
      </div>

      <div className="card space-y-5 p-5 sm:p-7">
        <div>
          <span className="label">Посилання</span>
          <div className="space-y-2">
            {links.map((l, i) => (
              <div key={i} className="flex flex-wrap gap-2 sm:flex-nowrap">
                <input
                  className="field sm:!w-[170px]"
                  list="link-presets"
                  placeholder="Підпис"
                  aria-label="Підпис посилання"
                  value={l.label}
                  maxLength={60}
                  onChange={(e) => setLinks(links.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))}
                />
                <input
                  className="field min-w-0 flex-1"
                  placeholder="https://…"
                  aria-label="Адреса посилання"
                  inputMode="url"
                  value={l.url}
                  onChange={(e) => setLinks(links.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))}
                />
                <button type="button" onClick={() => setLinks(links.filter((_, k) => k !== i))} className="btn btn-soft h-[2.85rem] w-[2.85rem] !p-0" aria-label="Прибрати посилання">
                  <IconX size={16} />
                </button>
              </div>
            ))}
            <datalist id="link-presets">
              {LINK_PRESETS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <button type="button" onClick={() => setLinks([...links, { label: links.length ? "" : "Сайт", url: "" }])} className="btn btn-soft btn-sm">
              <IconPlus size={15} />
              Додати посилання
            </button>
          </div>
        </div>

        <div>
          <span className="label">Спостерігачі</span>
          <p className="-mt-1 mb-2.5 text-sm text-ink-3">Бачать задачу й отримують сповіщення про зміну статусу</p>
          <div className="flex flex-wrap gap-2">
            {people
              .filter((p) => p.id !== assigneeId)
              .map((p) => {
                const on = watchers.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setWatchers(on ? watchers.filter((w) => w !== p.id) : [...watchers, p.id])}
                    className={`inline-flex h-9 items-center gap-2 rounded-full pl-1 pr-3.5 text-sm font-semibold transition-all ${
                      on ? "bg-ink text-white shadow-[0_4px_12px_rgba(29,33,48,.25)]" : "bg-panel text-ink-2 hover:bg-sunken"
                    }`}
                  >
                    <Avatar name={p.name} size={28} />
                    {p.name}
                  </button>
                );
              })}
          </div>
          {watchers
            .filter((w) => w !== assigneeId)
            .map((w) => (
              <input key={w} type="hidden" name="watchers" value={w} />
            ))}
        </div>
      </div>

      {allowRequest && (
        <div className="card p-5 sm:p-7">
          <input type="hidden" name="asIdea" value={asIdea ? "1" : ""} />
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Куди покласти задачу">
            {[
              [false, "Одразу в роботу", "Задача з’явиться в колонці «В роботі»"],
              [true, "Поки ідея", "У колонку «Ідея» — виконавець візьме пізніше, статус зміниться сам"],
            ].map(([v, l, h]) => {
              const on = asIdea === v;
              return (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setAsIdea(v as boolean)}
                  className={`min-w-[220px] flex-1 rounded-[16px] p-3.5 text-left transition-all hover:-translate-y-0.5 ${
                    on ? (v ? "bg-[#7c3aed] text-white shadow-[0_8px_20px_rgba(124,58,237,.35)]" : "bg-[#2563eb] text-white shadow-[0_8px_20px_rgba(37,99,235,.35)]") : "bg-panel text-ink-2"
                  }`}
                >
                  <span className="block font-extrabold">{l as string}</span>
                  <span className={`mt-0.5 block text-[0.8rem] leading-snug ${on ? "opacity-90" : "text-ink-3"}`}>{h as string}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {needsApproval && (
        <div className="card space-y-3 p-5 sm:p-7" style={{ background: "#fff8ec" }}>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-[#b45f06]">
              <IconAlert size={20} />
            </span>
            <div>
              <div className="font-extrabold">Задача піде адміну на підтвердження</div>
              <p className="text-sm text-ink-2">
                Ставити таку задачу цьому виконавцю напряму ви не можете. Адмін побачить запит і схвалить або відхилить його.
              </p>
            </div>
          </div>
          <AutoTextarea name="note" minRows={2} maxLength={1000} placeholder="Коментар для адміна: навіщо задача, чому саме цій людині" />
        </div>
      )}

      {extra}
      {blocked && (
        <div role="alert" className="rounded-xl bg-[#ffe6e8] px-4 py-3 text-sm font-semibold text-[#c01428]">
          Таке призначення поза вашими правами: його підтверджує адмін. Поверніть виконавця й відділ або створіть нову задачу — вона піде запитом.
        </div>
      )}
      {state.error && (
        <div role="alert" className="rounded-xl bg-[#ffe6e8] px-4 py-3 text-sm font-semibold text-[#c01428]">
          {state.error}
        </div>
      )}
      {state.confirm && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-[#fff1dc] px-4 py-3 text-sm font-semibold text-[#b45f06]">
          <span className="flex-1">{state.confirm}</span>
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: "#f08a0c", color: "#fff" }}
            disabled={pending}
            onClick={() => {
              if (!form.current) return;
              const fd = new FormData(form.current);
              fd.set("confirmMove", "1");
              startTransition(() => dispatch(fd));
            }}
          >
            Перенести все одно
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary" disabled={pending || blocked}>
          {needsApproval ? "Надіслати на підтвердження" : submitLabel}
        </button>
        {allowRequest && (
          <button type="button" onClick={saveDraft} disabled={pending || savingDraft} className="btn btn-soft">
            {savingDraft ? "Зберігаю…" : "Зберегти чернетку"}
          </button>
        )}
        <Link href={cancelHref} className="btn btn-soft">
          Скасувати
        </Link>
      </div>
    </form>
  );
}
