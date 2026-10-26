# Kasiko — Brief Proyek

> **Versi 2 — dikomisikan ulang 2026-10-25.** Dokumen ini adalah satu-satunya brief untuk
> agent dan pengembang. Baca seluruhnya sebelum menulis kode.
>
> - **Keputusan Terkunci (bagian 5)** sudah disetujui owner — jangan diubah tanpa bertanya.
> - **Pertanyaan Terbuka (bagian 12)** wajib ditanyakan sebelum mengerjakan fitur yang terdampak.
> - Bahasa: diskusi dengan owner & seluruh teks UI dalam **Bahasa Indonesia**; kode, nama
>   tabel/kolom, commit message, dan komentar kode dalam **bahasa Inggris**.

---

## 1. Tujuan

Kasiko adalah **aplikasi pribadi milik satu owner** untuk melacak **pemasukan dan pengeluaran
usahanya**, lalu melihat profit dan arus kas tanpa spreadsheet. Usaha pertama adalah
**Saimara** (cuci mobil). Owner bisa menambah usaha lain kapan saja; setiap usaha terpisah
datanya, brand-nya, dan akun kasirnya.

Kasiko menggantikan cara lama owner: satu file Excel per tahun, satu sheet per bulan, satu
angka pendapatan per hari, dan ±75 label pengeluaran yang ditulis bebas (audit 2026-10-19:
22 bulan, 608 hari, Rp 1,16 M pendapatan). Masalah cara lama yang harus hilang:

1. Pendapatan hanya total harian — tidak tahu layanan apa yang laku, metode bayar, jam ramai.
2. Label pengeluaran berubah-ubah — bulan tidak bisa dibandingkan.
3. "Net profit" tercampur cicilan, pembelian aset, dan uang yang diambil owner/keluarga.
4. Tidak ada jejak siapa mencatat apa, dan tidak ada kontrol uang laci.

