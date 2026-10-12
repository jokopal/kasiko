import { beforeEach, describe, expect, it } from 'vitest'
import { addReserveMovement, saveBusiness, voidTransactionAsOwner } from './actions'
import { getPreviewState, resetPreviewState } from './store'

const BIZ = 'saimara'

beforeEach(() => {
  localStorage.clear()
  resetPreviewState()
})

describe('reserve & settings validation', () => {
  it('requires a reason and enough balance to withdraw', () => {
    const base = { businessId: BIZ, type: 'withdraw' as const, source: null }
    expect(addReserveMovement({ ...base, amount: 1_000, reason: '' }).ok).toBe(false)
    expect(addReserveMovement({ ...base, amount: 10 ** 12, reason: 'Terlalu besar' }).ok).toBe(
      false,
    )
    expect(addReserveMovement({ ...base, amount: 1_000, reason: 'Servis' }).ok).toBe(true)
  })

  it('rejects invalid brand settings', () => {
    const business = getPreviewState().businesses[0]!
    expect(saveBusiness({ ...business, primaryColor: 'teal' }).ok).toBe(false)
    expect(saveBusiness({ ...business, receiptPrefix: 'x' }).ok).toBe(false)
    expect(saveBusiness({ ...business, name: 'Saimara Baru' }).ok).toBe(true)
  })
})

describe('owner voids', () => {
  it('voids any day without deleting', () => {
    const state = getPreviewState()
    const old = state.transactions.find(
      (t) => t.status === 'paid' && Date.now() - Date.parse(t.occurredAt) > 3 * 86_400_000,
    )!
    expect(voidTransactionAsOwner(old.id, 'Salah input').ok).toBe(true)
    expect(getPreviewState().transactions.find((t) => t.id === old.id)?.status).toBe('void')
    expect(getPreviewState().transactions).toHaveLength(state.transactions.length)
  })
})
