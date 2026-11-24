import { useQuery } from '@tanstack/react-query'
import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  MonitorSmartphoneIcon,
  UserIcon,
  UserPlusIcon,
} from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PageLoading } from '@/components/page-loading'
import { PasswordInput } from '@/components/password-input'
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
  revealCashierPassword,
  setCashierActive,
} from '@/features/data/owner-actions'
import { useOwnerData } from '@/features/data/owner-data'
import { keys, queryClient } from '@/features/data/query-client'
import { OwnerPage } from '@/features/owner/page'
import type { CashierAccount } from '@/lib/types'
import { cn } from '@/lib/utils'
import { passwordProblem, usernameProblem } from '../../../supabase/functions/_shared/accounts'

/**
 * Decision #4: one shared cashier account per business, managed by the owner. Decision #46:
 * the owner sees the username, the sign-in email and (on request, logged) the password.
 */
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
        <AccountCard
          businessId={business.id}
          account={account}
          onReset={() => setResetOpen(true)}
          onToggleActive={() => void toggleActive()}
        />
      ) : (
        <CreateCashierCard businessId={business.id} onCreated={() => void refresh()} />
      )}

      <Alert className="max-w-2xl">
        <AlertTitle>Keamanan akun kasir</AlertTitle>
        <AlertDescription>
          Kata sandi kasir disimpan terenkripsi dan hanya bisa dibuka owner; setiap kali dibuka
          tercatat di Log Audit. Reset kata sandi atau nonaktifkan akun akan mengeluarkan semua
          perangkat kasir. Data yang belum tersinkron di perangkat tetap dikirim setelah kasir masuk
          kembali.
        </AlertDescription>
      </Alert>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-sm">
          {resetOpen && (
            <ResetPasswordForm
              businessId={business.id}
              onDone={() => {
                setResetOpen(false)
                void refresh()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </OwnerPage>
  )
}

function AccountCard({
  businessId,
  account,
  onReset,
  onToggleActive,
}: {
  businessId: string
  account: CashierAccount
  onReset: () => void
  onToggleActive: () => void
}) {
  const [password, setPassword] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)

  async function toggleReveal() {
    if (password !== null) {
      setPassword(null)
      return
    }
    setRevealing(true)
    const result = await revealCashierPassword(businessId)
    setRevealing(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    if (result.value === null) {
      toast.error('Kata sandi belum tersimpan. Reset sekali agar bisa dilihat di sini.')
      return
    }
    setPassword(result.value)
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex flex-row items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted">
          <UserIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate">{account.username ?? 'Akun kasir'}</CardTitle>
          <CardDescription>Dipakai bersama di perangkat kasir</CardDescription>
        </div>
        <Badge variant={account.isActive ? 'default' : 'secondary'}>
          {account.isActive ? 'Aktif' : 'Nonaktif'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="divide-y rounded-lg border">
          <CredentialRow
            label="Nama pengguna"
            value={account.username ?? '-'}
            hint="Diketik di halaman masuk kasir"
          />
          <CredentialRow
            label="Email login"
            value={account.email ?? '-'}
            hint="Alamat internal, tidak menerima email"
          />
          <CredentialRow
            label="Kata sandi"
            value={password ?? '••••••••'}
            masked={password === null}
            copyable={password !== null}
            hint={
              account.hasStoredPassword
                ? 'Setiap kali dibuka tercatat di Log Audit'
                : 'Belum tersimpan. Reset kata sandi sekali agar bisa dilihat di sini.'
            }
            action={
              account.hasStoredPassword && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revealing}
                  onClick={() => void toggleReveal()}
                  aria-pressed={password !== null}
                >
                  {password === null ? <EyeIcon /> : <EyeOffIcon />}
                  {revealing ? 'Membuka…' : password === null ? 'Lihat' : 'Sembunyikan'}
                </Button>
              )
            }
          />
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onReset}>
            <KeyRoundIcon />
            Reset kata sandi
          </Button>
          <Button asChild variant="outline">
            <Link to="/owner/pratinjau-kasir">
              <MonitorSmartphoneIcon />
              Pratinjau kasir
            </Link>
          </Button>
          <Button variant={account.isActive ? 'destructive' : 'default'} onClick={onToggleActive}>
            {account.isActive ? 'Nonaktifkan' : 'Aktifkan'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CredentialRow({
  label,
  value,
  hint,
  masked = false,
  copyable = true,
  action,
}: {
  label: string
  value: string
  hint: string
  masked?: boolean
  copyable?: boolean
  action?: ReactNode
}) {
  const [copied, setCopied] = useState(false)
  function copy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd
          className={cn(
            'truncate font-mono text-sm',
            masked && 'tracking-widest text-muted-foreground',
          )}
          aria-live="polite"
        >
          {value}
        </dd>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        {action}
        {copyable && value !== '-' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={copy}
            aria-label={`Salin ${label.toLowerCase()}`}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? 'Tersalin' : 'Salin'}
          </Button>
        )}
      </div>
    </div>
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
          Kasir masuk dengan nama pengguna ini di perangkat kasir. Kata sandinya bisa dilihat lagi
          di halaman ini.
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
              <PasswordInput
                id="cashier-password"
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
          Semua perangkat kasir akan keluar dan perlu masuk lagi. Kata sandi baru tersimpan
          terenkripsi dan bisa dilihat lagi di halaman ini.
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={error !== null}>
        <FieldLabel htmlFor="new-cashier-password">Kata sandi baru</FieldLabel>
        <PasswordInput
          id="new-cashier-password"
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
