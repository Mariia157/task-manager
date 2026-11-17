import { describe, expect, it } from "vitest";
import {
  assignDecision,
  canComment,
  canSetColumn,
  canViewBoard,
  canManageTask,
  canViewTask,
  canWorkOnTask,
  covers,
  deadlineChange,
  expandRoles,
  taskScopeWhere,
  type AccessTask,
  type AccessUser,
} from "@/lib/access";

// справочники
const DEV = { id: "dev", roleId: "rDev" };
const ADS = { id: "ads", roleId: "rAds" };
const CREA = { id: "crea", roleId: "rCrea" };
const IT = { id: "it", roleId: null };
const FRONT = "front"; // подтип Разработки
const GOOGLE = "google"; // подтип Рекламы

const user = (id: string, level: number, extra: Partial<AccessUser> = {}): AccessUser => ({
  id,
  level,
  roleIds: [],
  grants: [],
  subordinateIds: [],
  ...extra,
});

const admin = user("admin", 4);
const anna = user("anna", 1, { roleIds: ["rCrea"] }); // креатив
const ivan = user("ivan", 1, { roleIds: ["rDev"] }); // разработчик
const tim = user("tim", 1, { roleIds: ["rAds"] }); // траффер
const lead = user("lead", 2, { roleIds: ["rAds"], subordinateIds: ["tim"] }); // руководитель группы рекламы
const devHead = user("devHead", 3, { roleIds: ["rDev"], grants: [{ directionId: "dev", subtypeId: null }] });
const frontHead = user("frontHead", 3, { roleIds: ["rDev"], grants: [{ directionId: "dev", subtypeId: FRONT }] });
const adsHead = user("adsHead", 3, { grants: [{ directionId: "ads", subtypeId: null }] });

const task = (p: Partial<AccessTask>): AccessTask => ({
  assigneeId: "x",
  creatorId: "admin",
  directionId: "it",
  subtypeId: null,
  ...p,
});

describe("видимість", () => {
  const ivansFront = task({ assigneeId: "ivan", directionId: "dev", subtypeId: FRONT });
  const ivansBackend = task({ assigneeId: "ivan", directionId: "dev" });
  const timsAds = task({ assigneeId: "tim", directionId: "ads", subtypeId: GOOGLE });

  it("рівень 1 бачить лише свої задачі", () => {
    expect(canViewTask(ivan, ivansFront)).toBe(true);
    expect(canViewTask(anna, ivansFront)).toBe(false);
    expect(canViewTask(tim, ivansBackend)).toBe(false);
  });

  it("рівень 1 бачить задачу, де він спостерігач або згаданий", () => {
    expect(canViewTask(anna, { ...ivansFront, watcherIds: ["anna"] })).toBe(true);
    expect(canViewTask(anna, { ...ivansFront, mentionIds: ["anna"] })).toBe(true);
    expect(canWorkOnTask(anna, { ...ivansFront, watcherIds: ["anna"] })).toBe(false);
    expect(canComment(anna, { ...ivansFront, mentionIds: ["anna"] })).toBe(true);
  });

  it("рівень 2 бачить задачі підлеглих, але не чужих", () => {
    expect(canViewTask(lead, timsAds)).toBe(true);
    expect(canViewTask(lead, ivansFront)).toBe(false);
  });

  it("рівень 3: «Розробка» включає «Фронт»", () => {
    expect(canViewTask(devHead, ivansFront)).toBe(true);
    expect(canViewTask(devHead, ivansBackend)).toBe(true);
    expect(canViewTask(devHead, timsAds)).toBe(false);
  });

  it("рівень 3: доступ лише до «Фронту» не відкриває решту розробки", () => {
    expect(canViewTask(frontHead, ivansFront)).toBe(true);
    expect(canViewTask(frontHead, ivansBackend)).toBe(false);
  });

  it("адмін бачить усе", () => {
    expect(canViewTask(admin, timsAds)).toBe(true);
  });

  it("рівень 2 без грантів не отримує доступу за напрямом", () => {
    expect(covers({ level: 2, grants: [{ directionId: "ads", subtypeId: null }] }, "ads", null)).toBe(false);
  });
});

describe("фільтр Prisma збігається з canViewTask", () => {
  it("адмін — без обмежень", () => expect(taskScopeWhere(admin)).toEqual({}));
  type Scope = { AND: [{ OR: object[] }, object] };
  it("рівень 1 — свої, відстежувані, згадки; без дошок-чернеток", () => {
    const w = taskScopeWhere(ivan) as Scope;
    expect(w.AND[0].OR).toHaveLength(4);
    expect(w.AND[1]).toEqual({ project: { isDraft: false } });
  });
  it("рівень 3 із грантом на підтип фільтрує за підтипом — і лише на доступних дошках", () => {
    const w = taskScopeWhere(frontHead) as Scope;
    const elevated = w.AND[0].OR.find((x) => "AND" in x) as { AND: [object, { OR: object[] }] };
    expect(elevated.AND[1].OR).toContainEqual({ directionId: "dev", subtypeId: FRONT });
    expect(JSON.stringify(elevated.AND[0])).toContain("accessAll");
  });
});

