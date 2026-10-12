import { LoaderCircleIcon } from 'lucide-react'

export function LoadingScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Memuat">
      <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" aria-hidden />
    </div>
  )
}
