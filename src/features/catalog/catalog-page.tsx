import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { RupiahInput } from '@/components/rupiah-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OwnerPage } from '@/features/owner/page'
import {
  moveCatalogItem,
  moveCategory,
  saveCatalogItem,
  saveCatalogCategory,
  setCatalogItemActive,
  setCategoryActive,
} from '@/features/preview/actions'
import { useBusinessData } from '@/features/preview/selectors'
import { formatRupiah } from '@/lib/money'
import type { CatalogCategory, CatalogItem } from '@/lib/types'
import { cn } from '@/lib/utils'

type ItemDraft = { id?: string; name: string; price: number | null; categoryId: string }

export function CatalogPage() {
  const { business, catalogCategories, catalogItems } = useBusinessData()
  const [itemDraft, setItemDraft] = useState<ItemDraft | null>(null)

  return (
    <OwnerPage
      title="Katalog"
      description="Layanan yang tampil di layar kasir. Item yang pernah dipakai dinonaktifkan, bukan dihapus."
    >
      <Tabs defaultValue="items">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="items">Layanan</TabsTrigger>
          <TabsTrigger value="categories">Kategori layanan</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() =>
                setItemDraft({ name: '', price: null, categoryId: catalogCategories[0]?.id ?? '' })
              }
            >
              <PlusIcon />
              Tambah layanan
            </Button>
          </div>
          {catalogCategories.map((category) => {
            const items = catalogItems.filter((item) => item.categoryId === category.id)
            return (
              <Card
                key={category.id}
                className={cn('gap-0 py-0', !category.isActive && 'opacity-70')}
              >
                <CardHeader className="flex flex-row items-center gap-2 border-b py-3">
                  <CardTitle className="text-base">{category.name}</CardTitle>
                  {!category.isActive && <Badge variant="secondary">Nonaktif</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {items.length} layanan
                  </span>
                </CardHeader>
                <CardContent className="px-0">
                  <ul className="divide-y">
                    {items.map((item, index) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        isFirst={index === 0}
                        isLast={index === items.length - 1}
                        onEdit={() =>
                          setItemDraft({
                            id: item.id,
                            name: item.name,
                            price: item.price,
                            categoryId: item.categoryId,
                          })
                        }
                      />
                    ))}
                    {items.length === 0 && (
                      <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                        Belum ada layanan
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <CategoryEditor businessId={business.id} rows={catalogCategories} />
        </TabsContent>
      </Tabs>

      <Dialog open={itemDraft !== null} onOpenChange={(open) => !open && setItemDraft(null)}>
        <DialogContent className="sm:max-w-md">
          {itemDraft && (
            <ItemForm
              draft={itemDraft}
              businessId={business.id}
              categories={catalogCategories}
              onDone={() => setItemDraft(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </OwnerPage>
  )
}

function OrderButtons({
  id,
  isFirst,
  isLast,
  onMove,
}: {
  id: string
  isFirst: boolean
  isLast: boolean
  onMove: (id: string, direction: -1 | 1) => void
}) {
  return (
    <div className="flex">
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        disabled={isFirst}
        onClick={() => onMove(id, -1)}
        aria-label="Naikkan urutan"
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        disabled={isLast}
        onClick={() => onMove(id, 1)}
        aria-label="Turunkan urutan"
      >
        <ArrowDownIcon />
      </Button>
    </div>
  )
}

function ItemRow({
  item,
  isFirst,
  isLast,
  onEdit,
}: {
  item: CatalogItem
  isFirst: boolean
  isLast: boolean
  onEdit: () => void
}) {
  return (
    <li className="flex items-center gap-2 px-3 py-2 sm:px-4">
      <div className={cn('min-w-0 flex-1', !item.isActive && 'text-muted-foreground')}>
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="text-sm tabular-nums">{formatRupiah(item.price)}</p>
      </div>
      <OrderButtons id={item.id} isFirst={isFirst} isLast={isLast} onMove={moveCatalogItem} />
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        onClick={onEdit}
        aria-label={`Ubah ${item.name}`}
      >
        <PencilIcon />
      </Button>
      <Switch
        checked={item.isActive}
        onCheckedChange={(checked) => setCatalogItemActive(item.id, checked)}
        aria-label={`${item.name} aktif`}
      />
    </li>
  )
}

function ItemForm({
  draft,
  businessId,
  categories,
  onDone,
}: {
  draft: ItemDraft
  businessId: string
  categories: CatalogCategory[]
  onDone: () => void
}) {
  const [name, setName] = useState(draft.name)
  const [price, setPrice] = useState(draft.price)
  const [categoryId, setCategoryId] = useState(draft.categoryId)
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (price === null) {
      setError('Harga wajib diisi')
      return
    }
    const result = saveCatalogItem({ id: draft.id, businessId, categoryId, name, price })
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(draft.id ? 'Layanan diperbarui' : 'Layanan ditambahkan')
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{draft.id ? 'Ubah layanan' : 'Tambah layanan'}</DialogTitle>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="item-name">Nama layanan</FieldLabel>
          <Input
            id="item-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10"
            autoFocus
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="item-price">Harga</FieldLabel>
          <RupiahInput id="item-price" value={price} onValueChange={setPrice} className="h-10" />
        </Field>
        <Field>
          <FieldLabel htmlFor="item-category">Kategori</FieldLabel>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="item-category" className="h-10 w-full">
              <SelectValue placeholder="Pilih kategori" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {draft.id && (
          <p className="text-xs text-muted-foreground">
            Perubahan harga hanya berlaku untuk transaksi baru — transaksi lama menyimpan harga saat
            itu.
          </p>
        )}
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button type="submit">Simpan</Button>
      </DialogFooter>
    </form>
  )
}

function CategoryEditor({
  businessId,
  rows,
}: {
  businessId: string
  rows: { id: string; name: string; isActive: boolean }[]
}) {
  const [editing, setEditing] = useState<{ id?: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    const result = saveCatalogCategory({ id: editing.id, businessId, name: editing.name })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setEditing(null)
    setError(null)
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center border-b py-3">
        <CardTitle className="text-base">Kategori layanan</CardTitle>
        <Button size="sm" className="ml-auto" onClick={() => setEditing({ name: '' })}>
          <PlusIcon />
          Tambah
        </Button>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y">
          {rows.map((row, index) => (
            <li key={row.id} className="flex items-center gap-2 px-3 py-2 sm:px-4">
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm font-medium',
                  !row.isActive && 'text-muted-foreground',
                )}
              >
                {row.name}
              </span>
              <OrderButtons
                id={row.id}
                isFirst={index === 0}
                isLast={index === rows.length - 1}
                onMove={(id, direction) => moveCategory('catalog', id, direction)}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                onClick={() => setEditing({ id: row.id, name: row.name })}
                aria-label={`Ubah ${row.name}`}
              >
                <PencilIcon />
              </Button>
              <Switch
                checked={row.isActive}
                onCheckedChange={(checked) => setCategoryActive('catalog', row.id, checked)}
                aria-label={`${row.name} aktif`}
              />
            </li>
          ))}
        </ul>
      </CardContent>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={submit} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>{editing?.id ? 'Ubah kategori' : 'Tambah kategori'}</DialogTitle>
            </DialogHeader>
            <Field data-invalid={error !== null}>
              <FieldLabel htmlFor="category-name">Nama kategori</FieldLabel>
              <Input
                id="category-name"
                value={editing?.name ?? ''}
                onChange={(e) =>
                  setEditing((current) => current && { ...current, name: e.target.value })
                }
                className="h-10"
                autoFocus
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Batal
              </Button>
              <Button type="submit">Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
