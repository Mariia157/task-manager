"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskCard, type CardTask } from "./TaskCard";
import { moveTaskAction, moveTaskToStatusAction } from "@/app/actions/tasks";
import { IconPlus } from "@/components/icons";

export type KanbanTask = CardTask & { canMove: boolean };
export type KanbanColumn = { id: string; name: string; color: string; isDone: boolean; tasks: KanbanTask[] };

type Board = Record<string, KanbanTask[]>;

/**
 * Канбан. byStatus — колонки не одной доски, а статусы (по названию колонки) для задач из разных проектов:
 * при переносе сервер ищет колонку с таким названием в проекте задачи.
 */
export function Kanban({ columns, now, newHref, byStatus = false }: { columns: KanbanColumn[]; now: Date; newHref: string | null; byStatus?: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const initial = useMemo(() => Object.fromEntries(columns.map((c) => [c.id, c.tasks])) as Board, [columns]);
  const [board, setBoard] = useState<Board>(initial);
  const [active, setActive] = useState<KanbanTask | null>(null);
  const [error, setError] = useState("");
  const snapshot = useRef<Board>(initial);
  const justDragged = useRef(false);

  // свежие данные с сервера (после router.refresh) заменяют локальное состояние
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setBoard(initial);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // сначала то, что под указателем (карточка важнее колонки), иначе — ближайшие углы
  const collision: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    if (hits.length) {
      const cards = hits.filter((h) => !(String(h.id) in board));
      return cards.length ? cards : hits;
    }
    return closestCorners(args);
  };

  const findCol = (id: string) => (id in board ? id : Object.keys(board).find((c) => board[c].some((t) => t.id === id)));

  function onStart(e: DragStartEvent) {
    snapshot.current = board;
    const col = findCol(String(e.active.id));
    setActive(col ? (board[col].find((t) => t.id === e.active.id) ?? null) : null);
    setError("");
  }

  function onOver(e: DragOverEvent) {
    const { active: a, over } = e;
    if (!over) return;
    const from = findCol(String(a.id));
    const to = findCol(String(over.id));
    if (!from || !to || from === to) return;
    setBoard((b) => {
      const item = b[from].find((t) => t.id === a.id);
      if (!item) return b;
      const target = b[to];
      const overIdx = target.findIndex((t) => t.id === over.id);
      const idx = overIdx < 0 ? target.length : overIdx;
      return { ...b, [from]: b[from].filter((t) => t.id !== a.id), [to]: [...target.slice(0, idx), item, ...target.slice(idx)] };
    });
  }

  function onEnd(e: DragEndEvent) {
    setActive(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 50);
    const { active: a, over } = e;
    const col = findCol(String(a.id));
    if (!over || !col) return setBoard(snapshot.current);
    let list = board[col];
    const from = list.findIndex((t) => t.id === a.id);
    const overIdx = list.findIndex((t) => t.id === over.id);
    if (overIdx >= 0 && overIdx !== from) {
      const copy = [...list];
      copy.splice(from, 1);
      copy.splice(overIdx, 0, list[from]);
      list = copy;
      setBoard((b) => ({ ...b, [col]: list }));
    }
    const i = list.findIndex((t) => t.id === a.id);
    const before = list[i - 1]?.id ?? null;
    const after = list[i + 1]?.id ?? null;
    const prevCol = Object.keys(snapshot.current).find((c) => snapshot.current[c].some((t) => t.id === a.id));
    const prevList = prevCol ? snapshot.current[prevCol] : [];
    const prevI = prevList.findIndex((t) => t.id === a.id);
    if (prevCol === col && prevI === i) return; // ничего не поменялось
    start(async () => {
      const r = byStatus ? await moveTaskToStatusAction(String(a.id), col) : await moveTaskAction(String(a.id), col, before, after);
      if (r.error) {
        setBoard(snapshot.current);
        setError(r.error);
      }
      router.refresh();
    });
  }

  return (
    <>
      {columns.some((c) => c.tasks.some((t) => t.canMove)) && (
        <p className="mb-3 flex items-center gap-2 text-sm text-ink-3">
          <span aria-hidden="true">✋</span>
          <span className="hidden sm:inline">Перетягуйте картки мишею між колонками — статус змінюється сам.</span>
          <span className="sm:hidden">Утримуйте картку й перетягніть в іншу колонку.</span>
        </p>
      )}
      {error && (
        <div role="alert" className="mb-3 rounded-xl bg-[#ffe6e8] px-4 py-3 text-sm font-semibold text-[#c01428]">
          {error}
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={collision}
        // доска едет вбок только у самого края, иначе соседняя колонка «подъезжает» под указатель
        autoScroll={{ threshold: { x: 0.06, y: 0.12 }, acceleration: 6 }} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => setBoard(snapshot.current)}>
        <div className="scroll-x -mx-4 flex snap-x items-start gap-4 px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-9 lg:px-9">
          {columns.map((c) => (
            <Column key={c.id} col={c} tasks={board[c.id] ?? []} now={now} newHref={newHref} justDragged={justDragged} />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.3,1)" }}>
          {active ? (
            <div className="rotate-[1.5deg] scale-[1.03] shadow-[0_24px_48px_rgba(29,33,48,.28)] rounded-[18px]">
              <TaskCard t={active} now={now} variant="board" href={false} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}

function Column({
  col,
  tasks,
  now,
  newHref,
  justDragged,
}: {
  col: KanbanColumn;
  tasks: KanbanTask[];
  now: Date;
  newHref: string | null;
  justDragged: React.RefObject<boolean>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <section className="flex w-[min(296px,84vw)] shrink-0 snap-start flex-col">
      <header className="mb-3 flex items-center gap-2 px-1">
        <span className="h-3 w-3 rounded-full" style={{ background: col.color, boxShadow: `0 0 0 4px ${col.color}26` }} />
        <h2 className="font-extrabold">{col.name}</h2>
        <span className="rounded-full bg-panel px-2 py-0.5 text-xs font-bold text-ink-3">{tasks.length}</span>
      </header>
      <div
        ref={setNodeRef}
        className={`flex min-h-[140px] flex-col gap-3 rounded-[20px] p-2.5 transition-colors ${isOver ? "bg-sunken" : "bg-panel"}`}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <SortableCard key={t.id} t={t} now={now} justDragged={justDragged} />
          ))}
        </SortableContext>
        {tasks.length === 0 && <div className="flex items-center justify-center py-8 text-sm font-semibold text-ink-3">Порожньо</div>}
        {!col.isDone && newHref && (
          <Link href={newHref} className="flex h-10 items-center justify-center gap-1.5 rounded-[14px] text-sm font-bold text-ink-3 transition-colors hover:bg-white hover:text-ink">
            <IconPlus size={15} />
            Задача
          </Link>
        )}
      </div>
    </section>
  );
}

function SortableCard({ t, now, justDragged }: { t: KanbanTask; now: Date; justDragged: React.RefObject<boolean> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id, disabled: !t.canMove });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${isDragging ? "opacity-30" : ""} ${t.canMove ? "cursor-grab touch-manipulation active:cursor-grabbing" : ""}`}
      // ссылка внутри карточки иначе запускает родное перетаскивание браузера и перебивает dnd-kit
      onDragStart={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        if (justDragged.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      {...attributes}
      {...listeners}
      aria-roledescription={t.canMove ? "картка, що перетягується" : undefined}
    >
      <TaskCard t={t} now={now} variant="board" />
    </div>
  );
}
