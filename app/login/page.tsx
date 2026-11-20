import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getAuthContext } from "@/lib/auth-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isLegacyAdmin, legacyAdminEnabled } from "@/lib/legacy-admin";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isLegacyAdmin()) redirect("/");
  const { user } = await getAuthContext();
  if (user) redirect("/");
  return <AuthForm playersEnabled={isSupabaseConfigured()} legacyAdminEnabled={legacyAdminEnabled()} />;
}
