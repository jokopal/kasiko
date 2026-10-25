import { LayoutTemplateIcon } from 'lucide-react'
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
import { applyTemplate } from '@/features/data/owner-actions'
import { BUSINESS_TEMPLATES, findTemplate } from './templates'

/** Re-applies a template: adds only what the business is missing, never edits rows. */
export function TemplateCard({
  businessId,
  templateId,
}: {
  businessId: string
  templateId: string
}) {
  const [choice, setChoice] = useState(templateId)
  const current = findTemplate(templateId)

  async function apply() {
    const result = await applyTemplate(businessId, choice)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    const { catalogCategories, catalogItems, expenseCategories } = result.value
    const added = catalogCategories + catalogItems + expenseCategories
    toast.success(
      added === 0
        ? 'Semua isi template sudah ada'
        : `Ditambahkan: ${catalogItems} layanan, ${catalogCategories} kategori layanan, ${expenseCategories} kategori pengeluaran`,
    )
  }

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LayoutTemplateIcon className="size-4" aria-hidden />
          Template usaha
        </CardTitle>
        <CardDescription>
          Saat ini: <strong>{current.name}</strong>. Menerapkan template hanya menambah kategori dan
          layanan yang belum ada — tidak mengubah atau menghapus apa pun.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Select value={choice} onValueChange={setChoice}>
          <SelectTrigger className="w-full" aria-label="Pilih template">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUSINESS_TEMPLATES.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => void apply()}>
          Terapkan
        </Button>
      </CardContent>
    </Card>
  )
}
