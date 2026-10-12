import { cn } from '@/lib/utils'
import type { Business } from '@/lib/types'

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters =
    words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : name.slice(0, 2)
  return letters.toUpperCase()
}

/** Uploaded logo when available, otherwise initials on the brand color. */
export function BusinessLogo({
  business,
  className,
}: {
  business: Pick<Business, 'name' | 'logoUrl' | 'primaryColor'>
  className?: string
}) {
  if (business.logoUrl) {
    return (
      <img
        src={business.logoUrl}
        alt={`Logo ${business.name}`}
        className={cn('size-9 shrink-0 rounded-lg object-cover', className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground ring-1 ring-black/5',
        className,
      )}
      style={{ backgroundColor: business.primaryColor }}
    >
      {initials(business.name)}
    </span>
  )
}
