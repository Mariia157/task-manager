/**
 * npx prisma db seed            — справочники, проекты с колонками, админ из .env (безопасно повторять)
 * npx prisma db seed -- --demo  — СТИРАЕТ всё и заливает демо-команду и задачи
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { DEFAULT_WORKPLACES, DEFAULT_BUSINESS, DEFAULT_COLUMNS, DEFAULT_DIRECTIONS, DEFAULT_PROJECTS, DEFAULT_ROLES } from "../lib/defaults";
import { addDays, dayKey, fromZoned, startOfDay, zonedParts } from "../lib/time";

const db = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }),
});

type BoardList = readonly { name: string; color: string }[];

/**
 * Справочники, доски, админ. На сервере вызывается без параметров (стандартные списки из lib/defaults.ts);
 * демо подставляет свои доски и людей.
 */
async function base(lists: { projects?: BoardList; business?: BoardList } = {}) {
  const roleIds: Record<string, string> = {};
  for (const r of DEFAULT_ROLES) {
    const parentId = "parent" in r ? roleIds[r.parent] : null;
    const row = await db.role.upsert({ where: { name: r.name }, update: {}, create: { name: r.name, parentId, sortOrder: Object.keys(roleIds).length } });
    roleIds[r.name] = row.id;
  }
  let i = 0;
  for (const d of DEFAULT_DIRECTIONS) {
    const row = await db.direction.upsert({
      where: { name: d.name },
      update: {},
      create: { name: d.name, color: d.color, roleId: d.role ? roleIds[d.role] : null, subtypeLabel: d.subtypeLabel, sortOrder: i++ },
    });
    let j = 0;
    for (const s of d.subtypes)
      await db.subtype.upsert({
        where: { directionId_name: { directionId: row.id, name: s } },
        update: {},
        create: { directionId: row.id, name: s, sortOrder: j++ },
      });
  }
  i = 0;
  for (const name of DEFAULT_WORKPLACES) await db.workPlace.upsert({ where: { name }, update: {}, create: { name, sortOrder: i++ } });
  i = 0;
  for (const b of lists.business ?? DEFAULT_BUSINESS) await db.businessLine.upsert({ where: { name: b.name }, update: {}, create: { ...b, sortOrder: i++ } });
  i = 0;
  for (const p of lists.projects ?? DEFAULT_PROJECTS) {
    const exists = await db.project.findUnique({ where: { name: p.name } });
    if (exists) continue;
    await db.project.create({
      data: { name: p.name, color: p.color, sortOrder: i++, accessAll: true, columns: { create: DEFAULT_COLUMNS.map((c, k) => ({ ...c, sortOrder: k })) } },
    });
  }
  const login = process.env.ADMIN_LOGIN || "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) throw new Error("ADMIN_PASSWORD у .env має бути не коротшим за 8 символів");
  const exists = await db.user.findUnique({ where: { login } });
  const admin =
    exists ?? (await db.user.create({ data: { login, name: process.env.ADMIN_NAME || (process.argv.includes("--demo") ? "Андрій Ковальчук" : "Адміністратор"), level: 4, passwordHash: await bcrypt.hash(password, 10) } }));
  return { admin, roleIds };
}

// детерминированный генератор, чтобы демо было одинаковым
let seed = 20261110;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

/** Демо: компания с сайтом, приложением, поддержкой и запуском продукта. */
const DEMO_PROJECTS = [
  { name: "Сайт компанії", color: "#2563eb" },
  { name: "Запуск продукту", color: "#16a34a" },
  { name: "Клієнтська підтримка", color: "#f08a0c" },
  { name: "Внутрішні процеси", color: "#7c3aed" },
  { name: "Мобільний застосунок", color: "#d946ef" },
  { name: "Партнерська програма", color: "#0f766e" },
] as const;

