import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface Choice<T extends string> {
  value: T
  title: ReactNode
  description?: ReactNode
}

/**
 * Native radio buttons dressed as cards: keyboard and screen-reader behavior come from
 * the browser, the whole card is the touch target (≥ 44 px).
 */
export function ChoiceCards<T extends string>({
  name,
  value,
  onChange,
  choices,
  className,
  legend,
}: {
  name: string
  value: T
  onChange: (value: T) => void
  choices: readonly Choice<T>[]
  className?: string
  legend: string
}) {
  return (
    <fieldset className={cn('grid gap-2', className)}>
      <legend className="sr-only">{legend}</legend>
      {choices.map((choice) => (
        <label
          key={choice.value}
          className={cn(
            'flex min-h-11 cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors',
            'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
            value === choice.value ? 'border-primary bg-brand-soft' : 'hover:bg-muted/60',
          )}
        >
          <input
            type="radio"
            name={name}
            value={choice.value}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span className="grid gap-0.5">
            <span className="font-medium">{choice.title}</span>
            {choice.description && (
              <span className="text-xs text-muted-foreground">{choice.description}</span>
            )}
          </span>
        </label>
      ))}
    </fieldset>
  )
}
