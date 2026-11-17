/**
 * Сквозная проверка: node scripts/e2e.mjs [baseUrl]
 * Требует запущенный сервер и свежий seed --demo. Нужны Playwright и Chrome.
 * ВНИМАНИЕ: меняет демо-базу (создаёт людей, задачи, запросы, комментарии).
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
// Playwright не входить у залежності: npm i -D playwright, або вкажіть шлях у PLAYWRIGHT_MODULE
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.argv[2] || "http://localhost:3100";
const SHOTS = process.env.SHOTS || "shots";
mkdirSync(SHOTS, { recursive: true });
new Database("prisma/dev.db").prepare("delete from LoginAttempt").run();
const db = new Database("prisma/dev.db", { readonly: true });
const all = (sql, ...a) => db.prepare(sql).all(...a);
const one = (sql, ...a) => db.prepare(sql).get(...a);

let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
  if (!cond) failed++;
};

// браузер: CHROME_PATH або встановлений Google Chrome
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : { channel: "chrome", headless: true });
const PW = { admin: "admin12345" };

async function as(login, viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("#login", login);
  await page.fill("#password", PW[login] ?? "demo12345");
  await Promise.all([page.waitForURL(`${BASE}/`), page.click("button:has-text('Увійти')")]);
  await page.waitForSelector("h1");
  return { ctx, page };
}

async function listIds(page, qs = "") {
  await page.goto(`${BASE}/tasks${qs}`);
  return page.$$eval("main a[href^='/tasks/']", (as) =>
    [...new Set(as.map((a) => a.getAttribute("href")).filter((h) => /^\/tasks\/[a-z0-9]+$/.test(h) && h !== "/tasks/new"))].map((h) => h.split("/")[2]),
  );
}

/** Выбрать значение в своём выпадающем списке по id кнопки и тексту варианта. */
async function pick(page, triggerId, text) {
  await page.click(`#${triggerId}`);
  await page.click(`[role=option]:has-text("${text}")`);
}

const uid = (login) => one("select id from User where login=?", login).id;
const dir = (name) => one("select id from Direction where name=?", name).id;
const sub = (name) => one("select id from Subtype where name=?", name).id;
const visibleSet = (login) => {
  const id = uid(login);
  return new Set(
    all(
      `select id from Task t where archivedAt is null and (assigneeId=? or creatorId=? or exists(select 1 from Watcher w where w.taskId=t.id and w.userId=?) or exists(select 1 from TaskMention m where m.taskId=t.id and m.userId=?))`,
      id, id, id, id,
    ).map((r) => r.id),
  );
};

