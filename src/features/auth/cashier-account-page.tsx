import { useQuery } from '@tanstack/react-query'
import { KeyRoundIcon, UserIcon, UserPlusIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { PageLoading } from '@/components/page-loading'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  createCashier,
  fetchCashierAccount,
  resetCashierPassword,
  setCashierActive,
} from '@/features/data/owner-actions'
import { useOwnerData } from '@/features/data/owner-data'
import { keys, queryClient } from '@/features/data/query-client'
import { OwnerPage } from '@/features/owner/page'
import { passwordProblem, usernameProblem } from '../../../supabase/functions/_shared/accounts'

/** Decision #4: one shared cashier account per business, managed by the owner. */
export function CashierAccountPage() {
  const { business } = useOwnerData()
  const [resetOpen, setResetOpen] = useState(false)
  const query = useQuery({
    queryKey: keys.list(business.id, 'cashier'),
    queryFn: () => fetchCashierAccount(business.id),
  })
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: keys.list(business.id, 'cashier') })
  const account = query.data

  async function toggleActive() {
    if (!account) return
    const result = await setCashierActive(business.id, !account.isActive)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(account.isActive ? 'Akun kasir dinonaktifkan' : 'Akun kasir diaktifkan')
    void refresh()
  }

  return (
    <OwnerPage
      title="Akun Kasir"
      description={`Satu akun kasir untuk ${business.name}, dipakai bersama di perangkat kasir.`}
    >
      {query.isPending ? (
        <PageLoading />
      ) : query.error ? (
        <p className="text-sm text-destructive">Akun kasir gagal dimuat: {query.error.message}</p>
      ) : account ? (
        <Card className="max-w-2xl">
          <CardHeader className="flex flex-row items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted">
              <UserIcon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate">{account.username ?? 'Akun kasir'}</CardTitle>
              <CardDescription>Nama pengguna untuk masuk di perangkat kasir</CardDescription>
            </div>
            <Badge variant={account.isActive ? 'default' : 'secondary'}>
              {account.isActive ? 'Aktif' : 'Nonaktif'}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setResetOpen(true)}>
              <KeyRoundIcon />
              Reset kata sandi
            </Button>
            <Button
              variant={account.isActive ? 'destructive' : 'default'}
              onClick={() => void toggleActive()}
            >
              {account.isActive ? 'Nonaktifkan' : 'Aktifkan'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <CreateCashierCard businessId={business.id} onCreated={() => void refresh()} />
      )}

      <Alert className="max-w-2xl">
        <AlertTitle>Keamanan akun kasir</AlertTitle>
        <AlertDescription>
          Reset kata sandi atau nonaktifkan akun akan mengeluarkan semua perangkat kasir. Data
          transaksi yang belum tersinkron di perangkat tetap disimpan dan dikirim setelah kasir
          masuk kembali.
        </AlertDescription>
      </Alert>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-sm">
          {resetOpen && (
            <ResetPasswordForm businessId={business.id} onDone={() => setResetOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </OwnerPage>
  )
}

function CreateCashierCard({
  businessId,
  onCreated,
}: {
  businessId: string
  onCreated: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const problem = usernameProblem(username.trim().toLowerCase()) ?? passwordProblem(password)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    const result = await createCashier(businessId, username.trim().toLowerCase(), password)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success('Akun kasir dibuat')
    onCreated()
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlusIcon className="size-5" aria-hidden />
          Buat akun kasir
        </CardTitle>
        <CardDescription>
          Kasir masuk dengan nama pengguna ini di perangkat kasir. Simpan kata sandinya di tempat
          aman.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cashier-username">Nama pengguna</FieldLabel>
              <Input
                id="cashier-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="kasir.saimara"
                autoCapitalize="none"
                spellCheck={false}
                autoComplete="off"
              />
              <FieldDescription>
                3–30 huruf kecil/angka, boleh titik, minus, garis bawah.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="cashier-password">Kata sandi</FieldLabel>
              <Input
                id="cashier-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <FieldDescription>Minimal 8 karakter, berisi huruf dan angka.</FieldDescription>
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Button type="submit" disabled={busy} className="w-fit">
              {busy ? 'Membuat…' : 'Buat akun kasir'}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function ResetPasswordForm({ businessId, onDone }: { businessId: string; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const problem = passwordProblem(password)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    const result = await resetCashierPassword(businessId, password)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success('Kata sandi kasir diganti; semua perangkat kasir perlu masuk lagi')
    onDone()
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Reset kata sandi kasir</DialogTitle>
        <DialogDescription>
          Semua perangkat kasir akan keluar dan perlu masuk lagi.
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={error !== null}>
        <FieldLabel htmlFor="new-cashier-password">Kata sandi baru</FieldLabel>
        <Input
          id="new-cashier-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          autoFocus
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit" disabled={busy}>
          Simpan
        </Button>
      </DialogFooter>
    </form>
  )
}
