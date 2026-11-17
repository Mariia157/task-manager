import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { Report } from "@/lib/report";
import { fmtDate, fmtDuration, isDoneLate, priorityMeta, workDayView } from "@/lib/format";
import { TZ } from "@/lib/time";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const LOGO = path.join(process.cwd(), "public", "brand", "logo-wide.png");

const INK = "#1d2130";
const INK2 = "#4a4f5f";
const INK3 = "#7c8090";
const PANEL = "#f4f2ee";
const GREEN = "#16a34a";
const RED = "#c01428";
const BLUE = "#2563eb";
const ORANGE = "#b45f06";

const ruDate = (k: string) => {
  const [y, m, d] = k.split("-");
  return `${d}.${m}.${y}`;
};
const ruDateTime = (d: Date) =>
  new Intl.DateTimeFormat("uk-UA", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

type Col = { title: string; width: number; align?: "left" | "right" | "center" };
type Cell = { text: string; color?: string; bold?: boolean };

/** Отчёт по сотруднику в PDF (A4). Возвращает Buffer. */
export function renderReportPdf(r: Report): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 42, bottom: 50, left: 42, right: 42 },
    bufferPages: true,
    info: { Title: `Звіт: ${r.person.name}, ${ruDate(r.period.from)}–${ruDate(r.period.to)}`, Author: "Taskflow", Creator: "Taskflow" },
  });
  doc.registerFont("R", path.join(FONT_DIR, "Onest-Regular.ttf"));
  doc.registerFont("S", path.join(FONT_DIR, "Onest-SemiBold.ttf"));
  doc.registerFont("B", path.join(FONT_DIR, "Onest-ExtraBold.ttf"));

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensure = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };

  // ── шапка ──
  try {
    doc.image(LOGO, L, 40, { height: 30 });
  } catch {
    /* без логотипа — не страшно */
  }
  doc.font("B").fontSize(11).fillColor(INK).text("Taskflow", L + 50, 49);
  doc.font("R").fontSize(8.5).fillColor(INK3).text(`Сформовано ${ruDateTime(r.generatedAt)} · ${r.generatedBy}`, L, 50, { width: W, align: "right" });

  doc.y = 92;
  doc.font("B").fontSize(20).fillColor(INK).text("Звіт про роботу працівника", L, doc.y, { width: W });
  doc.moveDown(0.15);
  doc.font("S").fontSize(14).fillColor(INK).text(r.person.name, { width: W });
  doc
    .font("R")
    .fontSize(10)
    .fillColor(INK2)
    .text(
      [
        r.period.from === r.period.to ? `За ${ruDate(r.period.from)}` : `Період: ${ruDate(r.period.from)} — ${ruDate(r.period.to)}`,
        r.person.roles.length ? `Ролі: ${r.person.roles.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("   ·   "),
      { width: W },
    );
  if (r.partial)
    doc.moveDown(0.2).font("R").fontSize(8.5).fillColor(INK3).text("До звіту ввійшли лише задачі, доступні укладачеві звіту.", { width: W });
  doc.moveDown(1);

  // ── плитки ──
  const s = r.summary;
  const tiles: { label: string; value: string; sub?: string; color: string }[] = [
    { label: "Виконано задач", value: String(s.done), sub: `вчасно ${pct(s.doneOnTime, s.done)}`, color: GREEN },
    { label: "Із запізненням", value: String(s.doneLate), color: s.doneLate ? ORANGE : INK3 },
    { label: "Нових задач за період", value: String(s.assigned), color: BLUE },
    { label: "Відкрито зараз", value: String(s.openNow), sub: s.lateNow ? `прострочено ${s.lateNow}` : "без прострочень", color: s.lateNow ? RED : INK },
  ];
  if (s.recurringDays) tiles.push({ label: "Щоденні: виконано днів", value: `${s.recurringDone} з ${s.recurringDays}`, sub: `з них вчасно — ${s.recurringOnTime}`, color: s.recurringDone === s.recurringDays ? GREEN : ORANGE });
  if (s.workDays) tiles.push({ label: "Робочих днів", value: String(s.workDays), sub: s.workMinutes ? `усього ${fmtDuration(s.workMinutes * 60000)}` : undefined, color: "#0f766e" });
  tiles.push({ label: "Коментарів", value: String(s.comments), color: INK2 });

  const perRow = 3;
  const gap = 10;
  const tw = (W - gap * (perRow - 1)) / perRow;
  const th = 62;
  // начало блока фиксируем: каждый text() сдвигает doc.y, и плитки «уползали» лесенкой
  const top = doc.y;
  tiles.forEach((t, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = L + col * (tw + gap);
    const y = top + row * (th + gap);
    doc.roundedRect(x, y, tw, th, 10).fill(PANEL);
    doc.rect(x, y + 12, 3, th - 24).fill(t.color);
    doc.font("R").fontSize(8.5).fillColor(INK3).text(t.label, x + 14, y + 10, { width: tw - 22 });
    doc.font("B").fontSize(19).fillColor(t.color).text(t.value, x + 14, y + 23, { width: tw - 22 });
    if (t.sub) doc.font("R").fontSize(8).fillColor(INK2).text(t.sub, x + 14, y + 46, { width: tw - 22 });
  });
  doc.y = top + Math.ceil(tiles.length / perRow) * (th + gap) + 6;
  doc.x = L;

  // ── разбивка ──
  if (r.byProject.length || r.byDirection.length) {
    ensure(70);
    const half = (W - 16) / 2;
    const y0 = doc.y;
    const list = (title: string, items: [string, number][], x: number) => {
      doc.font("S").fontSize(10).fillColor(INK).text(title, x, y0, { width: half });
      let y = y0 + 17;
      const max = Math.max(1, ...items.map((i) => i[1]));
      for (const [name, n] of items.slice(0, 6)) {
        doc.font("R").fontSize(9).fillColor(INK2).text(name, x, y, { width: half * 0.45, lineBreak: false, ellipsis: true });
        const bw = (half * 0.42 * n) / max;
        doc.roundedRect(x + half * 0.47, y + 2, Math.max(bw, 3), 7, 3.5).fill(GREEN);
        doc.font("S").fontSize(9).fillColor(INK).text(String(n), x + half * 0.47 + bw + 6, y, { width: 40 });
        y += 15;
      }
      return y;
    };
    const y1 = list("Виконано по проєктах", r.byProject, L);
    const y2 = list("Виконано по відділах", r.byDirection, L + half + 16);
    doc.y = Math.max(y1, y2) + 14;
    doc.x = L;
  }

  // ── таблицы ──
  function table(title: string, cols: Col[], rows: Cell[][], empty: string) {
    // заголовок + шапка + хотя бы две строки — иначе шапка «повисает» внизу страницы
    ensure(rows.length ? 110 : 50);
    doc.font("B").fontSize(12).fillColor(INK).text(title, L, doc.y, { width: W });
    doc.moveDown(0.4);
    const total = cols.reduce((a, c) => a + c.width, 0);
    const ws = cols.map((c) => (c.width / total) * W);
    const pad = 6;
    const header = () => {
      const y = doc.y;
      doc.roundedRect(L, y, W, 20, 5).fill(INK);
      let x = L;
      cols.forEach((c, i) => {
        doc.font("S").fontSize(8).fillColor("#ffffff").text(c.title, x + pad, y + 6, { width: ws[i] - pad * 2, align: c.align ?? "left", lineBreak: false });
        x += ws[i];
      });
      doc.y = y + 22;
    };
    if (!rows.length) {
      doc.font("R").fontSize(9.5).fillColor(INK3).text(empty, L, doc.y, { width: W });
      doc.moveDown(1.2);
      return;
    }
    header();
    rows.forEach((row, ri) => {
      doc.font("R").fontSize(8.5);
      const h = Math.max(...row.map((c, i) => doc.heightOfString(c.text || " ", { width: ws[i] - pad * 2 }))) + 9;
      if (doc.y + h > bottom()) {
        doc.addPage();
        header();
      }
      const y = doc.y;
      if (ri % 2 === 1) doc.rect(L, y, W, h).fill(PANEL);
      let x = L;
      row.forEach((c, i) => {
        doc
          .font(c.bold ? "S" : "R")
          .fontSize(8.5)
          .fillColor(c.color ?? INK)
          .text(c.text, x + pad, y + 4.5, { width: ws[i] - pad * 2, align: cols[i].align ?? "left" });
        x += ws[i];
      });
      doc.y = y + h;
    });
    doc.x = L;
    doc.moveDown(1.2);
  }

  const dl = (d: Date | null) => (d ? fmtDate(d, true) : "без строку");
  table(
    `Виконані задачі · ${r.done.length}`,
    [
      { title: "Виконана", width: 1.15 },
      { title: "Задача", width: 3.2 },
      { title: "Проєкт", width: 1.4 },
      { title: "Відділ", width: 1.45 },
      { title: "Строк", width: 1.15 },
      { title: "Вчасно", width: 0.8, align: "center" },
    ],
    r.done.map((t) => {
      const ok = !isDoneLate(t);
      return [
        { text: fmtDate(t.completedAt!, true) },
        { text: t.title + (t.priority === "HIGH" ? "  · високий" : ""), bold: true },
        { text: t.project.name + (t.business ? `
${t.business}` : ""), color: INK2 },
        { text: t.direction.name + (t.subtype ? ` · ${t.subtype.name}` : ""), color: INK2 },
        { text: dl(t.deadline), color: INK2 },
        { text: ok ? "так" : "ні", color: ok ? GREEN : RED, bold: true },
      ];
    }),
    "За цей період виконаних задач немає.",
  );

  table(
    `Відкриті задачі зараз · ${r.open.length}`,
    [
      { title: "Задача", width: 3.4 },
      { title: "Проєкт", width: 1.4 },
      { title: "Статус", width: 1.2 },
      { title: "Пріоритет", width: 1 },
      { title: "Строк", width: 1.3 },
    ],
    r.open.map((t) => {
      const late = t.deadline && t.deadline < r.generatedAt;
      return [
        { text: t.title, bold: true },
        { text: t.project.name + (t.business ? `
${t.business}` : ""), color: INK2 },
        { text: t.column.name, color: INK2 },
        { text: priorityMeta(t.priority).label, color: t.priority === "HIGH" ? RED : INK2 },
        { text: late ? `${dl(t.deadline)} · прострочена` : dl(t.deadline), color: late ? RED : INK2, bold: !!late },
      ];
    }),
    "Відкритих задач немає.",
  );

  if (r.recurring.length)
    table(
      `Щоденні задачі по днях · виконано ${r.summary.recurringDone} з ${r.summary.recurringDays}`,
      [
        { title: "День", width: 1 },
        { title: "Задача", width: 3 },
        { title: "Пріоритет", width: 1 },
        { title: "Строк", width: 1.2 },
        { title: "Виконана", width: 1.4 },
        { title: "Підсумок", width: 1.2 },
      ],
      r.recurring.map((t) => {
        const state = t.completedAt ? (isDoneLate(t) ? ["із запізненням", ORANGE] : ["вчасно", GREEN]) : t.deadline && t.deadline < r.generatedAt ? ["не виконана", RED] : ["в роботі", BLUE];
        return [
          { text: ruDate(t.recurringDay!) },
          { text: t.title, bold: true },
          { text: priorityMeta(t.priority).label, color: t.priority === "HIGH" ? RED : INK2 },
          { text: dl(t.deadline), color: INK2 },
          { text: t.completedAt ? fmtDate(t.completedAt, true) : "—", color: INK2 },
          { text: state[0], color: state[1], bold: true },
        ];
      }),
      "",
    );

  if (r.work.length)
    table(
      `Робочі дні · ${r.work.length}`,
      [
        { title: "Дата", width: 1 },
        { title: "Місце", width: 1.6 },
        { title: "Початок", width: 0.9 },
        { title: "Кінець", width: 1.1 },
        { title: "Години", width: 1.1 },
      ],
      r.work.map((w) => {
        const v = workDayView(w);
        return [
          { text: ruDate(w.day) },
          { text: v.place, bold: true },
          { text: v.start },
          { text: v.end ?? "не позначено", color: v.end ? INK : ORANGE, bold: !v.end },
          { text: v.duration ?? "—", color: INK2 },
        ];
      }),
      "",
    );

  // ── нумерация страниц ──
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // подпись ниже нижнего поля: иначе pdfkit сам добавит пустую страницу
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 32;
    doc.font("R").fontSize(8).fillColor(INK3);
    doc.text(`${r.person.name} · ${ruDate(r.period.from)}–${ruDate(r.period.to)}`, L, y, { width: W / 2, lineBreak: false });
    doc.text(`стор. ${i + 1} з ${range.count}`, L + W / 2, y, { width: W / 2, align: "right", lineBreak: false });
  }
  doc.end();
  return done;
}