// ───────── вход ─────────
console.log("Вхід");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/boards`);
  ok(page.url().endsWith("/login"), "без сесії — на /login");
  await page.fill("#login", "ivan");
  await page.fill("#password", "wrong-password");
  await page.click("button:has-text('Увійти')");
  await page.waitForSelector("[role=alert]");
  ok(true, "неправильний пароль — помилка");
  await ctx.close();
}
{
  const days = async (remember) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.fill("#login", "oleg");
    await page.fill("#password", "demo12345");
    if (!remember) await page.click("[role=switch]:has-text('Запам’ятати')");
    await Promise.all([page.waitForURL(`${BASE}/`), page.click("button:has-text('Увійти')")]);
    const sid = (await ctx.cookies()).find((c) => c.name === "sid");
    const left = sid.expires > 0 ? (sid.expires * 1000 - Date.now()) / 86400_000 : -1;
    await page.goto(`${BASE}/profile`);
    const listed = (await page.locator("text=цей пристрій").count()) === 1;
    await ctx.close();
    return { left, listed };
  };
  const on = await days(true);
  ok(on.left > 6.9 && on.left < 7.1, `«Запам’ятати»: cookie на тиждень (${on.left.toFixed(1)} дн.)`);
  ok(on.listed, "пристрій видно в профілі");
  const off = await days(false);
  ok(off.left === -1, "без галочки — до закриття браузера");
}

// ───────── безопасность входа ─────────
console.log("Безпека входу");
{
  const r = await fetch(`${BASE}/login`);
  ok(!r.headers.get("x-powered-by"), "немає X-Powered-By");
  ok(r.headers.get("x-frame-options") === "DENY" && (r.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"), "заборона вбудовування у фрейм + CSP");
  ok(r.headers.get("referrer-policy") === "same-origin", "Referrer-Policy");

  // время ответа одинаковое для существующего и несуществующего логина
  const timeLogin = async (login) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.fill("#login", login);
    await page.fill("#password", "wrong-password-x");
    const t = Date.now();
    await page.click("button:has-text('Увійти')");
    await page.waitForSelector("[role=alert]");
    const ms = Date.now() - t;
    await ctx.close();
    return ms;
  };
  const real = await timeLogin("kate");
  const ghost = await timeLogin("no-such-user-zz");
  ok(ghost > 60 && Math.abs(real - ghost) < Math.max(real, ghost) * 0.6, `час відповіді не видає логін (${real} мс / ${ghost} мс)`);

  // подбор: 5 ошибок → блок, даже с верным паролем
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  for (let i = 0; i < 5; i++) {
    await page.fill("#login", "sasha");
    await page.fill("#password", "wrong-" + i);
    await page.click("button:has-text('Увійти')");
    await page.waitForSelector("[role=alert]");
    await page.waitForTimeout(400);
  }
  await page.fill("#login", "sasha");
  await page.fill("#password", "demo12345");
  await page.click("button:has-text('Увійти')");
  await page.waitForTimeout(600);
  const msg = await page.textContent("[role=alert]").catch(() => "");
  ok(page.url().endsWith("/login") && /Забагато/.test(msg ?? ""), "після 5 помилок вхід заблоковано, навіть із правильним паролем");
  ok(one("select count(*) n from LoginAttempt where login='sasha' and ok=0").n >= 5, "спроби записано в журнал входів");
  await ctx.close();
}

// ───────── уровень 1: только свои ─────────
console.log("Рівень 1 — виконавець");
const ivan = await as("ivan");
{
  const ids = await listIds(ivan.page);
  const expected = visibleSet("ivan");
  ok(ids.length > 0 && ids.every((id) => expected.has(id)), `у списку лише свої/відстежувані/згадки (${ids.length})`);
  const foreign = one(
    "select id from Task where assigneeId=? and creatorId<>? and id not in (select taskId from Watcher where userId=?) and id not in (select taskId from TaskMention where userId=?)",
    uid("tim"), uid("ivan"), uid("ivan"), uid("ivan"),
  );
  const r = await ivan.page.goto(`${BASE}/tasks/${foreign.id}`);
  ok(r.status() === 404, "чужа картка за прямим посиланням — 404");
  const board = one("select projectId from Task where id=?", foreign.id).projectId;
  await ivan.page.goto(`${BASE}/boards/${board}`);
  const onBoard = await ivan.page.$$eval("a[href^='/tasks/']", (as) => as.map((a) => a.getAttribute("href")));
  ok(!onBoard.includes(`/tasks/${foreign.id}`), "на дошці чужих карток немає");
  await ivan.page.goto(`${BASE}/`);
  await ivan.page.screenshot({ path: `${SHOTS}/l1-dashboard.png`, fullPage: true });
}

// ───────── уровень 3: Разработка включает Фронт, Фронт не открывает остальное ─────────
console.log("Рівень 3 — напрями");
{
  const devFront = one("select id from Task where directionId=? and subtypeId=? and assigneeId=?", dir("Розробка"), sub("Фронт"), uid("ivan"));
  const devPlain = one("select id from Task where directionId=? and subtypeId is null and assigneeId=? and parentId is null", dir("Розробка"), uid("oleg"));
  const vika = await as("vika");
  ok((await vika.page.goto(`${BASE}/tasks/${devFront.id}`)).status() === 200, "доступ «лише Фронт» бачить фронт-задачу");
  ok((await vika.page.goto(`${BASE}/tasks/${devPlain.id}`)).status() === 404, "доступ «лише Фронт» не бачить решту розробки");
  await vika.ctx.close();
  const dmytro = await as("dmytro");
  ok((await dmytro.page.goto(`${BASE}/tasks/${devFront.id}`)).status() === 200, "доступ «Розробка» бачить Фронт");
  ok((await dmytro.page.goto(`${BASE}/tasks/${devPlain.id}`)).status() === 200, "доступ «Розробка» бачить усю розробку");
  const ads = one("select id from Task where directionId=? and assigneeId=?", dir("Реклама"), uid("tim"));
  const adsVisible = visibleSet("dmytro").has(ads.id);
  ok((await dmytro.page.goto(`${BASE}/tasks/${ads.id}`)).status() === (adsVisible ? 200 : 404), "чужий напрям (Реклама) — не видно");
  await dmytro.ctx.close();
}

// ───────── уровень 2: подчинённые ─────────
console.log("Рівень 2 — керівник групи");
{
  const maks = await as("maks");
  const tims = one("select id from Task where assigneeId=? and recurringId is null", uid("tim"));
  ok((await maks.page.goto(`${BASE}/tasks/${tims.id}`)).status() === 200, "бачить задачу підлеглого");
  const ivans = [...visibleSet("ivan")].find((id) => !visibleSet("maks").has(id));
  ok((await maks.page.goto(`${BASE}/tasks/${ivans}`)).status() === 404, "не бачить задачу не з групи");
  // ставит задачу человеку из другого отдела — напрямую, без запроса админу
  await maks.page.goto(`${BASE}/tasks/new`);
  await maks.page.fill("#title", "E2E: від керівника групи в розробку");
  await pick(maks.page, "projectId", "Сайт компанії");
  await maks.page.click("[role=radio]:has-text('Розробка')");
  await pick(maks.page, "assigneeId", "Іван Ткаченко");
  await Promise.all([maks.page.waitForURL((u) => /\/tasks\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")), maks.page.click("button:has-text('Створити задачу')")]);
  const cross = one("select t.id, a.login from Task t join User a on a.id=t.assigneeId join User c on c.id=t.creatorId where t.title=? and c.login='maks'", "E2E: від керівника групи в розробку");
  ok(cross?.login === "ivan", "керівник групи поставив задачу Івану (інший відділ) напряму");
  ok((await maks.page.goto(`${BASE}/tasks/${cross.id}`)).status() === 200, "свою поставлену задачу бачить");
  ok((await maks.page.goto(`${BASE}/tasks/${ivans}`)).status() === 404, "решту задач Івана, як і раніше, не бачить");
  await maks.ctx.close();
}

// ───────── админ: человек, справочник ─────────
console.log("Адмін");
const admin = await as("admin");
{
  const p = admin.page;
  await p.goto(`${BASE}/admin/people/new`);
  await p.fill("#name", "Тест Тестів");
  await p.fill("#login", "test.user");
  await p.click("button:has-text('Згенерувати')");
  const gen = await p.inputValue("#password");
  ok(gen.length === 15 && /[a-z]/.test(gen) && /[A-Z]/.test(gen) && /\d/.test(gen), `кнопка «Згенерувати» — пароль із 15 символів (${gen})`);
  await p.fill("#password", "test12345");
  await p.click("button[aria-pressed]:has-text('Маркетолог')");
  await p.click("[role=radio]:has-text('Керівник відділу')");
  await p.click("button:has-text('Реклама — усе')");
  await Promise.all([p.waitForURL(/\/admin\/people\/[a-z0-9]+\?saved=1/), p.click("button:has-text('Створити працівника')")]);
  const u = one("select id, level from User where login='test.user'");
  ok(u?.level === 3, "створено працівника рівня 3");
  ok(one("select count(*) n from DirectionGrant where userId=? and directionId=?", u.id, dir("Реклама")).n === 1, "надано доступ до напряму «Реклама»");
  ok(one("select count(*) n from UserRole ur join Role r on r.id=ur.roleId where ur.userId=? and r.name='Маркетолог'", u.id).n === 1, "надано роль «Маркетолог»");

  await p.goto(`${BASE}/admin/dictionaries`);
  await p.fill("input[placeholder='Нова мережа']", "Telegram Ads");
  await Promise.all([p.waitForResponse((r) => r.request().method() === "POST"), p.press("input[placeholder='Нова мережа']", "Enter")]);
  await p.waitForTimeout(400);
  ok(!!one("select id from Subtype where name='Telegram Ads'"), "нову рекламну мережу збережено");
  await p.goto(`${BASE}/tasks/new`);
  await p.click("[role=radio]:has-text('Реклама')");
  await p.click("#subtypeId");
  ok((await p.locator("[role=option]:has-text('Telegram Ads')").count()) === 1, "нова мережа одразу є в картці задачі");
  await p.keyboard.press("Escape");
  await p.screenshot({ path: `${SHOTS}/task-form.png`, fullPage: true });
}

// ───────── доски: создание и удаление админом ─────────
console.log("Дошки: створення й видалення");
{
  const p = admin.page;
  await p.goto(`${BASE}/boards`);
  await p.click("button:has-text('Нова дошка')");
  await p.fill("input[aria-label='Назва дошки']", "E2E дошка");
  await Promise.all([p.waitForURL(/\/boards\/[a-z0-9]+$/), p.click("button:has-text('Створити дошку')")]);
  const bid = p.url().split("/").pop();
  ok(one("select count(*) n from BoardColumn where projectId=?", bid).n === 5, "дошку створено зі стандартними колонками");
  // задача на доске, чтобы удаление было «с содержимым»
  await p.goto(`${BASE}/tasks/new?project=${bid}`);
  await p.fill("#title", "E2E: задача на дошці, що видаляється");
  await p.click("[role=radio]:has-text('Айті')");
  await pick(p, "assigneeId", "Юра Поляков");
  await Promise.all([p.waitForURL((u) => /\/tasks\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")), p.click("button:has-text('Створити задачу')")]);
  ok(one("select creatorId from Project where id=?", bid).creatorId === one("select id from User where login='admin'").id, "у дошки записано творця");
  // редактирование доски: название, описание, доступ
  await p.goto(`${BASE}/boards/${bid}`);
  await p.click("button:has-text('Змінити дошку')");
  await p.fill(`#bn-${bid}`, "E2E дошка 2");
  await p.fill(`#bd-${bid}`, "Опис з e2e");
  await p.click("[role=dialog] button:has-text('Усі працівники')");
  await Promise.all([p.waitForResponse((r) => r.request().method() === "POST"), p.click("[role=dialog] button:has-text('Зберегти')")]);
  await p.waitForTimeout(500);
  const eb = one("select name, description, accessAll from Project where id=?", bid);
  ok(eb.name === "E2E дошка 2" && eb.description === "Опис з e2e" && eb.accessAll === 1, "адмін змінив назву, опис і доступ дошки");
  ok((await p.locator("[role=dialog]").count()) === 0 && (await p.locator("h1:has-text('E2E дошка 2')").count()) === 1, "вікно закрилося, нова назва на сторінці");
  // не создатель и не админ — кнопки нет, а сервер отказывает
  await ivan.page.goto(`${BASE}/boards/${bid}`);
  ok((await ivan.page.locator("button:has-text('Змінити дошку')").count()) === 0, "виконавець (не творець) не бачить «Змінити дошку»");
  // создатель-не-админ: делаем Ивана создателем — кнопка появляется
  { const w = new Database("prisma/dev.db"); w.prepare("update Project set creatorId=(select id from User where login='ivan') where id=?").run(bid); w.close(); }
  await ivan.page.goto(`${BASE}/boards/${bid}`);
  ok((await ivan.page.locator("button:has-text('Змінити дошку')").count()) === 1, "творець дошки бачить «Змінити дошку»");
  await ivan.page.click("button:has-text('Змінити дошку')");
  await ivan.page.fill(`#bn-${bid}`, "E2E дошка");
  await ivan.page.click("[role=dialog] button:has-text('Лише вибрані')");
  await Promise.all([ivan.page.waitForResponse((r) => r.request().method() === "POST"), ivan.page.click("[role=dialog] button:has-text('Зберегти')")]);
  await ivan.page.waitForTimeout(500);
  ok(one("select name from Project where id=?", bid).name === "E2E дошка", "творець перейменував дошку");
  ok(!!one("select 1 x from ProjectMember m join User u on u.id=m.userId where m.projectId=? and u.login='ivan'", bid), "творець лишається в доступі, навіть якщо не позначив себе");
  ok((await ivan.page.locator("button:has-text('Видалити дошку')").count()) === 0, "видаляти дошку творець-не-адмін не може");
  await p.goto(`${BASE}/boards/${bid}`);
  await p.click("button:has-text('Видалити дошку')");
  ok(await p.locator("button:has-text('Видалити назавжди')").isDisabled(), "без назви видалити не можна");
  await p.fill(`#confirm-${bid}`, "E2E дошка");
  await Promise.all([p.waitForURL(`${BASE}/boards`), p.click("button:has-text('Видалити назавжди')")]);
  ok(!one("select id from Project where id=?", bid) && !one("select id from Task where title='E2E: задача на дошці, що видаляється'"), "дошку видалено разом із задачами");
  const iv = await ivan.page.goto(`${BASE}/boards`);
  ok(iv.status() === 200 && (await ivan.page.locator("button:has-text('Нова дошка')").count()) === 0, "у виконавця немає кнопки «Нова дошка»");
}

