"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import Link from "next/link";
import type { AdminState } from "@/app/actions/admin";
import { AutoTextarea } from "@/components/ui/AutoTextarea";
import { Avatar } from "@/components/ui/Avatar";
import { Switch } from "@/components/ui/Switch";
import { PasswordField } from "@/components/ui/PasswordField";

type Dir = { id: string; name: string; color: string; subtypes: { id: string; name: string }[] };
type Grant = { directionId: string; subtypeId: string | null };

const LEVELS = [
  { v: 1, name: "Виконавець", hint: "Бачить лише свої задачі, ті, за якими спостерігає, і де його згадано", color: "#64748b" },
  { v: 2, name: "Керівник групи", hint: "Плюс задачі підлеглих; ставить їм задачі", color: "#2563eb" },
  { v: 3, name: "Керівник відділу", hint: "Плюс усі задачі своїх відділів", color: "#7c3aed" },
  { v: 4, name: "Адмін", hint: "Усе: доступи, довідники, проєкти, запити", color: "#1d2130" },
];

export function PersonForm({
  action,
  initial,
  roles,
  directions,
  people,
  isNew,
  saved,
  closedBoards = [],
}: {
  action: (p: AdminState, f: FormData) => Promise<AdminState>;
  initial: {
    name: string;
    login: string;
    contacts: string;
    telegram: string;
    responsibility: string;
    level: number;
    roleIds: string[];
    grants: Grant[];
    subordinateIds: string[];
    active: boolean;
    boardIds?: string[];
  };
  roles: { id: string; name: string; parentId: string | null; active: boolean }[];
  directions: Dir[];
  people: { id: string; name: string }[];
  isNew: boolean;
  saved?: boolean;
  /** доски с ограниченным доступом */
  closedBoards?: { id: string; name: string; color: string }[];
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const [level, setLevel] = useState(initial.level);
  const [roleIds, setRoleIds] = useState(initial.roleIds);
  const [grants, setGrants] = useState<Grant[]>(initial.grants);
  const [subs, setSubs] = useState(initial.subordinateIds);
  const [boards, setBoards] = useState(initial.boardIds ?? []);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const hasGrant = (d: string, s: string | null) => grants.some((g) => g.directionId === d && g.subtypeId === s);
  function toggleGrant(d: string, s: string | null) {
    if (hasGrant(d, s)) return setGrants(grants.filter((g) => !(g.directionId === d && g.subtypeId === s)));
    // всё направление включает подтипы — отдельные гранты на подтипы тогда не нужны
    if (s === null) return setGrants([...grants.filter((g) => g.directionId !== d), { directionId: d, subtypeId: null }]);
    setGrants([...grants, { directionId: d, subtypeId: s }]);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  const top = roles.filter((r) => !r.parentId);

  return (
    <form onSubmit={submit} className="space-y-5">
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="grants" value={JSON.stringify(grants)} />
      {roleIds.map((r) => (
        <input key={r} type="hidden" name="roles" value={r} />
      ))}
      {subs.map((s) => (
        <input key={s} type="hidden" name="subordinates" value={s} />
      ))}
      {boards.map((b) => (
        <input key={b} type="hidden" name="boards" value={b} />
      ))}

      <div className="card space-y-5 p-5 sm:p-7">
        <h2 className="text-lg font-extrabold">Картка людини</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Ім’я</label>
            <input id="name" name="name" required maxLength={100} defaultValue={initial.name} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="login">Логін</label>
            <input id="login" name="login" required maxLength={40} defaultValue={initial.login} className="field" autoCapitalize="none" pattern="[a-zA-Z0-9_.\-]{2,40}" />
          </div>
          <div>
            <label className="label" htmlFor="password">{isNew ? "Пароль" : "Новий пароль"}</label>
            <PasswordField id="password" name="password" required={isNew} placeholder={isNew ? "від 8 символів" : "залиште порожнім, щоб не змінювати"} />
          </div>
          <div>
            <label className="label" htmlFor="telegram">Telegram для сповіщень</label>
            <input id="telegram" name="telegram" maxLength={64} defaultValue={initial.telegram} placeholder="@username" className="field" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="contacts">Контакти</label>
            <input id="contacts" name="contacts" maxLength={300} defaultValue={initial.contacts} placeholder="Телефон, пошта" className="field" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="responsibility">Зона відповідальності</label>
            <AutoTextarea
              id="responsibility"
              name="responsibility"
              minRows={2}
              maxLength={2000}
              defaultValue={initial.responsibility}
              placeholder="Постійна зона — окремо від поточних задач"
            />
          </div>
        </div>
      </div>

      <div className="card space-y-4 p-5 sm:p-7">
        <h2 className="text-lg font-extrabold">Ролі</h2>
        <p className="-mt-2 text-sm text-ink-3">Роль визначає, задачі якого відділу можна ставити людині. На доступ роль не впливає.</p>
        <div className="flex flex-wrap gap-2">
          {top.map((r) => {
            const kids = roles.filter((k) => k.parentId === r.id);
            return (
              <span key={r.id} className="inline-flex flex-wrap items-center gap-1.5">
                <RoleChip on={roleIds.includes(r.id)} label={r.name} inactive={!r.active} onClick={() => setRoleIds(toggle(roleIds, r.id))} />
                {kids.map((k) => (
                  <RoleChip
                    key={k.id}
                    sub
                    on={roleIds.includes(k.id)}
                    label={`+ ${k.name}`}
                    inactive={!k.active}
                    onClick={() => setRoleIds(roleIds.includes(k.id) ? roleIds.filter((x) => x !== k.id) : [...new Set([...roleIds, k.id, r.id])])}
                  />
                ))}
              </span>
            );
          })}
        </div>
      </div>

      <div className="card space-y-4 p-5 sm:p-7">
        <h2 className="text-lg font-extrabold">Рівень доступу</h2>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Рівень доступу">
          {LEVELS.map((l) => {
            const on = l.v === level;
            return (
              <button
                key={l.v}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setLevel(l.v)}
                className="rounded-[16px] p-4 text-left transition-all hover:-translate-y-0.5"
                style={on ? { background: l.color, color: "#fff", boxShadow: `0 8px 20px ${l.color}55` } : { background: "var(--panel)" }}
              >
                <span className="block text-xs font-extrabold opacity-70">Рівень {l.v}</span>
                <span className="block font-extrabold">{l.name}</span>
                <span className={`mt-1 block text-[0.8rem] leading-snug ${on ? "opacity-85" : "text-ink-3"}`}>{l.hint}</span>
              </button>
            );
          })}
        </div>

        {level === 3 && (
          <div className="rounded-[16px] bg-panel p-4">
            <div className="font-bold">Відділи в доступі</div>
            <p className="mb-3 text-sm text-ink-3">«Розробка» повністю включає «Фронт». Доступ лише до «Фронту» решту розробки не відкриває.</p>
            <div className="space-y-2.5">
              {directions.map((d) => {
                const whole = hasGrant(d.id, null);
                return (
                  <div key={d.id} className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-pressed={whole}
                      onClick={() => toggleGrant(d.id, null)}
                      className="inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-bold transition-all"
                      style={whole ? { background: d.color, color: "#fff", boxShadow: `0 4px 12px ${d.color}55` } : { background: "#fff", color: "var(--ink-2)" }}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: whole ? "#fff" : d.color }} />
                      {d.name} — усе
                    </button>
                    {!whole &&
                      d.subtypes.map((s) => {
                        const on = hasGrant(d.id, s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleGrant(d.id, s.id)}
                            className={`h-8 rounded-full px-3 text-[0.8rem] font-bold transition-all ${on ? "text-white" : "bg-white text-ink-3"}`}
                            style={on ? { background: d.color } : undefined}
                          >
                            тільки {s.name}
                          </button>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {level >= 2 && level < 4 && (
          <div className="rounded-[16px] bg-panel p-4">
            <div className="font-bold">Підлеглі</div>
            <p className="mb-3 text-sm text-ink-3">Керівник бачить їхні задачі й ставить їм задачі за їхніми ролями.</p>
            <div className="flex flex-wrap gap-2">
              {people.map((p) => {
                const on = subs.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSubs(toggle(subs, p.id))}
                    className={`inline-flex h-9 items-center gap-2 rounded-full pl-1 pr-3.5 text-sm font-semibold transition-all ${
                      on ? "bg-ink text-white shadow-[0_4px_12px_rgba(29,33,48,.25)]" : "bg-white text-ink-2 hover:bg-sunken"
                    }`}
                  >
                    <Avatar name={p.name} size={28} />
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {level < 4 && closedBoards.length > 0 && (
          <div className="rounded-[16px] bg-panel p-4">
            <div className="font-bold">Доступ до дошок</div>
            <p className="mb-3 text-sm text-ink-3">
              Дошки, відкриті всім, і так видно. Тут — дошки з обмеженим доступом. Задачі, де людина виконавець, вона бачить на будь-якій дошці.
            </p>
            <div className="flex flex-wrap gap-2">
              {closedBoards.map((b) => {
                const on = boards.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setBoards(on ? boards.filter((x) => x !== b.id) : [...boards, b.id])}
                    className="inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-bold transition-all"
                    style={on ? { background: b.color, color: "#fff", boxShadow: `0 4px 12px ${b.color}55` } : { background: "#fff", color: "var(--ink-2)" }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? "#fff" : b.color }} />
                    {b.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Switch name="active" defaultChecked={initial.active} label="Доступ увімкнено" hint="Вимкнення одразу викидає із системи, задачі й статистика зберігаються" />
      </div>

      {saved && !state.error && (
        <div role="status" className="rounded-xl bg-[#e2f6e8] px-4 py-3 text-sm font-semibold text-[#15803d]">
          Збережено
        </div>
      )}
      {state.error && (
        <div role="alert" className="rounded-xl bg-[#ffe6e8] px-4 py-3 text-sm font-semibold text-[#c01428]">
          {state.error}
        </div>
      )}
      <div className="flex gap-3">
        <button className="btn btn-primary" disabled={pending}>
          {isNew ? "Створити працівника" : "Зберегти"}
        </button>
        <Link href="/admin/people" className="btn btn-soft">
          До списку
        </Link>
      </div>
    </form>
  );
}

function RoleChip({ on, label, onClick, sub, inactive }: { on: boolean; label: string; onClick: () => void; sub?: boolean; inactive?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex items-center rounded-full font-bold transition-all ${sub ? "h-8 px-3 text-[0.8rem]" : "h-10 px-4 text-sm"} ${
        on ? "bg-ink text-white shadow-[0_4px_12px_rgba(29,33,48,.25)]" : "bg-panel text-ink-2 hover:bg-sunken"
      } ${inactive ? "opacity-50" : ""}`}
    >
      {label}
    </button>
  );
}
