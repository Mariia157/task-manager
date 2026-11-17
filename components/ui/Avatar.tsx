const PALETTE = ["#f4d7c6", "#d8e4fb", "#dcefd9", "#efdcf6", "#fbe7b8", "#d4eef0", "#f8d4dc", "#e2e0f8"];
const INK = ["#8a3b14", "#1e4aa8", "#2b6a26", "#6c2a8a", "#7a5600", "#1c6a70", "#9b2343", "#3d3796"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const i = hash(name) % PALETTE.length;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, background: PALETTE[i], color: INK[i], fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
