"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { MatchRecord } from "@/lib/types";
import type { SessionView } from "@/lib/db-queries";

function friendlyError(error: { message?: string } | null) {
  const message = error?.message ?? "Terjadi kendala. Coba lagi.";
  const known: Record<string, string> = {
    session_capacity_reached: "Kuota sesi sudah penuh.",
    waiting_list_full: "Daftar tunggu sudah penuh, berisi 10 pemain.",
    capacity_below_current_participants: "Jumlah lapangan tidak boleh membuat kuota di bawah jumlah pemain yang sudah absen.",
    finish_active_matches_first: "Selesaikan semua permainan yang sedang berjalan sebelum menutup sesi.",
    finish_active_match_before_leaving: "Selesaikan permainanmu terlebih dahulu sebelum keluar dari sesi.",
    finish_active_match_before_removal: "Pemain masih bertanding. Selesaikan permainannya terlebih dahulu.",
    choose_two_or_four_players: "Pilih 2 pemain untuk tunggal atau 4 pemain untuk ganda.",
    player_already_in_an_active_match: "Salah satu pemain sedang berada di permainan lain.",
    court_or_player_already_in_use: "Lapangan atau pemain tersebut baru saja digunakan di permainan lain.",
    court_number_out_of_range: "Nomor lapangan tidak sesuai dengan jumlah lapangan sesi.",
  };
  const key = Object.keys(known).find((candidate) => message.includes(candidate));
  return key ? known[key] : message;
}

