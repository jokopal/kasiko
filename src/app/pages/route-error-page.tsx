import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function RouteErrorPage() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Terjadi kesalahan yang tidak diketahui'

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-medium">Terjadi kesalahan</h1>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <p className="max-w-md text-xs text-muted-foreground">
        Data yang sudah tersimpan tidak hilang. Muat ulang halaman untuk melanjutkan.
      </p>
      <Button size="lg" onClick={() => window.location.reload()}>
        Muat ulang
      </Button>
    </main>
  )
}
