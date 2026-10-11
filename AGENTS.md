# Konteks Proyek: Aplikasi Kasir & Keuangan (PWA + Supabase)

> Dokumen ini adalah instruksi untuk agent yang mengeksekusi proyek ini.
> Baca seluruhnya sebelum menulis kode. Keputusan di bagian **Keputusan Terkunci**
> sudah disetujui owner — jangan diubah tanpa bertanya. Bagian **Pertanyaan Terbuka**
> harus ditanyakan ke user sebelum mengerjakan fitur yang terdampak.

Bahasa: diskusi dengan user dan seluruh teks UI dalam **Bahasa Indonesia**.
Kode, nama tabel/kolom, commit message, dan komentar kode dalam **bahasa Inggris**.

---

## 1. Ringkasan Produk

Aplikasi web progresif (PWA) untuk mencatat pemasukan (kasir) dan pengeluaran usaha,
lalu menyajikan rekap profit dan analisis untuk owner.

- **Satu owner, banyak usaha.** Owner bisa punya beberapa usaha dan berpindah di antaranya.
- **Usaha pertama: Saimara** — usaha cuci mobil. (Nama repo `kasiko`; nama usaha ditulis **Saimara**.)
- **Dua peran:** `kasir` dan `owner`.
- Dipakai di HP, tablet, dan laptop; bisa di-install sebagai aplikasi (PWA).

Rumus inti: **Profit = Pemasukan − Pengeluaran** (transaksi/pengeluaran yang dibatalkan tidak dihitung).

---

## 2. Keputusan Terkunci (disetujui owner)

| # | Topik | Keputusan |
|---|-------|-----------|
| 1 | Tenancy | Satu owner, banyak usaha. Semua data bisnis punya `business_id`. Belum ada pendaftaran publik/SaaS, tapi skema jangan menghalangi ke sana. |
| 2 | Katalog | Jasa dengan **harga tetap per item**, tanpa varian, tanpa stok. Item dikelompokkan dalam **kategori**; kategori, item, harga, dan urutan diatur owner. Kasir hanya memilih. |
| 3 | Pembayaran | **Tunai, QRIS, Transfer** — non-tunai dicatat manual (kasir menandai sudah dibayar). Tidak ada payment gateway. Kembalian hanya untuk tunai. Rekap memisahkan per metode. |
| 4 | Akun kasir | **Satu akun kasir per usaha**, login sekali di perangkat. Tidak ada pencatatan per orang. Owner pakai akun sendiri. |
| 5 | Nota | Tiga cara: (a) cetak langsung ke printer thermal **Bluetooth** (ESC/POS via Web Bluetooth), (b) **dialog print browser**, (c) **kirim WhatsApp**. Tombol Bluetooth hanya muncul jika `navigator.bluetooth` tersedia. |
| 6 | Pengeluaran | **Kasir**: pengeluaran harian kecil yang diambil dari uang laci (sumber `drawer`). **Owner**: pengeluaran besar (gaji, sewa, listrik) — mengurangi profit tapi tidak mengurangi uang laci (sumber `owner`). Kategori pengeluaran diatur owner (default: Bahan, Operasional, Gaji, Sewa, Lain-lain). Di UI kasir, tombol Pengeluaran **lebih kecil** dari tombol transaksi. |
| 7 | Offline | **Kasir tetap jalan offline**: katalog tersimpan lokal, transaksi & pengeluaran masuk antrean (outbox) lalu sinkron otomatis saat online. Nota tetap bisa dicetak offline. **Owner wajib online.** |
| 8 | Dana cadangan | "Dana dingin" per usaha: saldo dengan riwayat **setor/tarik**, penarikan wajib alasan. **Tidak mengubah profit**, tapi mengurangi **kas bebas**. Tanpa penyisihan otomatis. |
| 9 | Rekap & analisis | Rekap inti + grafik tren, layanan terlaris, jam & hari tersibuk, komposisi pengeluaran per kategori, perbandingan dengan periode sebelumnya, ekspor Excel/CSV. Tampilan lintas usaha: **struktur disiapkan saja**, tidak dibangun. |
| 10 | Branding | Per usaha: nama, logo, alamat, telepon, teks penutup nota, **satu warna utama**. Tampil di header kasir dan nota. Nama/ikon PWA saat di-install tetap generik. |
| 11 | Koreksi | Tidak ada hapus permanen. Kasir bisa **membatalkan** transaksi/pengeluaran **hari yang sama** dengan alasan wajib; owner bisa membatalkan kapan saja dan melihat daftar pembatalan. |
| 12 | Data kendaraan | **Plat nomor opsional** per transaksi, tampil di nota. Tidak menyimpan data pelanggan. Nomor WhatsApp hanya dipakai untuk membuka link kirim, **tidak disimpan**. |