// ───────── автоматически «В работе» ─────────
console.log("Автостатус «В роботі»");
{
  // админ ставит задачу Ивану — она попадает в «Идею»
  await admin.page.goto(`${BASE}/tasks/new`);
  await admin.page.fill("#title", "E2E: автостатус");
  await pick(admin.page, "projectId", "Мобільний застосунок");
  await admin.page.click("[role=radio]:has-text('Айті')");
  await pick(admin.page, "assigneeId", "Іван Ткаченко");
  await admin.page.click("[role=radio]:has-text('Поки ідея')");
  await Promise.all([admin.page.waitForURL((u) => /\/tasks\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")), admin.page.click("button:has-text('Створити задачу')")]);
  const t = { id: admin.page.url().split("/").pop() };
  ok(one("select c.name from Task t join BoardColumn c on c.id=t.columnId where t.id=?", t.id).name === "Ідея", "нова задача — в «Ідеї»; автор (не виконавець) відкрив — статус той самий");
  await ivan.page.goto(`${BASE}/tasks/${t.id}`);
  ok(one("select c.name from Task t join BoardColumn c on c.id=t.columnId where t.id=?", t.id).name === "В роботі", "виконавець відкрив задачу з «Ідеї» — вона «В роботі»");
  ok(!!one("select id from TaskEvent where taskId=? and toValue like '%автоматично%'", t.id), "в історії — «(автоматично)»");
  ok(!!one("select id from Notification where taskId=? and userId=? and type='status'", t.id, uid("admin")), "автор отримав «взяв(ла) в роботу»");
  const own = one("select t.id from Task t join BoardColumn c on c.id=t.columnId where c.sortOrder=0 and t.assigneeId<>? and t.archivedAt is null and t.completedAt is null limit 1", uid("admin"));
  await admin.page.goto(`${BASE}/tasks/${own.id}`);
  ok(one("select c.sortOrder s from Task t join BoardColumn c on c.id=t.columnId where t.id=?", own.id).s === 0, "не виконавець відкрив — статус не змінюється");
}

// исполнитель сдаёт на проверку с комментарием, постановщик принимает
console.log("Перевірка і приймання");
{
  await admin.page.goto(`${BASE}/tasks/new`);
  await admin.page.fill("#title", "E2E: здати й прийняти");
  await pick(admin.page, "projectId", "Мобільний застосунок");
  await admin.page.click("[role=radio]:has-text('Айті')");
  await pick(admin.page, "assigneeId", "Іван Ткаченко");
  await Promise.all([admin.page.waitForURL((u) => /\/tasks\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")), admin.page.click("button:has-text('Створити задачу')")]);
  const id = admin.page.url().split("/").pop();
  await ivan.page.goto(`${BASE}/tasks/${id}`);
  await ivan.page.click("button[aria-label='Статус']");
  const opts = (await ivan.page.locator("[role=option]").allInnerTexts()).map((x) => x.trim());
  ok(opts.length === 3 && opts.some((o) => o.includes("Чекає відповіді")) && opts.some((o) => o.includes("Перевірка")) && !opts.some((o) => o.includes("Готово")), `виконавцю доступні лише «Чекає відповіді» і «Перевірка» (${opts.join(", ")})`);
  await ivan.page.click("[role=option]:has-text('Перевірка')");
  await ivan.page.fill("textarea[aria-label='Коментар до зміни статусу']", "зробив, перевірте посилання в описі");
  await ivan.page.click("button:has-text('Змінити на «Перевірка»')");
  await ivan.page.waitForTimeout(900);
  ok(one("select c.name from Task t join BoardColumn c on c.id=t.columnId where t.id=?", id).name === "Перевірка", "виконавець здав на «Перевірку»");
  const rv = one("select text from Notification where taskId=? and userId=? and type='review'", id, uid("admin"));
  ok(!!rv && rv.text.includes("Потрібно перевірити виконання") && rv.text.includes("зробив, перевірте посилання"), "постановнику — «потрібно перевірити» разом із коментарем");
  ok(!!one("select id from Comment where taskId=? and text like 'зробив, перевірте%'", id), "коментар збережено в задачі");
  ok(!one("select completedAt from Task where id=?", id).completedAt, "задачу ще не виконано");
  await admin.page.goto(`${BASE}/tasks/${id}`);
  await admin.page.click("button[aria-label='Статус']");
  await admin.page.click("[role=option]:has-text('Готово')");
  await admin.page.click("button:has-text('Змінити на «Готово»')");
  await admin.page.waitForTimeout(900);
  ok(!!one("select completedAt from Task where id=?", id).completedAt, "постановник поставив «Готово» — задачу виконано");
  ok(!!one("select id from Notification where taskId=? and userId=? and type='accepted'", id, uid("ivan")), "виконавцю — «задачу прийнято»");
}

// по умолчанию новая задача — сразу «В работе»
{
  await admin.page.goto(`${BASE}/tasks/new`);
  await admin.page.fill("#title", "E2E: одразу в роботу");
  await pick(admin.page, "projectId", "Мобільний застосунок");
  await admin.page.click("[role=radio]:has-text('Айті')");
  await pick(admin.page, "assigneeId", "Юра Поляков");
  await Promise.all([admin.page.waitForURL((u) => /\/tasks\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")), admin.page.click("button:has-text('Створити задачу')")]);
  const id = admin.page.url().split("/").pop();
  ok(one("select c.name from Task t join BoardColumn c on c.id=t.columnId where t.id=?", id).name === "В роботі", "нова задача за замовчуванням одразу «В роботі»");
}

// ───────── доступ к доскам ─────────
console.log("Доступ до дошок");
{
  const law = one("select id from Project where name='Внутрішні процеси'");
  ok((await ivan.page.goto(`${BASE}/boards/${law.id}`)).status() === 404, "закрита дошка без доступу — 404");
  await ivan.page.goto(`${BASE}/boards`);
  ok((await ivan.page.locator(`a[href='/boards/${law.id}']`).count()) === 0, "закритої дошки немає в списку");
  // задача на закрытой доске, где исполнитель без доступа (как креатив) — свою видит
  const own = one("select t.id, t.assigneeId from Task t where t.projectId=? and t.archivedAt is null and t.assigneeId not in (select userId from ProjectMember where projectId=?) and t.assigneeId<>? limit 1", law.id, law.id, uid("admin"));
  if (own) {
    const login = one("select login from User where id=?", own.assigneeId).login;
    const u = await as(login);
    ok((await u.page.goto(`${BASE}/tasks/${own.id}`)).status() === 200, `виконавець без доступу до дошки бачить свою задачу (${login})`);
    ok((await u.page.goto(`${BASE}/boards/${law.id}`)).status() === 404, "…але не саму дошку");
    await u.ctx.close();
  }
  // руководитель отдела без доступа к доске не видит задачи отдела на ней
  const devTask = one("select id from Task where projectId=? and directionId=? and assigneeId<>? and creatorId<>? and archivedAt is null limit 1", law.id, dir("Розробка"), uid("vika"), uid("vika"));
  if (devTask) {
    const vika = await as("vika");
    const r = await vika.page.goto(`${BASE}/tasks/${devTask.id}`);
    const involved = one("select count(*) n from Watcher where taskId=? and userId=?", devTask.id, uid("vika")).n + one("select count(*) n from TaskMention where taskId=? and userId=?", devTask.id, uid("vika")).n;
    if (!involved) ok(r.status() === 404, "керівник відділу не бачить задачі свого відділу на закритій дошці");
    await vika.ctx.close();
  }
  // админ открывает доступ Ивану
  await admin.page.goto(`${BASE}/boards/${law.id}`);
  await admin.page.click("button:has-text('Змінити дошку')");
  await admin.page.click("[role=dialog] button:has-text('Іван Ткаченко')");
  await admin.page.click("[role=dialog] button:has-text('Зберегти')");
  await admin.page.waitForTimeout(800);
  ok((await ivan.page.goto(`${BASE}/boards/${law.id}`)).status() === 200, "після надання доступу Іван бачить дошку");
}

// ───────── отчёт по всем сотрудникам ─────────
console.log("Звіт по всіх");
{
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Kyiv" }).format(new Date());
  const from = today.slice(0, 8) + "01";
  await admin.page.goto(`${BASE}/reports?user=all&from=${from}&to=${today}`);
  ok((await admin.page.locator("th:text-is('Статус')").count()) === 1 && (await admin.page.locator("text=прострочено").count()) > 0, "попередній перегляд: Працівник / Статус (з «прострочено») / Задача / Дедлайн");
  const r = await admin.page.request.get(`${BASE}/api/reports/pdf?user=all&from=${from}&to=${today}`);
  const body = await r.body();
  ok(r.status() === 200 && body.subarray(0, 4).toString() === "%PDF", `PDF по всіх працівниках (${Math.round(body.length / 1024)} КБ)`);
  const m = await as("maks");
  await m.page.goto(`${BASE}/reports?user=all&from=${from}&to=${today}`);
  const names = await m.page.locator("tbody td:first-child").allInnerTexts();
  const shown = [...new Set(names.filter(Boolean))];
  ok(shown.length > 0 && shown.every((n) => ["Максим Шевчук", "Тимур Савченко", "Саша Гончар"].includes(n)), `керівник групи бачить у звіті лише свою групу (${shown.join(", ")})`);
  await m.ctx.close();
}

// ───────── черновики: задача и доска ─────────
console.log("Чернетки");
{
  const p = admin.page;
  await p.goto(`${BASE}/tasks/new`);
  await p.fill("#title", "E2E чернетка задачі");
  await Promise.all([p.waitForURL(/\/drafts\?saved=1/), p.click("button:has-text('Зберегти чернетку')")]);
  const dr = one("select id from Draft where title='E2E чернетка задачі'");
  ok(!!dr, "чернетку задачі збережено без виконавця і проєкту");
  ok(!one("select id from Task where title='E2E чернетка задачі'"), "чернетка — не задача (нікому не видна)");
  await p.goto(`${BASE}/tasks/new?draft=${dr.id}`);
  ok((await p.inputValue("#title")) === "E2E чернетка задачі", "чернетка відкривається із заповненими полями");

  // доска прямо из формы задачи, черновиком
  await p.click("button:has-text('+ Нова дошка')");
  await p.fill("input[aria-label='Назва нової дошки']", "E2E інлайн дошка");
  await p.check("text=чернетка — поки бачать лише адміни");
  await p.click("button:has-text('Створити дошку')");
  await p.waitForSelector("#projectId:has-text('E2E інлайн дошка')");
  const nb = one("select id, isDraft from Project where name='E2E інлайн дошка'");
  ok(nb?.isDraft === 1, "дошку створено з форми задачі й одразу вибрано (чернетка)");
  await p.click("[role=radio]:has-text('Айті')");
  await pick(p, "assigneeId", "Іван Ткаченко");
  await Promise.all([p.waitForURL((u) => /\/tasks\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")), p.click("button:has-text('Створити задачу')")]);
  const tid = p.url().split("/").pop();
  ok(!one("select id from Draft where id=?", dr.id), "після створення задачі чернетку видалено");
  ok(!one("select id from Notification where taskId=? and userId=?", tid, uid("ivan")), "щодо дошки-чернетки сповіщення не пішло");
  ok((await ivan.page.goto(`${BASE}/tasks/${tid}`)).status() === 404, "виконавець не бачить задачу на дошці-чернетці");
  ok((await ivan.page.goto(`${BASE}/boards/${nb.id}`)).status() === 404, "виконавець не бачить дошку-чернетку");
  await p.goto(`${BASE}/boards/${nb.id}`);
  await p.click("button:has-text('Опублікувати дошку')");
  await p.waitForTimeout(800);
  ok((await ivan.page.goto(`${BASE}/tasks/${tid}`)).status() === 200, "після публікації виконавець бачить задачу");
  ok(!!one("select id from Notification where taskId=? and userId=? and type='assigned'", tid, uid("ivan")), "під час публікації виконавцю пішло сповіщення");
}

// ───────── Креатив назначает другому → запрос → админ одобряет ─────────
console.log("Запити");
{
  const anna = await as("anna");
  const p = anna.page;
  await p.goto(`${BASE}/tasks/new`);
  await p.fill("#title", "E2E: вихідники логотипа");
  await pick(p, "projectId", "Сайт компанії");
  await p.click("[role=radio]:has-text('Розробка')");
  await pick(p, "assigneeId", "Іван Ткаченко");
  await p.waitForSelector("text=Задача піде адміну на підтвердження");
  ok(true, "форма попереджає про підтвердження");
  await Promise.all([p.waitForURL(/\/requests\?sent=/), p.click("button:has-text('Надіслати на підтвердження')")]);
  const req = one("select id, type, status from Request where payload like '%E2E: вихідники логотипа%'");
  ok(req?.type === "ASSIGN" && req.status === "PENDING", "призначення від Креативу пішло адміну (ASSIGN, PENDING)");
  ok(!one("select id from Task where title='E2E: вихідники логотипа'"), "задачу до схвалення не створено");
  await anna.ctx.close();

  await admin.page.goto(`${BASE}/requests`);
  const card = admin.page.locator("article", { hasText: "E2E: вихідники логотипа" });
  await card.locator("button:has-text('Схвалити')").click();
  await admin.page.waitForTimeout(800);
  const t = one("select assigneeId, creatorId from Task where title='E2E: вихідники логотипа'");
  ok(t?.assigneeId === uid("ivan") && t.creatorId === uid("anna"), "після схвалення задачу створено на Івана від Анни");
  await admin.page.screenshot({ path: `${SHOTS}/requests.png`, fullPage: true });

  // изменить и одобрить: админ правит задачу из запроса
  const pend = one("select id from Request where status='PENDING' and payload like '%спільну поштову скриньку%'");
  await admin.page.goto(`${BASE}/requests/${pend.id}/edit`);
  ok((await admin.page.inputValue("#title")).includes("спільну поштову скриньку"), "«Змінити й схвалити»: форму заповнено даними запиту");
  await admin.page.fill("#title", "Налаштувати спільну поштову скриньку (правка адміна)");
  await admin.page.fill("#decisionNote", "строк переніс на завтра");
  await Promise.all([admin.page.waitForURL((u) => /\/tasks\/[a-z0-9]+$/.test(u.pathname)), admin.page.click("button:has-text('Схвалити з правками')")]);
  const edited = one("select t.id, t.creatorId from Task t where t.title='Налаштувати спільну поштову скриньку (правка адміна)'");
  ok(!!edited && edited.creatorId === uid("yura"), "задачу створено з правками, автор — той, хто просив");
  ok(one("select status from Request where id=?", pend.id).status === "APPROVED", "запит позначено схваленим");
  ok(!!one("select id from Notification where userId=? and text like 'Схвалено з правками%'", uid("yura")), "автору пішло «Схвалено з правками»");
}

// ───────── уровень 1 ставит себе, двигает в «Готово», упоминает коллегу ─────────
console.log("Своя задача, статус, згадка");
{
  const p = ivan.page;
  await p.goto(`${BASE}/tasks/new`);
  await p.fill("#title", "E2E: своя задача");
  await pick(p, "projectId", "Мобільний застосунок");
  await p.click("[role=radio]:has-text('Айті')");
  await p.click("[role=radio]:has-text('Маркетинг')");
  await Promise.all([p.waitForURL((u) => /\/tasks\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith("/new")), p.click("button:has-text('Створити задачу')")]);
  const id = p.url().split("/").pop();
  ok(one("select assigneeId from Task where id=?", id)?.assigneeId === uid("ivan"), "рівень 1 поставив задачу собі одразу");
  ok(one("select business from Task where id=?", id)?.business === "Маркетинг", "вид роботи «Маркетинг» збережено");
  ok((await p.locator("main span:text-is('Маркетинг')").count()) >= 1, "вид роботи видно на картці");
  // свой вид работы, вписанный вручную
  await p.goto(`${BASE}/tasks/${id}/edit`);
  await p.click("[role=radio]:has-text('Свій')");
  await p.fill("input[aria-label='Свій вид роботи']", "Партнери");
  await Promise.all([p.waitForURL((u) => u.pathname === `/tasks/${id}`), p.click("button:has-text('Зберегти')")]);
  ok(one("select business from Task where id=?", id)?.business === "Партнери", "свій вид роботи вписується вручну");
  await p.click("button:has-text('Через годину')");
  await p.waitForSelector("text=Нагадаю");
  const rem = one("select remindAt from Reminder where taskId=? and userId=?", id, uid("ivan"));
  ok(!!rem && Math.abs(Date.parse(rem.remindAt) - Date.now() - 3600_000) < 120_000, "«⏰ Через годину» — нагадування поставлено");
  await p.click("button[aria-label='Статус']");
  await p.click("[role=option]:has-text('Готово')");
  await p.click("button:has-text('Змінити на «Готово»')");
  await p.waitForTimeout(900);
  ok(!!one("select completedAt from Task where id=?", id)?.completedAt, "колонка «Готово» = виконано");
  await p.fill("textarea[name=text]", "Потрібна допомога @kat");
  await p.waitForSelector("[role=listbox][aria-label='Згадати']");
  await p.keyboard.press("Enter");
  ok((await p.inputValue("textarea[name=text]")).includes("@kate "), "підказка доповнила @kate");
  await Promise.all([p.waitForResponse((r) => r.request().method() === "POST"), p.click("button:has-text('Надіслати')")]);
  await p.waitForTimeout(500);
  const kate = await as("kate");
  ok((await kate.page.goto(`${BASE}/tasks/${id}`)).status() === 200, "згадана колега бачить задачу");
  await kate.ctx.close();
}

// ───────── подзадачи и ежедневные задачи ─────────
console.log("Підзадачі й щоденні задачі");
{
  const parent = one("select id from Task where title like 'Запуск продукту:%'");
  await admin.page.goto(`${BASE}/tasks/${parent.id}`);
  const h = await admin.page.textContent("h2:has-text('Підзадачі')");
  ok(/Підзадачі · 1 з 4/.test(h), `прогрес батьківської рахується автоматично (${h?.trim()})`);
  await admin.page.screenshot({ path: `${SHOTS}/task-parent.png`, fullPage: true });
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Kyiv" }).format(new Date());
  const rec = one("select count(*) n from Task t join RecurringTask r on r.id=t.recurringId where r.title='Звіт по рекламі' and t.recurringDay=?", today);
  ok(rec.n === 1, "картку щоденної задачі на сьогодні створено автоматично (одну)");
  await admin.page.goto(`${BASE}/recurring`);
  await admin.page.screenshot({ path: `${SHOTS}/recurring.png`, fullPage: true });
}

// ───────── доска: перетаскивание ─────────
console.log("Дошка");
{
  const p = admin.page;
  const proj = one("select id from Project where name='Сайт компанії'");
  await p.goto(`${BASE}/boards/${proj.id}`);
  await p.screenshot({ path: `${SHOTS}/board.png` });
  const target = one("select id from BoardColumn where projectId=? and name='Чекає відповіді'", proj.id);
  const src = one(
    "select t.id from Task t join BoardColumn c on c.id=t.columnId where t.projectId=? and c.name in ('Ідея','В роботі') and t.archivedAt is null order by c.sortOrder, t.position limit 1",
    proj.id,
  );
  if (src) {
    const card = p.locator(`a[href='/tasks/${src.id}']`).first();
    const col = p.locator("section", { has: p.locator("h2", { hasText: /^Чекає відповіді$/ }) }).first();
    const a = await card.boundingBox();
    const b = await col.boundingBox();
    await p.mouse.move(a.x + a.width / 2, a.y + 20);
    await p.mouse.down();
    await p.mouse.move(a.x + a.width / 2 + 10, a.y + 30, { steps: 5 });
    await p.mouse.move(b.x + b.width / 2, b.y + 90, { steps: 25 });
    await p.mouse.up();
    await p.waitForTimeout(1200);
    ok(one("select columnId from Task where id=?", src.id).columnId === target.id, "картку перетягнуто в «Чекає відповіді»");
  } else ok(false, "немає картки для перетягування");
  // доска «по статусам» во «Всех задачах»: задачи разных проектов, перенос по названию колонки
  await p.goto(`${BASE}/tasks?view=board`);
  const card2 = p.locator("section:has(h2:text-is('Ідея')) a[href^='/tasks/']").first();
  const tid = (await card2.getAttribute("href")).split("/").pop();
  const col2 = p.locator("section", { has: p.locator("h2", { hasText: /^Чекає відповіді$/ }) }).first();
  const a2 = await card2.boundingBox();
  const b2 = await col2.boundingBox();
  await p.mouse.move(a2.x + a2.width / 2, a2.y + 20);
  await p.mouse.down();
  await p.mouse.move(a2.x + a2.width / 2 + 10, a2.y + 30, { steps: 5 });
  await p.mouse.move(b2.x + b2.width / 2, b2.y + 90, { steps: 25 });
  await p.mouse.up();
  await p.waitForTimeout(1200);
  ok(one("select c.name from Task t join BoardColumn c on c.id=t.columnId where t.id=?", tid)?.name === "Чекає відповіді", "«Усі задачі» → Дошка: перетягування змінює статус");
  ok((await p.locator("text=Перетягуйте картки мишею").count()) === 1, "підказку про перетягування видно");
  await p.goto(`${BASE}/`);
  await p.screenshot({ path: `${SHOTS}/admin-dashboard.png`, fullPage: true });
  await p.goto(`${BASE}/stats`);
  await p.screenshot({ path: `${SHOTS}/stats.png`, fullPage: true });
  await p.goto(`${BASE}/admin/people/${uid("vika")}`);
  await p.screenshot({ path: `${SHOTS}/person.png`, fullPage: true });
}

// ───────── PDF-отчёт по сотруднику ─────────
console.log("Звіти");
{
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Kyiv" }).format(new Date());
  const from = today.slice(0, 8) + "01";
  const q = (login) => `user=${uid(login)}&from=${from}&to=${today}`;
  await admin.page.goto(`${BASE}/reports`);
  await pick(admin.page, "user", "Тимур Савченко");
  await admin.page.click("button:has-text('Цей місяць')");
  await Promise.all([admin.page.waitForURL(/\/reports\?user=/), admin.page.click("button:has-text('Показати звіт')")]);
  ok((await admin.page.locator("text=Завантажити PDF").count()) === 1, "форма звіту показує попередній перегляд");
  const r = await admin.page.request.get(`${BASE}/api/reports/pdf?${q("tim")}`);
  const body = await r.body();
  ok(r.status() === 200 && r.headers()["content-type"] === "application/pdf" && body.subarray(0, 4).toString() === "%PDF", `адмін завантажує PDF (${Math.round(body.length / 1024)} КБ)`);
  ok((await admin.page.request.get(`${BASE}/api/reports/pdf?user=${uid("tim")}&from=${today}&to=2020-01-01`)).status() === 400, "неправильний період — 400");
  const maks = await as("maks");
  ok((await maks.page.request.get(`${BASE}/api/reports/pdf?${q("tim")}`)).status() === 200, "керівник групи — звіт по підлеглому");
  ok((await maks.page.request.get(`${BASE}/api/reports/pdf?${q("ivan")}`)).status() === 404, "керівник групи — не щодо чужого працівника");
  await maks.ctx.close();
  ok((await ivan.page.request.get(`${BASE}/api/reports/pdf?${q("ivan")}`)).status() === 404, "виконавцю звіти недоступні");
}

// ───────── вложения: чужим — 404 ─────────
console.log("Вкладення");
{
  const own = one("select id from Task where assigneeId=? and recurringId is null and archivedAt is null limit 1", uid("tim"));
  await admin.page.goto(`${BASE}/tasks/${own.id}`);
  writeFileSync(`${SHOTS}/e2e-file.txt`, "секретний звіт");
  await admin.page.setInputFiles("input[type=file][name=files]", `${SHOTS}/e2e-file.txt`);
  await admin.page.waitForSelector("text=e2e-file.txt");
  const att = one("select id from Attachment where taskId=? order by createdAt desc", own.id);
  const r1 = await admin.page.request.get(`${BASE}/api/files/${att.id}`);
  ok(r1.status() === 200, "адмін завантажує вкладення");
  const r2 = await ivan.page.request.get(`${BASE}/api/files/${att.id}`);
  ok(r2.status() === 404, "чужий виконавець отримує 404 за прямим запитом до файлу");
}

{
  const big = `${SHOTS}/e2e-5mb.bin`;
  writeFileSync(big, Buffer.alloc(5 * 1024 * 1024, 7));
  const own = one("select id from Task where assigneeId=? and recurringId is null and archivedAt is null limit 1", uid("tim"));
  await admin.page.goto(`${BASE}/tasks/${own.id}`);
  await admin.page.setInputFiles("input[type=file][name=files]", big);
  await admin.page.waitForSelector("text=e2e-5mb.bin", { timeout: 20000 }).catch(() => {});
  ok(!!one("select id from Attachment where fileName='e2e-5mb.bin'"), "файл на 5 МБ завантажується");
}

console.log("Зміна пароля");
{
  const a = await as("oleg");
  const b = await as("oleg");
  await b.page.goto(`${BASE}/profile`);
  await b.page.fill("#current", "demo12345");
  await b.page.fill("#next", "new-pass-123");
  await b.page.click("form:has(#next) button:has-text('Зберегти')");
  await b.page.waitForSelector("text=пароль змінено");
  await a.page.goto(`${BASE}/my`);
  ok(a.page.url().endsWith("/login"), "зміна пароля викидає з інших пристроїв");
  await b.page.goto(`${BASE}/my`);
  ok(b.page.url().endsWith("/my"), "поточний пристрій лишається в системі");
  await b.page.goto(`${BASE}/profile`);
  await b.page.fill("#current", "new-pass-123");
  await b.page.fill("#next", "demo12345");
  await b.page.click("form:has(#next) button:has-text('Зберегти')");
  await b.page.waitForSelector("text=пароль змінено");
  await a.ctx.close();
  await b.ctx.close();
}

// ───────── отключение: мгновенный отзыв доступа ─────────
console.log("Відкликання доступу");
{
  const victim = await as("yura");
  await admin.page.goto(`${BASE}/admin/people/${uid("yura")}`);
  await admin.page.click("[role=switch]:has-text('Доступ увімкнено')");
  await Promise.all([admin.page.waitForURL(/saved=1/), admin.page.click("button:has-text('Зберегти')")]);
  await victim.page.goto(`${BASE}/my`);
  ok(victim.page.url().endsWith("/login"), "вимкненого працівника одразу викинуто");
  await victim.ctx.close();
}


// ───────── «засчитать в срок» ─────────
console.log("Зарахувати вчасно");
{
  const late = one(
    "select t.id from Task t join Project p on p.id=t.projectId join User c on c.id=t.creatorId where c.login='admin' and t.completedAt is null and t.archivedAt is null and t.recurringId is null and p.isDraft=0 and t.deadline < ? order by t.deadline limit 1",
    new Date().toISOString().replace("Z", "+00:00"),
  );
  ok(!!late, "є прострочена відкрита задача адміна");
  if (late) {
    const p = admin.page;
    await p.goto(`${BASE}/tasks/${late.id}`);
    await p.click("button[aria-label='Статус']");
    await p.click("[role=option]:has-text('Готово')");
    ok((await p.locator("text=Зарахувати вчасно").count()) >= 1, "під час закриття простроченої — галочка «Зарахувати вчасно»");
    await p.click("label:has-text('Зарахувати вчасно') input[type=checkbox]");
    await p.click("button:has-text('Змінити на «Готово»')");
    await p.waitForTimeout(900);
    const t = one("select completedAt, lateOk from Task where id=?", late.id);
    ok(!!t.completedAt && t.lateOk === 1, "закрита й зарахована вчасно");
    await p.goto(`${BASE}/tasks/${late.id}`);
    ok((await p.locator("text=зараховано вчасно").count()) >= 1, "у картці — «зараховано вчасно»");
    // отчёт: строка этой задачи без опоздания
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Kyiv" }).format(new Date());
    await p.goto(`${BASE}/reports?user=all&from=${today}&to=${today}`);
    const row = p.locator(`tr:has(a[href='/tasks/${late.id}'])`);
    const st = await row.locator("td").nth(1).innerText();
    const cls = (await row.locator("td").nth(1).getAttribute("class")) ?? "";
    ok(/Готово/.test(st) && cls.includes("15803d"), `у звіті — «${st}» зеленим, без «із запізненням»`);
    // отменить и снова засчитать — кнопкой в карточке
    await p.goto(`${BASE}/tasks/${late.id}`);
    await p.click("button:has-text('Скасувати «вчасно»')");
    await p.waitForTimeout(700);
    ok(one("select lateOk from Task where id=?", late.id).lateOk === 0, "позначку можна зняти");
    await p.click("button:has-text('Зарахувати вчасно')");
    await p.waitForTimeout(700);
    ok(one("select lateOk from Task where id=?", late.id).lateOk === 1, "і поставити кнопкою в закритої задачі");
    // исполнитель (не постановщик) кнопки не видит
    const asg = one("select u.login from Task t join User u on u.id=t.assigneeId where t.id=?", late.id).login;
    if (asg !== "admin") {
      const w = await as(asg);
      await w.page.goto(`${BASE}/tasks/${late.id}`);
      ok((await w.page.locator("button:has-text('Скасувати «вчасно»'), button:has-text('Зарахувати вчасно')").count()) === 0, "виконавець не може зарахувати сам собі");
      await w.ctx.close();
    }
  }
}


// ───────── рабочий день: место, начало, конец ─────────
console.log("Робочий день");
{
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Kyiv" }).format(new Date());
  const p = ivan.page;
  await p.goto(`${BASE}/`);
  ok((await p.locator("text=Робочий день не розпочато").count()) === 1, "на головній — «Робочий день не розпочато»");
  const lastPlace = one("select place from WorkDay w join User u on u.id=w.userId where u.login='ivan' order by startedAt desc limit 1")?.place;
  if (lastPlace) ok((await p.locator(`[role=radio][aria-checked=true]:has-text('${lastPlace}')`).count()) === 1, `підставлено минуле місце («${lastPlace}»)`);
  await p.screenshot({ path: `${SHOTS}/workday-start.png` });
  await p.click("[role=radiogroup][aria-label='Місце роботи'] button:has-text('Офіс 2')");
  await Promise.all([p.waitForResponse((r) => r.request().method() === "POST"), p.click("button:has-text('Початок дня')")]);
  await p.waitForTimeout(600);
  const w1 = one("select place, startedAt, endedAt from WorkDay w join User u on u.id=w.userId where u.login='ivan' and day=?", today);
  ok(w1?.place === "Офіс 2" && !!w1.startedAt && !w1.endedAt, "початок дня записано: Офіс 2, час");
  await p.goto(`${BASE}/`);
  ok((await p.locator("text=Робочий день триває").count()) === 1, "на головній — «Робочий день триває»");
  await p.click("button:has-text('Кінець дня')");
  await p.click("button:has-text('Так, кінець дня')");
  await p.waitForTimeout(900);
  const w2 = one("select endedAt from WorkDay w join User u on u.id=w.userId where u.login='ivan' and day=?", today);
  ok(!!w2?.endedAt, "кінець дня записано");
  await p.goto(`${BASE}/`);
  ok((await p.locator("text=Робочий день закрито").count()) === 1, "на головній — «Робочий день закрито»");
  // отчёты: по всем и по сотруднику
  await admin.page.goto(`${BASE}/reports?user=all&from=${today}&to=${today}`);
  const row = admin.page.locator("tr:has(td:text-is('Іван Ткаченко')):has(td:text-is('Офіс 2'))");
  ok((await row.count()) === 1, "у звіті по всіх — Іван · Офіс 2");
  await admin.page.goto(`${BASE}/reports?user=${uid("ivan")}&from=${today.slice(0, 8)}01&to=${today}`);
  ok((await admin.page.locator("h2:has-text('Робочі дні')").count()) === 1, "у звіті по працівнику — блок «Робочі дні»");
  const pdf = await admin.page.request.get(`${BASE}/api/reports/pdf?user=all&from=${today.slice(0, 8)}01&to=${today}`);
  ok(pdf.status() === 200 && (await pdf.body()).subarray(0, 4).toString() === "%PDF", "PDF по всіх із робочими днями збирається");
  // справочник мест
  await admin.page.goto(`${BASE}/admin/dictionaries`);
  ok((await admin.page.locator("input[aria-label='Назва місця']").count()) === 4, "в адмінці — 4 місця роботи");
}

// ───────── телефон ─────────
console.log("Телефон 390px");
{
  const m = await as("tim", { width: 390, height: 844 });
  for (const path of ["/my", "/", "/tasks"]) {
    await m.page.goto(`${BASE}${path}`);
    const w = await m.page.evaluate(() => document.documentElement.scrollWidth);
    ok(w <= 392, `${path}: без горизонтального скролу (${w}px)`);
  }
  await m.page.goto(`${BASE}/my`);
  await m.page.screenshot({ path: `${SHOTS}/mobile-my.png`, fullPage: true });
  const t = one("select id from Task where assigneeId=? and recurringId is null limit 1", uid("tim"));
  await m.page.goto(`${BASE}/tasks/${t.id}`);
  await m.page.screenshot({ path: `${SHOTS}/mobile-task.png`, fullPage: true });
  const proj = one("select projectId from Task where id=?", t.id).projectId;
  await m.page.goto(`${BASE}/boards/${proj}`);
  await m.page.screenshot({ path: `${SHOTS}/mobile-board.png` });
  await m.ctx.close();
}

await browser.close();
console.log(failed ? `\nПровалено: ${failed}` : "\nУсе пройшло");
process.exit(failed ? 1 : 0);
