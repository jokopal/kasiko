import { useSyncExternalStore } from 'react'
import { createSeedState, type PreviewState } from './seed'

// In-browser stand-in for the database while it is pending. It lives behind the same
// shapes the Supabase data layer will return, so screens do not change when it is
// swapped out. Persisted in localStorage and synced across tabs (kasir + owner side by side).

const STORAGE_KEY = 'kasiko.preview.v3'

let state: PreviewState | null = null
const listeners = new Set<() => void>()

function load(): PreviewState | null {
  try {
    for (const old of ['kasiko.preview.v1', 'kasiko.preview.v2']) localStorage.removeItem(old)
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PreviewState>
    return parsed.version === 3 ? (parsed as PreviewState) : null
  } catch {
    return null
  }
}

function persist(next: PreviewState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: the preview keeps working in memory for this tab.
  }
}

function emit() {
  for (const listener of listeners) listener()
}

export function getPreviewState(): PreviewState {
  if (!state) {
    state = load() ?? createSeedState(new Date())
    persist(state)
  }
  return state
}

export function setPreviewState(recipe: (current: PreviewState) => PreviewState) {
  state = recipe(getPreviewState())
  persist(state)
  emit()
}

export function resetPreviewState() {
  state = createSeedState(new Date())
  persist(state)
  emit()
}

function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return
  const next = load()
  if (next) {
    state = next
    emit()
  }
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('storage', onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}

export function usePreviewState(): PreviewState {
  return useSyncExternalStore(subscribe, getPreviewState, getPreviewState)
}
