/**
 * Telegram-бот Taskflow: npm run bot
 * Long polling — публичный адрес не нужен.
 * Каждые 30 секунд: карточки текучки, напоминания, рассылка очереди уведомлений.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { ensureRecurringCore } from "@/lib/recurringCore";
import { handleUpdate, queueReminders, sendPending, tg } from "@/lib/telegram";

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("Немає TELEGRAM_BOT_TOKEN у .env");
  process.exit(1);
}

const TICK_MS = 30_000;
let stopping = false;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function tick() {
  try {
    const now = new Date();
    const made = await ensureRecurringCore(db, now);
    const queued = await queueReminders(db, now);
    const sent = await sendPending(db, now);
    if (made || queued || sent) log(`поточка +${made}, нагадувань +${queued}, надіслано ${sent}`);
  } catch (e) {
    log("помилка циклу:", e instanceof Error ? e.message : e);
  }
}

async function poll() {
  let offset = 0;
  while (!stopping) {
    try {
      const updates = await tg<{ update_id: number }[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] }, 35_000);
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          await handleUpdate(db, u as Parameters<typeof handleUpdate>[1]);
        } catch (e) {
          log("помилка обробки:", e instanceof Error ? e.message : e);
        }
      }
      if (updates.length) await sendPending(db); // ответ на «Выполнено» и т.п. — сразу
    } catch (e) {
      log("getUpdates:", e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function main() {
  const me = await tg<{ username: string }>("getMe");
  await tg("setMyCommands", {
    commands: [
      { command: "my", description: "Мої відкриті задачі" },
      { command: "help", description: "Що вміє бот" },
    ],
  });
  log(`бот @${me.username} запущено`);
  await tick();
  const timer = setInterval(tick, TICK_MS);
  const stop = () => {
    stopping = true;
    clearInterval(timer);
    log("зупинка");
    setTimeout(() => process.exit(0), 500);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await poll();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
