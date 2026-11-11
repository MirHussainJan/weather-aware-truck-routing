import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useUi } from '../store/ui'
import type { PlanResponse, PlannedRoute } from '../types/api'
import type { Trip } from './useTrip'

/** The plan for a trip + sampling interval; cached per combination by TanStack Query. */
export function usePlan(trip: Trip | null) {
  const interval = useUi((s) => s.interval)
  const query = useQuery({
    queryKey: ['plan', trip, interval],
    enabled: trip !== null,
    placeholderData: keepPreviousData, // keep the map populated while a new plan loads
    queryFn: ({ signal }) =>
      api.plan(
        {
          origin: { lat: trip!.origin.lat, lon: trip!.origin.lon },
          destination: { lat: trip!.destination.lat, lon: trip!.destination.lon },
          departure: trip!.departure,
          load_lb: trip!.loadLb,
          interval_mi: interval,
        },
        signal,
      ),
  })

  // A fresh plan for a *different trip* selects its recommended route and rewinds the timeline;
  // changing only the sampling interval keeps the user's selection.
  const { data, isPlaceholderData } = query
  const tripKey = JSON.stringify(trip)
  const lastTrip = useRef<string | null>(null)
  useEffect(() => {
    if (!data || isPlaceholderData) return
    const { selectedRouteId, selectRoute, setHour } = useUi.getState()
    if (lastTrip.current !== tripKey) {
      lastTrip.current = tripKey
      selectRoute(data.recommendation.route_id)
      setHour(0)
    } else if (!data.routes.some((r) => r.id === selectedRouteId)) {
      selectRoute(data.recommendation.route_id)
    }
  }, [data, isPlaceholderData, tripKey])

  return query
}

export function selectedRoute(plan: PlanResponse | undefined, id: string | null): PlannedRoute | undefined {
  return plan?.routes.find((r) => r.id === id) ?? plan?.routes.find((r) => r.recommended)
}
