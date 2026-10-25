import type { OutboxOperation } from '@/features/offline/db'
import type { DeviceRegistrar } from '@/features/offline/device'
import { PermanentSyncError, type SyncTransport } from '@/features/offline/sync-engine'
import { classifyServerError } from './errors'
import { callRpc, type RpcOutcome } from './rpc'
import { expensePayload, orderPayload, transactionPayload } from './rows'

// The cashier's network (decision #14): every queued operation is one idempotent RPC.

function check({ error, status }: RpcOutcome) {
  if (!error) return
  if (classifyServerError({ status, code: error.code, message: error.message }) === 'permanent') {
    throw new PermanentSyncError(error.message)
  }
  throw new Error(error.message || 'Server tidak dapat dihubungi')
}

async function call(fn: string, args: Record<string, unknown>): Promise<void> {
  if (!navigator.onLine) throw new Error('Perangkat sedang offline')
  check(await callRpc(fn, args))
}

export const supabaseTransport: SyncTransport = {
  async send(operation: OutboxOperation): Promise<void> {
    switch (operation.kind) {
      case 'transaction.create':
        return call('create_transaction', { p: transactionPayload(operation.record) })
      case 'expense.create':
        return call('create_expense', {
          p: expensePayload(operation.record, operation.deviceId ?? null),
        })
      case 'transaction.void':
        return call('void_transaction', {
          p_id: operation.targetId,
          p_reason: operation.reason,
          p_voided_at: operation.voidedAt,
        })
      case 'expense.void':
        return call('void_expense', {
          p_id: operation.targetId,
          p_reason: operation.reason,
          p_voided_at: operation.voidedAt,
        })
      case 'order.save':
        return call('save_order', { p: orderPayload(operation.record) })
      case 'order.cancel':
        return call('cancel_order', {
          p_id: operation.targetId,
          p_reason: operation.reason,
          p_cancelled_at: operation.cancelledAt,
        })
    }
  },
}

export const supabaseRegistrar: DeviceRegistrar = {
  async register(businessId: string) {
    const { data, error } = await callRpc('register_device', { p_business_id: businessId })
    if (error) throw new Error(error.message)
    const row = data as { id: string; device_code: string }
    return { id: row.id, code: row.device_code }
  },
}
