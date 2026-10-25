import { toast } from 'sonner'
import type { Result } from '@/lib/result'

/** Fire-and-forget owner action: show the error if it fails, optionally a success message. */
export function notify(action: Promise<Result<unknown>>, success?: string) {
  void action.then((result) => {
    if (!result.ok) toast.error(result.error)
    else if (success) toast.success(success)
  })
}
