import { NextResponse } from "next/server";
import { validateUpdateUserInput } from "../../../../../lib/admin-users";
import { getAdminUserRow, requireSuperAdmin } from "../../../../../lib/supabase/server";

// Update one user: role, display name, sport assignments, active state.
// Deactivation flips account_profiles.active AND bans the auth account
// (reactivation unbans). An admin cannot deactivate or demote themselves.
// (Handlers read the Authorization header, so they always run at request time.)

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin(req);
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const parsed = validateUpdateUserInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const patch = parsed.value;
  const svc = gate.svc;

  const { data: target, error: targetError } = await svc.auth.admin.getUserById(id);
  if (targetError || !target.user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  if (id === gate.callerId && (patch.active === false || (patch.role && patch.role !== "super_admin"))) {
    return NextResponse.json({ error: "You cannot deactivate or demote your own account." }, { status: 400 });
  }

  const { data: existing } = await svc.from("account_profiles")
    .select("user_id, role").eq("user_id", id).maybeSingle();
  if (!existing && !patch.role) {
    return NextResponse.json({ error: "This account has no profile yet — set a role to create one." }, { status: 400 });
  }

  const profilePatch: Record<string, unknown> = { user_id: id };
  if (patch.role) profilePatch.role = patch.role;
  if (patch.displayName !== undefined) profilePatch.display_name = patch.displayName;
  if (patch.active !== undefined) profilePatch.active = patch.active;
  if (!existing) profilePatch.sport_id = null;
  if (Object.keys(profilePatch).length > 1) {
    const { error } = await svc.from("account_profiles").upsert(profilePatch, { onConflict: "user_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const effectiveRole = patch.role ?? (existing?.role as string | undefined);
  if (patch.sportIds !== undefined || patch.role) {
    const { error: delError } = await svc.from("account_sport_assignments").delete().eq("user_id", id);
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
    const next = effectiveRole === "coordinator" ? (patch.sportIds ?? []) : [];
    if (patch.sportIds === undefined && patch.role === "coordinator") {
      // Role changed to coordinator without a sport list: keep it empty; the
      // admin assigns sports next (account has no sport access until then).
    } else if (next.length) {
      const { error: insError } = await svc.from("account_sport_assignments")
        .insert(next.map((sport_id) => ({ user_id: id, sport_id })));
      if (insError) return NextResponse.json({ error: insError.message }, { status: 500 });
    }
  }

  let warning: string | undefined;
  if (patch.active !== undefined) {
    const { error: banError } = await svc.auth.admin.updateUserById(id, {
      ban_duration: patch.active ? "none" : "876000h", // ~100 years = deactivated
    });
    if (banError) warning = `Profile updated, but the sign-in ${patch.active ? "unban" : "ban"} failed: ${banError.message}`;
  }

  const user = await getAdminUserRow(svc, id);
  return NextResponse.json({ user, ...(warning ? { warning } : {}) });
}
