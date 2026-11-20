"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PasswordRecoveryForm({ ready }: { ready: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password !== confirmation) {
      setMessage("Konfirmasi kata sandi belum sama.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage("Kata sandi belum dapat diperbarui. Minta tautan reset baru dan coba lagi.");
      return;
    }

    try {
      await fetch("/api/auth/recovery", { method: "DELETE" });
    } finally {
      router.replace("/");
      router.refresh();
    }
  }

  if (!ready) return <p className="form-message" role="status"><Link href="/lupa-password">Minta tautan reset baru</Link></p>;

  return <>
    <form onSubmit={submit}>
      <label className="field"><span className="form-label">Kata sandi baru</span><input className="text-input" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label className="field"><span className="form-label">Ulangi kata sandi baru</span><input className="text-input" type="password" required minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      <button className="button wide-button" type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan kata sandi baru"}</button>
    </form>
    {message && <p className="form-message" role="alert">{message}</p>}
  </>;
}
