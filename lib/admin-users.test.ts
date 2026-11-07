import { describe, expect, it } from "vitest";
import { validateCreateUserInput, validateUpdateUserInput } from "./admin-users";

describe("validateCreateUserInput", () => {
  const base = { email: "Coord@Example.com", password: "temp-pass-1", role: "coordinator", sportIds: ["vb", "bb"] };
  it("accepts and normalizes a coordinator", () => {
    const r = validateCreateUserInput({ ...base, displayName: "  Vic Ball  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.email).toBe("coord@example.com");
      expect(r.value.displayName).toBe("Vic Ball");
      expect(r.value.sportIds).toEqual(["vb", "bb"]);
    }
  });
  it("clears sportIds for super_admin", () => {
    const r = validateCreateUserInput({ ...base, role: "super_admin" });
    expect(r.ok && r.value.sportIds).toEqual([]);
  });
  it("rejects bad email, short password, bad role", () => {
    expect(validateCreateUserInput({ ...base, email: "nope" }).ok).toBe(false);
    expect(validateCreateUserInput({ ...base, password: "short" }).ok).toBe(false);
    expect(validateCreateUserInput({ ...base, role: "admin" }).ok).toBe(false);
    expect(validateCreateUserInput(null).ok).toBe(false);
  });
  it("rejects a coordinator with no sports", () => {
    expect(validateCreateUserInput({ ...base, sportIds: [] }).ok).toBe(false);
    expect(validateCreateUserInput({ email: base.email, password: base.password, role: "coordinator" }).ok).toBe(false);
  });
  it("dedupes sport ids", () => {
    const r = validateCreateUserInput({ ...base, sportIds: ["vb", "vb"] });
    expect(r.ok && r.value.sportIds).toEqual(["vb"]);
  });
});

describe("validateUpdateUserInput", () => {
  it("accepts partial updates", () => {
    expect(validateUpdateUserInput({ active: false }).ok).toBe(true);
    expect(validateUpdateUserInput({ role: "super_admin" }).ok).toBe(true);
    expect(validateUpdateUserInput({ sportIds: ["vb"] }).ok).toBe(true);
    expect(validateUpdateUserInput({ displayName: null }).ok).toBe(true);
  });
  it("rejects empty and malformed updates", () => {
    expect(validateUpdateUserInput({}).ok).toBe(false);
    expect(validateUpdateUserInput({ role: "owner" }).ok).toBe(false);
    expect(validateUpdateUserInput({ active: "yes" }).ok).toBe(false);
    expect(validateUpdateUserInput({ sportIds: "vb" }).ok).toBe(false);
    expect(validateUpdateUserInput({ role: "coordinator", sportIds: [] }).ok).toBe(false);
  });
});
