/** Текст с переносами строк, кликабельными ссылками и @упоминаниями. Без HTML — только безопасные узлы React. */
const TOKEN_RE = /(https?:\/\/[^\s<>"')]+|@[a-z0-9_.-]{2,40})/gi;

export function RichText({ text, className, mentions }: { text: string; className?: string; mentions?: Record<string, string> }) {
  return (
    <div className={`whitespace-pre-wrap break-words ${className ?? ""}`}>
      {text.split(TOKEN_RE).map((part, i) => {
        if (i % 2 === 0) return part;
        if (part.startsWith("@")) {
          const name = mentions?.[part.slice(1).toLowerCase()];
          return name ? (
            <span key={i} title={name} className="rounded-md bg-[#e7efff] px-1 font-bold text-[#1d4ed8]">
              {part}
            </span>
          ) : (
            part
          );
        }
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1d4ed8] underline decoration-2 underline-offset-2">
            {part}
          </a>
        );
      })}
    </div>
  );
}
