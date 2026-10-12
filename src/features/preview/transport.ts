import type { OutboxOperation } from '@/features/offline/db'
import type { DeviceRegistrar } from '@/features/offline/device'
import { PermanentSyncError, type SyncTransport } from '@/features/offline/sync-engine'
import type { Result } from '@/lib/result'
import {
  rpcCreateExpense,
  rpcCreateTransaction,
  rpcRegisterDevice,
  rpcVoidExpense,
  rpcVoidTransaction,
} from './server'
import { getPreviewState } from './store'

// The preview's "network". Replaced by a Supabase transport (RPC calls) in milestone 6
// proper; the outbox, sync engine and UI stay exactly the same.

function assertReachable(businessId?: string) {
  // Retryable: the entry stays queued and is sent once the device is back online.
  if (!navigator.onLine) throw new Error('Perangkat sedang offline')
  if (businessId) {
    const account = getPreviewState().cashierAccounts.find((a) => a.businessId === businessId)
    if (account && !account.isActive) {
      // Also retryable: data waits on the device until the account is re-enabled.
      throw new Error('Akun kasir dinonaktifkan owner')
    }
  }
}

function unwrap(result: Result<unknown>) {
  if (!result.ok) throw new PermanentSyncError(result.error)
}

export const previewTransport: SyncTransport = {
  send(operation: OutboxOperation): Promise<void> {
    const now = new Date()
    switch (operation.kind) {
      case 'transaction.create':
        assertReachable(operation.record.businessId)
        unwrap(rpcCreateTransaction(operation.record, now))
        break
      case 'expense.create':
        assertReachable(operation.record.businessId)
        unwrap(rpcCreateExpense(operation.record, 'cashier', now))
        break
      case 'transaction.void':
        assertReachable()
        unwrap(
          rpcVoidTransaction(
            {
              id: operation.targetId,
              reason: operation.reason,
              voidedAt: operation.voidedAt,
              role: 'cashier',
            },
            now,
          ),
        )
        break
      case 'expense.void':
        assertReachable()
        unwrap(
          rpcVoidExpense(
            {
              id: operation.targetId,
              reason: operation.reason,
              voidedAt: operation.voidedAt,
              role: 'cashier',
            },
            now,
          ),
        )
        break
    }
    return Promise.resolve()
  },
}

export const previewRegistrar: DeviceRegistrar = {
  register(businessId: string) {
    assertReachable()
    const result = rpcRegisterDevice(businessId)
    if (!result.ok) return Promise.reject(new Error(result.error))
    return Promise.resolve({ id: result.value.id, code: result.value.code })
  },
}
