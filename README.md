# Seimara

Aplikasi kasir & keuangan (PWA + Supabase) untuk usaha jasa dengan katalog harga tetap.
Usaha pertama: **Saimara** (cuci mobil). Detail produk & keputusan ada di [`AGENTS.md`](./AGENTS.md).

## Stack

React 19 + Vite + TypeScript (strict) + Tailwind CSS v4 + React Router + Supabase.

## Menjalankan proyek

```bash
npm install
cp .env.example .env   # isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY
npm run dev
```

Skrip lain:

```bash
npm run build         # type-check + build produksi
npm run lint          # ESLint
npm run format        # Prettier (write)
npm run format:check  # Prettier (check only)
npm run test          # Vitest (sekali jalan)
npm run test:watch    # Vitest (watch mode)
```

## Supabase lokal

Proyek ini memakai [Supabase CLI](https://supabase.com/docs/guides/cli). Migrasi di
`supabase/migrations/`, Edge Functions di `supabase/functions/`, tes pgTAP di `supabase/tests/`.

```bash
npx supabase start   # menjalankan stack Supabase lokal (butuh Docker)
npx supabase stop
```

Proyek Supabase remote belum dibuat/ditautkan — lihat Pertanyaan Terbuka #8 di `AGENTS.md`.

## Struktur folder

```
src/
  app/            # router, layout, guard peran
  features/       # auth, business, catalog, pos, receipt, expenses, offline, reports, reserve
  lib/            # supabase client, money, date/timezone utils
supabase/
  migrations/
  functions/
  tests/
```
