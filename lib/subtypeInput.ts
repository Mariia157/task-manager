import "server-only";
import { db } from "@/lib/db";

/** Значение в списке подтипов «✎ Вписать вручную»; само название — в поле subtypeNew. */
export const SUBTYPE_NEW = "__new";

/**
 * Подтип (рекламная сеть) из формы: выбранный из списка или вписанный вручную.
 * Вписанное ищется в отделе без учёта регистра; если такого нет — добавляется в справочник,
 * чтобы в следующий раз выбирать из списка. Выключенный в справочнике — включается обратно.
 */
export async function resolveSubtype(form: FormData, directionId: string): Promise<{ subtypeId: string | null; error?: string }> {
  const raw = String(form.get("subtypeId") ?? "").trim();
  if (raw !== SUBTYPE_NEW) {
    if (!raw) return { subtypeId: null };
    const ok = await db.subtype.findFirst({ where: { id: raw, directionId }, select: { id: true } });
    return ok ? { subtypeId: raw } : { subtypeId: null, error: "Підтип не належить до цього відділу" };
  }
  const name = String(form.get("subtypeNew") ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) return { subtypeId: null, error: "Впишіть назву або виберіть зі списку" };
  const all = await db.subtype.findMany({ where: { directionId }, select: { id: true, name: true, active: true } });
  const same = all.find((s) => s.name.toLocaleLowerCase("uk") === name.toLocaleLowerCase("uk"));
  if (same) {
    if (!same.active) await db.subtype.update({ where: { id: same.id }, data: { active: true } });
    return { subtypeId: same.id };
  }
  try {
    const s = await db.subtype.create({ data: { directionId, name, sortOrder: all.length } });
    return { subtypeId: s.id };
  } catch {
    // параллельно создали такой же — берём его
    const s = await db.subtype.findFirst({ where: { directionId, name }, select: { id: true } });
    return s ? { subtypeId: s.id } : { subtypeId: null, error: "Не вдалося зберегти підтип" };
  }
}
