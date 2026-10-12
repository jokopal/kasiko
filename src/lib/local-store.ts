import { useSyncExternalStore } from 'react'

/**
 * A tiny per-device settings store on localStorage. Reads are validated, failures fall
 * back to defaults, and changes in other tabs are picked up.
 */
export function createLocalStore<T extends object>(
  key: string,
  defaults: T,
  validate: (value: unknown) => value is T,
) {
  const listeners = new Set<() => void>()
  let cache: { raw: string | null; value: T } | null = null

  function readRaw(): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  function get(): T {
    const raw = readRaw()
    if (cache?.raw === raw) return cache.value
    let value = defaults
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : null
      if (validate(parsed)) value = parsed
    } catch {
      value = defaults
    }
    cache = { raw, value }
    return value
  }

  function set(patch: Partial<T>) {
    const value = { ...get(), ...patch }
    const raw = JSON.stringify(value)
    try {
      localStorage.setItem(key, raw)
    } catch {
      // Storage blocked: keep the value for this tab only.
    }
    cache = { raw, value }
    for (const listener of listeners) listener()
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    const onStorage = (event: StorageEvent) => event.key === key && listener()
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('storage', onStorage)
    }
  }

  function useValue(): T {
    return useSyncExternalStore(subscribe, get, () => defaults)
  }

  return { get, set, useValue }
}
