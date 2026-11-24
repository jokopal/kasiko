import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ArrowRightIcon, ShieldCheckIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageLoading } from '@/components/page-loading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AUDIT_PAGE, fetchAuditLog, fetchMemberRoles, type AuditEntry } from '@/features/data/owner'
import { useOwnerData } from '@/features/data/owner-data'
import { keys } from '@/features/data/query-client'
import { OwnerPage } from '@/features/owner/page'
import { PeriodPicker } from '@/features/reports/period-picker'
import { usePeriod } from '@/features/reports/use-period'
import { businessDayKey, formatLongDate, formatTime, startOfBusinessDayKey } from '@/lib/datetime'
import { cn } from '@/lib/utils'
import {
  actorLabel,
  AUDIT_KIND_ENTITIES,
  AUDIT_KIND_LABEL,
  describeAudit,
  isAuditKind,
  matchesKind,
  type AuditKind,
} from './audit-format'

const KINDS = Object.keys(AUDIT_KIND_LABEL) as AuditKind[]

/**
 * Log Audit (decisions #21, #44): every price, catalog, settings and account change, owner
 * voids, recategorized expenses and cashier password reveals, newest first.
 */
export function AuditPage() {
  const { business, catalogCategories, expenseCategories } = useOwnerData()
  const tz = business.timezone
  const period = usePeriod(tz, 'month')
  const [params, setParams] = useSearchParams()
  const raw = params.get('jenis')
  const kind: AuditKind | null = isAuditKind(raw) ? raw : null

  function setKind(next: AuditKind | null) {
    const updated = new URLSearchParams(params)
    if (next) updated.set('jenis', next)
    else updated.delete('jenis')
    setParams(updated, { replace: true })
  }

  const roles = useQuery({
    queryKey: keys.list(business.id, 'member-roles'),
    queryFn: () => fetchMemberRoles(business.id),
  })
  const log = useInfiniteQuery({
    queryKey: keys.list(business.id, 'audit', period.firstDayKey, period.lastDayKey, kind),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      fetchAuditLog(business.id, {
        from: period.range.from,
        to: period.range.to,
        entities: kind ? AUDIT_KIND_ENTITIES[kind] : undefined,
        beforeId: pageParam,
      }),
    getNextPageParam: (last) => (last.length === AUDIT_PAGE ? last.at(-1)?.id : undefined),
  })

  const names = useMemo(
    () => new Map([...catalogCategories, ...expenseCategories].map((c) => [c.id, c.name])),
    [catalogCategories, expenseCategories],
  )
  const entries = (log.data?.pages.flat() ?? []).filter((e) => !kind || matchesKind(e, kind))
  const byDay = groupByDay(entries, tz)

  return (
    <OwnerPage
      title="Log Audit"
      description="Siapa mengubah apa dan kapan: harga, katalog, pengaturan, akun kasir, dan pembatalan. Tidak bisa diubah atau dihapus."
      actions={<PeriodPicker period={period} />}
    >
      <div
        className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1"
        role="group"
        aria-label="Jenis perubahan"
      >
        {[null, ...KINDS].map((value) => (
          <Button
            key={value ?? 'all'}
            variant={kind === value ? 'default' : 'outline'}
            size="sm"
            className="h-9 shrink-0 rounded-full"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
          >
            {value ? AUDIT_KIND_LABEL[value] : 'Semua'}
          </Button>
        ))}
      </div>

      {log.isPending || roles.isPending ? (
        <PageLoading />
      ) : log.error ? (
        <p className="text-sm text-destructive">Log audit gagal dimuat: {log.error.message}</p>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ShieldCheckIcon className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">Tidak ada perubahan di periode ini</p>
            <p className="text-sm text-muted-foreground">
              Coba periode yang lebih panjang atau jenis lain.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {byDay.map(([dayKey, rows]) => (
            <section
              key={dayKey}
              aria-label={formatLongDate(startOfBusinessDayKey(dayKey, tz), tz)}
            >
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                {formatLongDate(startOfBusinessDayKey(dayKey, tz), tz)}
              </h2>
              <Card className="gap-0 py-0">
                <ul className="divide-y">
                  {rows.map((entry) => (
                    <AuditItem
                      key={entry.id}
                      entry={entry}
                      tz={tz}
                      actor={actorLabel(entry.actorId, roles.data ?? new Map())}
                      names={names}
                    />
                  ))}
                </ul>
              </Card>
            </section>
          ))}
          {log.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                disabled={log.isFetchingNextPage}
                onClick={() => void log.fetchNextPage()}
              >
                {log.isFetchingNextPage ? 'Memuat…' : 'Muat lebih banyak'}
              </Button>
            </div>
          )}
        </div>
      )}
    </OwnerPage>
  )
}

function groupByDay(entries: AuditEntry[], tz: string): [string, AuditEntry[]][] {
  const groups = new Map<string, AuditEntry[]>()
  for (const entry of entries) {
    const key = businessDayKey(new Date(entry.createdAt), tz)
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  return [...groups.entries()]
}

const KIND_BADGE: Record<AuditKind, string> = {
  koreksi:
    'border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100',
  harga:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
  katalog: '',
  pengaturan: '',
  akun: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100',
  pembatalan:
    'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100',
  pengeluaran: '',
}

function AuditItem({
  entry,
  tz,
  actor,
  names,
}: {
  entry: AuditEntry
  tz: string
  actor: string
  names: ReadonlyMap<string, string>
}) {
  const line = describeAudit(entry, names)
  return (
    <li className="flex gap-3 px-3 py-3 sm:px-4">
      <time
        dateTime={entry.createdAt}
        className="w-11 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums"
      >
        {formatTime(new Date(entry.createdAt), tz)}
      </time>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{line.title}</span>
          <span className="truncate text-sm text-muted-foreground">· {line.subject}</span>
        </div>
        {line.changes.length > 0 && (
          <ul className="space-y-0.5 text-sm">
            {line.changes.map((change) => (
              <li key={change.field} className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground">{change.field}</span>
                {change.from !== '–' && (
                  <>
                    <span className="tabular-nums line-through decoration-muted-foreground/60">
                      {change.from}
                    </span>
                    <ArrowRightIcon
                      className="size-3.5 text-muted-foreground"
                      aria-label="menjadi"
                    />
                  </>
                )}
                <span className="font-medium tabular-nums">{change.to}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant="outline" className={cn(KIND_BADGE[line.kind])}>
          {AUDIT_KIND_LABEL[line.kind]}
        </Badge>
        <span className="text-xs text-muted-foreground">oleh {actor}</span>
      </div>
    </li>
  )
}
