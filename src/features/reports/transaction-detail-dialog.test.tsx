import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Business, Transaction } from '@/lib/types'
import { TransactionDetailDialog } from './transaction-detail-dialog'

const business = {
  name: 'Saimara',
  address: 'Jl. Merdeka 10',
  phone: '0812',
  receiptFooter: 'Terima kasih',
  timezone: 'Asia/Jakarta',
} as Business

const transaction: Transaction = {
  id: 't1',
  businessId: 'biz',
  receiptNo: 'SMR-261012-AB0007',
  occurredAt: '2026-10-12T01:30:00Z',
  plateNumber: 'B 1234 XYZ',
  paymentMethod: 'cash',
  subtotal: 100_000,
  discountId: 'd1',
  discountName: 'Promo',
  discountType: 'percent',
  discountValue: 10,
  discountAmount: 10_000,
  total: 90_000,
  cashReceived: 100_000,
  changeAmount: 10_000,
  status: 'paid',
  voidReason: null,
  voidedAt: null,
  deviceId: 'd',
  receivedAt: '2026-10-12T01:31:00Z',
  orderId: 'o1',
  items: [
    {
      id: 'i1',
      catalogItemId: 'c1',
      nameSnapshot: 'Cuci Mobil Sedang',
      priceSnapshot: 50_000,
      qty: 2,
      lineTotal: 100_000,
    },
  ],
}

const show = (t: Transaction) =>
  render(<TransactionDetailDialog transaction={t} business={business} onClose={() => undefined} />)

describe('TransactionDetailDialog', () => {
  it('shows everything on the printed receipt', () => {
    show(transaction)
    const dialog = screen.getByRole('dialog', { name: 'Detail transaksi' })
    const paper = dialog.querySelector('.receipt-paper')
    expect(paper).toHaveTextContent('Saimara')
    expect(paper).toHaveTextContent('Jl. Merdeka 10')
    expect(paper).toHaveTextContent('SMR-261012-AB0007')
    expect(paper).toHaveTextContent('B 1234 XYZ')
    expect(paper).toHaveTextContent('Cuci Mobil Sedang')
    expect(paper).toHaveTextContent('2 x 50.000')
    expect(paper).toHaveTextContent('Diskon Promo')
    expect(paper).toHaveTextContent('TOTAL')
    expect(paper).toHaveTextContent('Diterima')
    expect(paper).toHaveTextContent('Kembali')
    expect(paper).toHaveTextContent('Terima kasih')
  })

  it('adds the record the receipt does not carry, and can print again', () => {
    show(transaction)
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('Lunas')).toBeVisible()
    expect(dialog.getByText('AB')).toBeVisible()
    expect(dialog.getByText('Bayar di akhir')).toBeVisible()
    expect(dialog.getByRole('button', { name: 'Print' })).toBeVisible()
    expect(dialog.getByRole('button', { name: 'WhatsApp' })).toBeVisible()
  })

  it('shows why a transaction was voided, on the record and on the receipt', () => {
    show({
      ...transaction,
      status: 'void',
      voidedAt: '2026-10-12T02:00:00Z',
      voidReason: 'Salah pilih layanan',
    })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByText('Dibatalkan')).toHaveLength(2)
    expect(dialog.querySelector('dl')).toHaveTextContent('Salah pilih layanan')
    expect(dialog.querySelector('.receipt-paper')).toHaveTextContent('*** DIBATALKAN ***')
  })

  it('renders nothing without a transaction', () => {
    render(
      <TransactionDetailDialog transaction={null} business={business} onClose={() => undefined} />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
