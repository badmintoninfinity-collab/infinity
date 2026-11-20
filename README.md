# Infinity Badminton

Aplikasi PB Badminton responsif dengan Next.js App Router dan Supabase. Pengunjung pertama kali diarahkan ke login. Pemain masuk atau membuat akun memakai email; administrator masuk memakai metode lama berupa satu kata sandi admin.

## Fitur

- Pendaftaran pemain memerlukan konfirmasi email dan persetujuan admin sebelum dapat ikut sesi.
- Pemain hanya mendapat Beranda dan Sesi: melihat informasi, histori, absen, dan keluar dari sesi.
- Admin masuk lewat kata sandi lama (`ADMIN_PASSWORD`) dan mendapat menu Admin serta Leaderboard.
- Admin dapat menyetujui pemain, membuat dan menutup sesi, mengatur lapangan, mengelola pertandingan, mencatat shuttlecock/hasil, dan mengeluarkan pemain dengan dialog konfirmasi.
- Sesi baru dimulai dengan dua lapangan (20 tempat); setiap lapangan menyediakan 10 tempat.
- Data sesi, kehadiran, pertandingan, dan leaderboard disimpan di Supabase.

## Menghubungkan Supabase

1. Buat project Supabase.
2. Di Authentication → Sign In / Providers → Email, aktifkan **Confirm email**. Jika dimatikan, Supabase otomatis menganggap email terkonfirmasi sehingga alamat dummy dapat masuk ([panduan Auth](https://supabase.com/docs/guides/auth/general-configuration)).
3. Dari Connect atau Project Settings → API Keys, salin project URL, publishable key, dan secret key.
4. Isi `.env.local` dari `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `ADMIN_PASSWORD`
   - `AUTH_SECRET`
5. Jalankan kedua file SQL di `supabase/migrations/` secara berurutan melalui SQL Editor Supabase.
6. Di Authentication → URL Configuration, tambahkan `http://localhost:3000/auth/callback` ke Redirect URLs.
7. Jalankan `npm ci`, `npm run dev`, lalu buka `http://localhost:3000`.

Buat `AUTH_SECRET` baru untuk deploy dengan Node.js:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Gunakan kata sandi admin yang kuat. `AUTH_SECRET` harus berisi nilai acak minimal 32 karakter. Secret key Supabase, kata sandi admin, dan `AUTH_SECRET` hanya untuk server; jangan menaruhnya dalam variabel `NEXT_PUBLIC_*` atau mengirimkannya ke browser. Secret key memberi akses backend istimewa, sehingga endpoint admin memvalidasi cookie admin sebelum menjalankan aksi ([panduan API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)).

Supabase harus mengirim email verifikasi. SMTP bawaan dibatasi untuk percobaan; siapkan SMTP sendiri sebelum membuka pendaftaran untuk pemain umum ([panduan SMTP](https://supabase.com/docs/guides/auth/auth-smtp)).

## Login administrator

Administrator menggunakan kata sandi tunggal lama dari `ADMIN_PASSWORD`; sesi admin berlaku 8 jam. Akun admin tidak dibuat melalui formulir daftar pemain. Aksi admin berjalan di server memakai `SUPABASE_SECRET_KEY`, sedangkan akun pemain memakai Supabase Auth dan kebijakan database.

## Hubungkan repository GitHub dan deploy

Repository lokal perlu remote GitHub sebelum dapat di-push. Buat repository kosong di GitHub, lalu jalankan dari folder project:

```sh
git remote add origin https://github.com/USERNAME/NAMA-REPOSITORY.git
git push -u origin HEAD
```

Hubungkan repository itu ke Vercel agar push berikutnya membangun dan menerbitkan aplikasi. Tambahkan kelima environment variable di atas pada project Vercel; simpan `SUPABASE_SECRET_KEY`, `ADMIN_PASSWORD`, dan `AUTH_SECRET` sebagai Environment Variables server yang terenkripsi. Di Supabase Redirect URLs, tambahkan `https://NAMA-APLIKASI.vercel.app/auth/callback` sesuai domain deploy.

Workflow `.github/workflows/ci.yml` menjalankan build untuk pull request dan push ke `main`. Aplikasi memakai cookies, Proxy, dan server-side actions, sehingga memerlukan runtime Next.js dan tidak cocok untuk GitHub Pages statis.
