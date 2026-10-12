import { KeyRoundIcon, UserIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OwnerPage } from '@/features/owner/page'
import { setCashierActive } from '@/features/preview/actions'
import { useBusinessData } from '@/features/preview/selectors'

export function CashierAccountPage() {
  const { business, cashierAccount } = useBusinessData()

  return (
    <OwnerPage
      title="Akun Kasir"
      description={`Satu akun kasir untuk ${business.name}, dipakai bersama di perangkat kasir.`}
    >
      <Card className="max-w-2xl">
        <CardHeader className="flex flex-row items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted">
            <UserIcon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{cashierAccount?.username ?? 'Belum dibuat'}</CardTitle>
            <CardDescription>Akun kasir {business.name}</CardDescription>
          </div>
          {cashierAccount && (
            <Badge variant={cashierAccount.isActive ? 'default' : 'secondary'}>
              {cashierAccount.isActive ? 'Aktif' : 'Nonaktif'}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              toast.info('Reset kata sandi memakai Edge Function manage-cashier (setelah database)')
            }
          >
            <KeyRoundIcon />
            Reset kata sandi
          </Button>
          {cashierAccount && (
            <Button
              variant={cashierAccount.isActive ? 'destructive' : 'default'}
              onClick={() => {
                setCashierActive(business.id, !cashierAccount.isActive)
                toast.success(
                  cashierAccount.isActive ? 'Akun kasir dinonaktifkan' : 'Akun kasir diaktifkan',
                )
              }}
            >
              {cashierAccount.isActive ? 'Nonaktifkan' : 'Aktifkan'}
            </Button>
          )}
        </CardContent>
      </Card>

      <Alert className="max-w-2xl">
        <AlertTitle>Keamanan akun kasir</AlertTitle>
        <AlertDescription>
          Reset kata sandi atau nonaktifkan akun akan mengeluarkan semua perangkat kasir. Data
          transaksi yang belum tersinkron di perangkat tetap disimpan dan dikirim setelah kasir
          masuk kembali.
        </AlertDescription>
      </Alert>
    </OwnerPage>
  )
}
