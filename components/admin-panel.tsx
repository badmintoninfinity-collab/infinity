"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClubSession, Profile } from "@/lib/types";

export function AdminPanel({ pendingPlayers, activeSession, activePlayerCount }: { pendingPlayers: Profile[]; activeSession: ClubSession | null; activePlayerCount: number }) {
  const router = useRouter();
  const [sessionName, setSessionName] = useState("");
  const [courtCount, setCourtCount] = useState(2);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function adminAction(action: string, params: Record<string, unknown>) {
    try {
      const response = await fetch("/api/admin-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, params }),
      });
      const result = await response.json() as { error?: string };
      return response.ok ? null : result.error ?? "Aksi admin gagal.";
    } catch {
      return "Koneksi terputus. Coba lagi.";
    }
  }

  async function approvePlayer(playerId: string, approve: boolean) {
    setBusyId(playerId); setMessage(""); setErrorMessage("");
    const error = await adminAction("review_player", { p_player_id: playerId, p_approve: approve });
    setBusyId("");
    if (error) setErrorMessage(error.includes("player_email_not_confirmed") ? "Pemain perlu mengonfirmasi email terlebih dahulu." : error);
    else { setMessage(approve ? "Pemain disetujui." : "Pendaftaran pemain ditolak."); router.refresh(); }
  }

  async function createSession() {
    setBusyId("create"); setMessage(""); setErrorMessage("");
    const error = await adminAction("create_club_session", { p_name: sessionName.trim() || null, p_court_count: courtCount });
    setBusyId("");
    if (error) setErrorMessage(error.includes("an_active_session_already_exists") ? "Masih ada sesi aktif. Tutup sesi tersebut sebelum membuat sesi baru." : error);
    else { setMessage("Sesi berhasil dibuat."); setSessionName(""); router.refresh(); }
  }

  return <>
    <div className="page-heading"><p className="eyebrow">ADMINISTRATOR</p><h1>Kelola PB</h1><p>Setujui pemain dan atur sesi bermain. Satu lapangan menyediakan 10 tempat.</p></div>
    {message && <p className="toast" role="status">{message}</p>}{errorMessage && <p className="toast error" role="alert">{errorMessage}</p>}

    <section className="surface">
      <div className="surface-heading"><div><h2>Pemain menunggu persetujuan</h2><p>Pastikan pemain sudah mengonfirmasi alamat emailnya.</p></div><span className="count-badge">{pendingPlayers.length}</span></div>
      {pendingPlayers.length ? <ul className="manage-list">{pendingPlayers.map((player) => <li className="approval-row" key={player.id}><span className="avatar">{player.display_name.slice(0, 1).toUpperCase()}</span><span className="approval-name"><strong>{player.display_name}</strong><small>{player.email}</small></span><button className="button button-small" disabled={busyId === player.id} onClick={() => void approvePlayer(player.id, true)}>Setujui</button><button className="small-action reject-action" disabled={busyId === player.id} onClick={() => void approvePlayer(player.id, false)}>Tolak</button></li>)}</ul> : <div className="empty-state compact-empty"><strong>Tidak ada pemain baru</strong><p>Pendaftaran yang menunggu persetujuan akan muncul di sini.</p></div>}
    </section>

    {activeSession ? <section className="surface admin-active-session"><div className="surface-heading"><div><p className="eyebrow">SESI AKTIF</p><h2>{activeSession.name}</h2><p>{activeSession.court_count} lapangan · {activeSession.court_count * 10} tempat · {activePlayerCount} pemain hadir</p></div><span className="live-label">AKTIF</span></div><Link className="button" href="/sesi-sekarang">Kelola sesi & permainan →</Link><p className="hint">Atur lapangan, absen, pertandingan, shuttlecock, dan penutupan sesi di halaman ini.</p></section> : <section className="surface">
      <div className="surface-heading"><div><h2>Buat sesi baru</h2><p>Default dua lapangan; ubah sesuai kebutuhan dan tambah 10 tempat per lapangan.</p></div></div>
      <label className="field"><span className="form-label">Nama sesi (opsional)</span><input className="text-input" maxLength={80} placeholder="Contoh: Latihan Rabu malam" value={sessionName} onChange={(event) => setSessionName(event.target.value)} /></label>
      <div className="capacity-control create-capacity"><button type="button" className="stepper" aria-label="Kurangi satu lapangan" disabled={courtCount <= 1} onClick={() => setCourtCount((count) => Math.max(1, count - 1))}>−</button><div><strong>{courtCount} lapangan</strong><span>{courtCount * 10} pemain</span></div><button type="button" className="stepper" aria-label="Tambah satu lapangan" disabled={courtCount >= 20} onClick={() => setCourtCount((count) => Math.min(20, count + 1))}>+</button></div>
      <button className="button wide-button" disabled={busyId === "create"} onClick={() => void createSession()}>{busyId === "create" ? "Membuat sesi…" : "Buat sesi"}</button>
    </section>}
    <section className="admin-note"><span aria-hidden="true">🔒</span><p>Akun administrator dibuat dengan mengubah peran profil pertama melalui SQL Supabase. Pendaftaran dari aplikasi selalu dimulai sebagai pemain.</p></section>
  </>;
}
