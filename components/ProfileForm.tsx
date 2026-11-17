"use client";

import { useActionState } from "react";
import { updateProfileAction, type AdminState } from "@/app/actions/admin";
import { Switch } from "@/components/ui/Switch";
import { PasswordField } from "@/components/ui/PasswordField";

export function ProfileForm({ telegram, notifyDigest }: { telegram: string; notifyDigest: boolean }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(updateProfileAction, {});
  return (
    <form action={action} className="card space-y-5 p-6">
      <div>
        <label className="label" htmlFor="telegram">Ваш @username у Telegram</label>
        <input id="telegram" name="telegram" defaultValue={telegram} maxLength={64} placeholder="@username" className="field" />
        <p className="mt-1.5 text-sm text-ink-3">Для колег і як запасний спосіб прив’язки: якщо написати боту /start, він упізнає вас за username.</p>
      </div>
      <Switch name="notifyDigest" defaultChecked={notifyDigest} label="Ранкове зведення в Telegram" hint="О 9:00 — що сьогодні за строками і що прострочено" />
      <div className="grid gap-4 sm:max-w-[560px]">
        <div>
          <label className="label" htmlFor="current">Поточний пароль</label>
          <input id="current" name="current" type="password" autoComplete="current-password" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="next">Новий пароль</label>
          <PasswordField id="next" name="next" placeholder="від 8 символів" />
        </div>
      </div>
      {state.error && (
        <div role="alert" className="rounded-xl bg-[#ffe6e8] px-4 py-3 text-sm font-semibold text-[#c01428]">
          {state.error}
        </div>
      )}
      {state.ok && (
        <div role="status" className="rounded-xl bg-[#e2f6e8] px-4 py-3 text-sm font-semibold text-[#15803d]">
          {state.ok}
        </div>
      )}
      <button className="btn btn-primary" disabled={pending}>
        Зберегти
      </button>
    </form>
  );
}
