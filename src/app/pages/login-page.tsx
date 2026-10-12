import { BarChart3Icon, ReceiptTextIcon } from 'lucide-react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { homePathFor, signInPreview, useSession } from '@/features/auth/session'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { Role } from '@/lib/types'

export function LoginPage() {
  const session = useSession()
  const navigate = useNavigate()

  if (session) return <Navigate to={homePathFor(session.role)} replace />

  function enterPreview(role: Role) {
    signInPreview(role)
    void navigate(homePathFor(role), { replace: true })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-3">
          <img src="/favicon.svg" alt="" className="size-10" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Kasiko</h1>
            <p className="text-sm text-muted-foreground">Kasir & keuangan usaha</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Masuk</CardTitle>
            <CardDescription>Gunakan akun owner atau akun kasir usaha Anda.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!isSupabaseConfigured && (
              <Alert>
                <AlertTitle>Login belum aktif</AlertTitle>
                <AlertDescription>
                  Database belum tersambung. Gunakan mode pratinjau di bawah untuk mencoba aplikasi.
                </AlertDescription>
              </Alert>
            )}
            <form onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    disabled={!isSupabaseConfigured}
                    className="h-11"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Kata sandi</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    disabled={!isSupabaseConfigured}
                    className="h-11"
                  />
                </Field>
                <Button type="submit" size="lg" className="h-11" disabled={!isSupabaseConfigured}>
                  Masuk
                </Button>
              </FieldGroup>
            </form>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" />
              Mode pratinjau
              <Separator className="flex-1" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-auto flex-col gap-1 py-4"
                onClick={() => enterPreview('cashier')}
              >
                <ReceiptTextIcon className="size-5" />
                <span className="font-medium">Masuk sebagai Kasir</span>
                <span className="text-xs font-normal text-muted-foreground">Saimara</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-col gap-1 py-4"
                onClick={() => enterPreview('owner')}
              >
                <BarChart3Icon className="size-5" />
                <span className="font-medium">Masuk sebagai Owner</span>
                <span className="text-xs font-normal text-muted-foreground">Semua usaha</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
