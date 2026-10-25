import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Only the public (publishable/anon) key ever reaches the browser; access is enforced by
// RLS and the RPCs (AGENTS.md section 8). The service key lives in Edge Functions only.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

let client: SupabaseClient | null = null

/**
 * Lazily creates the shared client. Never throws at import time, so the app shell
 * (and the offline cashier) still boots when configuration is missing.
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Supabase belum dikonfigurasi: isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY',
    )
  }
  // The session persists in localStorage so the cashier can reopen the app offline.
  client ??= createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  return client
}
