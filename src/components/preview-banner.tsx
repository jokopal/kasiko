import { FlaskConicalIcon } from 'lucide-react'
import { isSupabaseConfigured } from '@/lib/supabase'

/** Makes it obvious that numbers on screen are sample data, not real bookkeeping. */
export function PreviewBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-100 px-3 py-1 text-center text-xs text-amber-900">
      <FlaskConicalIcon className="size-3.5 shrink-0" aria-hidden />
      <span>
        Mode pratinjau — data contoh tersimpan di browser ini
        {isSupabaseConfigured ? '' : ' (database belum tersambung)'}
      </span>
    </div>
  )
}
