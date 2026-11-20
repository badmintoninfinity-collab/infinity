"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export function PasswordResetRequestForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setBusy(false);
    setMessage(error
      ? "Tautan belum dapat dikirim. Coba lagi beberapa saat."
      : "Jika email tersebut terdaftar, tautan untuk membuat kata sandi baru sudah dikirim. Periksa inbox dan folder spam.");
  }

  return <>
    <form onSubmit={submit}>
      <label className="field"><span className="form-label">Email akun</span><input className="text-input" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <button className="button wide-button" type="submit" disabled={busy}>{busy ? "Mengirim…" : "Kirim tautan reset"}</button>
    </form>
    {message && <p className="form-message" role="status">{message}</p>}
    <p className="auth-switch"><Link href="/login">Kembali ke login</Link></p>
  </>;
}
