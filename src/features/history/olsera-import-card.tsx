import { useQuery } from '@tanstack/react-query'
import { AlertTriangleIcon, CheckCircle2Icon, FileSpreadsheetIcon, UploadIcon } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { findTemplate } from '@/features/business/templates'
import { fetchItemSales, type ImportedItemSale } from '@/features/data/owner'
import { importItemSales } from '@/features/data/owner-actions'
import { useOwnerData } from '@/features/data/owner-data'
import { keys, queryClient } from '@/features/data/query-client'
import { formatRupiah } from '@/lib/money'
import { readWorkbookFile } from './cashflow-import'
import {
  importPeriods,
  mappingToSave,
  parseOlseraSheet,
  productsOf,
  suggestChoice,
  type OlseraReport,
  type ProductChoice,
} from './olsera-import'

const NONE = '__none'
const SKIP = '__skip'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const periodLabel = (first: string, last: string) => {
  const month = `${MONTHS[Number(first.slice(5, 7)) - 1] ?? ''} ${first.slice(0, 4)}`
  const fullMonth = first.endsWith('-01') && Number(last.slice(8, 10)) >= 28
  return fullMonth ? month : `${month} (${Number(first.slice(8, 10))}–${Number(last.slice(8, 10))})`
}

/**
 * Decision #45: Olsera "Penjualan berdasarkan SKU" reports, one file per month, imported as
 * item sales for best sellers and vehicles per day. Never income: the cash-flow import
 * already holds the same money.
 */
