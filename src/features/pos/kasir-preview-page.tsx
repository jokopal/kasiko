import { EyeIcon, MonitorIcon, TabletIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BusinessLogo } from '@/components/business-logo'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useOwnerData } from '@/features/data/owner-data'
import { OwnerPage } from '@/features/owner/page'
import { cn } from '@/lib/utils'
import { CartProvider } from './cart-provider'
import { PosPage } from './pos-page'
import { KasirDataContext, type KasirData } from './use-kasir-data'

// The cashier layout follows the viewport width, so a phone-sized frame on a laptop would
// show the tablet layout squeezed; on a phone the preview already shows the phone layout.
type Frame = 'tablet' | 'full'

const FRAME_CLASS: Record<Frame, string> = {
  tablet: 'md:max-w-[1024px]',
  full: 'max-w-none',
}

/**
 * The real cashier screen with this business's live catalog, colors and discounts, for the
 * owner to check (AGENTS.md section 9). Nothing is ever written: the screens get
 * `preview: true`, which blocks saving sales, expenses and price changes, and no outbox,
 * device registration or sync runs here.
 */
export function KasirPreviewPage() {
  const { business, catalogCategories, catalogItems, expenseCategories, discounts } = useOwnerData()
  const [frame, setFrame] = useState<Frame>('tablet')

  const data = useMemo<KasirData>(
    () => ({
      business,
      catalogCategories: catalogCategories.filter((c) => c.isActive),
      catalogItems: catalogItems.filter((i) => i.isActive),
      expenseCategories: expenseCategories.filter((c) => c.isActive && c.allowDrawer),
      discounts: discounts.filter((d) => d.isActive),
      device: {
        businessId: business.id,
        deviceId: 'preview',
        deviceCode: 'PR',
        registeredAt: new Date(0).toISOString(),
      },
      transactions: [],
      expenses: [],
      openOrders: [],
      outbox: [],
      preview: true,
    }),
    [business, catalogCategories, catalogItems, expenseCategories, discounts],
  )

  return (
    <OwnerPage
      title="Pratinjau Kasir"
      description="Layar kasir persis seperti di perangkat kasir, memakai katalog dan warna usaha ini."
      actions={
        <ToggleGroup
          type="single"
          variant="outline"
          value={frame}
          onValueChange={(value) => value && setFrame(value as Frame)}
          aria-label="Ukuran layar"
        >
          <ToggleGroupItem value="tablet" aria-label="Tablet" className="gap-1.5 px-3">
            <TabletIcon />
            <span className="hidden sm:inline">Tablet</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="full" aria-label="Lebar penuh" className="gap-1.5 px-3">
            <MonitorIcon />
            <span className="hidden sm:inline">Penuh</span>
          </ToggleGroupItem>
        </ToggleGroup>
      }
    >
      <Alert>
        <EyeIcon />
        <AlertTitle>Mode pratinjau</AlertTitle>
        <AlertDescription>
          Coba pilih layanan, keranjang, dan pembayaran. Tombol Simpan, Pengeluaran, dan Harga tidak
          menyimpan apa pun.
        </AlertDescription>
      </Alert>

      {/* `transform` makes this frame the containing block of the cart's fixed bottom bar. */}
      <div
        className={cn(
          'mx-auto flex h-[78dvh] min-h-[520px] w-full transform-gpu flex-col overflow-hidden rounded-2xl border bg-muted/40 shadow-sm',
          FRAME_CLASS[frame],
        )}
      >
        <KasirDataContext value={data}>
          <CartProvider key={business.id}>
            <header className="bg-primary text-primary-foreground shadow-sm">
              <div className="flex h-14 items-center gap-2 px-3 md:gap-3 md:px-5">
                <BusinessLogo business={business} className="ring-2 ring-white/25" />
                <div className="min-w-0 flex-1">
                  <p className="truncate leading-tight font-semibold">{business.name}</p>
                  <p className="truncate text-xs opacity-80">Kasir · pratinjau</p>
                </div>
              </div>
            </header>
            <main className="min-h-0 flex-1">
              <PosPage />
            </main>
          </CartProvider>
        </KasirDataContext>
      </div>
    </OwnerPage>
  )
}
