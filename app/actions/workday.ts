"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dayKey } from "@/lib/time";

export type WorkDayState = { error?: string };

/** «Начало дня»: место работы + время. Один раз в день (по Киеву). */
export async function startDayAction(_p: WorkDayState, form: FormData): Promise<WorkDayState> {
  const user = await requireUser();
  const placeName = String(form.get("place") ?? "").trim();
  const place = placeName ? await db.workPlace.findFirst({ where: { name: placeName, active: true } }) : null;
  if (!place) return { error: "Виберіть, де ви сьогодні працюєте" };
  const now = new Date();
  try {
    await db.workDay.create({ data: { userId: user.id, day: dayKey(now), place: place.name, startedAt: now } });
  } catch {
    return { error: "Сьогодні день уже розпочато" };
  }
  revalidatePath("/");
  return {};
}

/** «Конец дня»: закрывает сегодняшнюю отметку. */
export async function endDayAction(): Promise<WorkDayState> {
  const user = await requireUser();
  const now = new Date();
  const r = await db.workDay.updateMany({ where: { userId: user.id, day: dayKey(now), endedAt: null }, data: { endedAt: now } });
  if (!r.count) return { error: "Сьогодні день ще не розпочато або вже закрито" };
  revalidatePath("/");
  return {};
}

/** Место работы в справочнике (админ): добавить, переименовать, выключить. Прошлые отметки не меняются. */
export async function saveWorkPlaceAction(id: string | null, form: FormData) {
  const admin = await requireAdmin();
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!name) return;
  const active = id ? form.get("active") === "1" : true;
  try {
    if (id) await db.workPlace.update({ where: { id }, data: { name, active } });
    else await db.workPlace.create({ data: { name, sortOrder: await db.workPlace.count() } });
  } catch {
    return; // дубль названия
  }
  await audit(admin.id, id ? "workplace.update" : "workplace.create", "workplace", id, name);
  revalidatePath("/admin/dictionaries");
  revalidatePath("/");
}
