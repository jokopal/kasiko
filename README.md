# Kasiko

Aplikasi kasir & keuangan (PWA + Supabase) untuk usaha jasa dengan katalog harga tetap.
Usaha pertama: **Saimara** (cuci mobil). Keputusan produk & aturan kerja ada di [`AGENTS.md`](./AGENTS.md).

> **Status:** fondasi + pratinjau UI dua peran (Kasir & Owner) + nota (Bluetooth, print, WhatsApp) + offline/PWA. Database belum dibuat — aplikasi
> berjalan dalam **mode pratinjau** dengan data contoh yang tersimpan di browser.

## Stack

React 19 · Vite · TypeScript (strict) · Tailwind CSS v4 · shadcn/ui (Radix) · React Router · Recharts ·
Supabase (menyusul). Tes: Vitest + Testing Library, Playwright (HP, tablet, desktop).

## Menjalankan

Butuh Node 24 (lihat `.nvmrc`).

```bash
npm install
npm run dev            # http://localhost:5173
```

Buka `/masuk`, lalu pilih **Masuk sebagai Kasir** atau **Masuk sebagai Owner**. Buka keduanya di dua
tab untuk melihat transaksi kasir langsung muncul di dashboard owner. Data contoh bisa dikembalikan
lewat Owner → Pengaturan Usaha → **Reset data pratinjau**.

Uji offline: `npm run build && npm run preview`, buka kasir sekali, lalu matikan jaringan (DevTools →
Network → Offline). Transaksi masuk antrean dan terkirim otomatis saat online kembali.

Uji di HP pada jaringan yang sama: `npm run dev -- --host`, lalu buka alamat IP yang ditampilkan.

`.env` tidak wajib selama mode pratinjau. Saat Supabase sudah ada: `cp .env.example .env` lalu isi
`VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` (anon key saja — **service role key tidak pernah
masuk frontend/repo**).

## Skrip

| Perintah                      | Fungsi                                                                      |
| ----------------------------- | --------------------------------------------------------------------------- |
| `npm run dev`                 | Server pengembangan                                                         |
| `npm run build`               | Typecheck + build produksi ke `dist/`                                       |
| `npm run preview`             | Menyajikan hasil build                                                      |
| `npm run check`               | Typecheck + lint + cek format + tes unit (jalankan sebelum commit)          |
| `npm run test` / `test:watch` | Vitest                                                                      |
| `npm run test:e2e`            | Playwright di 3 perangkat (pertama kali: `npx playwright install chromium`) |
| `npm run lint` / `format`     | ESLint (type-aware) / Prettier                                              |

Screenshot E2E tersimpan di `test-results/screens/<perangkat>-<layar>.png`.

## Struktur

```
src/
  app/              router, guard peran, halaman masuk/404/error
  components/       komponen bersama; ui/ = primitif shadcn (vendor, update via `npx shadcn add`)
  features/
    auth/           sesi & peran, halaman akun kasir
    business/       warna brand, pengaturan usaha
    catalog/        master katalog & kategori
    pos/            layar kasir: keranjang, pembayaran, riwayat, ringkasan + logika murni
    receipt/        formatReceipt (satu sumber untuk semua jalur), ESC/POS + Web Bluetooth,
                    print browser, WhatsApp, pengaturan printer per perangkat
    expenses/       pengeluaran laci & owner
    offline/        IndexedDB (Dexie): outbox, mesin sinkron, registrasi perangkat, cache
                    katalog, status sinkron, PWA (update prompt & pasang aplikasi)
    owner/          layout & navigasi owner
    reports/        rumus keuangan, periode, dashboard, transaksi
    reserve/        dana cadangan
    preview/        PENGGANTI DATABASE SEMENTARA (server.ts meniru RPC, transport.ts meniru jaringan)
                    — diganti lapisan Supabase di milestone 1
  lib/              uang, tanggal per zona waktu, id, tipe domain, supabase client
supabase/           config lokal, migrations/, functions/, tests/ (milestone 1)
e2e/                spec Playwright
```

Aturan inti: uang selalu **integer rupiah**, batas hari mengikuti **zona waktu usaha**, data tidak
pernah dihapus (hanya dibatalkan dengan alasan). Logika ini berupa fungsi murni di `lib/` dan
`features/*/` yang dites, dan akan dipakai ulang oleh RPC server.

## Database (Supabase)

Database berjalan di **proyek Supabase owner** — tidak perlu Docker (keputusan #33). Rahasia
ada di `.env.bootstrap` (ter-ignore git):

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<kunci service: JWT service_role atau sb_secret_…>
SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
OWNER_PASSWORD=<hanya saat bootstrap owner>
```

```bash
npm run db:test        # tes pgTAP ke database proyek, tiap file di-rollback (tanpa Docker)
npm run db:types       # perbarui src/lib/database.types.ts (butuh `npx supabase login`)
npm run db:test:local  # opsional: tes di Supabase lokal (butuh Docker)
```

| Migrasi                | Isi                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `…0100_core_schema`    | Tabel, constraint, FK komposit antar-usaha, perangkat, data historis, audit                                                                 |
| `…0200_access`         | Helper `is_owner`/`is_cashier`/`is_member`, RLS semua tabel, grant per kolom, view `business_branding`                                      |
| `…0300_rpc`            | `register_device`, `create_transaction`, `create_expense`, `void_*`, `create_business`, `apply_template`, `import_history`, `clear_history` |
| `…0400_finance_audit`  | `period_totals`, `reserve_balance`, `free_cash`, `drawer_expected`, trigger audit                                                           |
| `…0500_owner_accounts` | `is_owner_account`, `create_business` hanya untuk akun owner, `admin_revoke_sessions`                                                       |

`supabase/seed.sql` (akun uji, hanya untuk Supabase lokal) **dihasilkan** dari
`src/features/business/templates.ts`; jangan diedit manual — jalankan
`npx vitest run src/features/business/seed-sql.test.ts -u` setelah template berubah.

### Proyek Supabase (remote)

Host `db.<ref>` hanya IPv6, jadi migrasi memakai session pooler IPv4 (`SUPABASE_DB_URL`):

```bash
npx supabase db push --db-url "$SUPABASE_DB_URL"   # tanya owner dulu (aturan kerja agent)
```

`seed.sql` **tidak** dikirim ke proyek (berisi akun uji).

### Edge Functions

| Fungsi            | Dipanggil oleh      | Untuk                                               |
| ----------------- | ------------------- | --------------------------------------------------- |
| `manage-cashier`  | owner (JWT)         | buat / reset kata sandi / aktif-nonaktif akun kasir |
| `bootstrap-owner` | admin (service key) | buat akun owner + usaha pertama dari template       |

```bash
npx supabase login                       # akun pemilik proyek
npx supabase functions deploy --project-ref <ref> --use-api
# owner pertama (secrets di .env.bootstrap, ter-ignore; kunci = secret key sb_secret_…):
node --env-file=.env.bootstrap scripts/bootstrap-owner.ts \
  --email owner@contoh.id --business Saimara --prefix SMR --template cuci-mobil
```
