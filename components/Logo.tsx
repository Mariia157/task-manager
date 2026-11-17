import Image from "next/image";

/** Знак (три колонки канбана) + название. Пропорции знака 181×128. */
export function Logo({ name, size = 34 }: { name: string; size?: number }) {
  const w = Math.round((size * 181) / 128);
  return (
    <div className="flex items-center gap-2.5">
      <Image src="/brand/logo-wide.png" alt="" width={w} height={size} priority className="shrink-0" style={{ width: w, height: size }} />
      <span className="text-lg font-extrabold tracking-tight">{name}</span>
    </div>
  );
}