describe("доступ до дошок", () => {
  const closed = { projectId: "b1", projectAccessAll: false };
  it("керівник відділу не бачить задачі відділу на закритій дошці без доступу", () => {
    const t = task({ assigneeId: "ivan", directionId: "dev", ...closed });
    expect(canViewTask(devHead, t)).toBe(false);
    expect(canViewTask({ ...devHead, boardIds: ["b1"] }, t)).toBe(true);
  });
  it("керівник групи — так само", () => {
    const t = task({ assigneeId: "tim", directionId: "ads", ...closed });
    expect(canViewTask(lead, t)).toBe(false);
    expect(canManageTask(lead, t)).toBe(false);
    expect(canViewTask({ ...lead, boardIds: ["b1"] }, t)).toBe(true);
  });
  it("виконавець (наприклад, креатив) бачить свою задачу на будь-якій дошці, навіть без доступу до неї", () => {
    const t = task({ assigneeId: "anna", directionId: "crea", ...closed });
    expect(canViewTask(anna, t)).toBe(true);
    expect(canWorkOnTask(anna, t)).toBe(true);
    expect(canViewTask(anna, task({ assigneeId: "kate", directionId: "crea", ...closed }))).toBe(false);
  });
  it("дошка, відкрита всім, — як раніше", () => {
    expect(canViewTask(devHead, task({ assigneeId: "ivan", directionId: "dev", projectId: "b2", projectAccessAll: true }))).toBe(true);
  });
  it("сторінка дошки: відкрита всім, свій доступ, адмін", () => {
    expect(canViewBoard(ivan, { id: "b1", accessAll: false })).toBe(false);
    expect(canViewBoard({ ...ivan, boardIds: ["b1"] }, { id: "b1", accessAll: false })).toBe(true);
    expect(canViewBoard(ivan, { id: "b2", accessAll: true })).toBe(true);
    expect(canViewBoard(admin, { id: "b1", accessAll: false })).toBe(true);
    expect(canViewBoard(ivan, { id: "b2", accessAll: true, isDraft: true })).toBe(false);
  });
});

describe("статуси: виконавець здає, постановник приймає", () => {
  const COL = (name: string, isDone = false) => ({ name, isDone });
  const t = task({ assigneeId: "ivan", creatorId: "admin", directionId: "dev" });
  const byLead = task({ assigneeId: "tim", creatorId: "lead", directionId: "ads" });
  it("виконавець — лише «Чекає відповіді» і «Перевірка»", () => {
    expect(canSetColumn(ivan, t, COL("Чекає відповіді"))).toBe(true);
    expect(canSetColumn(ivan, t, COL("Чекає відповіді"))).toBe(true);
    expect(canSetColumn(ivan, t, COL("Перевірка"))).toBe(true);
    expect(canSetColumn(ivan, t, COL("Ідея"))).toBe(false);
    expect(canSetColumn(ivan, t, COL("В роботі"))).toBe(false);
    expect(canSetColumn(ivan, t, COL("Готово", true))).toBe(false);
  });
  it("«Готово» ставить лише постановник (і адмін)", () => {
    expect(canSetColumn(lead, byLead, COL("Готово", true))).toBe(true);
    expect(canSetColumn(admin, byLead, COL("Готово", true))).toBe(true);
    expect(canSetColumn(tim, byLead, COL("Готово", true))).toBe(false);
  });
  it("керівник відділу (не постановник) рухає, але не закриває", () => {
    expect(canSetColumn(devHead, t, COL("В роботі"))).toBe(true);
    expect(canSetColumn(devHead, t, COL("Готово", true))).toBe(false);
  });
  it("своя задача собі — будь-який статус, зокрема «Готово»", () => {
    const own = task({ assigneeId: "ivan", creatorId: "ivan", directionId: "dev" });
    expect(canSetColumn(ivan, own, COL("Готово", true))).toBe(true);
    expect(canSetColumn(ivan, own, COL("Ідея"))).toBe(true);
  });
});

describe("дошка-чернетка", () => {
  const t = task({ assigneeId: "ivan", creatorId: "ivan", directionId: "dev", projectDraft: true });
  it("бачать лише адміни — навіть виконавець і автор не бачать", () => {
    expect(canViewTask(admin, t)).toBe(true);
    expect(canViewTask(ivan, t)).toBe(false);
    expect(canViewTask(devHead, t)).toBe(false);
    expect(canWorkOnTask(ivan, t)).toBe(false);
    expect(canManageTask(ivan, t)).toBe(false);
  });
});