const TITLES: Record<string, string[]> = {
  Розробка: ["Сторінка тарифів", "Форма зворотного зв'язку: перевірка телефону", "Перенести сайт на новий сервер", "Виправити відправку форми", "Сторінка «Контакти»", "Пришвидшити завантаження головної", "Вивантаження заявок у CSV", "Редирект зі старої адреси"],
  Реклама: ["Кампанія до весняного розпродажу", "Звіт по рекламі за тиждень", "Тест 3 варіантів банера", "Переглянути ставки в кампаніях", "Запуск реклами нового продукту", "Розібрати відхилені оголошення", "Ретаргетинг на відвідувачів сайту"],
  Креатив: ["Банери 1080×1080 — 5 шт.", "Відео 15 с для соцмереж", "Набір іконок для застосунку", "Обкладинка для сторінки в соцмережах", "Ілюстрації для головної", "Шаблон презентації"],
  Айті: ["Налаштувати корпоративну пошту", "Продовжити домени", "Резервна копія бази", "Видати доступи новому працівнику", "Перевірити SSL-сертифікати", "Оновити паролі сервісів"],
};

/** демо: вид работы по доске, остальное — вперемешку; «Обучение» — вписано вручную */
const BUSINESS_BY_PROJECT: Record<string, string | null> = {
  "Сайт компанії": "Продаж",
  "Запуск продукту": "Маркетинг",
  "Клієнтська підтримка": null,
  "Внутрішні процеси": "Навчання",
};

const COMMENTS = ["Взяв у роботу", "Чекаю макет від @anna", "Готово, перевірте", "Потрібен доступ до хостингу", "Переніс на завтра, чекаємо відповіді", "Зробив першу версію", "@admin перегляньте, будь ласка", "Є питання щодо макета"];

