"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addChecklistItemAction,
  addCommentAction,
  archiveTaskAction,
  deleteAttachmentAction,
  deleteChecklistItemAction,
  deleteTaskAction,
  moveTaskAction,
  setLateOkAction,
  toggleChecklistItemAction,
  toggleWatchAction,
  uploadAttachmentAction,
} from "@/app/actions/tasks";
import { Select } from "@/components/ui/Select";
import { AutoTextarea } from "@/components/ui/AutoTextarea";
import { Avatar } from "@/components/ui/Avatar";
import { IconArchive, IconCheck, IconClip, IconEye, IconPlus, IconSend, IconTrash, IconX } from "@/components/icons";
import { useRouter } from "next/navigation";

/**
 * Статус = колонка доски. В списке — только разрешённые этому человеку статусы.
 * После выбора можно добавить комментарий: он сохранится в задаче и придёт в Telegram вместе с уведомлением.
 */
export function ColumnPicker({
  taskId,
  columns,
  value,
  hint,
  canExcuse = false,
}: {
  taskId: string;
  columns: { id: string; name: string; color: string; isDone?: boolean }[];
  value: string;
  hint?: string;
  /** задача просрочена и человек может закрыть её «в срок» — при выборе «Готово» появится галочка */
  canExcuse?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [lateOk, setLateOk] = useState(false);
  const router = useRouter();
  const targetCol = columns.find((c) => c.id === target);
  return (
    <div className={`min-w-0 ${pending ? "opacity-60" : ""}`}>
      <Select
        ariaLabel="Статус"
        value={target ?? value}
        onChange={(v) => {
          setError("");
          setTarget(v === value ? null : v);
        }}
        options={columns.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
        className="min-w-[200px]"
      />
      {targetCol && (
        <div className="mt-2 w-full max-w-[520px] space-y-2 rounded-[14px] bg-panel p-3">
          <AutoTextarea
            minRows={2}
            maxRows={6}
            maxLength={2000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Коментар до зміни статусу (необов’язково) — прийде в Telegram разом зі сповіщенням"
            aria-label="Коментар до зміни статусу"
          />
          {canExcuse && targetCol.isDone && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-[12px] bg-white px-3 py-2.5 text-sm">
              <input type="checkbox" checked={lateOk} onChange={(e) => setLateOk(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#16a34a]" />
              <span>
                <b>Зарахувати вчасно</b>
                <span className="block text-ink-3">Роботу зробили вчасно, просто статус не змінили — у звіті не буде «прострочено» і «із запізненням».</span>
              </span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await moveTaskAction(taskId, targetCol.id, null, null, comment, canExcuse && !!targetCol.isDone && lateOk);
                  setError(r.error ?? "");
                  if (!r.error) {
                    setTarget(null);
                    setComment("");
                  }
                  router.refresh();
                })
              }
              className="btn btn-primary btn-sm"
            >
              Змінити на «{targetCol.name}»
            </button>
            <button type="button" onClick={() => (setTarget(null), setComment(""))} className="btn btn-soft btn-sm">
              Скасувати
            </button>
          </div>
        </div>
      )}
      {hint && !targetCol && <div className="mt-1.5 max-w-[420px] text-xs text-ink-3">{hint}</div>}
      {error && <div className="mt-1 text-sm font-semibold text-[#c01428]">{error}</div>}
    </div>
  );
}

export function Checklist({ taskId, items, canEdit }: { taskId: string; items: { id: string; text: string; done: boolean }[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState(addChecklistItemAction.bind(null, taskId), {});
  const [, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  const done = items.filter((i) => i.done).length;
  return (
    <div>
      {items.length > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-[#16a34a] transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
          <span className="text-sm font-bold text-ink-2">
            {done} з {items.length}
          </span>
        </div>
      )}
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.id} className="group flex items-center gap-3 rounded-[12px] px-2 py-1.5 hover:bg-panel">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => start(() => toggleChecklistItemAction(i.id))}
              role="checkbox"
              aria-checked={i.done}
              aria-label={i.text}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] transition-all ${
                i.done ? "bg-[#16a34a] text-white shadow-[0_3px_8px_rgba(22,163,74,.35)]" : "bg-sunken shadow-[inset_0_2px_3px_rgba(29,33,48,.1)]"
              }`}
            >
              {i.done && <IconCheck size={14} />}
            </button>
            <span className={`flex-1 ${i.done ? "text-ink-3 line-through" : ""}`}>{i.text}</span>
            {canEdit && (
              <button
                type="button"
                onClick={() => start(() => deleteChecklistItemAction(i.id))}
                aria-label={`Видалити пункт «${i.text}»`}
                className="rounded-lg p-1 text-ink-3 opacity-0 transition-opacity hover:text-[#c01428] focus:opacity-100 group-hover:opacity-100"
              >
                <IconX size={15} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form ref={form} action={action} className="mt-2 flex gap-2">
          <input name="text" required maxLength={300} placeholder="Новий пункт" aria-label="Новий пункт чек-листа" className="field !min-h-0 !py-2" />
          <button className="btn btn-soft btn-sm h-auto" disabled={pending} aria-label="Додати пункт">
            <IconPlus size={16} />
          </button>
        </form>
      )}
      {state.error && <div className="mt-1 text-sm font-semibold text-[#c01428]">{state.error}</div>}
    </div>
  );
}

function size(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} КБ` : `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

export function Attachments({
  taskId,
  items,
  canUpload,
  deletableIds,
}: {
  taskId: string;
  items: { id: string; fileName: string; size: number; mime: string; uploader: { name: string } }[];
  canUpload: boolean;
  deletableIds: string[];
}) {
  const [state, action, pending] = useActionState(uploadAttachmentAction.bind(null, taskId), {});
  const [, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  return (
    <div>
      {items.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-[14px] bg-panel p-2.5">
              {a.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${a.id}`} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-[10px] object-cover" />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-white text-ink-3 shadow-sm">
                  <IconClip size={18} />
                </span>
              )}
              <a href={`/api/files/${a.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold hover:underline">{a.fileName}</span>
                <span className="block text-xs text-ink-3">
                  {size(a.size)} · {a.uploader.name}
                </span>
              </a>
              {deletableIds.includes(a.id) && (
                <button
                  type="button"
                  onClick={() => confirm(`Видалити «${a.fileName}»?`) && start(() => deleteAttachmentAction(a.id))}
                  aria-label={`Видалити ${a.fileName}`}
                  className="rounded-lg p-1.5 text-ink-3 hover:text-[#c01428]"
                >
                  <IconTrash size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <form ref={form} action={action} className={items.length ? "mt-3" : ""}>
          <input ref={input} type="file" name="files" multiple className="sr-only" onChange={() => form.current?.requestSubmit()} aria-label="Прикріпити файли" />
          <button type="button" onClick={() => input.current?.click()} disabled={pending} className="btn btn-soft btn-sm">
            <IconClip size={15} />
            {pending ? "Завантажую…" : "Прикріпити файл"}
          </button>
          <span className="ml-3 text-xs text-ink-3">до 20 МБ за раз</span>
        </form>
      )}
      {state.error && <div className="mt-1 text-sm font-semibold text-[#c01428]">{state.error}</div>}
    </div>
  );
}

/** Комментарий с подсказкой @упоминаний. Упомянутый человек начинает видеть задачу. */
export function CommentBox({ taskId, people }: { taskId: string; people: { login: string; name: string }[] }) {
  const [state, action, pending] = useActionState(addCommentAction.bind(null, taskId), {});
  const [text, setText] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const el = useRef<HTMLTextAreaElement | null>(null);
  const form = useRef<HTMLFormElement>(null);

  // после успешной отправки очищаем поле (новый объект state = новый ответ сервера)
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.ok) setText("");
  }

  const matches =
    query === null
      ? []
      : people.filter((p) => p.login.startsWith(query) || p.name.toLocaleLowerCase("uk").includes(query.toLocaleLowerCase("uk"))).slice(0, 6);

  function detect(t: HTMLTextAreaElement) {
    el.current = t;
    const m = /(?:^|\s)@([a-z0-9_.-]*)$/i.exec(t.value.slice(0, t.selectionStart ?? 0));
    setQuery(m ? m[1].toLowerCase() : null);
    setActive(0);
  }

  function insert(login: string) {
    const t = el.current;
    if (!t) return;
    const caret = t.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([a-z0-9_.-]*)$/i, `@${login} `);
    const next = before + text.slice(caret);
    setText(next);
    setQuery(null);
    setTimeout(() => {
      t.focus();
      t.setSelectionRange(before.length, before.length);
    }, 0);
  }

  return (
    <form ref={form} action={action} className="relative">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
        <AutoTextarea
          name="text"
          required
          minRows={2}
          maxRows={10}
          maxLength={5000}
          value={text}
          placeholder="Коментар… @логін — згадати"
          aria-label="Коментар"
          className="flex-1"
          onChange={(e) => {
            setText(e.target.value);
            detect(e.target);
          }}
          onClick={(e) => detect(e.currentTarget)}
          onKeyDown={(e) => {
            if (matches.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                insert(matches[active].login);
                return;
              }
              if (e.key === "Escape") return setQuery(null);
            }
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) form.current?.requestSubmit();
          }}
        />
        <button className="btn btn-primary" disabled={pending}>
          <IconSend size={16} />
          Надіслати
        </button>
      </div>
      {matches.length > 0 && (
        <ul role="listbox" aria-label="Згадати" className="pop absolute bottom-full left-0 z-40 mb-2 w-[280px] p-1.5">
          {matches.map((p, i) => (
            <li
              key={p.login}
              role="option"
              aria-selected={i === active}
              onPointerDown={(e) => {
                e.preventDefault();
                insert(p.login);
              }}
              onPointerEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-[11px] px-2.5 py-2 ${i === active ? "bg-panel" : ""}`}
            >
              <Avatar name={p.name} size={26} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{p.name}</span>
                <span className="block text-xs text-ink-3">@{p.login}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {state.error && <div className="mt-1 text-sm font-semibold text-[#c01428]">{state.error}</div>}
    </form>
  );
}