export function OlseraImportCard() {
  const { business, config, catalogCategories, catalogItems } = useOwnerData()
  const [reports, setReports] = useState<OlseraReport[]>([])
  const [failures, setFailures] = useState<{ fileName: string; error: string }[]>([])
  const [overrides, setOverrides] = useState<Record<string, ProductChoice>>({})
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const imported = useQuery({
    queryKey: keys.list(business.id, 'item-sales'),
    queryFn: () => fetchItemSales(business.id),
  })

  const products = useMemo(() => productsOf(reports), [reports])
  const aliases = useMemo(
    () => findTemplate(config.templateId).itemAliases ?? {},
    [config.templateId],
  )
  const choices = useMemo(() => {
    const out: Record<string, ProductChoice> = {}
    for (const product of products) {
      out[product.key] =
        overrides[product.key] ??
        suggestChoice(product.key, catalogItems, config.itemMapping, aliases)
    }
    return out
  }, [products, overrides, catalogItems, config.itemMapping, aliases])

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setReading(true)
    const ok: OlseraReport[] = []
    const bad: { fileName: string; error: string }[] = []
    for (const file of Array.from(files)) {
      try {
        const [sheet] = await readWorkbookFile(file)
        const result = parseOlseraSheet(file.name, sheet?.rows ?? [])
        if (result.ok) ok.push(result.report)
        else bad.push({ fileName: result.fileName, error: result.error })
      } catch {
        bad.push({ fileName: file.name, error: 'File tidak bisa dibaca' })
      }
    }
    // One report per period: a later file for the same month replaces the earlier one.
    const byPeriod = new Map(ok.map((r) => [r.firstDay, r]))
    setReports([...byPeriod.values()].sort((a, b) => a.firstDay.localeCompare(b.firstDay)))
    setFailures(bad)
    setOverrides({})
    setReading(false)
    if (input.current) input.current.value = ''
  }

  async function commit() {
    setSaving(true)
    const result = await importItemSales(
      business.id,
      importPeriods(reports, choices),
      mappingToSave(choices),
    )
    setSaving(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`${result.value.periods} laporan Olsera diimpor`)
    setReports([])
    setFailures([])
    void queryClient.invalidateQueries({ queryKey: keys.list(business.id, 'item-sales') })
  }

  const categories = catalogCategories.filter((c) =>
    catalogItems.some((i) => i.categoryId === c.id),
  )
  const toValue = (choice: ProductChoice | undefined) =>
    !choice || choice.kind === 'none' ? NONE : choice.kind === 'skip' ? SKIP : choice.itemId
  const fromValue = (value: string): ProductChoice =>
    value === NONE
      ? { kind: 'none' }
      : value === SKIP
        ? { kind: 'skip' }
        : { kind: 'item', itemId: value }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Laporan penjualan per layanan (Olsera)</CardTitle>
        <CardDescription>
          File &quot;Penjualan berdasarkan SKU&quot;, satu per bulan; boleh pilih banyak sekaligus.
          Dipakai untuk layanan terlaris dan kendaraan per hari.{' '}
          <strong>Tidak menambah pemasukan</strong>, karena uangnya sudah tercatat dari impor arus
          kas. Bulan yang sudah memakai kasir Kasiko berhenti sehari sebelum transaksi kasir
          pertama.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="sr-only"
            id="olsera-files"
            onChange={(event) => void onFiles(event.target.files)}
          />
          <Button variant="outline" onClick={() => input.current?.click()} disabled={reading}>
            <UploadIcon />
            {reading ? 'Membaca…' : reports.length > 0 ? 'Ganti file' : 'Pilih file Olsera'}
          </Button>
          {reports.length > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileSpreadsheetIcon className="size-4" aria-hidden />
              {reports.length} laporan ·{' '}
              {periodLabel(reports[0]?.firstDay ?? '', reports[0]?.lastDay ?? '')}
              {reports.length > 1 &&
                ` s/d ${periodLabel(reports.at(-1)?.firstDay ?? '', reports.at(-1)?.lastDay ?? '')}`}
            </span>
          )}
        </div>

        {failures.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            {failures.map((f) => (
              <li key={f.fileName} className="flex gap-2">
                <AlertTriangleIcon
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="font-medium break-all">{f.fileName}</span>: {f.error}
                </span>
              </li>
            ))}
          </ul>
        )}

        {products.length > 0 && (
          <>
            <div className="relative overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">Hubungkan produk Olsera ke layanan Kasiko</caption>
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Produk Olsera
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Qty
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Total
                    </th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Layanan Kasiko
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {products.map((product) => (
                    <tr key={product.key}>
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        <span className="block font-medium">{product.product}</span>
                        {product.productGroup && (
                          <span className="block text-xs text-muted-foreground">
                            {product.productGroup}
                          </span>
                        )}
                      </th>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {product.qty.toLocaleString('id-ID')}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatRupiah(product.amount)}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={toValue(choices[product.key])}
                          onValueChange={(value) =>
                            setOverrides((current) => ({
                              ...current,
                              [product.key]: fromValue(value),
                            }))
                          }
                        >
                          <SelectTrigger
                            className="h-9 w-56"
                            aria-label={`Layanan untuk ${product.product}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Tanpa layanan (bukan kendaraan)</SelectItem>
                            <SelectItem value={SKIP}>Jangan impor</SelectItem>
                            <SelectSeparator />
                            {categories.map((category) => (
                              <SelectGroup key={category.id}>
                                <SelectLabel>{category.name}</SelectLabel>
                                {catalogItems
                                  .filter((i) => i.categoryId === category.id)
                                  .map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                      {item.name}
                                      {!item.isActive && ' (nonaktif)'}
                                    </SelectItem>
                                  ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Produk yang dihubungkan ke layanan ikut dihitung sebagai kendaraan bila kategorinya
              menghitung kendaraan. Pilihan ini diingat untuk impor berikutnya.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setReports([])}>
                Batal
              </Button>
              <Button onClick={() => void commit()} disabled={saving}>
                <CheckCircle2Icon />
                {saving ? 'Mengimpor…' : `Impor ${reports.length} laporan`}
              </Button>
            </div>
          </>
        )}

        <ImportedItemSales rows={imported.data ?? []} />
      </CardContent>
    </Card>
  )
}

function ImportedItemSales({ rows }: { rows: readonly ImportedItemSale[] }) {
  const periods = useMemo(() => {
    const map = new Map<string, { last: string; qty: number; amount: number; linked: number }>()
    for (const row of rows) {
      const entry = map.get(row.firstDay) ?? { last: row.lastDay, qty: 0, amount: 0, linked: 0 }
      entry.qty += row.qty
      entry.amount += row.amount
      if (row.catalogItemId) entry.linked += row.amount
      map.set(row.firstDay, entry)
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [rows])
  if (periods.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada laporan Olsera yang diimpor.</p>
  }
  return (
    <details className="rounded-lg border">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-medium">
        Sudah diimpor
        <Badge variant="secondary">{periods.length} laporan</Badge>
      </summary>
      <ul className="max-h-72 divide-y overflow-y-auto border-t text-sm">
        {periods.map(([first, entry]) => (
          <li key={first} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="font-medium">{periodLabel(first, entry.last)}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {entry.qty.toLocaleString('id-ID')} item
            </span>
            <span className="tabular-nums">{formatRupiah(entry.amount)}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
