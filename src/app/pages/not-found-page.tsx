import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-5xl font-semibold text-muted-foreground">404</p>
      <h1 className="text-lg font-medium">Halaman tidak ditemukan</h1>
      <Button asChild size="lg">
        <Link to="/">Kembali ke beranda</Link>
      </Button>
    </main>
  )
}
