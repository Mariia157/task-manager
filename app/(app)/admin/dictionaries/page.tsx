import { db } from "@/lib/db";
import { saveBusinessLineAction, saveDirectionAction, saveRoleAction, saveSubtypeAction } from "@/app/actions/admin";
import { ColorPicker } from "@/components/admin/ColorPicker";
import { Select } from "@/components/ui/Select";
import { IconPlus } from "@/components/icons";
import { saveWorkPlaceAction } from "@/app/actions/workday";

export const metadata = { title: "Довідники · Taskflow" };

export default async function DictionariesPage() {
  const [workPlaces, placeUse, roles, directions, businessLines, customBiz] = await Promise.all([
    db.workPlace.findMany({ orderBy: { sortOrder: "asc" } }),
    db.workDay.groupBy({ by: ["place"], _count: { _all: true } }),
    db.role.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { users: true } } } }),
    db.direction.findMany({
      orderBy: { sortOrder: "asc" },
      include: { subtypes: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { tasks: true } } } }, _count: { select: { tasks: true } } },
    }),
    db.businessLine.findMany({ orderBy: { sortOrder: "asc" } }),
    db.task.groupBy({ by: ["business"], where: { business: { not: null } }, _count: { _all: true } }),
  ]);
  const bizCount = new Map(customBiz.map((g) => [g.business!, g._count._all]));
  const presetNames = new Set(businessLines.map((b) => b.name));
  const manual = customBiz.filter((g) => !presetNames.has(g.business!));
  const roleOptions = [{ value: "", label: "Будь-якому працівнику" }, ...roles.filter((r) => r.active).map((r) => ({ value: r.id, label: `за роллю «${r.name}»` }))];

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-extrabold">Види роботи</h2>
        <p className="mb-4 text-sm text-ink-3">Що за робота: HR, Продаж, Маркетинг… Для якого бізнесу — видно з дошки («HR» на дошці «Сайт компанії» — шукаємо людей у команду сайту). Основні — кнопками у формі задачі; свій вид можна вписати вручну.</p>
        <div className="card overflow-hidden">
          <div className="zebra">
            {businessLines.map((b) => (
              <form key={b.id} action={saveBusinessLineAction.bind(null, b.id)} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${b.active ? "" : "opacity-55"}`}>
                <input name="name" defaultValue={b.name} required maxLength={40} aria-label="Назва" className="field !min-h-0 max-w-[200px] !py-2 font-bold" />
                <ColorPicker name="color" defaultValue={b.color} />
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" name="active" value="1" defaultChecked={b.active} className="h-4 w-4 accent-[#1d2130]" />
                  у формі
                </label>
                <span className="text-sm text-ink-3">{bizCount.get(b.name) ?? 0} задач</span>
                <button className="btn btn-soft btn-sm ml-auto">Зберегти</button>
              </form>
            ))}
          </div>
          <form action={saveBusinessLineAction.bind(null, null)} className="flex flex-wrap items-center gap-3 bg-panel px-4 py-3">
            <input name="name" required maxLength={40} placeholder="Новий вид роботи" aria-label="Новий вид роботи" className="field !min-h-0 max-w-[200px] !py-2" />
            <ColorPicker name="color" defaultValue="#64748b" />
            <button className="btn btn-primary btn-sm ml-auto">
              <IconPlus size={15} />
              Додати
            </button>
          </form>
        </div>
        {manual.length > 0 && (
          <p className="mt-3 text-sm text-ink-3">
            Вписані вручну: {manual.map((m) => `${m.business} (${m._count._all})`).join(", ")}. Щоб зробити таке значення основним, додайте його з такою самою назвою.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-xl font-extrabold">Місця роботи</h2>
        <p className="mb-4 text-sm text-ink-3">
          Вибір на головній під час «Початку дня». Перейменування не змінює вже позначені дні; вимкнене місце зникає з вибору.
        </p>
        <div className="card overflow-hidden">
          <div className="zebra">
            {workPlaces.map((w) => (
              <form key={w.id} action={saveWorkPlaceAction.bind(null, w.id)} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${w.active ? "" : "opacity-55"}`}>
                <input name="name" defaultValue={w.name} required maxLength={40} aria-label="Назва місця" className="field !min-h-0 max-w-[220px] !py-2 font-bold" />
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" name="active" value="1" defaultChecked={w.active} className="h-4 w-4 accent-[#1d2130]" />
                  у виборі
                </label>
                <span className="text-sm text-ink-3">{placeUse.find((u) => u.place === w.name)?._count._all ?? 0} відміток</span>
                <button className="btn btn-soft btn-sm ml-auto">Зберегти</button>
              </form>
            ))}
          </div>
          <form action={saveWorkPlaceAction.bind(null, null)} className="flex flex-wrap items-center gap-3 bg-panel px-4 py-3">
            <input name="name" required maxLength={40} placeholder="Нове місце" aria-label="Нове місце роботи" className="field !min-h-0 max-w-[220px] !py-2" />
            <button className="btn btn-primary btn-sm ml-auto">
              <IconPlus size={15} />
              Додати
            </button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-extrabold">Ролі</h2>
        <p className="mb-4 text-sm text-ink-3">Ролі людини (їх може бути кілька). Дочірня роль — додаткова мітка, наприклад «Фронт» у Розробника.</p>
        <div className="card divide-y-0 overflow-hidden">
          <div className="zebra">
            {roles.map((r) => (
              <form key={r.id} action={saveRoleAction.bind(null, r.id)} className="flex flex-wrap items-center gap-2.5 px-4 py-3">
                <input name="name" defaultValue={r.name} required maxLength={60} aria-label="Назва ролі" className="field !min-h-0 max-w-[220px] !py-2" />
                <Select
                  name="parentId"
                  defaultValue={r.parentId ?? ""}
                  ariaLabel="Батьківська роль"
                  className="min-w-[200px] max-w-[240px]"
                  options={[{ value: "", label: "Основна роль" }, ...roles.filter((x) => x.id !== r.id && !x.parentId).map((x) => ({ value: x.id, label: `мітка до «${x.name}»` }))]}
                />
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" name="active" value="1" defaultChecked={r.active} className="h-4 w-4 accent-[#1d2130]" />
                  активна
                </label>
                <span className="text-sm text-ink-3">{r._count.users} осіб</span>
                <button className="btn btn-soft btn-sm ml-auto">Зберегти</button>
              </form>
            ))}
          </div>
          <form action={saveRoleAction.bind(null, null)} className="flex flex-wrap items-center gap-2.5 bg-panel px-4 py-3">
            <input name="name" required maxLength={60} placeholder="Нова роль" aria-label="Нова роль" className="field !min-h-0 max-w-[220px] !py-2" />
            <Select name="parentId" defaultValue="" ariaLabel="Батьківська роль" className="min-w-[200px] max-w-[240px]" options={[{ value: "", label: "Основна роль" }, ...roles.filter((x) => !x.parentId).map((x) => ({ value: x.id, label: `мітка до «${x.name}»` }))]} />
            <button className="btn btn-primary btn-sm">
              <IconPlus size={15} />
              Додати
            </button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-extrabold">Відділи й підтипи</h2>
        <p className="mb-4 text-sm text-ink-3">
          У задачі один відділ. Роль відділу — кому ставлять такі задачі; винятки роблять керівник відділу (у своїх відділах) і адмін. Нова рекламна мережа одразу
          з’являється в картці задачі.
        </p>
        <div className="space-y-5">
          {directions.map((d) => (
            <article key={d.id} className={`card p-5 ${d.active ? "" : "opacity-60"}`}>
              <form action={saveDirectionAction.bind(null, d.id)} className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
                <div>
                  <label className="label">Назва</label>
                  <input name="name" defaultValue={d.name} required maxLength={60} className="field" />
                </div>
                <div>
                  <label className="label">Кому ставити</label>
                  <Select name="roleId" defaultValue={d.roleId ?? ""} options={roleOptions} ariaLabel="Роль виконавця" />
                </div>
                <div>
                  <label className="label">Підпис підтипу в картці</label>
                  <input name="subtypeLabel" defaultValue={d.subtypeLabel} maxLength={40} className="field" />
                </div>
                <div className="lg:col-span-2">
                  <span className="label">Колір</span>
                  <ColorPicker name="color" defaultValue={d.color} />
                </div>
                <div className="flex items-end justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" name="active" value="1" defaultChecked={d.active} className="h-4 w-4 accent-[#1d2130]" />
                    активно · {d._count.tasks} задач
                  </label>
                  <button className="btn btn-soft btn-sm">Зберегти</button>
                </div>
              </form>

              <div className="mt-5 rounded-[16px] bg-panel p-4">
                <div className="mb-2.5 text-sm font-bold">{d.subtypeLabel}</div>
                <div className="flex flex-wrap gap-2">
                  {d.subtypes.map((s) => (
                    <form key={s.id} action={saveSubtypeAction.bind(null, d.id, s.id)} className={`flex items-center gap-1.5 rounded-full bg-white py-1 pl-1 pr-1.5 shadow-sm ${s.active ? "" : "opacity-55"}`}>
                      <input name="name" defaultValue={s.name} required maxLength={60} aria-label="Назва підтипу" className="h-8 w-32 rounded-full bg-transparent px-3 text-sm font-bold outline-none focus:bg-panel" />
                      <label className="flex items-center gap-1 text-xs font-semibold text-ink-3" title="Активний">
                        <input type="checkbox" name="active" value="1" defaultChecked={s.active} className="h-3.5 w-3.5 accent-[#1d2130]" />
                        {s._count.tasks}
                      </label>
                      <button className="h-7 rounded-full bg-panel px-2.5 text-xs font-bold hover:bg-sunken">OK</button>
                    </form>
                  ))}
                  <form action={saveSubtypeAction.bind(null, d.id, null)} className="flex items-center gap-1.5">
                    <input name="name" required maxLength={60} placeholder={d.name === "Реклама" ? "Нова мережа" : "Новий підтип"} aria-label="Новий підтип" className="field !h-10 !min-h-0 w-40 !py-1.5 text-sm" />
                    <button className="btn btn-primary btn-sm" aria-label="Додати підтип">
                      <IconPlus size={15} />
                    </button>
                  </form>
                </div>
              </div>
            </article>
          ))}
          <form action={saveDirectionAction.bind(null, null)} className="card flex flex-wrap items-center gap-3 p-5">
            <input name="name" required maxLength={60} placeholder="Новий відділ" aria-label="Новий відділ" className="field max-w-[260px]" />
            <input type="hidden" name="subtypeLabel" value="Підтип" />
            <ColorPicker name="color" defaultValue="#64748b" />
            <button className="btn btn-primary btn-sm ml-auto">
              <IconPlus size={15} />
              Додати відділ
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
