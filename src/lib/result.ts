export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })
