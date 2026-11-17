import { disconnectTelegramAction } from "@/app/actions/admin";
import { IconSend } from "@/components/icons";

/** Подключение бота: ссылка с одноразовым кодом или статус «подключён». */
export function TelegramCard({ connected, link, botName }: { connected: boolean; link: string | null; botName: string }) {
  return (
    <div className="card flex flex-wrap items-center gap-4 p-6">
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-white"
        style={{ background: connected ? "#16a34a" : "#229ED9", boxShadow: `0 6px 16px ${connected ? "#16a34a" : "#229ED9"}55` }}
      >
        <IconSend size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-extrabold">Telegram-бот @{botName}</div>
        <div className="text-sm text-ink-3">
          {connected
            ? "Підключено: нові задачі, близькі дедлайни, згадки, зміна статусу й щоденні задачі приходять у Telegram."
            : "Підключіть, щоб отримувати сповіщення й позначати задачі виконаними просто з Telegram."}
        </div>
      </div>
      {connected ? (
        <form action={disconnectTelegramAction.bind(null, null)}>
          <button className="btn btn-soft btn-sm">Вимкнути</button>
        </form>
      ) : link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={{ background: "#229ED9", color: "#fff" }}>
          Підключити Telegram
        </a>
      ) : (
        <span className="text-sm font-semibold text-[#c01428]">Бота не налаштовано на сервері</span>
      )}
    </div>
  );
}
