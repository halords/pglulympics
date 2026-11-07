// Shared shapes + input validation for the super-admin user-management API
// (app/api/admin/users). Pure module: imported by the route handlers AND the
// admin UI, and unit-tested. Passwords pass through validation only — they are
// never stored, logged, or returned by any code path here.

export type AdminRole = "super_admin" | "coordinator";

export interface AdminUserRow {
  userId: string;
  email: string;
  displayName: string | null;
  role: AdminRole | null; // null = auth account without a profile row
  sportIds: string[];
  active: boolean;
  createdAt: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string | null;
  role: AdminRole;
  sportIds: string[];
}

export interface UpdateUserInput {
  displayName?: string | null;
  role?: AdminRole;
  sportIds?: string[];
  active?: boolean;
}

type Parse<T> = { ok: true; value: T } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseRole(v: unknown): AdminRole | null {
  return v === "super_admin" || v === "coordinator" ? v : null;
}

function parseSportIds(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const ids = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return ids.length === v.length ? [...new Set(ids)] : null;
}

function parseDisplayName(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : null;
}

export function validateCreateUserInput(body: unknown): Parse<CreateUserInput> {
  if (!isRecord(body)) return { ok: false, error: "Request body must be a JSON object." };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (typeof body.password !== "string" || body.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Temporary password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const role = parseRole(body.role);
  if (!role) return { ok: false, error: "Role must be 'super_admin' or 'coordinator'." };
  const sportIds = body.sportIds === undefined ? [] : parseSportIds(body.sportIds);
  if (!sportIds) return { ok: false, error: "sportIds must be an array of sport id strings." };
  if (role === "coordinator" && sportIds.length === 0) {
    return { ok: false, error: "A coordinator needs at least one assigned sport." };
  }
  const displayName = parseDisplayName(body.displayName);
  if (displayName === undefined && body.displayName !== undefined) {
    return { ok: false, error: "displayName must be a string." };
  }
  return {
    ok: true,
    value: { email, password: body.password, displayName: displayName ?? null, role, sportIds: role === "super_admin" ? [] : sportIds },
  };
}

export function validateUpdateUserInput(body: unknown): Parse<UpdateUserInput> {
  if (!isRecord(body)) return { ok: false, error: "Request body must be a JSON object." };
  const out: UpdateUserInput = {};
  if (body.role !== undefined) {
    const role = parseRole(body.role);
    if (!role) return { ok: false, error: "Role must be 'super_admin' or 'coordinator'." };
    out.role = role;
  }
  if (body.sportIds !== undefined) {
    const sportIds = parseSportIds(body.sportIds);
    if (!sportIds) return { ok: false, error: "sportIds must be an array of sport id strings." };
    out.sportIds = sportIds;
  }
  if (body.displayName !== undefined) {
    const displayName = parseDisplayName(body.displayName);
    if (displayName === undefined) return { ok: false, error: "displayName must be a string or null." };
    out.displayName = displayName;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return { ok: false, error: "active must be a boolean." };
    out.active = body.active;
  }
  if (Object.keys(out).length === 0) return { ok: false, error: "Nothing to update." };
  if (out.role === "coordinator" && out.sportIds !== undefined && out.sportIds.length === 0) {
    return { ok: false, error: "A coordinator needs at least one assigned sport." };
  }
  return { ok: true, value: out };
}
