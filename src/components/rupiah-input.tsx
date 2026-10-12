import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { formatDigits, parseRupiah } from '@/lib/money'
import { cn } from '@/lib/utils'

type RupiahInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: number | null
  onValueChange: (value: number | null) => void
}

/** Numeric keypad on phones, thousands grouping as you type, integer rupiah only. */
export function RupiahInput({ value, onValueChange, className, ...props }: RupiahInputProps) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
        Rp
      </span>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={cn('pl-9 tabular-nums', className)}
        value={value === null ? '' : formatDigits(value)}
        onChange={(event) => onValueChange(parseRupiah(event.target.value))}
      />
    </div>
  )
}
