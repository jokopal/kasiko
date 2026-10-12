import { ChevronUpIcon, ReceiptIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ExpenseDialog } from '@/features/expenses/expense-dialog'
import { formatRupiah } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useCart } from './use-cart'
import { useKasirData } from './use-kasir-data'
import { CartPanel } from './cart-panel'
import { PaymentDialog } from './payment-dialog'

const ALL = 'all'

export function PosPage() {
  const { business, catalogCategories, catalogItems, expenseCategories } = useKasirData()
  const { lines, total, quantity, dispatch } = useCart()
  const [categoryId, setCategoryId] = useState<string>(ALL)
  const [cartOpen, setCartOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)

  const activeItems = useMemo(() => catalogItems.filter((item) => item.isActive), [catalogItems])
  const categories = useMemo(
    () =>
      catalogCategories.filter(
        (c) => c.isActive && activeItems.some((item) => item.categoryId === c.id),
      ),
    [catalogCategories, activeItems],
  )
  const visibleCategoryIds = new Set(categories.map((c) => c.id))
  const shownItems = activeItems
    .filter((item) => visibleCategoryIds.has(item.categoryId))
    .filter((item) => categoryId === ALL || item.categoryId === categoryId)
    .sort((a, b) => {
      const ca = categories.findIndex((c) => c.id === a.categoryId)
      const cb = categories.findIndex((c) => c.id === b.categoryId)
      return ca - cb || a.sortOrder - b.sortOrder
    })
  const qtyById = new Map(lines.map((line) => [line.itemId, line.qty]))

  function openPayment() {
    setCartOpen(false)
    setPayOpen(true)
  }

  return (
    <div className="h-full md:grid md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
      <section className="h-full overflow-y-auto pb-28 md:pb-6" aria-label="Pilih layanan">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-2.5 backdrop-blur md:px-5">
          <div
            className="no-scrollbar -mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1"
            role="tablist"
            aria-label="Kategori"
          >
            {[{ id: ALL, name: 'Semua' }, ...categories].map((category) => (
              <button
                key={category.id}
                role="tab"
                aria-selected={categoryId === category.id}
                onClick={() => setCategoryId(category.id)}
                className={cn(
                  'h-9 shrink-0 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors',
                  categoryId === category.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-muted',
                )}
              >
                {category.name}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            aria-label="Catat pengeluaran"
            onClick={() => setExpenseOpen(true)}
          >
            <ReceiptIcon />
            <span className="hidden sm:inline">Pengeluaran</span>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-3 md:grid-cols-2 md:gap-3 md:p-5 lg:grid-cols-3 xl:grid-cols-4">
          {shownItems.map((item) => {
            const qty = qtyById.get(item.id)
            return (
              <button
                key={item.id}
                onClick={() => dispatch({ type: 'add', item })}
                aria-label={`${item.name}, ${formatRupiah(item.price)}${qty ? `, ${qty} di keranjang` : ''}`}
                className={cn(
                  'relative flex min-h-24 flex-col justify-between gap-2 rounded-xl border bg-card p-3 text-left shadow-xs transition active:scale-[0.97] md:min-h-28 md:p-4',
                  qty ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50',
                )}
              >
                <span
                  className={cn(
                    'line-clamp-2 text-sm leading-snug font-medium md:text-base',
                    qty !== undefined && 'pr-7',
                  )}
                >
                  {item.name}
                </span>
                <span className="text-base font-semibold text-primary tabular-nums">
                  {formatRupiah(item.price)}
                </span>
                {qty !== undefined && (
                  <Badge className="absolute top-2 right-2 h-6 min-w-6 justify-center rounded-full tabular-nums">
                    {qty}
                  </Badge>
                )}
              </button>
            )
          })}
          {shownItems.length === 0 && (
            <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
              Belum ada layanan aktif. Owner dapat menambahkannya di menu Katalog.
            </p>
          )}
        </div>
      </section>

      {/* Tablet & desktop: cart beside the grid. */}
      <aside className="hidden h-full border-l bg-background md:flex" aria-label="Keranjang">
        <CartPanel onPay={openPayment} className="w-full" />
      </aside>

      {/* Phone: cart summary bar at the bottom, full cart in a sheet. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] md:hidden">
        <div className="flex items-center gap-3">
          <button
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => setCartOpen(true)}
            aria-label="Buka keranjang"
          >
            <ChevronUpIcon className="size-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">
                {quantity === 0 ? 'Keranjang kosong' : `${quantity} item`}
              </span>
              <span className="block truncate text-xl font-bold tabular-nums">
                {formatRupiah(total)}
              </span>
            </span>
          </button>
          <Button
            size="lg"
            className="h-12 px-8 text-base font-semibold"
            disabled={lines.length === 0}
            onClick={openPayment}
          >
            Bayar
          </Button>
        </div>
      </div>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="flex max-h-[88dvh] flex-col gap-0 rounded-t-2xl p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Keranjang</SheetTitle>
            <SheetDescription>Daftar layanan yang akan dibayar</SheetDescription>
          </SheetHeader>
          <CartPanel onPay={openPayment} className="min-h-0 flex-1" />
        </SheetContent>
      </Sheet>

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} />
      <ExpenseDialog
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        businessId={business.id}
        categories={expenseCategories}
        source="drawer"
      />
    </div>
  )
}
