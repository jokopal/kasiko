import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * A password field with a show/hide button, so a typed password can be checked before
 * submitting. The button only appears once something is typed, and is a real button
 * (keyboard reachable, labelled, 40px touch target) that never submits the form.
 */
export function PasswordInput({
  className,
  value,
  ...props
}: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false)
  const filled = typeof value === 'string' ? value.length > 0 : true
  return (
    <div className="relative">
      <Input
        {...props}
        value={value}
        type={visible && filled ? 'text' : 'password'}
        className={cn('pr-11', className)}
      />
      {filled && (
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
          aria-pressed={visible}
          aria-controls={props.id}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {visible ? (
            <EyeOffIcon className="size-4" aria-hidden />
          ) : (
            <EyeIcon className="size-4" aria-hidden />
          )}
        </button>
      )}
    </div>
  )
}
