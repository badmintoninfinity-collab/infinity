import { PasswordResetRequestForm } from "@/components/password-reset-request-form";
import { getAuthContext } from "@/lib/auth-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const [{ user }, params] = await Promise.all([getAuthContext(), searchParams]);
  return <section className="login-card">
    <div className="login-mark" aria-hidden="true">🔐</div>
    <p className="eyebrow">AKUN PEMAIN</p>
    <h1>Lupa kata sandi?</h1>
    <p>Masukkan email akunmu. Kami akan mengirim tautan untuk membuat kata sandi baru.</p>
    {params.expired === "1" && <p className="form-message" role="status">Tautan reset tidak berlaku atau sudah kedaluwarsa. Minta tautan baru di bawah ini.</p>}
    {isSupabaseConfigured()
      ? <PasswordResetRequestForm initialEmail={user?.email ?? ""} />
      : <p className="form-message">Fitur email pemain belum dikonfigurasi.</p>}
  </section>;
}
