import { LoaderCircleIcon } from 'lucide-react'

/** In-layout placeholder while a page chunk loads; header and navigation stay put. */
export function PageLoading() {
  return (
    <div
      className="flex h-full min-h-48 items-center justify-center"
      role="status"
      aria-label="Memuat"
    >
      <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" aria-hidden />
    </div>
  )
}
