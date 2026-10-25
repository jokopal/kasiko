import { ArrowDownIcon, ArrowUpIcon, RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import {
  KPI_INFO,
  moveEntry,
  PANEL_INFO,
  toggleEntry,
  type DashboardLayout,
  type LayoutEntry,
} from '@/features/business/config'
import { toast } from 'sonner'
import { resetDashboardLayout, saveDashboardLayout } from '@/features/data/owner-actions'
import { cn } from '@/lib/utils'

/** Per-business dashboard layout: what to show and in which order. Saved on every change. */
export function DashboardCustomizer({
  open,
  onOpenChange,
  businessId,
  templateId,
  layout,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  businessId: string
  templateId: string
  layout: DashboardLayout
}) {
  const save = (next: Partial<DashboardLayout>) =>
    void saveDashboardLayout(businessId, { ...layout, ...next }).then((result) => {
      if (!result.ok) toast.error(result.error)
    })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Sesuaikan dashboard</SheetTitle>
          <SheetDescription>
            Berlaku untuk usaha ini saja. Perubahan langsung tersimpan.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <EntryList
            title="Angka utama"
            entries={layout.kpis}
            info={KPI_INFO}
            onChange={(kpis) => save({ kpis })}
          />
          <EntryList
            title="Panel"
            entries={layout.panels}
            info={PANEL_INFO}
            onChange={(panels) => save({ panels })}
          />
        </div>
        <SheetFooter className="border-t">
          <Button
            variant="outline"
            onClick={() => void resetDashboardLayout(businessId, templateId)}
          >
            <RotateCcwIcon />
            Kembalikan ke template
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function EntryList<T extends string>({
  title,
  entries,
  info,
  onChange,
}: {
  title: string
  entries: LayoutEntry<T>[]
  info: Record<T, { label: string; hint: string }>
  onChange: (entries: LayoutEntry<T>[]) => void
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="divide-y rounded-lg border">
        {entries.map((entry, index) => (
          <li key={entry.id} className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
            <div className={cn('min-w-0 flex-1', !entry.visible && 'text-muted-foreground')}>
              <p className="truncate text-sm font-medium">{info[entry.id].label}</p>
              <p className="truncate text-xs text-muted-foreground">{info[entry.id].hint}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              disabled={index === 0}
              onClick={() => onChange(moveEntry(entries, entry.id, -1))}
              aria-label={`Naikkan ${info[entry.id].label}`}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              disabled={index === entries.length - 1}
              onClick={() => onChange(moveEntry(entries, entry.id, 1))}
              aria-label={`Turunkan ${info[entry.id].label}`}
            >
              <ArrowDownIcon />
            </Button>
            <Switch
              checked={entry.visible}
              onCheckedChange={(visible) => onChange(toggleEntry(entries, entry.id, visible))}
              aria-label={`Tampilkan ${info[entry.id].label}`}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
