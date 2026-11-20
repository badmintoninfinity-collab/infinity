import { NextResponse, type NextRequest } from "next/server";
import { LEGACY_ADMIN_COOKIE, isValidLegacyAdminToken } from "@/lib/legacy-admin";
import { createServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

const allowedActions = new Set([
  "review_player",
  "create_club_session",
  "update_session_capacity",
  "close_club_session",
  "admin_remove_player_from_session",
  "admin_start_match",
  "admin_finish_match",
]);

export async function POST(request: NextRequest) {
  if (!isValidLegacyAdminToken(request.cookies.get(LEGACY_ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: "Login admin diperlukan." }, { status: 401 });
  }
  const origin = request.headers.get("origin");
  if (origin !== request.nextUrl.origin) return NextResponse.json({ error: "Origin tidak diizinkan." }, { status: 403 });
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return NextResponse.json({ error: "Format permintaan tidak valid." }, { status: 415 });
  if (!isSupabaseServiceConfigured()) return NextResponse.json({ error: "Koneksi database server belum lengkap." }, { status: 503 });

  try {
    const { action, params } = await request.json() as { action?: unknown; params?: unknown };
    if (typeof action !== "string" || !allowedActions.has(action) || !params || typeof params !== "object" || Array.isArray(params)) {
      return NextResponse.json({ error: "Aksi admin tidak valid." }, { status: 400 });
    }
    const supabase = createServiceClient();
    const { error } = await supabase.rpc(action, params as Record<string, unknown>);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Permintaan admin tidak valid." }, { status: 400 });
  }
}
