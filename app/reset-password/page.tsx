import { cookies } from "next/headers";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { getAuthContext } from "@/lib/auth-context";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const [cookieStore, { user }] = await Promise.all([cookies(), getAuthContext()]);
  const recoveryReady = cookieStore.get("password_recovery")?.value === "1" && Boolean(user);

  return <section className="login-card">
    <div className="login-mark" aria-hidden="true">🔑</div>
    <p className="eyebrow">VERIFIKASI EMAIL</p>
    <h1>Buat kata sandi baru</h1>
    <p>{recoveryReady ? "Tautan email terverifikasi. Masukkan kata sandi baru untuk akunmu." : "Halaman ini hanya bisa dibuka dari tautan reset password yang dikirim ke email."}</p>
    <PasswordRecoveryForm ready={recoveryReady} />
  </section>;
}
