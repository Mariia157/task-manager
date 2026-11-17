import { describe, expect, it } from "vitest";
import { generatePassword } from "@/components/ui/PasswordField";

describe("генератор пароля", () => {
  it("15 символів, є мала, велика літера й цифра, без схожих знаків", () => {
    for (let i = 0; i < 300; i++) {
      const p = generatePassword(15);
      expect(p).toHaveLength(15);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });
  it("паролі не повторюються", () => {
    const set = new Set(Array.from({ length: 500 }, () => generatePassword(15)));
    expect(set.size).toBe(500);
  });
});
