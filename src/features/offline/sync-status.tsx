import { AlertTriangleIcon, CloudIcon, CloudOffIcon, RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatRupiah } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { OutboxEntry } from './db'
import { retryEntry } from './outbox'
import { useOnlineStatus } from './use-online-status'

const KIND_LABEL: Record<OutboxEntry['operation']['kind'], string> = {
  'transaction.create': 'Transaksi',
  'transaction.void': 'Pembatalan transaksi',
  'expense.create': 'Pengeluaran',
  'expense.void': 'Pembatalan pengeluaran',
}

function describe(entry: OutboxEntry): string {
  const { operation } = entry
  if (operation.kind === 'transaction.create') {
    return `${operation.record.receiptNo} · ${formatRupiah(operation.record.total)}`
  }
  if (operation.kind === 'expense.create') return formatRupiah(operation.record.amount)
  return operation.reason
}

/** Online/offline + unsynced count in the header; tap for details and retries. */
export function SyncStatus({ entries }: { entries: readonly OutboxEntry[] }) {
  const online = useOnlineStatus()
  const [open, setOpen] = useState(false)
  const failed = entries.filter((e) => e.status === 'failed')
  const pending = entries.length - failed.length
  const Icon = failed.length > 0 ? AlertTriangleIcon : online ? CloudIcon : CloudOffIcon
  const label = online ? 'Online' : 'Offline'
  const detail =
    entries.length === 0
      ? 'Semua data sudah tersinkron'
      : `${pending} menunggu sinkron${failed.length ? `, ${failed.length} gagal` : ''}`

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label}. ${detail}`}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors',
          failed.length > 0
            ? 'bg-red-600 text-white'
            : online
              ? 'bg-white/15 hover:bg-white/25'
              : 'bg-amber-400 text-amber-950',
        )}
      >
        <Icon className="size-4" aria-hidden />
        <span className="hidden sm:inline">{label}</span>
        {entries.length > 0 && (
          <span
            className="rounded-full bg-white px-1.5 text-[11px] text-foreground tabular-nums"
            data-testid="outbox-count"
          >
            {entries.length}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Status sinkron</DialogTitle>
            <DialogDescription>
              {online ? 'Perangkat online. ' : 'Perangkat offline — data tetap tersimpan di sini. '}
              {detail}.
            </DialogDescription>
          </DialogHeader>
          {entries.length > 0 && (
            <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{KIND_LABEL[entry.operation.kind]}</p>
                    <p className="truncate text-muted-foreground">{describe(entry)}</p>
                    {entry.lastError && (
                      <p
                        className={cn(
                          'mt-1 text-xs',
                          entry.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {entry.status === 'failed' ? 'Ditolak server: ' : 'Terakhir: '}
                        {entry.lastError}
                      </p>
                    )}
                  </div>
                  {entry.status === 'failed' ? (
                    <Button size="sm" variant="outline" onClick={() => void retryEntry(entry.id)}>
                      <RefreshCwIcon />
                      Coba lagi
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Menunggu</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {failed.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Data yang ditolak tidak dihapus. Laporkan ke owner bila tetap gagal setelah dicoba
              lagi.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