async function demo() {
  // входы людей переживают пересев: запоминаем сессии по логину и возвращаем после
  const keep = await db.session.findMany({ where: { expiresAt: { gt: new Date() } }, include: { user: { select: { login: true } } } });
  // и подключённый Telegram-бот — тоже по логину
  const tg = await db.user.findMany({ where: { telegramChatId: { not: null } }, select: { login: true, telegramChatId: true, notifyDigest: true } });
  // порядок: от зависимых к независимым
  for (const m of [
    db.draft, db.reminder, db.notification, db.auditLog, db.request, db.taskEvent, db.comment, db.checklistItem, db.attachment, db.taskLink, db.taskMention,
    db.watcher, db.taskResource, db.taskDependency, db.task, db.projectMember, db.recurringTask, db.savedView, db.resource, db.session, db.subordination,
    db.workDay, db.directionGrant, db.userRole, db.user, db.boardColumn, db.project, db.subtype, db.direction, db.role, db.taskTemplate, db.businessLine,
  ] as unknown as { deleteMany: () => Promise<unknown> }[])
    await m.deleteMany();

  const { admin, roleIds } = await base({ projects: DEMO_PROJECTS });
  const dirs = await db.direction.findMany({ include: { subtypes: true } });
  const dir = (n: string) => dirs.find((d) => d.name === n)!;
  const sub = (d: string, s: string) => dir(d).subtypes.find((x) => x.name === s)!.id;
  const projects = await db.project.findMany({ include: { columns: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } });

  const hash = await bcrypt.hash("demo12345", 10);
  const people = [
    { login: "olena", name: "Олена Коваль", level: 3, roles: ["Маркетолог"], grants: [["Реклама", null]], resp: "Уся реклама: бюджети, кампанії, звіти" },
    { login: "dmytro", name: "Дмитро Бондаренко", level: 3, roles: ["Розробник", "Фронт"], grants: [["Розробка", null], ["Айті", null]], resp: "Розробка і сервери" },
    { login: "vika", name: "Віка Мельник", level: 3, roles: ["Розробник", "Фронт"], grants: [["Розробка", "Фронт"]], resp: "Верстка сайту й застосунку" },
    { login: "maks", name: "Максим Шевчук", level: 2, roles: ["Маркетолог"], subs: ["tim", "sasha"], resp: "Група рекламних кампаній" },
    { login: "ivan", name: "Іван Ткаченко", level: 1, roles: ["Розробник", "Фронт"], resp: "Сторінки сайту й форми" },
    { login: "oleg", name: "Олег Кравець", level: 1, roles: ["Розробник"], resp: "Бекенд, інтеграції" },
    { login: "anna", name: "Анна Лисенко", level: 1, roles: ["Креатив"], resp: "Банери й відео" },
    { login: "kate", name: "Катя Руденко", level: 1, roles: ["Креатив"], resp: "Іконки, обкладинки" },
    { login: "tim", name: "Тимур Савченко", level: 1, roles: ["Маркетолог"], resp: "Google, TikTok" },
    { login: "sasha", name: "Саша Гончар", level: 1, roles: ["Маркетолог"], resp: "Facebook, Instagram" },
    { login: "yura", name: "Юра Поляков", level: 1, roles: ["Айті"], resp: "Пошта, домени, доступи" },
  ] as const;
  await db.user.update({ where: { id: admin.id }, data: { contacts: "+380 67 000 00 00", responsibility: "Усе" } });
  const uid: Record<string, string> = { admin: admin.id };
  for (const p of people) {
    const u = await db.user.create({
      data: {
        login: p.login,
        name: p.name,
        level: p.level,
        passwordHash: hash,
        responsibility: p.resp,
        roles: { create: p.roles.map((r) => ({ roleId: roleIds[r] })) },
      },
    });
    uid[p.login] = u.id;
    if ("grants" in p)
      for (const [d, s] of p.grants)
        await db.directionGrant.create({ data: { userId: u.id, directionId: dir(d).id, subtypeId: s ? sub(d, s) : null } });
  }
  for (const p of people) if ("subs" in p) for (const s of p.subs) await db.subordination.create({ data: { managerId: uid[p.login], subordinateId: uid[s] } });

  const byDir: Record<string, string[]> = {
    Розробка: ["ivan", "oleg", "dmytro", "vika"],
    Реклама: ["tim", "sasha", "maks", "olena"],
    Креатив: ["anna", "kate"],
    Айті: ["yura", "oleg", "ivan", "anna", "tim"],
  };
  const creatorFor = (d: string, assignee: string) =>
    d === "Реклама" && ["tim", "sasha"].includes(assignee) ? pick(["maks", "olena", "admin"]) : d === "Розробка" ? pick(["dmytro", "admin"]) : "admin";

  const now = new Date();
  const today = startOfDay(now);
  let pos = 0;
  const created: { id: string; assignee: string }[] = [];

  for (let n = 0; n < 70; n++) {
    const dName = pick(["Розробка", "Розробка", "Реклама", "Реклама", "Креатив", "Айті"]);
    const d = dir(dName);
    const assignee = pick(byDir[dName]);
    let subtypeId: string | null = null;
    if (dName === "Реклама") subtypeId = pick(d.subtypes).id;
    if (dName === "Розробка" && rnd() < 0.5) subtypeId = sub("Розробка", "Фронт");
    const project = pick(projects);
    const colIdx = pick([0, 1, 1, 1, 2, 3, 4, 4, 4]);
    const col = project.columns[colIdx];
    const createdAt = addDays(today, -Math.floor(rnd() * 28) - 1);
    const priority = pick(["HIGH", "MEDIUM", "MEDIUM", "LOW"]);
    const dz = zonedParts(addDays(today, Math.floor(rnd() * 14) - 5));
    const deadline = priority === "LOW" && rnd() < 0.4 ? null : fromZoned(dz.y, dz.m, dz.d, pick([10, 12, 15, 18, 18]), 0);
    let completedAt: Date | null = null;
    if (col.isDone) {
      const back = Math.floor(rnd() * 26);
      completedAt = new Date(Math.min(now.getTime() - 3600_000, addDays(today, -back).getTime() + (9 + Math.floor(rnd() * 9)) * 3600_000));
    }
    const creator = creatorFor(dName, assignee);
    const business = BUSINESS_BY_PROJECT[project.name] ?? pick(["HR", "Продаж", null, "Маркетинг"]);
    const t = await db.task.create({
      data: {
        title: pick(TITLES[dName]),
        description: "Що потрібно зробити:\n— підготувати першу версію\n— погодити з керівником\n\nМатеріали в посиланнях нижче.",
        projectId: project.id,
        columnId: col.id,
        position: pos++,
        directionId: d.id,
        subtypeId,
        business,
        assigneeId: uid[assignee],
        creatorId: uid[creator],
        priority,
        deadline,
        completedAt,
        createdAt,
        links: rnd() < 0.5 ? { create: [{ label: pick(["Сайт", "Канал", "Бот", "Група"]), url: "https://example.com/" + n }] } : undefined,
        checklist: rnd() < 0.5 ? { create: ["Зробити чернетку", "Показати керівнику", "Внести правки"].map((text, k) => ({ text, done: col.isDone || rnd() < 0.4, sortOrder: k })) } : undefined,
        events: { create: [{ actorId: uid[creator], type: "created", createdAt }] },
      },
    });
    created.push({ id: t.id, assignee });
    if (rnd() < 0.5) {
      const text = pick(COMMENTS);
      await db.comment.create({ data: { taskId: t.id, authorId: uid[assignee], text, createdAt: new Date(createdAt.getTime() + 3600_000 * 5) } });
      for (const m of text.matchAll(/@([a-z0-9_.-]+)/g)) if (uid[m[1]]) await db.taskMention.upsert({ where: { taskId_userId: { taskId: t.id, userId: uid[m[1]] } }, update: {}, create: { taskId: t.id, userId: uid[m[1]] } });
    }
    if (rnd() < 0.2) await db.watcher.create({ data: { taskId: t.id, userId: uid[pick(["anna", "kate", "yura"])] } }).catch(() => {});
  }

  // составная задача: запуск проекта = сайт + креативы + реклама
  const re = projects.find((p) => p.name === "Запуск продукту")!;
  const inWork = re.columns[1];
  const deadline = (days: number, h = 18) => {
    const z = zonedParts(addDays(today, days));
    return fromZoned(z.y, z.m, z.d, h, 0);
  };
  const parent = await db.task.create({
    data: {
      title: "Запуск продукту: нова версія застосунку",
      description: "Сайт, креативи й реклама до запуску. Прогрес рахується за підзадачами.",
      projectId: re.id, columnId: inWork.id, position: pos++, directionId: dir("Айті").id, business: "Маркетинг", assigneeId: uid.dmytro, creatorId: admin.id,
      priority: "HIGH", deadline: deadline(6),
      links: { create: [{ label: "Сайт", url: "https://example.com/launch" }, { label: "Макет", url: "https://example.com/design" }] },
      events: { create: [{ actorId: admin.id, type: "created" }] },
    },
  });
  const kids = [
    { title: "Сторінка нового продукту", d: "Розробка", s: sub("Розробка", "Фронт"), a: "ivan", col: 1 },
    { title: "Банери до запуску — 6 шт.", d: "Креатив", s: null, a: "anna", col: 4 },
    { title: "Рекламна кампанія Google до запуску", d: "Реклама", s: sub("Реклама", "Google"), a: "tim", col: 2 },
    { title: "Підключити онлайн-чат на сайт", d: "Айті", s: null, a: "yura", col: 0 },
  ];
  for (const k of kids)
    await db.task.create({
      data: {
        title: k.title, projectId: re.id, columnId: re.columns[k.col].id, position: pos++, directionId: dir(k.d).id, subtypeId: k.s, business: "Маркетинг",
        assigneeId: uid[k.a], creatorId: admin.id, priority: "HIGH", deadline: deadline(4), parentId: parent.id,
        completedAt: re.columns[k.col].isDone ? new Date(now.getTime() - 86400_000) : null,
        events: { create: [{ actorId: admin.id, type: "created" }] },
      },
    });

  // ежедневная задача: отчёт по рекламе к 9:00 + история за неделю
  const ads = projects.find((p) => p.name === "Сайт компанії")!;
  const rec = await db.recurringTask.create({
    data: {
      title: "Звіт по рекламі", description: "Витрати, заявки й вартість заявки по кожній кампанії.", assigneeId: uid.tim, projectId: ads.id,
      directionId: dir("Реклама").id, subtypeId: sub("Реклама", "Google"), priority: "HIGH", dueTime: "09:00", remindBefore: 60,
    },
  });
  await db.recurringTask.create({
    data: { title: "Розібрати вхідні звернення", assigneeId: uid.yura, projectId: re.id, directionId: dir("Айті").id, priority: "MEDIUM", dueTime: "10:30", weekdays: "12345" },
  });
  for (let back = 7; back >= 1; back--) {
    const day = addDays(today, -back);
    const z = zonedParts(day);
    const done = rnd() < 0.85;
    const dl = fromZoned(z.y, z.m, z.d, 9, 0);
    await db.task.create({
      data: {
        title: rec.title, description: rec.description, projectId: ads.id, columnId: ads.columns[done ? 4 : 1].id, position: pos++,
        directionId: rec.directionId, subtypeId: rec.subtypeId, assigneeId: uid.tim, creatorId: admin.id, priority: "HIGH",
        deadline: dl, completedAt: done ? new Date(dl.getTime() - 20 * 60_000) : null, recurringId: rec.id, recurringDay: dayKey(day), createdAt: day,
      },
    });
  }

  // запросы на подтверждение
  await db.request.create({
    data: {
      type: "ASSIGN", requesterId: uid.anna, note: "Потрібні вихідники для банерів",
      payload: JSON.stringify({ title: "Вивантажити вихідники логотипа в SVG", description: "", projectId: re.id, directionId: dir("Розробка").id, subtypeId: null, assigneeId: uid.ivan, priority: "MEDIUM", deadline: deadline(2).toISOString(), parentId: null }),
    },
  });
  await db.request.create({
    data: {
      type: "REQUEST", requesterId: uid.yura, note: "Листи зі спільної скриньки потрапляють у спам",
      payload: JSON.stringify({ title: "Налаштувати спільну поштову скриньку", description: "Листи йдуть у спам — перевірити SPF і DKIM.", projectId: projects.find((p) => p.name === "Внутрішні процеси")!.id, directionId: dir("Айті").id, subtypeId: null, assigneeId: uid.yura, priority: "HIGH", deadline: deadline(1).toISOString(), parentId: null }),
    },
  });

  // доска с ограниченным доступом: «Внутренние процессы» — только Дмитрию и Юре (+ админы)
  const law = projects.find((p) => p.name === "Внутрішні процеси")!;
  await db.project.update({ where: { id: law.id }, data: { accessAll: false, members: { create: [{ userId: uid.dmytro }, { userId: uid.yura }] } } });

  // сохранённые виды
  await db.savedView.create({ data: { name: "Уся реклама", query: `direction=${dir("Реклама").id}`, sortOrder: 0 } });
  await db.savedView.create({ data: { name: "Увесь фронт", query: `direction=${dir("Розробка").id}&subtype=${sub("Розробка", "Фронт")}`, sortOrder: 1 } });

  for (const t of tg) if (uid[t.login]) await db.user.update({ where: { id: uid[t.login] }, data: { telegramChatId: t.telegramChatId, notifyDigest: t.notifyDigest } });
  for (const k of keep) {
    const id = uid[k.user.login];
    if (id) await db.session.create({ data: { id: k.id, userId: id, expiresAt: k.expiresAt, persistent: k.persistent, userAgent: k.userAgent, lastSeenAt: k.lastSeenAt, createdAt: k.createdAt } });
  }
  // отметки рабочего дня за 2 недели (будни, без сегодня): место, начало ~9:00, конец ~18:00; изредка конец не отмечен
  const day0 = startOfDay(new Date());
  for (const login of Object.keys(uid)) {
    if (login === "admin") continue;
    for (let back = 14; back >= 1; back--) {
      const d = addDays(day0, -back);
      const z = zonedParts(d);
      const wd = new Date(Date.UTC(z.y, z.m - 1, z.d)).getUTCDay();
      if (wd === 0 || wd === 6 || rnd() < 0.08) continue;
      const startedAt = fromZoned(z.y, z.m, z.d, 8 + Math.floor(rnd() * 2), Math.floor(rnd() * 60));
      const endedAt = rnd() < 0.07 ? null : fromZoned(z.y, z.m, z.d, 17 + Math.floor(rnd() * 2), Math.floor(rnd() * 60));
      await db.workDay.create({ data: { userId: uid[login], day: dayKey(d), place: pick(DEFAULT_WORKPLACES), startedAt, endedAt } });
    }
  }

  await db.auditLog.create({ data: { actorId: admin.id, action: "seed", entity: "system", detail: "Заповнено демо-дані" } });
  console.log(`Демо: ${people.length + 1} осіб, ${created.length + kids.length + 8} задач. Пароль працівників: demo12345`);
}

async function main() {
  // демо стирает ВСЮ базу — без явного подтверждения не запускается
  if (process.argv.includes("--demo") && process.env.NODE_ENV === "production" && !process.argv.includes("--i-really-want-to-wipe-production")) {
    console.error("Відмова: NODE_ENV=production, а --demo стирає всі дані. Базовий seed запускається без --demo.");
    process.exit(1);
  }
  if (process.argv.includes("--demo")) await demo();
  else {
    await base();
    console.log("Довідники, проєкти й адмін на місці");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
