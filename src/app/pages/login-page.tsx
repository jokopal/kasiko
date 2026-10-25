import { BarChart3Icon, ReceiptTextIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { homePathFor, signInCashier, signInOwner, useAuthState } from '@/features/auth/session'
import { isSupabaseConfigured } from '@/lib/supabase'
import { LoadingScreen } from './loading-screen'

type Mode = 'cashier' | 'owner'

export function LoginPage() {
  const auth = useAuthState()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('cashier')
  const [identity, setIdentity] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (auth.status === 'loading') return <LoadingScreen />
  if (auth.status === 'signedIn') return <Navigate to={homePathFor(auth.session.role)} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const result =
      mode === 'owner'
        ? await signInOwner(identity, password)
        : await signInCashier(identity, password)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    void navigate('/', { replace: true })
  }

  const notice = auth.message

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
            <CardDescription>
              Kasir masuk dengan nama pengguna dari owner; owner masuk dengan email.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!isSupabaseConfigured && (
              <Alert variant="destructive">
                <AlertTitle>Belum tersambung ke database</AlertTitle>
                <AlertDescription>
                  Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY di pengaturan hosting.
                </AlertDescription>
              </Alert>
            )}
            {notice && (
              <Alert>
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}

            <Tabs
              value={mode}
              onValueChange={(value) => {
                setMode(value as Mode)
                setIdentity('')
                setError(null)
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="cashier" className="gap-1.5">
                  <ReceiptTextIcon className="size-4" aria-hidden />
                  Kasir
                </TabsTrigger>
                <TabsTrigger value="owner" className="gap-1.5">
                  <BarChart3Icon className="size-4" aria-hidden />
                  Owner
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <form onSubmit={(event) => void submit(event)}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="identity">
                    {mode === 'owner' ? 'Email' : 'Nama pengguna'}
                  </FieldLabel>
                  <Input
                    id="identity"
                    type={mode === 'owner' ? 'email' : 'text'}
                    value={identity}
                    onChange={(e) => setIdentity(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    disabled={!isSupabaseConfigured}
                    className="h-11"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Kata sandi</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={!isSupabaseConfigured}
                    className="h-11"
                  />
                </Field>
                {error && <FieldError>{error}</FieldError>}
                <Button
                  type="submit"
                  size="lg"
                  className="h-11"
                  disabled={!isSupabaseConfigured || busy}
                >
                  {busy ? 'Memeriksa…' : 'Masuk'}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
