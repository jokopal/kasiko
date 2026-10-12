import { WifiOffIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Full-screen explanation when a screen cannot work in the current state. */
export function BlockingScreen({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
      <WifiOffIcon className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  )
}
