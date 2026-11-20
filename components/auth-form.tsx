"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ playersEnabled, legacyAdminEnabled }: { playersEnabled: boolean; legacyAdminEnabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "admin">(() => !playersEnabled && legacyAdminEnabled ? "admin" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    if (mode === "admin") {
      const response = await fetch("/api/admin-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json() as { error?: string };
      setBusy(false);
      if (!response.ok) {
        setMessage(result.error ?? "Login admin gagal.");
        return;
      }
      router.replace("/");
      router.refresh();
      return;
    }
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() }, emailRedirectTo: redirectTo } });
    setBusy(false);
    if (result.error) {
      const errorMessage = result.error.message.toLowerCase();
      setMessage(errorMessage === "invalid login credentials" ? "Email atau kata sandi belum benar." : errorMessage.includes("email not confirmed") || errorMessage.includes("email_not_confirmed") ? "Konfirmasi email dari kotak masukmu sebelum login." : result.error.message);
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setMessage("Pendaftaran berhasil. Cek email untuk mengonfirmasi akun, lalu tunggu admin menyetujui akun pemainmu.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return <section className="login-card">
    <div className="login-mark" aria-hidden="true">🏸</div>
    <p className="eyebrow">INFINITY BADMINTON</p>
    <h1>{mode === "admin" ? "Login administrator" : mode === "login" ? "Masuk ke akun pemain" : "Daftar sebagai pemain"}</h1>
    <p>{mode === "admin" ? "Masuk dengan kata sandi administrator yang sudah diberikan." : mode === "login" ? "Gunakan email terverifikasi untuk melihat sesi dan mencatat kehadiran." : "Buat akun pemain. Konfirmasi email diperlukan sebelum admin dapat menyetujui akunmu."}</p>
    <form onSubmit={submit}>
      {mode === "signup" && <label className="field"><span className="form-label">Nama pemain</span><input className="text-input" required maxLength={60} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>}
      {mode !== "admin" && <label className="field"><span className="form-label">Email</span><input className="text-input" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
      <label className="field"><span className="form-label">{mode === "admin" ? "Kata sandi admin" : "Kata sandi"}</span><input className="text-input" type="password" required minLength={mode === "admin" ? 1 : 8} autoComplete={mode === "login" || mode === "admin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button className="button wide-button" type="submit" disabled={busy || (mode !== "admin" && !playersEnabled)}>{busy ? "Memproses…" : mode === "admin" ? "Masuk sebagai admin" : mode === "login" ? "Masuk" : "Buat akun pemain"}</button>
    </form>
    {!playersEnabled && mode !== "admin" && <p className="form-message">Login pemain belum dikonfigurasi. Isi URL dan publishable key Supabase untuk mengaktifkan akun pemain.</p>}
    {message && <p className="form-message" role="status">{message}</p>}
    {playersEnabled && mode !== "admin" && <p className="auth-switch">{mode === "signup" ? "Sudah punya akun?" : "Belum punya akun?"} <button type="button" onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setMessage(""); }}>{mode === "signup" ? "Masuk pemain" : "Buat akun pemain"}</button></p>}
    {legacyAdminEnabled && <p className="auth-switch">{mode === "admin" ? "Kembali ke login pemain?" : "Administrator?"} <button type="button" onClick={() => { setMode(mode === "admin" ? "login" : "admin"); setMessage(""); setPassword(""); }}>{mode === "admin" ? "Login pemain" : "Login admin"}</button></p>}
  </section>;
}
