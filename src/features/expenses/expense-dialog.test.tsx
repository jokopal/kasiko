import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/features/offline/db'
import type { ExpenseCategory } from '@/lib/types'
import { ExpenseDialog } from './expense-dialog'

const category = (id: string, name: string, extra: Partial<ExpenseCategory> = {}) =>
  ({
    id,
    businessId: 'biz',
    name,
    sortOrder: 0,
    isActive: true,
    kind: 'operating',
    allowDrawer: true,
    requiresNote: false,
    ...extra,
  }) satisfies ExpenseCategory

const categories = [
  category('c1', 'Makan & Konsumsi'),
  category('c9', 'Lainnya', { requiresNote: true }),
  category('c3', 'Cicilan', { allowDrawer: false, kind: 'non_operating' }),
]

function renderDrawerDialog() {
  render(
    <ExpenseDialog
      open
      onOpenChange={() => undefined}
      businessId="biz"
      categories={categories}
      source="drawer"
      deviceId="dev-1"
    />,
  )
}

describe('ExpenseDialog — "Lainnya" (decision #36)', () => {
  beforeEach(async () => {
    await db.outbox.clear()
  })

  it('shows "Lainnya" apart from the grid and makes the note required', async () => {
    const user = userEvent.setup()
    renderDrawerDialog()
    expect(screen.queryByRole('radio', { name: /Cicilan/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Catatan (opsional)')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /Lainnya/ }))
    const note = screen.getByLabelText('Keterangan (wajib)')
    expect(note).toHaveFocus()

    await user.type(screen.getByLabelText('Nominal'), '25000')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(screen.getByText(/min. 3 huruf/)).toBeInTheDocument()
    expect(await db.outbox.count()).toBe(0)

    await user.type(note, 'Beli lampu teras')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await db.outbox.count()).toBe(1)
  })
})