---

## 3. Stack Teknis

> Rekomendasi agent, belum dikonfirmasi eksplisit oleh owner (lihat Pertanyaan Terbuka #1).
> Jika user belum mengonfirmasi, tanyakan sekali di awal sesi eksekusi pertama, lalu lanjutkan.

- **Frontend:** React 19 + Vite + TypeScript (strict), React Router, Tailwind CSS.
- **PWA:** `vite-plugin-pwa` (Workbox) — precache app shell, `registerType: 'prompt'` dengan banner "Versi baru tersedia".
- **Data lokal/offline:** IndexedDB via Dexie (cache katalog + outbox).
- **Server state:** TanStack Query.
- **Backend:** Supabase — Postgres, Auth (email + password), Row Level Security, Storage (logo), Edge Functions (pembuatan akun kasir).
- **Grafik:** Recharts. **Ekspor:** SheetJS (`xlsx`) + CSV.
- **Tes:** Vitest (logika murni), pgTAP via `supabase test db` (RLS & fungsi SQL), Playwright (alur E2E kasir).
- **Hosting:** situs statis (Vercel / Netlify / Cloudflare Pages).
- Satu aplikasi, dua area: `/kasir/*` dan `/owner/*`. Kode owner (grafik, ekspor) di-*lazy load* agar bundle kasir tetap ringan.

Struktur folder yang disarankan:

```
src/
  app/            # router, layout, guard peran
  features/
    auth/
    business/     # pemilih usaha, branding, tema
    catalog/
    pos/          # layar kasir, keranjang, pembayaran
    receipt/      # format nota, ESC/POS, print browser, WhatsApp
    expenses/
    offline/      # Dexie db, outbox, sync engine
    reports/      # rekap & analisis (lazy)
    reserve/      # dana cadangan
  lib/            # supabase client, money, date/timezone utils
supabase/
  migrations/
  functions/      # edge functions
  tests/          # pgTAP
  seed.sql
```

---

## 4. Model Data

Semua uang disimpan sebagai **integer rupiah (`bigint`)** — tidak pernah float/numeric desimal.
Semua waktu `timestamptz`; pengelompokan harian memakai `businesses.timezone`.
Semua tabel bisnis punya `business_id`, `created_at`, `updated_at`.

```
businesses
  id uuid pk, owner_id uuid -> auth.users, name, logo_path, address, phone,
  receipt_footer, primary_color (hex), receipt_prefix (mis. 'SMR'),
  timezone (default 'Asia/Jakarta'), opening_cash bigint default 0, is_active

business_members
  business_id, user_id, role ('owner' | 'cashier'), pk(business_id, user_id)
  -- owner: satu baris per usaha miliknya; akun kasir: tepat satu usaha

catalog_categories
  id, business_id, name, sort_order, is_active

catalog_items
  id, business_id, category_id, name, price bigint (>= 0), sort_order, is_active
  -- item dinonaktifkan, bukan dihapus, bila sudah pernah dipakai transaksi

transactions
  id uuid (DIBUAT DI CLIENT — kunci idempotensi sync offline)
  business_id, receipt_no (unik per business), occurred_at (waktu di perangkat),
  plate_number nullable, payment_method ('cash' | 'qris' | 'transfer'),
  total bigint, cash_received bigint nullable, change_amount bigint nullable,
  status ('paid' | 'void'), void_reason, voided_at, voided_by,
  created_by, device_id

transaction_items
  id, transaction_id, catalog_item_id nullable,
  name_snapshot, price_snapshot bigint, qty int (> 0), line_total bigint
  -- snapshot wajib: perubahan harga katalog tidak boleh mengubah transaksi lama

expense_categories
  id, business_id, name, sort_order, is_active

expenses
  id uuid (DIBUAT DI CLIENT untuk sumber drawer), business_id, category_id,
  amount bigint (> 0), note, source ('drawer' | 'owner'),
  occurred_at, status ('active' | 'void'), void_reason, voided_at, voided_by,
  created_by, device_id

reserve_movements
  id, business_id, type ('deposit' | 'withdraw'), amount bigint (> 0),
  source ('cash' | 'capital')   -- hanya untuk deposit: dari kas usaha atau modal baru owner
  reason (WAJIB untuk withdraw), occurred_at, created_by
```

### Rumus keuangan (implementasikan sebagai fungsi SQL + tes)

Untuk periode `[from, to)` per usaha, hanya baris `status` aktif/paid:

- **Pemasukan** = Σ `transactions.total`
- **Pengeluaran** = Σ `expenses.amount` (semua sumber)
- **Profit** = Pemasukan − Pengeluaran
- **Saldo cadangan** = Σ deposit − Σ withdraw (sepanjang waktu)
- **Kas bebas** = `opening_cash` + Σ pemasukan − Σ pengeluaran − Σ deposit(`source='cash'`) + Σ withdraw
  - Deposit `capital` = uang baru dari owner, langsung masuk cadangan (tidak mengurangi kas bebas).
  - Withdraw mengembalikan uang ke kas bebas; jika uangnya lalu dipakai, catat sebagai pengeluaran biasa.
  - Setor/tarik cadangan **tidak pernah** mengubah profit.
- **Uang laci seharusnya (hari ini)** = Σ transaksi tunai − Σ pengeluaran `drawer` hari ini.

> Rumus kas bebas di atas adalah turunan agent dari keputusan #8 — tunjukkan ke owner
> saat membangun fitur cadangan dan minta konfirmasi.

### Nomor nota (harus aman offline)

Format: `{receipt_prefix}-{YYMMDD}-{device_code}{seq}` — contoh `SMR-261009-A0007`.
`device_code` 1 huruf dibuat saat perangkat pertama kali login dan disimpan lokal;
`seq` counter harian per perangkat di IndexedDB. Ada constraint unik `(business_id, receipt_no)`.

---

## 5. Keamanan & Akses (RLS)

- RLS **aktif di semua tabel**. Pembatasan akses dijaga di database, bukan hanya di UI.
- Helper SQL: `is_member(business_id)`, `is_owner(business_id)` (`security definer`, `stable`).
- **Owner:** akses penuh ke data usaha miliknya.
- **Kasir:**
  - `select` katalog & kategori aktif, branding usahanya.
  - `insert` transaksi, item transaksi, dan pengeluaran `source='drawer'` untuk usahanya.
  - `select` transaksi & pengeluaran **hari ini** saja (riwayat hari ini).
  - Tidak boleh `update`/`delete` langsung. Pembatalan lewat RPC `void_transaction(id, reason)` /
    `void_expense(id, reason)` yang memeriksa: peran, usaha yang sama, hari yang sama (zona waktu usaha), alasan tidak kosong.
  - Tidak boleh melihat rekap, cadangan, pengeluaran owner, atau usaha lain.
- **Pembuatan/reset akun kasir:** Edge Function `manage-cashier` (memakai service role di server),
  hanya bisa dipanggil owner usaha tersebut.
- **`service_role` key tidak boleh ada di kode frontend atau di repo.** `.env` masuk `.gitignore`; sediakan `.env.example`.
- Insert transaksi menghitung ulang/validasi total di server (trigger atau RPC `create_transaction`)
  — jangan percaya total dari client mentah-mentah.

---

## 6. UI Kasir (harus sesederhana mungkin)

Target: transaksi biasa selesai dalam **≤ 4 ketukan** (pilih item → Bayar → Uang pas → Simpan/Cetak).

- **Header:** logo + nama usaha (warna utama brand), indikator online/offline + jumlah antrean belum sinkron.
- **Pemilih kategori** (dropdown/tab sesuai pengaturan owner) → **grid tombol item besar** (nama + harga).
- **Keranjang:** daftar item, qty +/−, total besar, kolom plat nomor opsional.
- **Tombol Bayar** (besar) → layar pembayaran:
  - Metode: Tunai / QRIS / Transfer.
  - Tunai: tombol cepat (Uang Pas, nominal pecahan umum di atas total), keypad angka, **kembalian ditampilkan besar**; tombol simpan nonaktif jika uang kurang.
  - QRIS/Transfer: konfirmasi "Sudah dibayar".
- **Setelah simpan:** pilihan Cetak (Bluetooth) / Print / Kirim WhatsApp / Transaksi Baru.
- **Tombol Pengeluaran** — lebih kecil, sekunder: nominal, kategori, catatan.
- **Riwayat hari ini:** transaksi & pengeluaran hari ini, dengan aksi Batalkan (alasan wajib) dan Cetak ulang.
- **Ringkasan hari ini:** total per metode + uang laci seharusnya.
- Layout responsif: HP = satu kolom (keranjang sebagai panel bawah), tablet/laptop = grid + keranjang berdampingan.
- Format rupiah `Rp 35.000` (`Intl.NumberFormat('id-ID')`), tanpa desimal.

## 7. UI Owner

- **Pemilih usaha** (dan tombol tambah usaha). Warna utama berganti per usaha agar tidak salah usaha.
- **Dashboard:** pemasukan, pengeluaran, profit, saldo cadangan, kas bebas untuk periode terpilih
  (Hari ini / Minggu / Bulan / Rentang bebas) + perbandingan periode sebelumnya.
- **Analisis:** tren harian, layanan terlaris (qty & nilai), heatmap jam × hari, komposisi pengeluaran,
  pemisahan per metode bayar. Agregasi dilakukan di **fungsi SQL/RPC**, bukan menarik semua baris ke client.
- **Transaksi & Pengeluaran:** tabel dengan filter (tanggal, metode, status, kategori, sumber), daftar pembatalan, ekspor Excel/CSV.
- **Pengeluaran owner:** form tambah (sumber `owner`).
- **Dana cadangan:** saldo, riwayat, form setor (sumber kas/modal) & tarik (alasan wajib).
- **Master data:** kategori & item katalog (tambah, ubah, urutkan, nonaktifkan), kategori pengeluaran.
- **Pengaturan usaha / brand:** nama, logo (upload ke Storage), alamat, telepon, teks penutup nota,
  warna utama (dengan pratinjau kasir & nota), prefix nota, zona waktu, saldo awal kas.
- **Akun kasir:** buat, reset password, nonaktifkan.

## 8. Nota

- Isi: logo/nama, alamat, telepon, no. nota, tanggal-jam, plat nomor (jika ada), item × qty × harga,
  total, metode, uang diterima & kembalian (tunai), teks penutup.
- **Bluetooth:** ESC/POS via Web Bluetooth (Chrome Android & Chrome/Edge desktop; tidak tersedia di iOS).
  Lebar kertas 58mm (32 karakter) / 80mm (48 karakter) diatur per perangkat (localStorage).
  Simpan perangkat yang dipasangkan agar cetak berikutnya satu ketuk. Logo di nota thermal = opsional/fase berikut.
- **Print browser:** halaman/komponen nota dengan CSS `@media print` lebar 58/80mm.
- **WhatsApp:** buka `https://wa.me/62xxxxxxxxxx?text=<nota teks terformat>`; normalisasi nomor `08…` → `628…`.
  Bekerja walau transaksi belum tersinkron. Nomor tidak disimpan.
- Satu fungsi murni `formatReceipt(transaction, business, width) → lines[]` dipakai ketiga jalur (diuji dengan Vitest).

## 9. Offline & Sinkronisasi

- Service worker precache app shell; katalog + branding di-cache di IndexedDB dan di-refresh saat online.
- Transaksi/pengeluaran kasir **selalu** ditulis dulu ke outbox lokal, lalu dikirim oleh sync engine
  (saat online, saat event `online`, dan berkala). Pengiriman memakai `upsert` dengan `id` dari client → idempoten, aman diulang.
- Pembatalan saat offline juga masuk outbox (urut setelah insert-nya).
- Gagal permanen (mis. ditolak RLS/validasi) → tandai di outbox dan tampilkan ke kasir, jangan dibuang diam-diam.
- Sesi Supabase disimpan lokal; aplikasi kasir tetap bisa dibuka offline selama pernah login di perangkat itu.
- Owner area: jika offline tampilkan pesan "Butuh koneksi internet".

---

## 10. Urutan Pengerjaan (milestone)

Kerjakan berurutan; tiap milestone diakhiri tes hijau dan demo singkat ke user.

0. **Fondasi:** scaffold Vite + TS + Tailwind + Router + ESLint/Prettier + Vitest; Supabase CLI lokal; `.env.example`; README cara menjalankan.
1. **Database:** migrasi semua tabel, constraint, helper RLS, policy, RPC void, `seed.sql` (Saimara + katalog contoh). Tes pgTAP untuk RLS (kasir tidak bisa baca usaha lain, tidak bisa lihat rekap, tidak bisa void hari kemarin).
2. **Auth & peran:** login, redirect per peran, guard rute, pemilih usaha owner, tema warna per usaha.
3. **Master data owner:** pengaturan usaha/brand + upload logo, katalog, kategori pengeluaran, Edge Function akun kasir.
4. **Kasir online:** katalog, keranjang, pembayaran, kembalian, simpan, riwayat & ringkasan hari ini, pengeluaran laci, pembatalan.
5. **Nota:** `formatReceipt`, print browser, WhatsApp, lalu Bluetooth ESC/POS.
6. **Offline:** Dexie, outbox, sync engine, PWA install & update prompt, indikator status.
7. **Rekap & analisis:** fungsi SQL agregasi + dashboard + ekspor.
8. **Dana cadangan & kas bebas** (konfirmasi rumus dengan owner dulu).
9. **Pengerasan:** E2E Playwright alur kasir (online & offline), audit aksesibilitas dasar, uji di HP Android nyata dengan printer.

## 11. Aturan Kerja untuk Agent

- **Tanya dulu** sebelum: membuat proyek Supabase / menjalankan migrasi ke database remote, memilih atau membayar layanan, `git init`/push ke remote, mengubah Keputusan Terkunci.
- Jangan menambah fitur di luar dokumen ini (YAGNI). Ide tambahan → catat di bagian "Ditunda" dan usulkan ke user.
- Logika uang & tanggal berupa fungsi murni yang dites (penjumlahan, kembalian, batas hari per zona waktu, nomor nota).
- Setiap tabel baru wajib punya RLS + tes policy sebelum dipakai UI.
- Jangan pernah menghapus data transaksi/pengeluaran secara permanen dari aplikasi.
- Perbarui dokumen ini bila ada keputusan baru dari user (tambahkan ke tabel Keputusan Terkunci dengan tanggal).

---

## 12. Pertanyaan Terbuka (tanyakan sebelum fitur terkait dikerjakan)

1. **Stack teknis** — konfirmasi React + Vite satu aplikasi (bagian 3). Alternatif yang ditolak sementara: Next.js (menyulitkan offline), dua aplikasi terpisah (dua basis kode).
2. **Perangkat kasir** di Saimara: Android, iPhone/iPad, atau laptop? (iOS tidak bisa cetak Bluetooth langsung.)
3. **Printer thermal**: sudah ada? Merek/tipe, 58mm atau 80mm?
4. **Bayar di awal atau di akhir?** Asumsi saat ini: transaksi langsung lunas saat dibuat. Jika bayar di akhir, perlu fitur "mobil dalam pengerjaan / belum bayar".
5. **Daftar layanan & harga Saimara** untuk `seed.sql`.
6. **Logo & warna** Saimara.
7. **Zona waktu** lokasi Saimara (WIB / WITA / WIT) — menentukan batas "hari ini".
8. **Proyek Supabase**: sudah punya atau buat baru? (Jangan buat sendiri tanpa izin.)
9. **Konfirmasi rumus kas bebas** & konsep saldo awal kas (bagian 4).
10. **Kategori pengeluaran** — asumsi: diatur owner, dengan daftar default di keputusan #6.
11. **Dana cadangan per usaha** — asumsi: terpisah per usaha (bukan gabungan).

## 13. Ditunda (bukan cakupan sekarang)

Payment gateway / QRIS dinamis · varian harga & stok · data pelanggan & member · akun per karyawan/PIN ·
pengeluaran berulang otomatis · penyisihan cadangan otomatis · dashboard lintas usaha ·
pendaftaran owner publik (SaaS) · nama/ikon PWA per brand · link nota publik · logo di nota thermal.
