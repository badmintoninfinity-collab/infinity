import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin !== request.nextUrl.origin) return NextResponse.json({ error: "Origin tidak diizinkan." }, { status: 403 });
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return NextResponse.json({ error: "Format permintaan tidak valid." }, { status: 415 });

  const { user, profile } = await getAuthContext();
  if (!user || profile?.approval_status !== "approved") return NextResponse.json({ error: "Login pemain yang disetujui diperlukan." }, { status: 401 });

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const leaderPhone = process.env.WHATSAPP_LEADER_PHONE?.replace(/\D/g, "");
  if (!phoneNumberId || !accessToken || !leaderPhone) {
    return NextResponse.json({ error: "Antrean penuh. Konfigurasi WhatsApp ketua PB belum dipasang." }, { status: 503 });
  }
  if (!isSupabaseServiceConfigured()) return NextResponse.json({ error: "Notifikasi belum dapat diproses oleh server." }, { status: 503 });

  let payload: { session_id?: unknown };
  try {
    payload = await request.json() as { session_id?: unknown };
  } catch {
    return NextResponse.json({ error: "Data sesi tidak valid." }, { status: 400 });
  }
  if (typeof payload.session_id !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.session_id)) {
    return NextResponse.json({ error: "Data sesi tidak valid." }, { status: 400 });
  }

  const userClient = await createClient();
  const { data: queue, error: queueError } = await userClient
    .from("session_waitlist")
    .select("player_id,queued_at")
    .eq("session_id", payload.session_id)
    .order("queued_at", { ascending: true })
    .order("player_id", { ascending: true });
  if (queueError) return NextResponse.json({ error: "Daftar tunggu belum dapat diperiksa." }, { status: 503 });
  if (queue.length !== 10 || queue[9]?.player_id !== user.id) return NextResponse.json({ ok: true, skipped: true });

  const service = createServiceClient();
  const { data: claimData, error: claimError } = await service.rpc("claim_waitlist_full_alert", { p_session_id: payload.session_id });
  if (claimError) return NextResponse.json({ error: "Notifikasi belum dapat diproses." }, { status: 503 });
  const claim = claimData as { claimed?: boolean; session_name?: string; court_count?: number; waiting_count?: number } | null;
  if (!claim?.claimed) return NextResponse.json({ ok: true, alreadyHandled: true });

  const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || "v27.0";
  if (!/^v\d+\.\d+$/.test(apiVersion)) {
    await service.rpc("finish_waitlist_full_alert", { p_session_id: payload.session_id, p_succeeded: false });
    return NextResponse.json({ error: "Versi WhatsApp API belum valid." }, { status: 503 });
  }

  let delivered = false;
  try {
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: leaderPhone,
        type: "template",
        template: {
          name: process.env.WHATSAPP_TEMPLATE_NAME || "infinity_session_full",
          language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "id" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: claim.session_name ?? "Sesi bermain" },
              { type: "text", text: String(claim.waiting_count ?? 10) },
              { type: "text", text: String(claim.court_count ?? 0) },
            ],
          }],
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    delivered = response.ok;
  } catch {
    delivered = false;
  }

  const { error: finishError } = await service.rpc("finish_waitlist_full_alert", {
    p_session_id: payload.session_id,
    p_succeeded: delivered,
  });
  if (!delivered || finishError) return NextResponse.json({ error: "Notifikasi WhatsApp gagal dikirim. Periksa pengaturan WhatsApp atau hubungi admin PB." }, { status: 502 });
  return NextResponse.json({ ok: true, sent: true });
}
