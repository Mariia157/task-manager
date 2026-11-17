/** Значения по умолчанию. Всё это потом редактируется в админке. */

export const DEFAULT_COLUMNS = [
  { name: "Ідея", color: "#7c3aed", isDone: false },
  { name: "В роботі", color: "#2563eb", isDone: false },
  { name: "Чекає відповіді", color: "#f08a0c", isDone: false },
  { name: "Перевірка", color: "#0891b2", isDone: false },
  { name: "Готово", color: "#16a34a", isDone: true },
] as const;

export const DEFAULT_ROLES = [
  { name: "Креатив" },
  { name: "Розробник" },
  { name: "Фронт", parent: "Розробник" },
  { name: "Маркетолог" },
  { name: "Айті" },
] as const;

/** Направление → роль исполнителя (null — любому), подтипы. */
export const DEFAULT_DIRECTIONS = [
  { name: "Розробка", color: "#2563eb", role: "Розробник", subtypeLabel: "Мітка", subtypes: ["Фронт"] },
  { name: "Реклама", color: "#e5283b", role: "Маркетолог", subtypeLabel: "Рекламна мережа", subtypes: ["Google", "TikTok", "Facebook", "Instagram", "YouTube"] },
  { name: "Креатив", color: "#d946ef", role: "Креатив", subtypeLabel: "Підтип", subtypes: [] },
  { name: "Айті", color: "#0f766e", role: null, subtypeLabel: "Підтип", subtypes: [] },
] as const;

export const DEFAULT_PROJECTS = [
  { name: "Сайт компанії", color: "#2563eb" },
  { name: "Мобільний застосунок", color: "#d946ef" },
  { name: "Маркетинг", color: "#e5283b" },
  { name: "Внутрішні процеси", color: "#7c3aed" },
] as const;

/**
 * Виды работы — кнопки в форме задачи; можно вписать и свой. Для какого бизнеса — говорит доска:
 * «HR» на доске «Мобильное приложение» = ищем людей в команду приложения, «Продажа» на «Сайте компании» = продаём услуги.
 */
export const DEFAULT_BUSINESS = [
  { name: "HR", color: "#e5283b" },
  { name: "Продаж", color: "#16a34a" },
  { name: "Маркетинг", color: "#2563eb" },
] as const;

/** Места работы для отметки «Начало дня». */
export const DEFAULT_WORKPLACES = ["Віддалено", "Офіс 1", "Офіс 2", "Коворкінг"] as const;

/** Палитра для проектов, колонок и направлений в админке. */
export const SWATCHES = ["#7c3aed", "#2563eb", "#0891b2", "#0f766e", "#16a34a", "#ca8a04", "#f08a0c", "#e5283b", "#d946ef", "#64748b"];
