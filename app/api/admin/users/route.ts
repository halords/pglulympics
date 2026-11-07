import { NextResponse } from "next/server";
import { validateCreateUserInput } from "../../../../lib/admin-users";
import { getAdminUserRow, listAdminUsers, requireSuperAdmin } from "../../../../lib/supabase/server";

// Super-admin user management (migration 8). Every handler re-validates the
// caller's session + super_admin profile server-side before touching the
// service-role client. Temporary passwords arrive in the request body, are
// handed straight to the Supabase Auth Admin API, and are never stored,
// logged, or echoed back. (Handlers read the Authorization header, so they
// always run at request time — no segment config needed with cacheComponents.)

export async function GET(req: Request) {
  const gate = await requireSuperAdmin(req);
  if (!gate.ok) return gate.response;
  try {
    return NextResponse.json({ users: await listAdminUsers(gate.svc) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to list users." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const gate = await requireSuperAdmin(req);
  if (!gate.ok) return gate.response;
  const parsed = validateCreateUserInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { email, password, displayName, role, sportIds } = parsed.value;
  const svc = gate.svc;

  const { data: created, error: createError } = await svc.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: displayName ? { display_name: displayName } : undefined,
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? "Could not create the auth user." }, { status: 400 });
  }
  const userId = created.user.id;
  try {
    const { error: profileError } = await svc.from("account_profiles").insert({
      user_id: userId, role, display_name: displayName, sport_id: null, active: true,
    });
    if (profileError) throw new Error(profileError.message);
    if (role === "coordinator" && sportIds.length) {
      const { error: assignError } = await svc.from("account_sport_assignments")
        .insert(sportIds.map((sport_id) => ({ user_id: userId, sport_id })));
      if (assignError) throw new Error(assignError.message);
    }
  } catch (e) {
    // Roll back the orphan auth account so a failed create leaves nothing behind.
    await svc.auth.admin.deleteUser(userId).catch(() => undefined);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Profile setup failed; user rolled back." }, { status: 500 });
  }
  return NextResponse.json({ user: await getAdminUserRow(svc, userId) }, { status: 201 });
}
