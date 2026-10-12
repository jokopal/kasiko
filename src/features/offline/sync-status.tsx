import { CloudIcon, CloudOffIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useOnlineStatus } from './use-online-status'

/** Online/offline indicator with the number of records waiting to sync (outbox: milestone 6). */
export function SyncStatus({ pending }: { pending: number }) {
  const online = useOnlineStatus()
  const Icon = online ? CloudIcon : CloudOffIcon
  const label = online ? 'Online' : 'Offline'
  const detail = pending === 0 ? 'Semua data sudah tersinkron' : `${pending} data menunggu sinkron`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          aria-label={`${label}. ${detail}`}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
            online ? 'bg-white/15' : 'bg-amber-400 text-amber-950',
          )}
        >
          <Icon className="size-4" aria-hidden />
          <span className="hidden sm:inline">{label}</span>
          {pending > 0 && (
            <span className="rounded-full bg-white px-1.5 text-[11px] text-foreground tabular-nums">
              {pending}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  )
}
