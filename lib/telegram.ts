/**
 * Telegram-бот (этап 5). Без "server-only": работает в отдельном процессе scripts/bot.ts.
 * Сайт только кладёт уведомления в таблицу Notification; бот их рассылает, плюс сам создаёт
 * напоминания о дедлайнах и ежедневной задаче.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { fmtDate, fmtTime, priorityMeta } from "@/lib/format";
import { addDays, startOfDay, zonedParts } from "@/lib/time";
import { columnsFor, loadMover, moveTaskCore } from "@/lib/taskMove";

const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN ?? "";
const APP_URL = () => (process.env.APP_URL ?? "").replace(/\/$/, "");

/** За сколько до срока напоминать об обычной задаче. */
export const DEADLINE_WINDOW_MS = 3 * 3600_000;
/** «Срок вышел» — только для недавно просроченных, чтобы при первом запуске не завалить старыми. */
const OVERDUE_LOOKBACK_MS = 24 * 3600_000;
/** Утренняя сводка: с 9:00 до 12:00 по Киеву, раз в день. */
const DIGEST_FROM_HOUR = 9;
const DIGEST_TO_HOUR = 12;
/** Уведомления старше суток не досылаем — человек мог подключить бота позже. */
const MAX_AGE_MS = 24 * 3600_000;

export class TgError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

