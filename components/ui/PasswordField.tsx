"use client";

import { useState } from "react";

/** Без похожих знаков (0/O, 1/l/I), чтобы пароль легко продиктовать или переписать. */
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const ALL = LOWER + UPPER + DIGITS;

/** Случайный пароль: криптостойкий генератор браузера, обязательно есть строчная, заглавная и цифра. */
export function generatePassword(length = 15): string {
  const pick = (set: string) => {
    // отбрасываем «хвост», чтобы не было перекоса распределения
    const max = 256 - (256 % set.length);
    const buf = new Uint8Array(1);
    do crypto.getRandomValues(buf);
    while (buf[0] >= max);
    return set[buf[0] % set.length];
  };
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(ALL));
  // перемешивание Фишера — Йейтса
  for (let i = chars.length - 1; i > 0; i--) {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const j = r[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Поле пароля с кнопками «Сгенерировать», «Показать» и «Копировать». */
export function PasswordField({
  id,
  name,
  required,
  placeholder,
  autoComplete = "new-password",
  minLength = 8,
}: {
  id: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
}) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <div className="flex gap-2">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setCopied(false);
          }}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          spellCheck={false}
          className="field min-w-0 flex-1 font-mono tracking-wide"
        />
        <button
          type="button"
          onClick={() => {
            setValue(generatePassword(15));
            setVisible(true);
            setCopied(false);
          }}
          className="btn btn-soft shrink-0 !px-3.5"
          title="Випадковий пароль із 15 символів"
        >
          🎲 Згенерувати
        </button>
      </div>
      {value && (
        <div className="mt-1.5 flex gap-3 pl-1 text-xs font-bold">
          <button type="button" onClick={() => setVisible(!visible)} className="text-ink-3 hover:text-ink">
            {visible ? "Сховати" : "Показати"}
          </button>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(value).catch(() => {});
              setCopied(true);
            }}
            className={copied ? "text-[#15803d]" : "text-ink-3 hover:text-ink"}
          >
            {copied ? "Скопійовано ✓" : "Копіювати"}
          </button>
          <span className="font-semibold text-ink-3">{value.length} символів</span>
        </div>
      )}
    </div>
  );
}
