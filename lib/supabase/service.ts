import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function isSupabaseServiceConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
}

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) throw new Error("Konfigurasi Supabase server belum lengkap.");
  return createSupabaseClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
