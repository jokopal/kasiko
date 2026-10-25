// Sorting server errors for the sync engine (AGENTS.md section 9): retry what can succeed
// later, mark the rest as failed — visible to the cashier, never dropped.

export interface ServerError {
  /** HTTP status of the response; 0 when the request never reached the server. */
  status: number
  /** PostgREST/Postgres error code (SQLSTATE such as 23514, or PGRSTxxx). */
  code: string | null | undefined
  message: string
}

export type ErrorClass = 'retry' | 'permanent'

const SQLSTATE = /^[0-9A-Z]{5}$/

export function classifyServerError(error: ServerError): ErrorClass {
  const { status, code, message } = error
  // Offline, timeouts, rate limits, server trouble, expired session: try again later.
  if (status === 0 || status === 408 || status === 429 || status >= 500 || status === 401) {
    return 'retry'
  }
  if (code?.startsWith('PGRST3')) return 'retry' // JWT problems: refreshed on the next pass
  // A deactivated cashier account: the data waits on the device until the owner
  // re-enables it, exactly like being offline.
  if (/Hanya kasir usaha ini/.test(message)) return 'retry'
  if (code && SQLSTATE.test(code)) return 'permanent'
  return 'retry'
}

/** Indonesian message for the UI from any thrown value. */
export function errorMessage(error: unknown, fallback = 'Terjadi kesalahan. Coba lagi.') {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    const { message } = error
    if (typeof message === 'string' && message) return message
  }
  return fallback
}
