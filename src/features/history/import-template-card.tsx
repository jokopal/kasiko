import { DownloadIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { downloadBlob } from '@/features/reports/monthly-export'
import { businessDayKey } from '@/lib/datetime'
import type { Business, ExpenseCategory } from '@/lib/types'
import { monthsOfYear, renderTemplate, templateMonth, templateTags } from './import-template'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Downloads the tagged Excel template, built from this business's own categories. */
export function ImportTemplateCard({
  business,
  categories,
}: {
  business: Business
  categories: ExpenseCategory[]
}) {
  const thisYear = Number(businessDayKey(new Date(), business.timezone).slice(0, 4))
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2]
  const [year, setYear] = useState(String(thisYear))
  const [building, setBuilding] = useState(false)

  async function download() {
    setBuilding(true)
    try {
      const tags = templateTags(categories)
      const buffer = await renderTemplate({
        businessName: business.name,
        brandColor: business.primaryColor,
        tags,
        months: monthsOfYear(Number(year)).map((key) => templateMonth(key, tags)),
      })
      downloadBlob(
        `Template Impor ${business.name} ${year}.xlsx`,
        new Blob([buffer], { type: XLSX_TYPE }),
      )
    } catch {
      toast.error('Template gagal dibuat. Coba lagi.')
    } finally {
      setBuilding(false)
    }
  }

  return (
    <Card className="h-fit gap-3">
      <CardHeader>
        <CardTitle className="text-base">Template Excel</CardTitle>
        <CardDescription>
          Dibuat dari kategori {business.name}. Setiap baris punya tag, jadi langsung dikenali saat
          diimpor dan labelnya bebas diubah.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-24 shrink-0" aria-label="Tahun template">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="min-w-0 flex-1"
          disabled={building || categories.length === 0}
          onClick={() => void download()}
        >
          <DownloadIcon />
          {building ? 'Membuat…' : 'Unduh template'}
        </Button>
      </CardContent>
    </Card>
  )
}
