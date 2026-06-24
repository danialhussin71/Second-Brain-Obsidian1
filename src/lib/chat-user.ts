import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServer, getCurrentUser } from "@/lib/supabase/server";

/**
 * Resolve the "effective" chat user + a Supabase client scoped to them.
 *
 * Two modes:
 *   1. Authenticated  — a real Supabase session exists. We return the request
 *      cookie client (RLS enforced, auth.uid() = user_id) and the real user id.
 *   2. Local single-user — no session (self-hosted dev, no login flow). We fall
 *      back to the ADMIN client (service role, RLS bypassed) and a stable seeded
 *      local user so conversations/messages persist and satisfy the auth.users
 *      FK without anyone having to log in.
 *
 * Returns null only when neither a session NOR the admin client is configured
 * (callers then 401). The local user is seeded once and memoised per process.
 */

const LOCAL_EMAIL = "local@second-brain.local";
let localUserIdCache: string | null = null;

export type ChatUser = { id: string; sb: SupabaseClient; mode: "auth" | "local" };

export async function resolveChatUser(): Promise<ChatUser | null> {
  // 1. Real session?
  const user = await getCurrentUser();
  if (user) {
    const sb = await createSupabaseServer();
    return { id: user.id, sb, mode: "auth" };
  }

  // 2. Local single-user fallback via the admin client.
  let createAdminClient: () => SupabaseClient;
  try {
    ({ createAdminClient } = await import("@/lib/supabase/admin"));
  } catch {
    return null;
  }
  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    return null; // service role not configured
  }

  const id = await ensureLocalUser(admin);
  if (!id) return null;
  return { id, sb: admin, mode: "local" };
}

/** Find-or-create the stable local auth user. Memoised after first resolve. */
async function ensureLocalUser(admin: SupabaseClient): Promise<string | null> {
  if (localUserIdCache) return localUserIdCache;
  try {
    // Look for an existing local user (first page is plenty for single-user).
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users?.find((u) => u.email === LOCAL_EMAIL);
    if (existing) {
      localUserIdCache = existing.id;
      return existing.id;
    }
    const { data: created, error } = await admin.auth.admin.createUser({
      email: LOCAL_EMAIL,
      email_confirm: true,
      user_metadata: { local: true, label: "Local Owner" },
    });
    if (error || !created?.user) return null;
    localUserIdCache = created.user.id;
    return created.user.id;
  } catch {
    return null;
  }
}