export function SessionManager({ initialView, userId, isAdmin }: { initialView: SessionView; userId: string; isAdmin: boolean }) {
  const router = useRouter();
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [courtNumber, setCourtNumber] = useState(1);
  const [finishMatchId, setFinishMatchId] = useState<string | null>(null);
  const [shuttleCount, setShuttleCount] = useState("1");
  const [winnerTeam, setWinnerTeam] = useState("");
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [notificationError, setNotificationError] = useState("");
  const supabase = isAdmin ? null : createClient();

  const { session, players, participants, waitingList, matches, matchPlayers } = initialView;
  const names = new Map(players.map((player) => [player.id, player.display_name]));
  const participantById = new Map(participants.map((participant) => [participant.player_id, participant]));
  const present = participants.filter((participant) => participant.left_at === null);
  const inActiveMatch = new Set(matchPlayers.filter((entry) => matches.some((match) => match.id === entry.match_id && match.ended_at === null)).map((entry) => entry.player_id));
  const activeMatches = matches.filter((match) => match.ended_at === null);
  const availablePlayers = present.filter((participant) => !inActiveMatch.has(participant.player_id));
  const currentParticipation = participantById.get(userId);
  const currentWaitingIndex = waitingList.findIndex((entry) => entry.player_id === userId);
  const currentWaitingPosition = currentWaitingIndex < 0 ? 0 : currentWaitingIndex + 1;
  const activeCount = matches.filter((match) => match.ended_at !== null).reduce((total, match) => total + (match.shuttlecocks_used ?? 0), 0);
  const gamePlayerIds = useMemo(() => new Map(matchPlayers.map((entry) => [entry.match_id, matchPlayers.filter((item) => item.match_id === entry.match_id)])), [matches, matchPlayers]);

  useEffect(() => {
    if (!session) return;
    const refreshTimer = window.setInterval(() => router.refresh(), 15000);
    return () => window.clearInterval(refreshTimer);
  }, [router, session?.id]);

  useEffect(() => {
    if (isAdmin || !session || waitingList.length !== 10 || currentWaitingPosition !== 10) return;
    setNotificationError("");
    void fetch("/api/notifications/waitlist-full", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: session.id }),
    }).then(async (response) => {
      if (response.ok) return;
      const result = await response.json().catch(() => null) as { error?: string } | null;
      setNotificationError(result?.error ?? "Notifikasi WhatsApp belum terkirim. Hubungi admin PB.");
    }).catch(() => setNotificationError("Notifikasi WhatsApp belum terkirim. Hubungi admin PB."));
  }, [isAdmin, session?.id, waitingList.length, currentWaitingPosition]);

  async function adminAction(action: string, params: Record<string, unknown>) {
    try {
      const response = await fetch("/api/admin-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, params }),
      });
      const result = await response.json() as { error?: string };
      return { error: response.ok ? null : { message: result.error ?? "Aksi admin gagal." } };
    } catch {
      return { error: { message: "Koneksi terputus. Coba lagi." } };
    }
  }

  async function run(action: () => PromiseLike<{ error: { message?: string } | null; data?: unknown }>, success: string | ((data: unknown) => string)) {
    setBusy(true); setMessage(""); setErrorMessage("");
    let result: { error: { message?: string } | null; data?: unknown };
    try {
      result = await action();
    } catch {
      result = { error: { message: "Koneksi terputus. Coba lagi." } };
    }
    setBusy(false);
    if (result.error) setErrorMessage(friendlyError(result.error));
    else { setMessage(typeof success === "function" ? success(result.data) : success); setSelectedPlayers([]); setRemoveTarget(null); setFinishMatchId(null); router.refresh(); }
  }

  function togglePlayer(playerId: string) {
    setSelectedPlayers((current) => current.includes(playerId) ? current.filter((id) => id !== playerId) : current.length < 4 ? [...current, playerId] : current);
  }

  if (!session) return <>
    <div className="page-heading"><p className="eyebrow">SESI BERMAIN</p><h1>Belum ada sesi aktif</h1><p>{isAdmin ? "Buat sesi baru dari halaman Admin agar pemain bisa absen." : "Admin belum membuka sesi bermain. Cek lagi nanti ya."}</p></div>
    {isAdmin && <a className="button" href="/admin">Buka halaman Admin →</a>}
    {message && <p className="toast" role="status">{message}</p>}
  </>;

  const capacity = session.court_count * 10;
  const remainingSpots = Math.max(0, capacity - present.length);
  const sessionIsFull = remainingSpots === 0;
  const ownIsPresent = currentParticipation?.left_at === null;
  const canRemove = isAdmin;

  return <>
    <div className="page-heading"><p className="eyebrow">SESI BERMAIN</p><h1>Sesi sekarang</h1><p>Absen saat tiba, lalu lihat pemain dan pertandingan yang berlangsung.</p></div>
    <section className={`session-overview${sessionIsFull ? " session-overview-full" : ""}`}><div><strong>{session.name}</strong><p>{session.court_count} lapangan · kapasitas {capacity} pemain · {present.length} sudah absen</p></div><span className={sessionIsFull ? "capacity-state full" : "capacity-state open"}>{sessionIsFull ? "TEMPAT PENUH" : `${remainingSpots} tempat tersedia`}</span></section>

    <section className="surface">
      <div className="surface-heading"><div><h2>Kehadiran pemain</h2><p>{present.length} dari {capacity} tempat terisi</p></div><span className={sessionIsFull ? "capacity-pill capacity-pill-full" : "capacity-pill"}>{sessionIsFull ? "Penuh" : `${remainingSpots} tempat`}</span></div>
      <div className="capacity-meter" role="progressbar" aria-label="Kapasitas sesi" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={Math.min(present.length, capacity)}><span style={{ width: `${Math.min(100, (present.length / capacity) * 100)}%` }} /></div>
      {!isAdmin && (ownIsPresent ? <button className="button button-muted" disabled={busy || inActiveMatch.has(userId)} onClick={() => void run(() => supabase!.rpc("leave_club_session", { p_session_id: session.id }), "Kamu sudah keluar dari sesi. Jika ada antrean, pemain berikutnya akan langsung mendapat tempat.")}>{inActiveMatch.has(userId) ? "Selesaikan permainan untuk keluar" : "Keluar dari sesi"}</button>
        : currentWaitingIndex >= 0 ? <div className="waiting-own-status"><span>Kamu di urutan <strong>{currentWaitingPosition}</strong> dari {waitingList.length}</span><button className="button button-muted" disabled={busy} onClick={() => void run(() => supabase!.rpc("leave_session_waitlist", { p_session_id: session.id }), "Kamu keluar dari daftar tunggu.")}>Keluar antrean</button></div>
          : sessionIsFull ? <div className="waiting-join"><button className="button" disabled={busy || waitingList.length >= 10} onClick={() => void run(() => supabase!.rpc("join_session_waitlist", { p_session_id: session.id }), (data) => (data as { status?: string } | null)?.status === "attending" ? "Ada tempat kosong; kamu langsung masuk sesi." : "Kamu masuk daftar tunggu.")}>{waitingList.length >= 10 ? "Daftar tunggu penuh" : "Masuk daftar tunggu"}</button><small>{waitingList.length >= 10 ? "Antrean sudah mencapai batas 10 pemain." : "Urutan antrean mengikuti waktu pendaftaran."}</small></div>
            : <button className="button" disabled={busy} onClick={() => void run(() => supabase!.rpc("check_in_to_session", { p_session_id: session.id }), "Kehadiranmu sudah tercatat.")}>Absen hadir</button>)}
      {isAdmin && <p className="hint">Admin juga dapat mengelola kapasitas dan mengeluarkan pemain di daftar ini.</p>}
      {present.length ? <ul className="manage-list roster-list">{present.map((participant) => <li key={participant.player_id}><span className="avatar">{(names.get(participant.player_id) ?? "P").slice(0, 1).toUpperCase()}</span><strong>{names.get(participant.player_id) ?? "Pemain"}{participant.player_id === userId ? " (kamu)" : ""}</strong><small className="muted">{inActiveMatch.has(participant.player_id) ? "Sedang bermain" : "Hadir"}</small>{canRemove && <button className="small-action" disabled={busy || inActiveMatch.has(participant.player_id)} onClick={() => setRemoveTarget({ id: participant.player_id, name: names.get(participant.player_id) ?? "pemain ini" })}>Keluarkan</button>}</li>)}</ul>
        : <div className="empty-state compact-empty"><strong>Belum ada pemain yang absen</strong><p>Jadilah yang pertama hadir.</p></div>}
    </section>

    <section className="surface">
      <div className="surface-heading"><div><h2>Daftar tunggu</h2><p>Urut sesuai waktu masuk antrean (FIFO).</p></div><span className={waitingList.length >= 10 ? "capacity-pill capacity-pill-full" : "capacity-pill"}>{waitingList.length}/10</span></div>
      {notificationError && waitingList.length >= 10 && <p className="notice waitlist-alert-notice" role="status">{notificationError}</p>}
      {waitingList.length ? <ol className="waitlist-list">{waitingList.map((entry, index) => <li key={entry.player_id} className={entry.player_id === userId ? "waitlist-self" : ""}><span className="waitlist-position">{index + 1}</span><span className="avatar">{(names.get(entry.player_id) ?? "P").slice(0, 1).toUpperCase()}</span><strong>{names.get(entry.player_id) ?? "Pemain"}{entry.player_id === userId ? " (kamu)" : ""}</strong>{index === 0 && <small>Berikutnya masuk</small>}</li>)}</ol>
        : <div className="empty-state compact-empty"><strong>Belum ada antrean</strong><p>Jika tempat penuh, pemain dapat mendaftar di sini.</p></div>}
    </section>

    {isAdmin && <section className="surface">
      <div className="surface-heading"><div><h2>Kelola lapangan</h2><p>Satu lapangan menampung 10 pemain.</p></div></div>
      <div className="capacity-control"><button type="button" className="stepper" aria-label="Kurangi satu lapangan" disabled={busy || session.court_count <= 1} onClick={() => void run(() => adminAction("update_session_capacity", { p_session_id: session.id, p_court_count: session.court_count - 1 }), "Kapasitas lapangan diperbarui.")}>−</button><div><strong>{session.court_count} lapangan</strong><span>{capacity} pemain</span></div><button type="button" className="stepper" aria-label="Tambah satu lapangan" disabled={busy || session.court_count >= 20} onClick={() => void run(() => adminAction("update_session_capacity", { p_session_id: session.id, p_court_count: session.court_count + 1 }), "Kapasitas lapangan diperbarui.")}>+</button></div>
    </section>}

    {isAdmin && <section className="surface">
      <div className="surface-heading"><div><h2>Mulai permainan</h2><p>Pilih 2 pemain untuk tunggal atau 4 untuk ganda.</p></div></div>
      {availablePlayers.length < 2 ? <div className="notice">Perlu minimal dua pemain yang sudah absen dan tidak sedang bermain.</div> : <>
        <div className="attendance-grid">{availablePlayers.map((participant) => <div className="attendance-option" key={participant.player_id}><input id={`pick-${participant.player_id}`} type="checkbox" checked={selectedPlayers.includes(participant.player_id)} onChange={() => togglePlayer(participant.player_id)} /><label htmlFor={`pick-${participant.player_id}`}><span className="avatar">{(names.get(participant.player_id) ?? "P").slice(0, 1).toUpperCase()}</span>{names.get(participant.player_id) ?? "Pemain"}{selectedPlayers.includes(participant.player_id) && <small className="pick-order">{selectedPlayers.indexOf(participant.player_id) + 1}</small>}</label></div>)}</div>
        {!!selectedPlayers.length && <p className="hint selected-team-hint">{selectedPlayers.length < 3 ? `Tim 1: ${names.get(selectedPlayers[0]) ?? "Pemain"}${selectedPlayers.length === 2 ? ` · Tim 2: ${names.get(selectedPlayers[1]) ?? "Pemain"}` : ""}` : `Tim 1: ${selectedPlayers.slice(0, 2).map((id) => names.get(id)).join(" & ")} · Tim 2: ${selectedPlayers.slice(2).map((id) => names.get(id)).join(" & ")}`}</p>}
        <div className="inline-form game-start-form"><label className="screen-reader-only" htmlFor="court-number">Lapangan</label><select id="court-number" value={courtNumber} onChange={(event) => setCourtNumber(Number(event.target.value))}>{Array.from({ length: session.court_count }, (_, index) => <option value={index + 1} key={index}>Lapangan {index + 1}{activeMatches.some((match) => match.court_number === index + 1) ? " · sedang dipakai" : ""}</option>)}</select><button className="button" disabled={busy || ![2, 4].includes(selectedPlayers.length) || activeMatches.some((match) => match.court_number === courtNumber)} onClick={() => void run(() => adminAction("admin_start_match", { p_session_id: session.id, p_court_number: courtNumber, p_player_ids: selectedPlayers }), "Permainan dimulai.")}>Mulai · {selectedPlayers.length} pemain</button></div>
      </>}
    </section>}

    <section className="surface">
      <div className="surface-heading"><div><h2>Permainan</h2><p>{activeMatches.length} sedang berjalan · {matches.filter((match) => match.ended_at).length} selesai · {activeCount} shuttlecock tercatat</p></div></div>
      {matches.length ? <div className="match-list">{matches.map((match: MatchRecord) => {
        const roster = gamePlayerIds.get(match.id) ?? [];
        const teamOne = roster.filter((entry) => entry.team_number === 1).map((entry) => names.get(entry.player_id) ?? "Pemain");
        const teamTwo = roster.filter((entry) => entry.team_number === 2).map((entry) => names.get(entry.player_id) ?? "Pemain");
        const result = match.winner_team === null ? "Hasil belum dicatat" : `Tim ${match.winner_team} menang`;
        return <article key={match.id} className={`match-card ${match.ended_at ? "" : "match-live"}`}><div className="match-heading"><div><strong>Lapangan {match.court_number}</strong><span>{match.ended_at ? "Selesai" : "Sedang bermain"}</span></div>{!match.ended_at && <span className="live-label">LIVE</span>}</div><p className="match-teams"><span>Tim 1 · {teamOne.join(" & ")}</span><span>Tim 2 · {teamTwo.join(" & ")}</span></p>{match.ended_at ? <small className="muted">{match.shuttlecocks_used} shuttlecock · {result}</small> : isAdmin ? finishMatchId === match.id ? <div className="finish-form"><label>Shuttlecock<input className="text-input" type="number" min="0" max="999" value={shuttleCount} onChange={(event) => setShuttleCount(event.target.value)} /></label><label>Pemenang (opsional)<select className="text-input" value={winnerTeam} onChange={(event) => setWinnerTeam(event.target.value)}><option value="">Belum dicatat</option><option value="1">Tim 1</option><option value="2">Tim 2</option></select></label><button className="button button-small" disabled={busy || shuttleCount === ""} onClick={() => void run(() => adminAction("admin_finish_match", { p_match_id: match.id, p_shuttlecocks_used: Number(shuttleCount), p_winner_team: winnerTeam ? Number(winnerTeam) : null }), "Permainan selesai dan hasil dicatat.")}>Simpan hasil</button><button className="button button-muted button-small" onClick={() => setFinishMatchId(null)}>Batal</button></div> : <button className="button button-muted button-small" onClick={() => { setFinishMatchId(match.id); setShuttleCount("1"); setWinnerTeam(""); }}>Akhiri permainan</button> : <small className="muted">Menunggu admin mengakhiri permainan</small>}</article>;
      })}</div> : <div className="empty-state compact-empty"><strong>Belum ada permainan</strong><p>Permainan yang dimulai admin akan tercatat di sini.</p></div>}
    </section>

    {isAdmin && <section className="surface close-session-card"><div><h2>Tutup sesi</h2><p>Penutupan sesi menghentikan absen dan menyimpan sesi ke histori.</p></div><button className="button button-danger" disabled={busy || activeMatches.length > 0} onClick={() => {
      if (window.confirm(`Tutup “${session.name}”? Pemain tidak bisa lagi absen setelah sesi ditutup.`)) void run(() => adminAction("close_club_session", { p_session_id: session.id }), "Sesi berhasil ditutup.");
    }}>{activeMatches.length ? "Selesaikan permainan dulu" : "Tutup sesi"}</button></section>}

    {message && <p className="toast" role="status">{message}</p>}
    {errorMessage && <p className="toast error" role="alert">{errorMessage}</p>}
    {removeTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setRemoveTarget(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="remove-title"><div className="confirm-icon" aria-hidden="true">!</div><p className="eyebrow">KONFIRMASI ADMIN</p><h2 id="remove-title">Keluarkan pemain dari sesi?</h2><p><strong>{removeTarget.name}</strong> akan dikeluarkan dari sesi <strong>{session.name}</strong>. Tempatnya akan kembali tersedia dan tindakan ini tidak dapat dibatalkan.</p>{inActiveMatch.has(removeTarget.id) && <div className="notice">Pemain sedang bermain dan tidak dapat dikeluarkan sampai permainan selesai.</div>}<div className="modal-actions"><button className="button button-muted" disabled={busy} onClick={() => setRemoveTarget(null)}>Batal</button><button className="button button-danger" disabled={busy || inActiveMatch.has(removeTarget.id)} onClick={() => void run(() => adminAction("admin_remove_player_from_session", { p_session_id: session.id, p_player_id: removeTarget.id }), `${removeTarget.name} dikeluarkan dari sesi.`)}>{busy ? "Memproses…" : "Ya, keluarkan"}</button></div></section></div>}
  </>;
}
