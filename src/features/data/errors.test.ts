import { describe, expect, it } from 'vitest'
import { classifyServerError, errorMessage } from './errors'

const error = (status: number, code: string | null, message = 'x') => ({ status, code, message })

describe('classifyServerError (what stays in the outbox)', () => {
  it('retries when the server could not be reached or is struggling', () => {
    expect(classifyServerError(error(0, null))).toBe('retry')
    expect(classifyServerError(error(503, null))).toBe('retry')
    expect(classifyServerError(error(429, null))).toBe('retry')
  })

  it('retries an expired session (refreshed before the next pass)', () => {
    expect(classifyServerError(error(401, 'PGRST301'))).toBe('retry')
    expect(classifyServerError(error(400, 'PGRST303'))).toBe('retry')
  })

  it('keeps data waiting while the cashier account is switched off', () => {
    expect(
      classifyServerError(
        error(400, '42501', 'Hanya kasir usaha ini yang bisa mencatat transaksi'),
      ),
    ).toBe('retry')
  })

  it('marks validation refusals as failed, never retried forever', () => {
    expect(classifyServerError(error(400, '23514', 'Total transaksi tidak cocok'))).toBe(
      'permanent',
    )
    expect(classifyServerError(error(409, '23505', 'Nomor nota sudah dipakai'))).toBe('permanent')
    expect(
      classifyServerError(error(403, '42501', 'Kasir hanya bisa membatalkan data hari ini')),
    ).toBe('permanent')
  })

  it('treats unknown answers as temporary', () => {
    expect(classifyServerError(error(400, null, 'aneh'))).toBe('retry')
  })
})

describe('errorMessage', () => {
  it('reads messages from errors and error-like objects', () => {
    expect(errorMessage(new Error('Gagal'))).toBe('Gagal')
    expect(errorMessage({ message: 'Ditolak' })).toBe('Ditolak')
    expect(errorMessage(42)).toBe('Terjadi kesalahan. Coba lagi.')
  })
})
