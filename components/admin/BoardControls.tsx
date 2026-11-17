"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveProjectAction, createBoardAction, deleteBoardAction, updateBoardAction, type BoardState } from "@/app/actions/admin";
import { ColorPicker } from "@/components/admin/ColorPicker";
import { AccessPicker } from "@/components/admin/BoardAccess";
import { IconArchive, IconEdit, IconPlus, IconTrash, IconX } from "@/components/icons";

/** «Новая доска»: название + цвет; после создания открывается сама доска. */
export function NewBoardButton({ people }: { people: { id: string; name: string; level: number }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<BoardState, FormData>(createBoardAction, {});
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary">
        <IconPlus size={17} />
        Нова дошка
      </button>
    );
  return (
    <form action={action} className="card w-full space-y-3 p-5 sm:w-auto sm:min-w-[460px] sm:max-w-[640px]">
      <div className="flex items-center justify-between">
        <h2 className="font-extrabold">Нова дошка</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label="Закрити" className="rounded-lg p-1 text-ink-3 hover:text-ink">
          <IconX size={16} />
        </button>
      </div>
      <input name="name" required maxLength={80} autoFocus placeholder="Назва, наприклад «Сайт компанії»" aria-label="Назва дошки" className="field" />
      <input name="description" maxLength={500} placeholder="Опис (необов’язково)" aria-label="Опис" className="field" />
      <ColorPicker name="color" defaultValue="#2563eb" />
      <div>
        <div className="label">Хто бачить дошку</div>
        <AccessPicker people={people} initialAll={false} initialIds={[]} />
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-ink-2">
        <input type="checkbox" name="draft" value="1" className="h-4 w-4 accent-[#1d2130]" />
        Чернетка — поки бачать лише адміни, опублікувати можна пізніше
      </label>
      <p className="text-xs text-ink-3">Колонки створяться стандартні: Ідея → В роботі → Чекає відповіді → Перевірка → Готово. Їх можна змінити в «Адмінка → Проєкти і колонки».</p>
      {state.error && <div className="text-sm font-semibold text-[#c01428]">{state.error}</div>}
      <button className="btn btn-primary w-full" disabled={pending}>
        Створити дошку
      </button>
    </form>
  );
}

/**
 * Удаление доски насовсем — с подтверждением названием. Рядом безопасный вариант: в архив.
 */
export function DeleteBoardButton({ id, name, tasks, archived, compact }: { id: string; name: string; tasks: number; archived?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState<BoardState, FormData>(deleteBoardAction.bind(null, id), {});
  const [archiving, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`btn btn-danger btn-sm ${compact ? "!px-2.5" : ""}`} aria-label={`Видалити дошку «${name}»`}>
        <IconTrash size={15} />
        {!compact && "Видалити дошку"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Видалити дошку «${name}»`}>
          <button className="absolute inset-0 bg-[#1d2130]/40" aria-label="Закрити" onClick={() => setOpen(false)} />
          <form action={action} className="pop relative w-full max-w-[460px] space-y-4 p-6">
            <h2 className="text-xl font-extrabold">Видалити дошку «{name}»?</h2>
            <p className="text-sm text-ink-2">
              {tasks > 0 ? (
                <>
                  Разом із нею <b className="text-[#c01428]">назавжди</b> видаляться {tasks} задач, їхні коментарі, файли й історія, а також щоденні задачі
                  цієї дошки. Скасувати неможливо.
                </>
              ) : (
                "Задач на дошці немає. Видаляться колонки й сама дошка."
              )}
            </p>
            {tasks > 0 && !archived && (
              <div className="rounded-[14px] bg-panel p-3 text-sm">
                Якщо дошка просто більше не потрібна — надішліть її в архів: задачі збережуться, дошку можна повернути.
                <button
                  type="button"
                  disabled={archiving}
                  onClick={() =>
                    start(async () => {
                      await archiveProjectAction(id, false);
                      setOpen(false);
                      router.push("/boards");
                    })
                  }
                  className="btn btn-soft btn-sm mt-2 w-full"
                >
                  <IconArchive size={15} />
                  Краще в архів
                </button>
              </div>
            )}
            <div>
              <label className="label" htmlFor={`confirm-${id}`}>
                Щоб видалити, впишіть назву дошки: <span className="text-ink">{name}</span>
              </label>
              <input id={`confirm-${id}`} name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="field" />
            </div>
            {state.error && <div className="text-sm font-semibold text-[#c01428]">{state.error}</div>}
            <div className="flex gap-2.5">
              <button className="btn btn-danger flex-1" disabled={pending || typed.trim() !== name}>
                <IconTrash size={15} />
                Видалити назавжди
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn btn-soft">
                Скасувати
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/** «Изменить доску»: название, описание, цвет и доступ. Видят админы и создатель доски. */
export function EditBoardButton({
  board,
  people,
}: {
  board: { id: string; name: string; description: string; color: string; accessAll: boolean; memberIds: string[] };
  people: { id: string; name: string; level: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<BoardState, FormData>(async (prev, form) => {
    const r = await updateBoardAction(board.id, prev, form);
    if (r.ok) setOpen(false); // сохранено — окно закрывается, страница уже обновлена
    return r;
  }, {});
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-soft btn-sm">
        <IconEdit size={15} />
        Змінити дошку
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Змінити дошку «${board.name}»`}>
          <button className="absolute inset-0 bg-[#1d2130]/40" aria-label="Закрити" onClick={() => setOpen(false)} />
          <form action={action} className="pop relative max-h-[92vh] w-full max-w-[560px] space-y-3 overflow-y-auto p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold">Змінити дошку</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрити" className="rounded-lg p-1 text-ink-3 hover:text-ink">
                <IconX size={16} />
              </button>
            </div>
            <div>
              <label className="label" htmlFor={`bn-${board.id}`}>
                Назва
              </label>
              <input id={`bn-${board.id}`} name="name" required maxLength={80} defaultValue={board.name} className="field" />
            </div>
            <div>
              <label className="label" htmlFor={`bd-${board.id}`}>
                Опис
              </label>
              <input id={`bd-${board.id}`} name="description" maxLength={500} defaultValue={board.description} placeholder="Необов’язково" className="field" />
            </div>
            <div>
              <div className="label">Колір</div>
              <ColorPicker name="color" defaultValue={board.color} />
            </div>
            <div>
              <div className="label">Хто бачить дошку</div>
              <AccessPicker people={people} initialAll={board.accessAll} initialIds={board.memberIds} />
            </div>
            {state.error && <div className="text-sm font-semibold text-[#c01428]">{state.error}</div>}
            <div className="flex gap-2.5 pt-1">
              <button className="btn btn-primary flex-1" disabled={pending}>
                Зберегти
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn btn-soft">
                Скасувати
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
