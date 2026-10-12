import { useSearchParams } from 'react-router-dom'
import { isPeriodPreset, resolvePeriod, type Period, type PeriodPreset } from './period'

/** Period kept in the URL (`?periode=7d`), so it survives reloads and page switches. */
export function usePeriod(timeZone: string, fallback: PeriodPreset = '7d'): Period {
  const [params] = useSearchParams()
  const raw = params.get('periode')
  const preset = isPeriodPreset(raw) ? raw : fallback
  return resolvePeriod(preset, new Date(), timeZone, {
    from: params.get('dari'),
    to: params.get('sampai'),
  })
}