**Bukan tujuan:** produk SaaS untuk banyak owner. Skema tidak menghalangi ke sana
(keputusan #1), tetapi tidak ada yang dibangun untuk itu.

## 2. Pengguna & peran

| Peran | Siapa | Masuk dengan | Bisa |
|-------|-------|--------------|------|
| **Owner** | Pemilik (satu orang), semua usaha | Email + kata sandi | Semua data usahanya: rekap, analisis, pengeluaran owner, cadangan, impor, master data, akun kasir |
| **Kasir** | **Satu akun bersama per usaha**, dipakai di perangkat kasir | Nama pengguna + kata sandi | Mencatat penjualan & pengeluaran laci, mencetak/mengirim nota, membatalkan data **hari ini**, melihat ringkasan hari ini |

Kasir adalah **pintu masuk data** (pemasukan & pengeluaran harian); owner adalah **pembaca
dan pengatur**. Area owner dibagi tiga: **Monitor** (dashboard, rekap bulanan, transaksi),
**Manajemen** (pengeluaran, dana cadangan, impor data), **Admin** (katalog, kategori
pengeluaran, pengaturan usaha, akun kasir).

## 3. Cakupan

### Kasir (`/kasir`) — HP/tablet, harus jalan offline

- Pilih layanan dari katalog (grid tombol besar) → keranjang (qty, plat nomor opsional) →
  Bayar (Tunai/QRIS/Transfer, kembalian besar) → nota. Target **≤ 4 ketukan**.
- Nota: cetak Bluetooth (ESC/POS), print browser, kirim WhatsApp.
- Pengeluaran laci (tombol lebih kecil): nominal, kategori yang diizinkan owner, catatan.
- Riwayat & ringkasan hari ini (per metode, uang laci seharusnya), batal hari ini dengan alasan.
- Offline: semua catatan masuk antrean lalu sinkron otomatis; jumlah antrean selalu terlihat.

### Owner (`/owner`) — wajib online

- **Monitor:** dashboard per periode (KPI & panel bisa diatur per usaha), tingkatan profit,
  tren harian/bulanan, layanan terlaris, jam × hari tersibuk, komposisi pengeluaran per
  kategori & jenis; rekap bulanan tanggal × kategori (format Excel lama); daftar transaksi
  dengan filter & ekspor.
- **Manajemen:** pengeluaran owner (gaji bulanan, cicilan, sewa…), dana cadangan
  (setor/tarik), impor riwayat dari Excel arus kas.
- **Admin:** katalog layanan, kategori pengeluaran (jenis + izin kasir), pengaturan & brand
  usaha (nama, logo, warna, nota, zona waktu, saldo awal kas, template), akun kasir,
  tambah usaha dari template.

### Di luar cakupan

Lihat bagian 13 (Ditunda). Ide baru dicatat di sana dan diusulkan ke owner — tidak dibangun
diam-diam (YAGNI).

## 4. Ukuran keberhasilan (Rilis 1: "Saimara live")

1. Kasir Saimara mencatat **setiap** penjualan dan pengeluaran laci di Kasiko, termasuk saat
   internet putus, tanpa kehilangan data.
2. Owner **berhenti mengisi Excel**: rekap bulanan Kasiko menggantikan sheet bulanan, dan
   riwayat 2025–2026 sudah diimpor.
3. Angka bisa dipercaya: rumus diuji di aplikasi (Vitest) **dan** di database (pgTAP) dengan
   kasus yang sama; impor Excel Saimara cocok sampai rupiah.
4. Data aman: kasir tidak bisa melihat rekap atau usaha lain, tidak ada hapus permanen, setiap
   perubahan harga/pengaturan dan pembatalan owner tercatat.

---

## 5. Keputusan Terkunci

Nomor dipertahankan karena dirujuk di kode dan migrasi. Bila dua keputusan bertentangan,
**yang lebih baru berlaku** dan ditandai di sini.

### Produk (disetujui awal proyek)

| # | Topik | Keputusan |
|---|-------|-----------|
| 1 | Tenancy | Satu owner, banyak usaha. Semua data bisnis punya `business_id`. Tidak ada pendaftaran publik/SaaS, tapi skema tidak menghalangi ke sana. |
| 2 | Katalog | Jasa dengan **harga tetap per item**, tanpa varian/stok, dikelompokkan dalam kategori. Kategori, item, harga, urutan diatur owner; kasir hanya memilih. *Potongan harga hanya lewat preset diskon owner (#35).* |
| 3 | Pembayaran | **Tunai, QRIS, Transfer** — non-tunai dicatat manual ("sudah dibayar"). Tanpa payment gateway. Kembalian hanya untuk tunai. Rekap memisahkan per metode. |
| 4 | Akun kasir | **Satu akun kasir per usaha**, login sekali di perangkat. Tidak ada pencatatan per orang. |
| 5 | Nota | (a) printer thermal **Bluetooth** (ESC/POS via Web Bluetooth, tombol hanya muncul bila `navigator.bluetooth` ada), (b) print browser, (c) WhatsApp. |
| 6 | Pengeluaran | **Laci** (`drawer`, dicatat kasir, mengurangi uang laci) dan **owner** (`owner`, tidak mengurangi laci). Kategori diatur owner per usaha — default dari template (#25). Tombol Pengeluaran di kasir **lebih kecil** dari tombol transaksi. |
| 7 | Offline | **Kasir tetap jalan offline** (katalog lokal, outbox, sinkron otomatis, nota tetap bisa dicetak). **Owner wajib online.** |
| 8 | Dana cadangan | Saldo per usaha dengan riwayat setor/tarik; tarik wajib alasan. **Tidak mengubah profit**, tetapi mengurangi kas bebas. Tanpa penyisihan otomatis. |
| 9 | Rekap & analisis | Rekap inti, tren, layanan terlaris, jam & hari tersibuk, komposisi pengeluaran, perbandingan periode sebelumnya, ekspor Excel/CSV. Tampilan lintas usaha: struktur disiapkan saja. |
| 10 | Branding | Per usaha: nama, logo, alamat, telepon, teks penutup nota, **satu warna utama** — di header kasir & nota. Nama/ikon PWA tetap generik. |
| 11 | Koreksi | **Tidak ada hapus permanen.** Kasir membatalkan data **hari yang sama** dengan alasan; owner kapan saja dan bisa melihat daftar pembatalan. |
| 12 | Data kendaraan | Plat nomor opsional, tampil di nota. Tidak menyimpan data pelanggan; nomor WhatsApp tidak disimpan. |

### Teknis (2026-10-12)

| # | Topik | Keputusan |
|---|-------|-----------|
| 13 | Stack & UI | Stack bagian 6. UI **shadcn/ui** (Radix, preset Nova) di `src/components/ui` (kode vendor, diperbarui lewat `shadcn add`); kode aplikasi ditulis sendiri, tanpa template admin. `radix-ui` dipin versi persis. |
| 14 | Sinkron kasir | RPC **`create_transaction(jsonb)`** / **`create_expense(jsonb)`**: header + item satu transaksi DB, idempoten pada `id` dari perangkat. Bukan `upsert` tabel. |
| 15 | Validasi server | Server menghitung ulang subtotal, total, kembalian, dan konsistensi per metode. **Harga snapshot dari perangkat diterima** (katalog offline bisa basi). |
| 16 | Perangkat & nota | Tabel `devices`: `device_code` 1–2 huruf **dibagikan server**, unik per usaha, **tidak pernah dipakai ulang**. Data browser terhapus → registrasi ulang dengan kode baru. |
| 17 | Waktu | `occurred_at` dari perangkat + `received_at` dari server; selisih di atas ambang ditandai `needs_review` (ambang: #32). |
| 18 | Batal offline | "Hari yang sama" dinilai dari **waktu permintaan batal di perangkat**, dengan toleransi di server (#32). |
| 19 | Integritas | Referensi dalam satu usaha memakai **FK komposit `(business_id, id)`**. Kasir membaca branding lewat view `business_branding` (tanpa `opening_cash`). |
| 20 | Outbox aman | Minta `navigator.storage.persist()`; **logout diblokir** selama outbox belum kosong; jumlah antrean selalu terlihat. |
| 21 | Audit | Tabel `audit_log` untuk perubahan harga/katalog/pengaturan/akun dan pembatalan owner. |
| 22 | Akun | Pendaftaran publik **dimatikan**; kata sandi ≥ 8 huruf+angka. Owner pertama dibuat lewat *bootstrap* (#33). Reset/nonaktif akun kasir mencabut semua sesi. |
| 23 | Mode pratinjau | `src/features/preview/` (localStorage) menggantikan database sementara dengan bentuk data yang sama. **Dihapus saat lapisan Supabase dibangun** (Rilis 1, langkah R1). |

### Hasil audit Excel Saimara (2026-10-19)

| # | Topik | Keputusan |
|---|-------|-----------|
| 24 | Jenis pengeluaran & profit | Kategori punya `kind`: **operating**, **non_operating** (cicilan, aset/renovasi), **drawing** (prive owner/keluarga). Profit operasional = Pemasukan − operasional; **Profit bersih = Profit operasional − non-operasional**; **prive tidak mengurangi profit** tetapi mengurangi kas bebas; Arus kas bersih = Pemasukan − semua pengeluaran (= "Total Net Profit" Excel lama). *Menggantikan rumus "Profit = Pemasukan − Pengeluaran" versi awal.* |
| 25 | Templateable per usaha | Usaha dibuat dari **template** (`src/features/business/templates.ts`: katalog, kategori pengeluaran + jenis + izin kasir, tata letak dashboard, alias label impor). Menerapkan template hanya **menambah yang belum ada**. Konfigurasi owner per usaha di `business_configs`. Owner: Monitor / Manajemen / Admin. |
| 26 | Kategori di kasir | `allow_drawer` per kategori: hanya kategori aktif + diizinkan yang tampil di kasir; server menolak yang lain. Gaji komisi harian **diisi manual**. "Gratis cuci" = biaya komisi pekerja untuk cuci gratis/promo. |
| 27 | Data historis | Impor Excel arus kas → `historical_days` + `historical_expenses`. **Hanya untuk analisis**: tidak memengaruhi kas bebas, uang laci, atau daftar transaksi. Hari yang punya data kasir dilewati; impor ulang mengganti. File Excel **tidak pernah di-commit**, angkanya tidak ada di kode/seed. |
| 28 | Rekap bulanan & ekspor | Tabel tanggal × kategori seperti Excel owner; ekspor Excel memakai format yang sama sehingga bisa diimpor balik. |

### Database & infrastruktur (2026-10-20)

| # | Topik | Keputusan |
|---|-------|-----------|
| 29 | Label impor tak jelas | Label yang tidak jelas/tak dikenal **tidak diimpor** (jumlahnya tetap ditampilkan) sampai owner membuat kategorinya sendiri. *Impor tidak pernah memasukkan label tak dikenal ke "Lainnya" (#36); "Lainnya" hanya menampung label yang memang berarti lain-lain.* |
| 30 | Upah harian | Upah kasir & driver harian diambil **dari uang laci**. |
| 31 | Katalog Saimara | Tidak memakai data Olsera; katalog & harga **dibangun owner dari awal**. Harga di template hanya contoh. |
| 32 | Skema database | Migrasi di `supabase/migrations`. Dua peran via `business_members` (satu akun satu peran, satu kasir per usaha, `is_active` memutus akses seketika). Ambang waktu perangkat: **> 5 menit di depan** atau **> 72 jam terlambat** → `needs_review`; batal kasir di luar ambang ditolak. Retry batal idempoten hanya bila membawa waktu perangkat yang sama. `seed.sql` hanya untuk lokal, dihasilkan dari template. |
| 33 | Proyek & Edge Function | Memakai **proyek Supabase owner yang sudah ada**, tanpa Docker lokal. Kredensial hanya di file lokal ter-ignore. Data harian lewat **RPC/RLS** (langsung ke database, cocok untuk offline). **Edge Function hanya untuk operasi ber-hak service role:** `manage-cashier` dan `bootstrap-owner`. Akun owner ditandai `app_metadata.kasiko_role = 'owner'`; hanya akun itu yang boleh `create_business`. |

### Keputusan tambahan — 2026-10-25

| # | Topik | Keputusan |
|---|-------|-----------|
| 34 | Bayar di akhir | Mobil dicatat sebagai **pesanan terbuka** (`orders`: layanan, plat, total) saat masuk; dibayar saat selesai lewat transaksi biasa (`create_transaction` dengan `order_id`) yang menutup pesanan dalam satu transaksi DB. Pesanan bukan pemasukan; disimpan lewat outbox (offline, idempoten, edit terbaru menurut waktu perangkat menang); kasir melihat semua pesanan terbuka; batal wajib alasan. Menjawab Pertanyaan #4. |
| 35 | Diskon | Ada, **atas aktivasi owner**: owner membuat preset (`discounts`: persen 1–100 atau nominal) dan menyalakan/mematikannya; kasir hanya memilih preset aktif. Server menghitung ulang potongan (persen dibulatkan ke bawah), menolak potongan ≥ subtotal, dan menerima snapshot preset seperti harga (#15). Transaksi menyimpan `subtotal`, snapshot diskon, `discount_amount`, `total = subtotal − diskon`. Owner melihat total diskon per periode. Menjawab Pertanyaan #13; melengkapi #2. |

### Keputusan tambahan — 2026-10-26

| # | Topik | Keputusan |
|---|-------|-----------|
| 36 | "Lainnya" | Kategori pengeluaran bisa ditandai **wajib keterangan** (`expense_categories.requires_note`). Template punya satu "Lainnya" (operasional, boleh dari laci, wajib keterangan); "Lain-lain" yang sudah ada diganti nama jadi "Lainnya". Di kasir tampil sebagai kartu terpisah di bawah daftar kategori; keterangan ≥ 3 huruf dicek di perangkat **dan** di server (trigger). Owner bisa **memindahkan** pengeluaran ke kategori lain (`recategorize_expense`: hanya yang aktif, nominal/catatan/sumber tetap, tercatat di `audit_log`); dashboard & halaman Pengeluaran mengingatkan "Lainnya" yang perlu dipilah. |
| 37 | Modal laci & uang dingin | **Modal laci** (`businesses.drawer_float`) = uang kembalian yang sama **setiap pagi**: Uang laci seharusnya = modal laci + tunai − pengeluaran laci; sisanya disetor ke owner. Kasir melihatnya lewat `business_branding`. **Uang dingin** (`businesses.opening_reserve`) = **saldo awal Dana Cadangan**: tidak mengubah profit, tidak dihitung kas bebas; tarik cadangan boleh memakainya, tetapi uang dingin tidak bisa diturunkan di bawah yang sudah ditarik. Diatur owner di Dashboard / Pengaturan bersama saldo awal kas; tercatat di audit. Menjawab sebagian Pertanyaan #12 (modal awal) dan #9 (arti uang dingin). |

---

## 6. Arsitektur & stack

```
Perangkat kasir (PWA)                     Perangkat owner (browser)
  React + Dexie (katalog, outbox)            React (+ TanStack Query*)
        │  RPC create_* / void_* (idempoten)      │ select via RLS, RPC rekap
        ▼                                          ▼
  ┌──────────────── Supabase (proyek owner, region ap-northeast-1) ────────────────┐
  │ Postgres: RLS di semua tabel · RPC tulis · fungsi rekap · audit                 │
  │ Auth: email/password, sign-up publik mati                                       │
  │ Edge Functions: manage-cashier (owner) · bootstrap-owner (service key)          │
  │ Storage*: logo usaha                                                            │
  └─────────────────────────────────────────────────────────────────────────────────┘
* = belum dibangun
```

- **Frontend:** React 19 + Vite + TypeScript (strict + `noUncheckedIndexedAccess`), React Router,
  Tailwind CSS v4, shadcn/ui + lucide-react, sonner. Grafik Recharts (chunk owner saja).
  Ekspor/impor Excel: SheetJS dari CDN resmi (`xlsx` di npm berhenti di 0.18.5 dengan CVE).
- **Offline:** `vite-plugin-pwa` (prompt "Versi baru tersedia"), Dexie (cache katalog + outbox).
- **Server state owner:** TanStack Query — *tercantum sejak awal tetapi belum dipasang*;
  dipasang saat R1.
- **Backend:** Supabase (Postgres, Auth, RLS, Edge Functions, Storage).
- **Kualitas:** ESLint type-aware (`no-floating-promises` wajib), Prettier, Node ≥ 24.
  `npm run check` = typecheck + lint + format + Vitest. `npm run test:e2e` = Playwright di
  `phone`, `tablet`, `desktop`. `npm run db:test` = pgTAP ke database proyek tanpa Docker
  (setiap file di-rollback).
- **Hosting:** Vercel paket gratis (`vercel.json`: rewrite SPA, `sw.js` tanpa cache). Domain sendiri belum.
- Satu aplikasi, dua area (`/kasir`, `/owner`); kode owner di-lazy-load agar bundle kasir ringan.

```
src/
  app/            router, layout, guard peran
  features/
    auth/  business/  catalog/  pos/  receipt/  expenses/
    history/      impor Excel arus kas
    offline/      Dexie, outbox, sync engine
    reports/      rekap & analisis (lazy)
    reserve/      dana cadangan
    preview/      PENGGANTI DATABASE SEMENTARA — dihapus di R1
  lib/            supabase client, database.types.ts (generated), money, datetime
supabase/
  migrations/     sumber kebenaran skema
  functions/      manage-cashier, bootstrap-owner, _shared (dites Vitest)
  tests/          pgTAP
  seed.sql        lokal saja, dihasilkan dari template
scripts/          bootstrap-owner.ts, db-test.ts (rahasia dari .env.bootstrap)
```

---

## 7. Data & aturan bisnis

**Sumber kebenaran skema adalah `supabase/migrations`.** Ringkasan:

| Tabel | Isi | Akses kasir |
|-------|-----|-------------|
| `businesses` | brand, prefix nota, zona waktu, saldo awal kas, modal laci, uang dingin (#37) | lewat view `business_branding` (+ modal laci) |
| `business_members` | user × usaha × peran (`owner`/`cashier`), `is_active` | baris miliknya |
| `business_configs` | template asal, tata letak dashboard, pemetaan label impor | — |
| `catalog_categories`, `catalog_items` | layanan & harga | yang aktif |
| `expense_categories` | `kind`, `allow_drawer`, `requires_note` (#36) | aktif + diizinkan |
| `devices` | kode perangkat 1–2 huruf | usahanya |
| `transactions`, `transaction_items` | penjualan (id dari perangkat), item snapshot berurutan | **hari ini** saja |
| `expenses` | `drawer` / `owner` | `drawer` **hari ini** saja |
| `reserve_movements` | setor/tarik cadangan (append-only) | — |
| `historical_days`, `historical_expenses` | impor Excel | — |
| `audit_log` | jejak perubahan & pembatalan owner | — |
| `orders` | pesanan terbuka "bayar di akhir" (#34) | semua yang terbuka + hari ini |
| `discounts` | preset diskon owner (#35) | yang aktif |
| Storage `logos` | logo usaha di folder `<business_id>/` | baca publik, tulis owner |

**Uang** selalu integer rupiah (`bigint`). **Waktu** `timestamptz`; batas hari memakai zona
waktu usaha.

### Rumus (diimplementasikan di `src/features/reports/finance.ts` **dan** fungsi SQL, diuji dengan kasus yang sama)

Untuk periode `[from, to)`, hanya baris paid/active:

- Pemasukan = Σ total transaksi (+ pendapatan hari impor)
- Pengeluaran = Σ semua pengeluaran (semua sumber & jenis, + hari impor)
- Profit operasional = Pemasukan − operasional
- **Profit bersih** = Profit operasional − non-operasional (prive tidak dihitung)
- Arus kas bersih = Pemasukan − semua pengeluaran
- Saldo cadangan = uang dingin + Σ setor − Σ tarik (sepanjang waktu, #37)
- Kas bebas = saldo awal kas + Σ pemasukan − Σ pengeluaran − Σ setor(`cash`) + Σ tarik
  — data impor **tidak** ikut; setor `capital` = uang baru owner, tidak mengurangi kas bebas.
  *Rumus ini turunan agent dari #8 — konfirmasi owner masih tertunda (Pertanyaan #9).*
- Uang laci seharusnya (hari ini) = modal laci + Σ penjualan tunai − Σ pengeluaran laci (#37).

### Nomor nota

`{prefix}-{YYMMDD}-{kode perangkat}{urut 4 digit}`, contoh `SMR-261009-A0007`. Kode perangkat
dari server (#16), nomor urut harian per perangkat di IndexedDB, unik per usaha di database.

---

## 8. Keamanan

- RLS aktif di **semua** tabel; `anon` tidak punya akses apa pun. Hak `authenticated` diberikan
  per kolom sehingga kolom identitas (id, `business_id`, pemilik) tidak bisa diubah.
- Kasir tidak bisa `insert/update/delete` langsung ke transaksi/pengeluaran — hanya lewat RPC
  yang memeriksa peran, usaha, perangkat, hari, dan alasan.
- **Kunci `service_role`/`sb_secret_` tidak pernah ada di frontend atau repo.** Rahasia lokal
  di `supabase se.txt` dan `.env.bootstrap` (keduanya ter-ignore). Frontend hanya memakai
  kunci publishable/anon.
- Akun owner ditandai `app_metadata` oleh server; pendaftaran liar tidak bisa membuat usaha.
- Menonaktifkan kasir: `business_members.is_active = false` (akses data putus seketika) +
  ban akun + semua sesi dicabut.

---

## 9. Spesifikasi UI singkat

**Kasir** — header berwarna brand (logo, nama, indikator online/offline + jumlah antrean);
kategori → grid tombol layanan besar; keranjang (HP: panel bawah, tablet/laptop: berdampingan);
pembayaran dengan tombol cepat (Uang Pas, pecahan di atas total), keypad, kembalian besar,
Simpan nonaktif bila uang kurang; setelah simpan: Cetak / Print / WhatsApp / Transaksi Baru;
format `Rp 35.000`.

**Owner** — pemilih usaha + tambah usaha (warna utama berganti per usaha); periode Hari ini /
7 hari / Bulan ini / Rentang + pembanding periode sebelumnya; tabel dengan filter (tanggal,
metode, status, kategori, sumber, jenis) dan ekspor; pratinjau kasir & nota di pengaturan;
pemeriksaan kontras WCAG untuk warna brand.

**Visual data** — warna seri tetap (bukan warna brand), palet divalidasi untuk buta warna;
jenis pengeluaran: operasional oranye, non-operasional violet, prive aqua; tidak pernah
warna saja tanpa label.

**Nota** — logo/nama, alamat, telepon, no. nota, waktu, plat, item × qty × harga, total,
metode, uang diterima & kembalian, teks penutup. Satu fungsi murni
`formatReceipt(transaction, business, width)` untuk ketiga jalur; lebar 58 mm (32 kolom) /
80 mm (48 kolom) per perangkat.

---

## 10. Status (evaluasi 2026-10-25)

Legenda: ✅ selesai & teruji · 🟡 ada tetapi belum teruji penuh / belum live ·
⬜ belum ada.

| Area | Status | Catatan |
|------|--------|---------|
| Fondasi kode, kualitas, CI lokal | ✅ | 216 tes Vitest, 15 E2E asap (3 perangkat, tanpa menulis data), lint/format bersih |
| Database: skema, RLS, RPC, rumus, audit | ✅ | 6 migrasi live di produksi; 151 tes pgTAP hijau (termasuk migrasi `0700`) |
| "Lainnya" wajib keterangan + pindah kategori; modal laci & uang dingin (#36, #37) | 🟡 | kode + 22 tes pgTAP; **migrasi `0700` menunggu diterapkan ke produksi** |
| Edge Function `manage-cashier`, `bootstrap-owner` | ✅ | ter-deploy & diuji penolakan aksesnya |
| Akun owner & usaha Saimara di produksi | ✅ | dibuat 2026-10-25 dari template `cuci-mobil` |
| Sign-up publik mati | ✅ | dimatikan owner di dashboard |
| Login & peran memakai Supabase Auth | ✅ | owner (email) & kasir (nama pengguna); sesi tersimpan untuk kasir offline |
| Data aplikasi dari database | ✅ | mode pratinjau **dihapus** (#23); kasir via RPC + outbox, owner via RLS/RPC + TanStack Query |
| Bayar di akhir (pesanan) & diskon | ✅ | migrasi `0600` live di produksi (2026-10-25) |
| Kasir: POS, bayar, nota (print/WA), riwayat, ringkasan, batal, pengeluaran laci | 🟡 | tersambung ke RPC; alur tulis belum diuji E2E terhadap database (menunggu staging, #20); Bluetooth belum diuji printer fisik |
| Offline: outbox, sync, registrasi perangkat, PWA | 🟡 | transport & registrasi ke RPC; offline→online teruji dengan transport tiruan, E2E nyata siap di `e2e-live/` (menunggu staging) |
| Owner Monitor: dashboard, rekap bulanan, transaksi + ekspor | ✅ | angka dari fungsi SQL; ekspor Excel/CSV transaksi |
| Owner Manajemen: pengeluaran, cadangan, impor Excel | ✅ | ekspor pengeluaran; rumus kas bebas masih menunggu konfirmasi (#9) |
| Owner Admin: katalog, kategori, diskon, pengaturan, template, tambah usaha, akun kasir | ✅ | akun kasir via `manage-cashier`; upload logo ke Storage |
| Storage logo | ✅ | bucket `logos` + policy (dalam migrasi `0600`) |
| Hosting & domain | 🟡 | Vercel (paket gratis) `kasiko-snowy.vercel.app` — proyek Vercel terhubung ke **fork** `loypandia12-cpu/kasiko` yang masih di commit lama; domain sendiri belum |
| Riwayat Excel 2025–2026 di produksi | ⬜ | alat impor siap, menunggu R1 |
| Operasional produksi (backup, monitoring, SMTP) | ⬜ | Pertanyaan #14 |

**Ringkasnya:** fondasi dan database sudah kuat dan live, dan semua layar sudah ada — tetapi
aplikasi **belum tersambung** ke database. Itulah jarak utama menuju Saimara live.

## 11. Kekurangan & rencana Rilis 1 ("Saimara live")

Dikerjakan berurutan; setiap langkah ditutup dengan tes hijau dan demo singkat ke owner.

| Langkah | Isi | Menutup |
|---------|-----|---------|
| **R1. Sambungkan ke Supabase** ✅ kode (2026-10-25) | Supabase Auth (owner: email; kasir: nama pengguna → `@kasir.kasiko.invalid`), sesi tersimpan untuk kasir offline, guard peran, pemilih usaha dari `business_members`; lapisan data Supabase + TanStack Query untuk owner; transport sync kasir → RPC; registrasi perangkat → `register_device`; cache katalog dari database. **Hapus `features/preview`** (#23). E2E jalan terhadap database. | "Data aplikasi dari database", "Login" |
| **R2. Admin di database** ✅ kode (2026-10-25) | Katalog & kategori (tulis via RLS), pengaturan usaha, terapkan template, tambah usaha (`create_business`), akun kasir via `manage-cashier`, **upload logo** (bucket Storage + RLS + tes). | Admin 🟡 → ✅, Storage |
| **R3. Hosting** | Pilih hosting (Pertanyaan #18), env publishable key, HTTPS, PWA ter-install di perangkat kasir. | Hosting |
| **R4. Rekap via SQL** ✅ fungsi & dashboard (2026-10-25); impor riwayat Saimara ke produksi belum | Fungsi SQL untuk deret harian/bulanan, layanan terlaris, jam × hari, matriks rekap bulanan (`period_totals` sudah ada); ekspor pengeluaran; daftar pembatalan; impor riwayat Excel Saimara ke produksi lewat `import_history`. | Monitor & Manajemen, riwayat |
| **R5. Cadangan & kas bebas** | Konfirmasi rumus (Pertanyaan #9), UI di database. | Manajemen |
| **R6. Pengerasan** | Uji di perangkat kasir nyata + printer (Pertanyaan #2–#3), audit aksesibilitas, backup & pemantauan error (Pertanyaan #14), uji beban 1 tahun data. | Go-live |

**Kekurangan lain yang perlu keputusan owner** (lihat Pertanyaan Terbuka): kontrol uang laci
(modal awal & tutup kasir, #12) — tanpa ini selisih uang laci tidak terdeteksi; zona waktu
Saimara (#7); bayar di awal/akhir (#4); daftar layanan & harga (#5).

**Risiko yang diketahui:**

- Belum ada proyek staging — `npm run db:test` berjalan di database produksi (aman karena
  di-rollback, tetapi tetap produksi). Pertimbangkan proyek staging (Pertanyaan #14).
- Supabase **paket gratis**: proyek dijeda setelah 7 hari tanpa aktivitas (kasir harian
  mencegahnya) dan tidak ada backup harian yang bisa diunduh — backup manual (`pg_dump`)
  perlu dijadwalkan (Pertanyaan #14).
- Rumus keuangan ada di dua tempat (TS & SQL) — wajib diuji dengan kasus yang sama.
- Kunci JWT lama (`anon`, `service_role`) masih aktif di proyek dan tersimpan sebagai teks
  biasa di komputer owner. Setelah R1 memakai kunci baru, pertimbangkan menonaktifkan kunci
  lama (Pertanyaan #19).
- `bootstrap-owner` tetap ter-deploy (dilindungi service key). Bisa dihapus setelah owner
  terakhir dibuat.

---

## 12. Pertanyaan Terbuka

Yang **masih terbuka** (tanyakan sebelum fitur terkait dikerjakan):

| # | Pertanyaan | Dibutuhkan untuk |
|---|------------|------------------|
| 2 | Perangkat kasir Saimara: Android, iPhone/iPad, atau laptop? (iOS tidak bisa cetak Bluetooth langsung.) | R3, R6 |
| 3 | Printer thermal: sudah ada? Merek/tipe, 58 atau 80 mm? **Wajib BLE** — Web Bluetooth tidak bisa ke Bluetooth Classic (SPP). | R6 |
| 5 | Daftar layanan & harga Saimara (owner membangun sendiri, #31) — kapan siap? | Go-live |
| 6 | Logo & warna Saimara. | R2 |
| 7 | Zona waktu Saimara (WIB/WITA/WIT) — menentukan batas "hari ini". Saat ini WIB. | R1 |
| 9 | Konfirmasi rumus kas bebas (bagian 7). Uang dingin sudah jelas (#37). | R5 |
| 11 | Dana cadangan terpisah per usaha? (asumsi: ya) | R5 |
| 12 | Tutup kasir: hitung fisik laci, setoran ke owner, catat selisih? (Modal laci harian sudah: #37.) | Usulan R4/R5 |
| 14 | Lingkungan produksi: staging terpisah, backup (paket Supabase), SMTP untuk reset kata sandi owner, pemantauan error. | R6 |
| 18 | Hosting sudah Vercel (gratis). Sisa: domain sendiri? Hubungkan Vercel ke repo utama atau sinkronkan fork. | R3 |
| 19 | Nonaktifkan kunci JWT lama setelah aplikasi memakai kunci baru? | setelah R1 |
| 20 | E2E yang menulis data: proyek **staging** terpisah (disarankan) atau **usaha uji tersembunyi** di produksi? Kode perangkat tidak pernah dipakai ulang (#16), jadi E2E tidak bisa terus memakai satu usaha. | E2E penuh |

Sudah terjawab: #4 bayar di akhir (#34) · #13 diskon (#35) · #1 stack (#13) · #8 proyek Supabase (#33) · #10 kategori pengeluaran
(#24–#26) · #15 label Excel tak jelas (#29) · #16 upah harian (#30) · #17 Olsera (#31).

## 13. Ditunda (bukan cakupan Rilis 1)

Payment gateway / QRIS dinamis · varian harga & stok · data pelanggan & member · akun per
karyawan/PIN · pengeluaran berulang otomatis · penyisihan cadangan otomatis · dashboard lintas
usaha · pendaftaran owner publik (SaaS) · nama/ikon PWA per brand · link nota publik · logo di
nota thermal.

---

## 14. Aturan kerja agent

- **Tanya dulu** sebelum: membuat proyek/layanan berbayar, menjalankan migrasi ke database
  produksi, push ke remote, mengubah Keputusan Terkunci, atau mengubah pengaturan Auth proyek.
- **Rahasia:** baca kredensial hanya dari file lokal ter-ignore; jangan menampilkan, menyalin
  ke repo, atau mengirimkannya ke layanan lain. Pindai repo sebelum commit.
- **Database:** setiap perubahan skema = migrasi baru (jangan ubah migrasi yang sudah
  diterapkan); setiap tabel baru wajib RLS + tes pgTAP sebelum dipakai UI; `npm run db:test`
  hijau sebelum push. `seed.sql` dibuat ulang lewat `seed-sql.test.ts -u`, tidak pernah dikirim
  ke produksi.
- Logika uang & tanggal berupa fungsi murni yang dites. Rumus keuangan diubah di TS **dan** SQL
  sekaligus, dengan kasus uji yang sama.
- Jangan pernah menghapus data transaksi/pengeluaran secara permanen.
- YAGNI: fitur di luar dokumen ini → catat di bagian 13 dan usulkan.
- Perbarui dokumen ini bila ada keputusan baru (tambahkan ke bagian 5 dengan tanggal) dan
  perbarui bagian 10 setiap langkah selesai.
