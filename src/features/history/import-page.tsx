import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FileSpreadsheetIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { findTemplate, normalizeLabel, suggestCategory } from '@/features/business/templates'
import { KindDot } from '@/features/expenses/kind'
import { OwnerPage } from '@/features/owner/page'
import { fetchHistoricalDays, fetchLiveDays } from '@/features/data/owner'
import { clearHistory, importHistory } from '@/features/data/owner-actions'
import { useOwnerData } from '@/features/data/owner-data'
import { keys } from '@/features/data/query-client'
import { formatRupiah, sumRupiah } from '@/lib/money'
import { EXPENSE_KIND_LABEL, EXPENSE_KINDS, type ExpenseCategory } from '@/lib/types'
import {
  parseCashflowWorkbook,
  planImport,
  readWorkbookFile,
  SKIP_LABEL,
  type ParsedWorkbook,
} from './cashflow-import'

type Source = 'saved' | 'auto' | 'unknown' | 'manual'

const SOURCE_LABEL: Record<Source, string> = {
  saved: 'Tersimpan',
  auto: 'Otomatis',
  unknown: 'Belum dikenali',
  manual: 'Dipilih',
}

export function ImportPage() {
  const { business, config, expenseCategories } = useOwnerData()
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [reading, setReading] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const active = expenseCategories.filter((c) => c.isActive)
  const imported = useQuery({
    queryKey: keys.list(business.id, 'history'),
    queryFn: () => fetchHistoricalDays(business.id),
  })
  // Days the file covers that already hold cashier data are skipped (decision #27).
  const fileDays = parsed?.months.flatMap((m) => m.days.map((d) => d.dayKey)) ?? []
  const firstFileDay = fileDays.reduce((min, key) => (min === '' || key < min ? key : min), '')
  const lastFileDay = fileDays.reduce((max, key) => (key > max ? key : max), '')
  const live = useQuery({
    queryKey: keys.list(business.id, 'live-days', firstFileDay, lastFileDay),
    queryFn: () => fetchLiveDays(business.id, firstFileDay, lastFileDay),
    enabled: firstFileDay !== '',
  })
  const liveDayKeys = useMemo(() => live.data ?? new Set<string>(), [live.data])

  // Label → category: owner's choice, then the remembered mapping, then template rules.
  // Anything still unknown is not imported until the owner picks a category (decision #29).
  const mapping = useMemo(() => {
    if (!parsed) return {}
    const template = findTemplate(config.templateId)
    const rules = active.map((c) => {
      const fromTemplate = template.expenseCategories.find(
        (t) => normalizeLabel(t.name) === normalizeLabel(c.name),
      )
      return { name: c.name, aliases: fromTemplate?.aliases, keywords: fromTemplate?.keywords }
    })
    const byName = (name: string | null) =>
      name ? active.find((c) => normalizeLabel(c.name) === normalizeLabel(name))?.id : undefined
    const result: Record<string, { categoryId: string; source: Source }> = {}
    for (const label of parsed.labels) {
      const manual = overrides[label.key]
      const saved = config.importMapping[label.key]
      const auto = byName(suggestCategory(label.display, rules))
      if (manual) result[label.key] = { categoryId: manual, source: 'manual' }
      else if (saved && (saved === SKIP_LABEL || active.some((c) => c.id === saved))) {
        result[label.key] = { categoryId: saved, source: 'saved' }
      } else if (auto) result[label.key] = { categoryId: auto, source: 'auto' }
      else result[label.key] = { categoryId: SKIP_LABEL, source: 'unknown' }
    }
    return result
  }, [parsed, overrides, config, active])

  const plan = useMemo(() => {
    if (!parsed || !live.data) return null
    const ids = Object.fromEntries(Object.entries(mapping).map(([k, v]) => [k, v.categoryId]))
    const unmapped = parsed.labels.filter((l) => !ids[l.key])
    if (unmapped.length > 0) return { ok: false as const, unmapped: unmapped.length }
    return {
      ok: true as const,
      ids,
      ...planImport(parsed, ids, { businessId: business.id, liveDayKeys, now: new Date() }),
    }
  }, [parsed, live.data, mapping, business.id, liveDayKeys])

  async function onFile(file: File | undefined) {
    if (!file) return
    setReading(true)
    try {
      const result = parseCashflowWorkbook(await readWorkbookFile(file))
      if (result.months.length === 0) {
        toast.error('Tidak ada sheet bulanan yang bisa dibaca di file ini')
        return
      }
      setParsed(result)
      setOverrides({})
      setFileName(file.name)
    } catch {
      toast.error('File tidak bisa dibaca. Pastikan formatnya .xlsx atau .xls')
    } finally {
      setReading(false)
      if (input.current) input.current.value = ''
    }
  }

  async function commit() {
    if (!plan?.ok) return
    const result = await importHistory(business.id, plan.days, plan.ids)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`${result.value.days} hari data historis diimpor`)
    setParsed(null)
    setFileName(null)
  }

  const needsReview = parsed?.labels.filter((l) => mapping[l.key]?.source === 'unknown') ?? []

  return (
    <OwnerPage
      title="Impor Data"
      description="Masukkan riwayat dari spreadsheet arus kas agar tren dan perbandingan langsung terisi. Data impor hanya untuk analisis — tidak mengubah kas bebas atau uang laci."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>1. Pilih file</CardTitle>
              <CardDescription>
                Format arus kas bulanan: satu sheet per bulan (mis. <code>JAN-25</code>,{' '}
                <code>MARET 26</code>), tanggal di baris pertama, baris <strong>Pendapatan</strong>,
                lalu satu baris per jenis pengeluaran di kolom B. File hanya dibaca di perangkat
                ini.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <input
                ref={input}
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                id="cashflow-file"
                onChange={(event) => void onFile(event.target.files?.[0])}
              />
              <Button onClick={() => input.current?.click()} disabled={reading}>
                <UploadIcon />
                {reading ? 'Membaca…' : parsed ? 'Ganti file' : 'Pilih file Excel'}
              </Button>
              {fileName && (
                <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                  <FileSpreadsheetIcon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{fileName}</span>
                </span>
              )}
            </CardContent>
          </Card>

          {parsed && !plan && (
            <p className="text-sm text-muted-foreground">
              {live.error ? `Gagal memeriksa tanggal: ${live.error.message}` : 'Memeriksa tanggal…'}
            </p>
          )}
          {parsed && plan && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>2. Periksa isi file</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <Stat
                      label="Bulan"
                      value={`${parsed.months.length}`}
                      note={`${parsed.months[0]?.monthKey ?? ''} – ${parsed.months.at(-1)?.monthKey ?? ''}`}
                    />
                    <Stat
                      label="Hari diimpor"
                      value={plan.ok ? `${plan.days.length}` : '—'}
                      note={
                        plan.ok && plan.skippedDayKeys.length > 0
                          ? `${plan.skippedDayKeys.length} hari dilewati (sudah ada data kasir)`
                          : 'Tidak ada yang bentrok'
                      }
                    />
                    <Stat label="Pendapatan" value={plan.ok ? formatRupiah(plan.income) : '—'} />
                    <Stat
                      label="Pengeluaran"
                      value={plan.ok ? formatRupiah(plan.expense) : '—'}
                      note={
                        plan.ok && plan.skippedExpense > 0
                          ? `${formatRupiah(plan.skippedExpense)} tidak diimpor`
                          : `${parsed.labels.length} label`
                      }
                    />
                  </dl>
                  {(parsed.warnings.length > 0 || parsed.skippedSheets.length > 0) && (
                    <details className="rounded-lg border bg-muted/40 p-3 text-sm">
                      <summary className="flex cursor-pointer items-center gap-2 font-medium">
                        <AlertTriangleIcon className="size-4 text-amber-600" aria-hidden />
                        {parsed.warnings.length} peringatan
                        {parsed.skippedSheets.length > 0 &&
                          ` · ${parsed.skippedSheets.length} sheet dilewati`}
                      </summary>
                      <ul className="mt-2 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-muted-foreground">
                        {parsed.skippedSheets.map((name) => (
                          <li key={name}>Sheet &quot;{name}&quot; bukan nama bulan, dilewati</li>
                        ))}
                        {parsed.warnings.map((warning, i) => (
                          <li key={i}>{warning}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </CardContent>
              </Card>

              <Card className="gap-0 pb-0">
                <CardHeader className="border-b pb-4">
                  <CardTitle>3. Cocokkan label dengan kategori</CardTitle>
                  <CardDescription>
                    Jenis kategori menentukan hitungan profit. Pilihan Anda diingat untuk impor
                    berikutnya.
                    {needsReview.length > 0 &&
                      ` ${needsReview.length} label belum dikenali dan tidak diimpor. Kalau perlu, tambahkan kategorinya di Admin → Kategori Pengeluaran lalu pilih di sini.`}
                  </CardDescription>
                </CardHeader>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label di Excel</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Total</TableHead>
                      <TableHead className="w-56">Kategori Kasiko</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...parsed.labels]
                      .sort(
                        (a, b) =>
                          Number(mapping[b.key]?.source === 'unknown') -
                          Number(mapping[a.key]?.source === 'unknown'),
                      )
                      .map((label) => {
                        const current = mapping[label.key]
                        return (
                          <TableRow key={label.key}>
                            <TableCell>
                              <span className="font-medium">{label.display}</span>
                              <span className="block text-xs text-muted-foreground">
                                {label.entries} catatan
                                <span className="sm:hidden"> · {formatRupiah(label.total)}</span>
                              </span>
                            </TableCell>
                            <TableCell className="hidden text-right tabular-nums sm:table-cell">
                              {formatRupiah(label.total)}
                            </TableCell>
                            <TableCell>
                              <div className="grid gap-1">
                                <CategorySelect
                                  label={label.display}
                                  value={current?.categoryId ?? ''}
                                  categories={active}
                                  onChange={(id) =>
                                    setOverrides((o) => ({ ...o, [label.key]: id }))
                                  }
                                />
                                {current && (
                                  <Badge
                                    variant={current.source === 'unknown' ? 'secondary' : 'outline'}
                                    className="w-fit"
                                  >
                                    {SOURCE_LABEL[current.source]}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                  </TableBody>
                </Table>
                <div className="flex flex-wrap items-center justify-end gap-3 border-t p-4">
                  {!plan.ok && (
                    <p className="text-sm text-destructive">
                      {plan.unmapped} label belum punya kategori
                    </p>
                  )}
                  <Button variant="outline" onClick={() => setParsed(null)}>
                    Batal
                  </Button>
                  <Button
                    onClick={() => void commit()}
                    disabled={!plan.ok || plan.days.length === 0}
                  >
                    <CheckCircle2Icon />
                    Impor {plan.ok ? `${plan.days.length} hari` : ''}
                  </Button>
                </div>
              </Card>
            </>
          )}
        </div>

        <ImportedSummary days={imported.data ?? []} onClear={() => setConfirmClear(true)} />
      </div>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus data impor?</DialogTitle>
            <DialogDescription>
              Semua hari hasil impor untuk {business.name} dihapus. Transaksi dan pengeluaran dari
              kasir tidak tersentuh. File Excel Anda tetap aman dan bisa diimpor lagi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void clearHistory(business.id).then((result) => {
                  setConfirmClear(false)
                  if (result.ok) toast.success('Data impor dihapus')
                  else toast.error(result.error)
                })
              }}
            >
              Hapus data impor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OwnerPage>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  )
}

function CategorySelect({
  label,
  value,
  categories,
  onChange,
}: {
  label: string
  value: string
  categories: ExpenseCategory[]
  onChange: (id: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-full" aria-label={`Kategori untuk ${label}`}>
        <SelectValue placeholder="Pilih kategori" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SKIP_LABEL}>Tidak diimpor</SelectItem>
        {EXPENSE_KINDS.map((kind) => {
          const group = categories.filter((c) => c.kind === kind)
          if (group.length === 0) return null
          return (
            <SelectGroup key={kind}>
              <SelectLabel className="flex items-center gap-1.5">
                <KindDot kind={kind} />
                {EXPENSE_KIND_LABEL[kind]}
              </SelectLabel>
              {group.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )
        })}
      </SelectContent>
    </Select>
  )
}

function ImportedSummary({
  days,
  onClear,
}: {
  days: readonly { dayKey: string; income: number }[]
  onClear: () => void
}) {
  const months = useMemo(() => {
    const byMonth = new Map<string, { days: number; income: number }>()
    for (const day of days) {
      const key = day.dayKey.slice(0, 7)
      const entry = byMonth.get(key) ?? { days: 0, income: 0 }
      entry.days += 1
      entry.income += day.income
      byMonth.set(key, entry)
    }
    return [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [days])

  return (
    <Card className="h-fit gap-3">
      <CardHeader>
        <CardTitle className="text-base">Data impor saat ini</CardTitle>
        <CardDescription>
          {days.length === 0
            ? 'Belum ada data historis.'
            : `${days.length} hari · ${formatRupiah(sumRupiah(days.map((d) => d.income)))}`}
        </CardDescription>
      </CardHeader>
      {months.length > 0 && (
        <CardContent className="space-y-3">
          <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border text-sm">
            {months.map(([key, entry]) => (
              <li key={key} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="font-medium tabular-nums">{key}</span>
                <span className="text-xs text-muted-foreground">{entry.days} hari</span>
                <span className="tabular-nums">{formatRupiah(entry.income)}</span>
              </li>
            ))}
          </ul>
          <Button variant="outline" className="w-full text-destructive" onClick={onClear}>
            <Trash2Icon />
            Hapus data impor
          </Button>
          <p className="text-xs text-muted-foreground">
            Impor ulang bulan yang sama menggantikan datanya, tidak menggandakan.
          </p>
        </CardContent>
      )}
    </Card>
  )
}
