import { useSearchParams } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { isPeriodPreset, PERIOD_LABEL, type Period, type PeriodPreset } from './period'

export function PeriodPicker({ period }: { period: Period }) {
  const [params, setParams] = useSearchParams()

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        variant="outline"
        value={period.preset}
        onValueChange={(value) => {
          if (!isPeriodPreset(value)) return
          update(
            value === 'custom'
              ? { periode: value, dari: period.firstDayKey, sampai: period.lastDayKey }
              : { periode: value, dari: null, sampai: null },
          )
        }}
        aria-label="Periode"
      >
        {(Object.keys(PERIOD_LABEL) as PeriodPreset[]).map((preset) => (
          <ToggleGroupItem key={preset} value={preset} className="h-9 px-3 text-sm">
            {PERIOD_LABEL[preset]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {period.preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="Dari tanggal"
            className="h-9 w-auto"
            value={period.firstDayKey}
            onChange={(event) => update({ dari: event.target.value })}
          />
          <span className="text-sm text-muted-foreground">–</span>
          <Input
            type="date"
            aria-label="Sampai tanggal"
            className="h-9 w-auto"
            value={period.lastDayKey}
            onChange={(event) => update({ sampai: event.target.value })}
          />
        </div>
      )}
    </div>
  )
}
