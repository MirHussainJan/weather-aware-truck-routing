import { useMemo } from 'react'
import * as z from 'zod/mini' // tree-shakable build: ~10x smaller than classic zod
import { useUi } from '../store/ui'
import type { Place } from '../types/api'
import { useDebounced } from './useDebounced'

export interface Trip {
  origin: Place
  destination: Place
  /** ISO-8601 instant. */
  departure: string
  loadLb: number
}

export type TripErrors = Partial<Record<'departure' | 'loadLb' | 'destination', string>>

const HOUR_MS = 3_600_000
const MAX_AHEAD_MS = 5 * 24 * HOUR_MS // departure + 48 h heatmap must fit the 7-day forecast

const departureSchema = z.number().check(
  z.refine((t) => Number.isFinite(t), 'Choose a departure time.'),
  z.refine((t) => t >= Date.now() - HOUR_MS, 'Departure can’t be in the past.'),
  z.refine((t) => t <= Date.now() + MAX_AHEAD_MS, 'Forecasts reach 5 days ahead — pick an earlier time.'),
)
const loadSchema = z
  .int({ error: 'Enter the load in whole pounds.' })
  .check(z.gte(0, 'Load can’t be negative.'), z.lte(100_000, 'Maximum supported load is 100,000 lb.'))

const firstError = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? undefined : r.error?.issues[0]?.message

/**
 * Turns the raw inputs into a validated Trip. Typing in the time/load fields is debounced so the
 * plan is only requested once the user pauses — the way Google Maps re-routes as you edit.
 */
export function useTrip(): { trip: Trip | null; errors: TripErrors } {
  const origin = useUi((s) => s.origin)
  const destination = useUi((s) => s.destination)
  const departMode = useUi((s) => s.departMode)
  const nowTs = useUi((s) => s.nowTs)
  const departAt = useDebounced(
    useUi((s) => s.departAt),
    500,
  )
  const loadLb = useDebounced(
    useUi((s) => s.loadLb),
    500,
  )

  return useMemo(() => {
    const ts = departMode === 'now' ? nowTs : departAt ? new Date(departAt).getTime() : Number.NaN
    const errors: TripErrors = {
      departure: firstError(departureSchema.safeParse(ts)),
      loadLb: firstError(loadSchema.safeParse(loadLb ?? Number.NaN)),
      destination:
        origin && destination && Math.abs(origin.lat - destination.lat) < 1e-4 && Math.abs(origin.lon - destination.lon) < 1e-4
          ? 'Start and destination are the same place.'
          : undefined,
    }
    const valid = origin && destination && !errors.departure && !errors.loadLb && !errors.destination
    return {
      trip: valid ? { origin, destination, departure: new Date(ts).toISOString(), loadLb: loadLb! } : null,
      errors,
    }
  }, [origin, destination, departMode, nowTs, departAt, loadLb])
}
