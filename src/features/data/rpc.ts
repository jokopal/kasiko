import { getSupabase } from '@/lib/supabase'

// Typed doors to supabase-js, whose rpc/functions results are `any`: everything that
// crosses here is `unknown` and gets mapped explicitly by the caller.

export interface RpcOutcome {
  data: unknown
  error: { code?: string | null; message: string } | null
  status: number
}

export async function callRpc(fn: string, args: Record<string, unknown>): Promise<RpcOutcome> {
  return await getSupabase().rpc(fn, args)
}

export interface FunctionOutcome {
  data: unknown
  error: (Error & { context?: Response }) | null
}

export async function invokeFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<FunctionOutcome> {
  return await getSupabase().functions.invoke(name, { body })
}
