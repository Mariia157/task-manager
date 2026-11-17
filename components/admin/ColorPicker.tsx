"use client";

import { useState } from "react";
import { SWATCHES } from "@/lib/defaults";

/** Выбор цвета из палитры: кнопки-кружки + скрытое поле формы. */
export function ColorPicker({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [v, setV] = useState(SWATCHES.includes(defaultValue) ? defaultValue : SWATCHES[1]);
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Колір">
      <input type="hidden" name={name} value={v} />
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === v}
          aria-label={c}
          onClick={() => setV(c)}
          className="h-7 w-7 rounded-full transition-transform hover:scale-110"
          style={{ background: c, boxShadow: c === v ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : "inset 0 -2px 0 rgba(0,0,0,.12)" }}
        />
      ))}
    </div>
  );
}