describe("керування задачею", () => {
  it("виконавець працює в картці, але не керує чужою постановкою", () => {
    const t = task({ assigneeId: "ivan", creatorId: "admin", directionId: "dev" });
    expect(canWorkOnTask(ivan, t)).toBe(true);
    expect(canManageTask(ivan, t)).toBe(false);
  });
  it("свою задачу собі виконавець править сам", () => {
    expect(canManageTask(ivan, task({ assigneeId: "ivan", creatorId: "ivan" }))).toBe(true);
  });
  it("керівник групи керує задачами підлеглих", () => {
    expect(canManageTask(lead, task({ assigneeId: "tim", directionId: "ads" }))).toBe(true);
    expect(canManageTask(lead, task({ assigneeId: "ivan", directionId: "ads" }))).toBe(false);
  });
});

describe("призначення", () => {
  it("Айті — будь-якому працівнику", () => {
    expect(assignDecision(lead, tim, IT, null)).toBe("direct");
    expect(assignDecision(ivan, ivan, IT, null)).toBe("direct");
  });
  it("рівень 1 ставить задачі лише собі, решту — запитом", () => {
    expect(assignDecision(ivan, ivan, DEV, null)).toBe("direct");
    expect(assignDecision(ivan, tim, IT, null)).toBe("request");
  });
  it("за роллю: Реклама — на Маркетолога", () => {
    expect(assignDecision(lead, tim, ADS, GOOGLE)).toBe("direct");
    expect(assignDecision(lead, lead, ADS, null)).toBe("direct");
  });
  it("рівень 2 не ставить підлеглому задачу не за роллю — іде запитом", () => {
    expect(assignDecision(lead, tim, DEV, null)).toBe("request");
  });
  it("рівень 2 ставить напряму людині з іншого відділу (за її роллю), але бачить лише свою задачу", () => {
    expect(assignDecision(lead, ivan, DEV, null)).toBe("direct");
    expect(assignDecision(lead, anna, CREA, null)).toBe("direct");
    expect(assignDecision(lead, anna, DEV, null)).toBe("request"); // роль не подходит отделу
    const mine = task({ assigneeId: "ivan", creatorId: "lead", directionId: "dev" });
    const others = task({ assigneeId: "ivan", creatorId: "admin", directionId: "dev" });
    expect(canViewTask(lead, mine)).toBe(true);
    expect(canManageTask(lead, mine)).toBe(true);
    expect(canViewTask(lead, others)).toBe(false);
    expect(canManageTask(lead, others)).toBe(false);
  });
  it("рівень 1 не керує задачею, яку створив іншому (вона прийшла через запит)", () => {
    expect(canManageTask(ivan, task({ assigneeId: "tim", creatorId: "ivan", directionId: "ads" }))).toBe(false);
  });
  it("рівень 3 робить винятки у своєму напрямі", () => {
    expect(assignDecision(devHead, anna, DEV, null)).toBe("direct");
    expect(assignDecision(devHead, anna, ADS, null)).toBe("request");
    expect(assignDecision(frontHead, anna, DEV, FRONT)).toBe("direct");
    expect(assignDecision(frontHead, anna, DEV, null)).toBe("request");
  });
  it("Креатив призначає будь-кому — через підтвердження адміна", () => {
    expect(assignDecision(anna, ivan, CREA, null)).toBe("request");
  });
  it("адмін призначає будь-кого, крім вимкнених", () => {
    expect(assignDecision(admin, anna, ADS, null)).toBe("direct");
    expect(assignDecision(admin, { ...anna, active: false }, IT, null)).toBe("forbidden");
  });
  it("adsHead без ролі ставить рекламу собі — за грантом", () => {
    expect(assignDecision(adsHead, adsHead, ADS, null)).toBe("direct");
  });
});

describe("ролі", () => {
  it("«Фронт» зараховує «Розробника»", () => {
    const roles = [
      { id: "rDev", parentId: null },
      { id: "rFront", parentId: "rDev" },
    ];
    expect(expandRoles(["rFront"], roles).sort()).toEqual(["rDev", "rFront"]);
  });
});

describe("перенесення строку", () => {
  const a = new Date("2026-11-10T07:00:00Z");
  const b = new Date("2026-11-11T07:00:00Z");
  it("високий — не можна, крім адміна", () => {
    expect(deadlineChange(ivan, "HIGH", a, b)).toBe("forbidden");
    expect(deadlineChange(admin, "HIGH", a, b)).toBe("warn");
  });
  it("середній — з позначкою, низький — вільно", () => {
    expect(deadlineChange(ivan, "MEDIUM", a, b)).toBe("warn");
    expect(deadlineChange(ivan, "LOW", a, b)).toBe("ok");
  });
  it("перше встановлення і той самий строк — не перенесення", () => {
    expect(deadlineChange(ivan, "HIGH", null, b)).toBe("ok");
    expect(deadlineChange(ivan, "HIGH", a, new Date(a))).toBe("ok");
  });
});
