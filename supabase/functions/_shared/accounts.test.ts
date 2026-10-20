import { describe, expect, it } from 'vitest'
import {
  cashierEmail,
  parseCashierRequest,
  parseOwnerBootstrap,
  passwordProblem,
  safeEqual,
  usernameFromEmail,
  usernameProblem,
} from './accounts'

const businessId = '5a1a0000-0000-4000-8000-0000000000b1'

describe('cashier usernames', () => {
  it('maps a username onto the reserved cashier domain and back', () => {
    expect(cashierEmail('  Kasir.Saimara ')).toBe('kasir.saimara@kasir.kasiko.invalid')
    expect(usernameFromEmail('kasir.saimara@kasir.kasiko.invalid')).toBe('kasir.saimara')
    expect(usernameFromEmail('owner@saimara.id')).toBeNull()
  })

  it('accepts simple lowercase names only', () => {
    expect(usernameProblem('kasir.saimara')).toBeNull()
    expect(usernameProblem('ab')).not.toBeNull()
    expect(usernameProblem('kasir saimara')).not.toBeNull()
    expect(usernameProblem('.kasir')).not.toBeNull()
  })
})

describe('passwords (decision #22)', () => {
  it('needs 8+ characters with letters and digits', () => {
    expect(passwordProblem('saimara123')).toBeNull()
    expect(passwordProblem('pendek1')).toMatch(/minimal 8/)
    expect(passwordProblem('hanyahuruf')).toMatch(/huruf dan angka/)
    expect(passwordProblem('12345678')).toMatch(/huruf dan angka/)
  })
})

describe('parseCashierRequest', () => {
  it('validates each action', () => {
    expect(parseCashierRequest({ action: 'get', businessId })).toEqual({
      ok: true,
      value: { action: 'get', businessId },
    })
    expect(
      parseCashierRequest({
        action: 'create',
        businessId,
        username: 'Kasir.Saimara',
        password: 'saimara123',
      }),
    ).toEqual({
      ok: true,
      value: { action: 'create', businessId, username: 'kasir.saimara', password: 'saimara123' },
    })
    expect(parseCashierRequest({ action: 'set_active', businessId, active: false }).ok).toBe(true)
  })

  it('rejects bad input before touching any account', () => {
    expect(parseCashierRequest(null).ok).toBe(false)
    expect(parseCashierRequest({ action: 'get', businessId: 'saimara' }).ok).toBe(false)
    expect(parseCashierRequest({ action: 'drop', businessId }).ok).toBe(false)
    expect(parseCashierRequest({ action: 'reset_password', businessId, password: 'x' }).ok).toBe(
      false,
    )
    expect(parseCashierRequest({ action: 'set_active', businessId, active: 'no' }).ok).toBe(false)
  })
})

describe('parseOwnerBootstrap', () => {
  it('accepts an owner with an optional first business', () => {
    const parsed = parseOwnerBootstrap({
      email: ' Owner@Saimara.ID ',
      password: 'rahasia123',
      business: { name: 'Saimara', receipt_prefix: 'SMR' },
    })
    expect(parsed.ok && parsed.value.email).toBe('owner@saimara.id')
  })

  it('never lets an owner use the cashier domain', () => {
    const parsed = parseOwnerBootstrap({
      email: 'x@kasir.kasiko.invalid',
      password: 'rahasia123',
    })
    expect(parsed.ok).toBe(false)
  })
})

describe('safeEqual', () => {
  it('compares secrets', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})
