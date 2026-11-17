/**
 * Проверка логики бота без Telegram: npx tsx scripts/bot-smoke.ts
 * Работает на КОПИИ prisma/dev.db, fetch подменён — все вызовы API записываются, наружу ничего не уходит.
 */
import { copyFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const copy = path.join(os.tmpdir(), `bot-smoke-${Date.now()}.db`);
copyFileSync("prisma/dev.db", copy);
process.env.DATABASE_URL = `file:${copy}`;
process.env.TELEGRAM_BOT_TOKEN = "TEST";
process.env.APP_URL = "https://tasks.example.com";

const calls: { method: string; body: Record<string, unknown> }[] = [];
globalThis.fetch = (async (url: string, init: { body: string }) => {
  const method = String(url).split("/").pop()!;
  const body = JSON.parse(init.body);
  calls.push({ method, body });
  const fail = body.chat_id === "403";
  return new Response(JSON.stringify(fail ? { ok: false, error_code: 403, description: "Forbidden: bot was blocked" } : { ok: true, result: { message_id: 1 } }));
}) as typeof fetch;

let failed = 0;
const ok = (c: unknown, m: string) => {
  console.log(`${c ? "  ✓" : "  ✗"} ${m}`);
  if (!c) failed++;
};

async function main() {
  const { db } = await import("@/lib/db");
  const { handleUpdate, queueReminders, sendPending } = await import("@/lib/telegram");
  const { ensureRecurringCore } = await import("@/lib/recurringCore");

  const tim = await db.user.findUniqueOrThrow({ where: { login: "tim" } });
  const maks = await db.user.findUniqueOrThrow({ where: { login: "maks" } });
  const msg = (chat: number, text: string, username?: string) => ({ update_id: 1, message: { chat: { id: chat, type: "private" }, from: { username }, text } });

  console.log("Прив’язка");
  await db.user.update({ where: { id: tim.id }, data: { tgLinkCode: "code-tim", telegramChatId: null } });
  await handleUpdate(db, msg(111, "/start code-tim"));
  const u = await db.user.findUniqueOrThrow({ where: { id: tim.id } });
  ok(u.telegramChatId === "111" && u.tgLinkCode === null, "/start <код> прив’язав чат і погасив код");
  ok(String(calls.at(-1)?.body.text).includes("Бот підключено"), "бот відповів «підключено»");
  await handleUpdate(db, msg(222, "/start code-tim"));
  ok(String(calls.at(-1)?.body.text).includes("застаріло"), "повторний код не працює");
  await db.user.update({ where: { id: maks.id }, data: { telegram: "@Maks_Real" } });
  await handleUpdate(db, msg(333, "/start", "maks_real"));
  ok((await db.user.findUniqueOrThrow({ where: { id: maks.id } })).telegramChatId === "333", "запасний шлях: прив'язка за @username з картки");
  await handleUpdate(db, msg(999, "/my"));
  ok(String(calls.at(-1)?.body.text).includes("не підключено"), "чужий чат не отримує задачі");

  console.log("Команди");
  await handleUpdate(db, msg(111, "/my"));
  ok(String(calls.at(-1)?.body.text).includes("Ваші відкриті задачі"), "/my показує задачі виконавця");

  console.log("Щоденні задачі й нагадування");
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Kyiv" }).format(new Date());
  const rec = await db.recurringTask.findFirstOrThrow({ where: { title: "Звіт по рекламі" } });
  await db.task.deleteMany({ where: { recurringId: rec.id, recurringDay: today } });
  // время срока ежедневной задачи — через 30 минут, напоминание за 60 → должно сработать сразу
  const soon = new Date(Date.now() + 30 * 60_000);
  const hhmm = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" }).format(soon);
  await db.recurringTask.update({ where: { id: rec.id }, data: { dueTime: hhmm, weekdays: "1234567", remindBefore: 60 } });
  const made = await ensureRecurringCore(db);
  ok(made >= 1, `картку щоденної задачі створено (${made})`);
  ok((await ensureRecurringCore(db)) === 0, "повторний виклик не дублює");
  const card = await db.task.findFirstOrThrow({ where: { recurringId: rec.id, recurringDay: today } });
  const q1 = await queueReminders(db);
  const q2 = await queueReminders(db);
  ok(q1 >= 1 && q2 === 0, `нагадування ставляться один раз (${q1}, потім ${q2})`);
  ok(!!(await db.notification.findFirst({ where: { type: "remind", taskId: card.id } })), "нагадування щодо щоденної задачі за remindBefore до строку");

  console.log("Розсилка");
  calls.length = 0;
  await sendPending(db);
  const toTim = calls.filter((c) => c.method === "sendMessage" && c.body.chat_id === "111");
  ok(toTim.length >= 2, `виконавцю пішли повідомлення (${toTim.length})`);
  const withDone = toTim.find((c) => JSON.stringify(c.body.reply_markup ?? {}).includes(`done:${card.id}`));
  ok(!!withDone, "у нагадування є кнопка «✅ Виконано»");
  ok(JSON.stringify(withDone?.body.reply_markup).includes("https://tasks.example.com/tasks/"), "і кнопка «Відкрити» з посиланням на сайт");
  ok((await db.notification.count({ where: { userId: tim.id, sentAt: null } })) === 0, "надіслані позначено");

  console.log("Кнопка «Виконано»");
  await handleUpdate(db, { update_id: 2, callback_query: { id: "cb", from: { id: 111 }, message: { chat: { id: 111 }, message_id: 5, text: "x" }, data: `done:${card.id}` } });
  const after = await db.task.findUniqueOrThrow({ where: { id: card.id }, include: { column: true } });
  ok(!!after.completedAt && after.column.isDone, "задача пішла в «Готово» і виконана");
  const foreign = await db.task.findFirstOrThrow({ where: { assigneeId: { not: tim.id }, completedAt: null } });
  await handleUpdate(db, { update_id: 3, callback_query: { id: "cb2", from: { id: 111 }, data: `done:${foreign.id}` } });
  ok(!(await db.task.findUniqueOrThrow({ where: { id: foreign.id } })).completedAt, "чужу задачу кнопкою закрити не можна");
  ok(/Немає (доступу|прав)/.test(String(calls.at(-1)?.body.text)), "відповідь «Немає доступу / немає прав»");

  console.log("Нагадування і зведення");
  await db.user.update({ where: { id: tim.id }, data: { telegramChatId: "111", notifyDigest: true } });
  const open = await db.task.findFirstOrThrow({ where: { assigneeId: tim.id, completedAt: null, archivedAt: null, recurringId: null } });
  await db.reminder.create({ data: { taskId: open.id, userId: tim.id, creatorId: maks.id, remindAt: new Date(Date.now() - 1000), note: "перевір ставки" } });
  await queueReminders(db);
  const rem = await db.notification.findFirst({ where: { type: "reminder", taskId: open.id, userId: tim.id } });
  ok(!!rem && rem.text.includes("від Максим") && rem.text.includes("перевір ставки"), "особисте нагадування від керівника потрапило в чергу");
  ok((await db.reminder.count({ where: { taskId: open.id, sentAt: null } })) === 0, "нагадування позначено надісланим");
  // срок вышел: задача с дедлайном час назад
  await db.task.update({ where: { id: open.id }, data: { deadline: new Date(Date.now() - 3600_000) } });
  await queueReminders(db);
  ok(!!(await db.notification.findFirst({ where: { type: "overdue", taskId: open.id, userId: tim.id } })), "«строк минув» — виконавцю");
  if (open.creatorId !== tim.id) ok(!!(await db.notification.findFirst({ where: { type: "overdue", taskId: open.id, userId: open.creatorId } })), "«прострочена» — тому, хто ставив");
  const before = await db.notification.count({ where: { type: "overdue" } });
  await queueReminders(db);
  ok((await db.notification.count({ where: { type: "overdue" } })) === before, "«строк минув» не повторюється");
  // утренняя сводка: 9:30 по Киеву
  const kyiv = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const { fromZoned } = await import("@/lib/time");
  const [y, mo, d] = kyiv.split("-").map(Number);
  const morning = fromZoned(y, mo, d, 9, 30);
  await queueReminders(db, morning);
  const dg = await db.notification.findFirst({ where: { type: "digest", userId: tim.id } });
  ok(!!dg && dg.text.includes("Доброго ранку") && dg.text.includes("Прострочено"), "ранкове зведення з простроченими");
  await queueReminders(db, morning);
  ok((await db.notification.count({ where: { type: "digest", userId: tim.id } })) === 1, "зведення — раз на день");
  calls.length = 0;
  await sendPending(db);
  const msgRem = calls.find((c) => c.method === "sendMessage" && String(c.body.text).includes("Нагадування"));
  ok(!!msgRem && String(msgRem.body.text).includes("<i>"), "у повідомленні — проєкт, строк, пріоритет");
  ok(JSON.stringify(msgRem?.body.reply_markup).includes(`snooze:${open.id}:60`), "кнопка «⏰ через 1 год»");

  console.log("Відкласти");
  await handleUpdate(db, { update_id: 4, callback_query: { id: "cb3", from: { id: 111 }, message: { chat: { id: 111 }, message_id: 7, text: "x" }, data: `snooze:${open.id}:60` } });
  const sn = await db.reminder.findFirst({ where: { taskId: open.id, userId: tim.id, sentAt: null } });
  ok(!!sn && Math.abs(sn.remindAt.getTime() - Date.now() - 3600_000) < 60_000, "«відкласти на годину» створив нагадування");
  ok(String(calls.find((c) => c.method === "answerCallbackQuery" && String(c.body.text).startsWith("Нагадаю"))?.body.text ?? "").length > 0, "бот відповів «Нагадаю за …»");
  const strangerTask = await db.task.findFirstOrThrow({ where: { assigneeId: { not: tim.id }, creatorId: { not: tim.id }, completedAt: null, watchers: { none: { userId: tim.id } } } });
  await handleUpdate(db, { update_id: 5, callback_query: { id: "cb4", from: { id: 111 }, data: `snooze:${strangerTask.id}:60` } });
  ok(!(await db.reminder.findFirst({ where: { taskId: strangerTask.id, userId: tim.id } })), "чужу задачу відкласти не можна");

  console.log("Без дублів");
  {
    await db.user.update({ where: { id: tim.id }, data: { telegramChatId: "111" } });
    await db.notification.updateMany({ where: { sentAt: null }, data: { sentAt: new Date() } });
    await db.notification.create({ data: { userId: tim.id, type: "status", text: "тест дубля" } });
    calls.length = 0;
    // две рассылки одновременно (таймер + ответ на кнопку) — сообщение должно уйти один раз
    await Promise.all([sendPending(db), sendPending(db), sendPending(db)]);
    ok(calls.filter((c) => c.method === "sendMessage" && String(c.body.text).includes("тест дубля")).length === 1, "одночасні розсилки не дублюють повідомлення");
  }

  console.log("Перевірка і приймання");
  await db.user.update({ where: { id: tim.id }, data: { telegramChatId: "111" } });
  await db.user.update({ where: { id: maks.id }, data: { telegramChatId: "333" } });
  const cols = await db.boardColumn.findMany({ where: { project: { name: "Сайт компанії" } }, orderBy: { sortOrder: "asc" } });
  const work = cols.find((c) => c.name === "В роботі")!;
  const job = await db.task.create({
    data: { title: "Smoke: здати на перевірку", projectId: work.projectId, columnId: work.id, directionId: (await db.direction.findFirstOrThrow({ where: { name: "Реклама" } })).id, assigneeId: tim.id, creatorId: maks.id },
  });
  const cb = (from: number, data: string) => handleUpdate(db, { update_id: 9, callback_query: { id: "c" + data, from: { id: from }, data } });
  await cb(111, `done:${job.id}`);
  ok(!(await db.task.findUniqueOrThrow({ where: { id: job.id } })).completedAt, "виконавець не може закрити чужу задачу кнопкою");
  await cb(111, `review:${job.id}`);
  const afterReview = await db.task.findUniqueOrThrow({ where: { id: job.id }, include: { column: true } });
  ok(afterReview.column.name === "Перевірка", "«📤 На перевірку» → колонка «Перевірка»");
  const rv = await db.notification.findFirst({ where: { taskId: job.id, userId: maks.id, type: "review" } });
  ok(!!rv && rv.text.includes("Потрібно перевірити виконання"), "постановнику — «потрібно перевірити виконання»");
  calls.length = 0;
  await sendPending(db);
  const toMaks = calls.find((c) => c.method === "sendMessage" && c.body.chat_id === "333" && String(c.body.text).includes("перевірити"));
  ok(JSON.stringify(toMaks?.body.reply_markup ?? {}).includes(`done:${job.id}`) && JSON.stringify(toMaks?.body.reply_markup).includes(`back:${job.id}`), "у постановника кнопки «Прийняти» і «Повернути в роботу»");
  await cb(333, `done:${job.id}`);
  const closed = await db.task.findUniqueOrThrow({ where: { id: job.id }, include: { column: true } });
  ok(!!closed.completedAt && closed.column.isDone, "постановник прийняв — задачу виконано");
  ok(!!(await db.notification.findFirst({ where: { taskId: job.id, userId: tim.id, type: "accepted" } })), "виконавцю — «задачу прийнято»");

  console.log("Блокування бота");
  await db.user.update({ where: { id: tim.id }, data: { telegramChatId: "403" } });
  await db.notification.create({ data: { userId: tim.id, type: "status", text: "тест" } });
  await sendPending(db);
  ok((await db.user.findUniqueOrThrow({ where: { id: tim.id } })).telegramChatId === null, "той, хто заблокував бота, відв'язується");

  await db.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    failed++;
  })
  .finally(() => {
    try {
      rmSync(copy);
    } catch {}
    console.log(failed ? `\nПровалено: ${failed}` : "\nУсе пройшло");
    process.exit(failed ? 1 : 0);
  });
