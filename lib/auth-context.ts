import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext, Profile } from "@/lib/types";

export async function getAuthContext(): Promise<AuthContext> {
  if (!isSupabaseConfigured()) return { user: null, profile: null };
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  const user = userResult.user;
  if (!user) return { user: null, profile: null };

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return {
    user: { id: user.id, email: user.email ?? undefined },
    profile: (data as Profile | null) ?? null,
  };
}