export function WatchButton({ taskId, watching }: { taskId: string; watching: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button onClick={() => start(() => toggleWatchAction(taskId))} disabled={pending} className="btn btn-soft btn-sm" aria-pressed={watching}>
      <IconEye size={15} />
      {watching ? "Не стежити" : "Стежити"}
    </button>
  );
}

export function ArchiveButton({ taskId, archived }: { taskId: string; archived: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => (archived || confirm("Надіслати задачу в архів? Її можна буде повернути.")) && start(() => archiveTaskAction(taskId, archived))}
      disabled={pending}
      className="btn btn-soft btn-sm"
    >
      <IconArchive size={15} />
      {archived ? "Повернути з архіву" : "В архів"}
    </button>
  );
}

export function DeleteForeverButton({ taskId }: { taskId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => confirm("Видалити задачу назавжди разом із коментарями та файлами?") && start(() => deleteTaskAction(taskId))}
      disabled={pending}
      className="btn btn-danger btn-sm"
    >
      <IconTrash size={15} />
      Видалити назавжди
    </button>
  );
}

/** «Засчитать в срок» для закрытой с опозданием задачи (и отмена). Постановщик или админ. */
export function LateOkButton({ taskId, lateOk }: { taskId: string; lateOk: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <div className="mt-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setLateOkAction(taskId, !lateOk);
            setError(r.error ?? "");
            router.refresh();
          })
        }
        className={`btn btn-sm ${lateOk ? "btn-soft" : "btn-primary"}`}
        title={lateOk ? "Повернути позначку «із запізненням»" : "Роботу зробили вчасно, статус просто змінили пізніше"}
      >
        {lateOk ? "Скасувати «вчасно»" : "Зарахувати вчасно"}
      </button>
      {error && <div className="mt-1 text-sm font-semibold text-[#c01428]">{error}</div>}
    </div>
  );
}