export async function tg<T = unknown>(method: string, body: object = {}, timeoutMs = 40_000): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json()) as { ok: boolean; result: T; error_code?: number; description?: string };
  if (!data.ok) throw new TgError(data.error_code ?? res.status, data.description ?? "Telegram error");
  return data.result;
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Telegram не принимает localhost в кнопках-ссылках — тогда ссылку не показываем. */
function publicUrl(path: string): string | null {
  const base = APP_URL();
  if (!/^https?:\/\//.test(base) || /\/\/(localhost|127\.|10\.|192\.168\.)/.test(base)) return null;
  return base + path;
}

// ───────────── напоминания ─────────────

async function alreadyQueued(db: PrismaClient, type: string, taskId: string, userId: string) {
  return !!(await db.notification.findFirst({ where: { type, taskId, userId }, select: { id: true } }));
}

/** Создать напоминания: «скоро срок» по обычным задачам и напоминание по ежедневной задаче (за remindBefore минут). */
export async function queueReminders(db: PrismaClient, now = new Date()) {
  let n = 0;
  const soon = await db.task.findMany({
    where: {
      completedAt: null,
      archivedAt: null,
      recurringId: null,
      deadline: { gt: now, lte: new Date(now.getTime() + DEADLINE_WINDOW_MS) },
      assignee: { active: true },
      project: { isDraft: false },
    },
    select: { id: true, title: true, deadline: true, assigneeId: true },
  });
  for (const t of soon) {
    if (await alreadyQueued(db, "deadline", t.id, t.assigneeId)) continue;
    await db.notification.create({
      data: { userId: t.assigneeId, type: "deadline", taskId: t.id, text: `Скоро строк — до ${fmtTime(t.deadline!)}: ${t.title}` },
    });
    n++;
  }
  const rec = await db.task.findMany({
    where: { completedAt: null, archivedAt: null, recurringId: { not: null }, deadline: { gt: now }, assignee: { active: true }, project: { isDraft: false } },
    select: { id: true, title: true, deadline: true, assigneeId: true, recurring: { select: { remindBefore: true } } },
  });
  for (const t of rec) {
    const before = t.recurring?.remindBefore ?? 0;
    if (!before || t.deadline!.getTime() - before * 60_000 > now.getTime()) continue;
    if (await alreadyQueued(db, "remind", t.id, t.assigneeId)) continue;
    await db.notification.create({
      data: { userId: t.assigneeId, type: "remind", taskId: t.id, text: `Нагадування про щоденну задачу — до ${fmtTime(t.deadline!)}: ${t.title}` },
    });
    n++;
  }

  // личные напоминания «⏰ Напомнить»
  const due = await db.reminder.findMany({
    where: { sentAt: null, remindAt: { lte: now } },
    include: { task: { select: { title: true, completedAt: true, archivedAt: true } }, creator: { select: { id: true, name: true } } },
    take: 200,
  });
  for (const r of due) {
    await db.reminder.update({ where: { id: r.id }, data: { sentAt: now } });
    if (r.task.completedAt || r.task.archivedAt) continue; // уже сделано — не дёргаем
    const from = r.creatorId !== r.userId ? ` (від ${r.creator.name})` : "";
    await db.notification.create({
      data: { userId: r.userId, type: "reminder", taskId: r.taskId, text: `Нагадування${from}: ${r.task.title}${r.note ? `\n${r.note}` : ""}` },
    });
    n++;
  }

  // «срок вышел» — исполнителю и тому, кто ставил
  const overdue = await db.task.findMany({
    where: {
      completedAt: null,
      archivedAt: null,
      deadline: { lte: now, gt: new Date(now.getTime() - OVERDUE_LOOKBACK_MS) },
      assignee: { active: true },
      project: { isDraft: false },
    },
    select: { id: true, title: true, assigneeId: true, creatorId: true, recurringId: true, assignee: { select: { name: true } } },
  });
  for (const t of overdue) {
    if (!(await alreadyQueued(db, "overdue", t.id, t.assigneeId))) {
      await db.notification.create({ data: { userId: t.assigneeId, type: "overdue", taskId: t.id, text: `Строк минув: ${t.title}` } });
      n++;
    }
    if (!t.recurringId && t.creatorId !== t.assigneeId && !(await alreadyQueued(db, "overdue", t.id, t.creatorId))) {
      await db.notification.create({ data: { userId: t.creatorId, type: "overdue", taskId: t.id, text: `Прострочена в ${t.assignee.name}: ${t.title}` } });
      n++;
    }
  }

  n += await queueDigests(db, now);
  return n;
}

/** Утренняя сводка: что сегодня по срокам и что просрочено. Только подключившим бота. */
async function queueDigests(db: PrismaClient, now: Date) {
  const h = zonedParts(now).h;
  if (h < DIGEST_FROM_HOUR || h >= DIGEST_TO_HOUR) return 0;
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const users = await db.user.findMany({ where: { active: true, notifyDigest: true, telegramChatId: { not: null } }, select: { id: true, name: true } });
  let n = 0;
  for (const u of users) {
    if (await db.notification.findFirst({ where: { userId: u.id, type: "digest", createdAt: { gte: today } }, select: { id: true } })) continue;
    const open = await db.task.findMany({
      where: { assigneeId: u.id, completedAt: null, archivedAt: null, deadline: { lt: tomorrow }, project: { isDraft: false } },
      orderBy: { deadline: "asc" },
      select: { title: true, deadline: true },
    });
    if (!open.length) continue; // пустую сводку не шлём
    const late = open.filter((t) => t.deadline! < now);
    const todayList = open.filter((t) => t.deadline! >= now);
    const parts = [`Доброго ранку, ${u.name.split(" ")[0]}!`];
    if (todayList.length) parts.push(`\nСьогодні за строком (${todayList.length}):`, ...todayList.slice(0, 8).map((t) => `• ${t.title} — до ${fmtTime(t.deadline!)}`));
    if (late.length) parts.push(`\nПрострочено (${late.length}):`, ...late.slice(0, 8).map((t) => `• ${t.title} — було до ${fmtDate(t.deadline!, true)}`));
    await db.notification.create({ data: { userId: u.id, type: "digest", text: parts.join("\n") } });
    n++;
  }
  return n;
}

// ───────────── рассылка ─────────────

const ICON: Record<string, string> = {
  assigned: "📌",
  deadline: "⏰",
  remind: "⏰",
  recurring: "🔁",
  comment: "💬",
  mention: "📣",
  status: "🔄",
  request: "📥",
  reminder: "⏰",
  overdue: "🔥",
  digest: "☀️",
  review: "🔎",
  accepted: "✅",
};

/** Строка с подробностями задачи под текстом уведомления. */
async function details(db: PrismaClient, taskId: string | null) {
  if (!taskId) return "";
  const t = await db.task.findUnique({
    where: { id: taskId },
    select: { deadline: true, priority: true, business: true, project: { select: { name: true } }, direction: { select: { name: true } } },
  });
  if (!t) return "";
  const bits = [
    t.business,
    t.project.name,
    t.direction.name,
    t.deadline ? `до ${fmtDate(t.deadline, true)}` : "без строку",
    t.priority === "HIGH" ? "❗ високий" : priorityMeta(t.priority).label.toLowerCase(),
  ];
  return `\n<i>${esc(bits.filter(Boolean).join(" · "))}</i>`;
}

/** Кнопки под сообщением: «Открыть» (если сайт доступен извне) и «Выполнено» — только исполнителю открытой задачи. */
async function keyboard(db: PrismaClient, n: { type: string; taskId: string | null; userId: string }) {
  if (!n.taskId) {
    const url = n.type === "request" ? publicUrl("/requests") : null;
    return url ? { inline_keyboard: [[{ text: "Відкрити запити", url }]] } : undefined;
  }
  const t = await db.task.findUnique({ where: { id: n.taskId }, select: { assigneeId: true, creatorId: true, completedAt: true, archivedAt: true } });
  const row: object[] = [];
  const url = publicUrl(`/tasks/${n.taskId}`);
  if (url) row.push({ text: "Відкрити", url });
  const open = !!t && !t.completedAt && !t.archivedAt;
  const selfTask = !!t && t.assigneeId === t.creatorId;
  const rows: object[][] = [];
  if (open && t.assigneeId === n.userId && ["assigned", "deadline", "remind", "recurring", "reminder", "overdue", "status"].includes(n.type)) {
    // своя задача — закрыть сразу; чужая — сдать на проверку постановщику
    row.push(selfTask ? { text: "✅ Виконано", callback_data: `done:${n.taskId}` } : { text: "📤 На перевірку", callback_data: `review:${n.taskId}` });
  }
  if (open && n.type === "review" && t.creatorId === n.userId) {
    rows.push([
      { text: "✅ Прийняти (Готово)", callback_data: `done:${n.taskId}` },
      { text: "↩️ Повернути в роботу", callback_data: `back:${n.taskId}` },
    ]);
  }
  if (row.length) rows.unshift(row);
  if (open && ["deadline", "remind", "reminder", "overdue", "recurring"].includes(n.type))
    rows.push([
      { text: "⏰ через 1 год", callback_data: `snooze:${n.taskId}:60` },
      { text: "через 3 год", callback_data: `snooze:${n.taskId}:180` },
    ]);
  return rows.length ? { inline_keyboard: rows } : undefined;
}

/** В одном процессе рассылка идёт строго по очереди (таймер и ответ на кнопку не пересекаются). */
let sending: Promise<number> = Promise.resolve(0);
export function sendPending(db: PrismaClient, now = new Date()): Promise<number> {
  const run = sending.then(() => sendPendingOnce(db, now));
  sending = run.catch(() => 0);
  return run;
}

async function sendPendingOnce(db: PrismaClient, now: Date) {
  const list = await db.notification.findMany({
    where: { sentAt: null },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: { user: { select: { active: true, telegramChatId: true } } },
  });
  let sent = 0;
  for (const n of list) {
    const stale = now.getTime() - n.createdAt.getTime() > MAX_AGE_MS;
    if (stale || !n.user.active) {
      await db.notification.updateMany({ where: { id: n.id, sentAt: null }, data: { sentAt: now } });
      continue;
    }
    if (!n.user.telegramChatId) continue; // подождёт привязки (до суток)
    // «захват»: помечаем отправленным ДО отправки — второй проход это уведомление уже не возьмёт
    const claimed = await db.notification.updateMany({ where: { id: n.id, sentAt: null }, data: { sentAt: new Date() } });
    if (claimed.count === 0) continue;
    try {
      await tg("sendMessage", {
        chat_id: n.user.telegramChatId,
        text: `${ICON[n.type] ?? "•"} ${esc(n.text)}${await details(db, n.taskId)}`,
        parse_mode: "HTML",
        reply_markup: await keyboard(db, n),
        link_preview_options: { is_disabled: true },
      });
      sent++;
    } catch (e) {
      if (e instanceof TgError && (e.code === 403 || e.code === 400)) {
        // бот заблокирован или чат недоступен — отвязываем, чтобы не долбиться (уведомление остаётся «отправленным»)
        if (e.code === 403) await db.user.updateMany({ where: { telegramChatId: n.user.telegramChatId }, data: { telegramChatId: null } });
      } else {
        // сеть или лимит — вернём в очередь, отправим на следующем круге
        await db.notification.update({ where: { id: n.id }, data: { sentAt: null } });
        if (e instanceof TgError && e.code === 429) break;
        throw e;
      }
    }
  }
  return sent;
}

// ───────────── входящие ─────────────

type Update = {
  update_id: number;
  message?: { chat: { id: number; type: string }; from?: { username?: string; first_name?: string }; text?: string };
  callback_query?: { id: string; from: { id: number }; message?: { chat: { id: number }; message_id: number; text?: string }; data?: string };
};

const HELP =
  "Я надсилаю сповіщення Taskflow: нові задачі, близькі дедлайни, згадки, зміну статусу та щоденні задачі.\n\n/my — мої відкриті задачі\n/help — ця довідка";

async function reply(chatId: number, text: string) {
  await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
}

async function link(db: PrismaClient, chatId: string, userId: string) {
  // один чат — один человек
  await db.user.updateMany({ where: { telegramChatId: chatId, NOT: { id: userId } }, data: { telegramChatId: null } });
  return db.user.update({ where: { id: userId }, data: { telegramChatId: chatId, tgLinkCode: null } });
}

export async function handleUpdate(db: PrismaClient, u: Update) {
  if (u.callback_query) return handleCallback(db, u.callback_query);
  const m = u.message;
  if (!m?.text || m.chat.type !== "private") return;
  const chatId = String(m.chat.id);
  const [cmd, arg] = m.text.trim().split(/\s+/, 2);

  if (cmd === "/start") {
    if (arg) {
      const byCode = await db.user.findUnique({ where: { tgLinkCode: arg } });
      if (byCode?.active) {
        const usr = await link(db, chatId, byCode.id);
        return reply(m.chat.id, `Готово, ${esc(usr.name)}! Бот підключено.\n\n${HELP}`);
      }
      return reply(m.chat.id, "Посилання застаріло. Відкрийте «Профіль» на сайті й натисніть «Підключити Telegram» ще раз.");
    }
    const linked = await db.user.findUnique({ where: { telegramChatId: chatId } });
    if (linked) return reply(m.chat.id, `Ви вже підключені як ${esc(linked.name)}.\n\n${HELP}`);
    // запасной путь: совпал @username из карточки человека
    const uname = m.from?.username?.toLowerCase();
    if (uname) {
      const candidates = await db.user.findMany({ where: { active: true, telegramChatId: null, telegram: { not: "" } } });
      const match = candidates.filter((c) => c.telegram.replace(/^@/, "").toLowerCase() === uname);
      if (match.length === 1) {
        const usr = await link(db, chatId, match[0].id);
        return reply(m.chat.id, `Знайшов вас за @${esc(uname)}: ${esc(usr.name)}. Бот підключено.\n\n${HELP}`);
      }
    }
    return reply(m.chat.id, "Щоб отримувати сповіщення, відкрийте на сайті «Профіль» → «Підключити Telegram».");
  }

  const user = await db.user.findUnique({ where: { telegramChatId: chatId } });
  if (!user?.active) return reply(m.chat.id, "Бот не підключено. Відкрийте на сайті «Профіль» → «Підключити Telegram».");

  if (cmd === "/my") {
    const tasks = await db.task.findMany({
      where: { assigneeId: user.id, completedAt: null, archivedAt: null },
      orderBy: [{ deadline: "asc" }],
      take: 15,
      select: { title: true, deadline: true, priority: true, project: { select: { name: true } } },
    });
    if (!tasks.length) return reply(m.chat.id, "Відкритих задач немає 🎉");
    const now = Date.now();
    const lines = tasks.map((t) => {
      const late = t.deadline && t.deadline.getTime() < now;
      const due = t.deadline ? fmtDate(t.deadline, true) : "без строку";
      return `${late ? "🔥" : t.priority === "HIGH" ? "❗" : "•"} <b>${esc(t.title)}</b> — ${due}, ${esc(t.project.name)}`;
    });
    return reply(m.chat.id, `Ваші відкриті задачі:\n\n${lines.join("\n")}`);
  }
  return reply(m.chat.id, HELP);
}

async function handleCallback(db: PrismaClient, q: NonNullable<Update["callback_query"]>) {
  const answer = (text: string) => tg("answerCallbackQuery", { callback_query_id: q.id, text, show_alert: text.length > 60 });
  const [kind, taskId, arg] = (q.data ?? "").split(":");
  if (kind === "snooze" && taskId) return snooze(db, q, taskId, Number(arg) || 60);
  if (!["done", "review", "back"].includes(kind) || !taskId) return answer("Невідома команда");
  const u = await db.user.findUnique({ where: { telegramChatId: String(q.from.id) }, select: { id: true, active: true } });
  const mover = u?.active ? await loadMover(db, u.id) : null;
  const task = await db.task.findUnique({ where: { id: taskId }, select: { projectId: true, completedAt: true, archivedAt: true } });
  if (!mover || !task || task.archivedAt) return answer("Немає доступу до задачі");
  if (task.completedAt && kind !== "back") return answer("Задачу вже закрито");
  const cols = await columnsFor(db, task.projectId);
  const target = kind === "done" ? cols.done : kind === "review" ? cols.review : cols.inWork;
  if (!target) return answer("На дошці немає потрібної колонки");
  const r = await moveTaskCore(db, mover, taskId, target.id, { via: "з Telegram" });
  if (r.error) return answer(r.error);
  const label = kind === "done" ? "✅ Прийнято, задачу закрито" : kind === "review" ? "📤 Надіслано на перевірку" : "↩️ Повернуто в роботу";
  await answer(label);
  if (q.message)
    await tg("editMessageText", { chat_id: q.message.chat.id, message_id: q.message.message_id, text: `${q.message.text ?? ""}\n\n${label}` }).catch(() => {});
}

/** «Отложить»: новое личное напоминание через N минут. Только тем, кто связан с задачей (исполнитель, автор, наблюдатель). */
async function snooze(db: PrismaClient, q: NonNullable<Update["callback_query"]>, taskId: string, minutes: number) {
  const answer = (text: string) => tg("answerCallbackQuery", { callback_query_id: q.id, text });
  const user = await db.user.findUnique({ where: { telegramChatId: String(q.from.id) } });
  const task = await db.task.findUnique({ where: { id: taskId }, include: { watchers: { select: { userId: true } } } });
  const related = !!task && !!user && (task.assigneeId === user.id || task.creatorId === user.id || task.watchers.some((w) => w.userId === user.id));
  if (!user?.active || !task || !related) return answer("Немає доступу до задачі");
  if (task.completedAt || task.archivedAt) return answer("Задачу вже закрито");
  const at = new Date(Date.now() + Math.min(Math.max(minutes, 5), 24 * 60) * 60_000);
  await db.reminder.create({ data: { taskId, userId: user.id, creatorId: user.id, remindAt: at } });
  await answer(`Нагадаю о ${fmtTime(at)}`);
  if (q.message)
    await tg("editMessageReplyMarkup", { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
}
