import { lazy, Suspense, type ReactNode } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { RouteList } from '@/components/RouteList'
import { RouteSheet } from '@/components/RouteSheet'
import { TripCard } from '@/components/TripCard'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { selectedRoute, usePlan } from '@/hooks/usePlan'
import { useTrip } from '@/hooks/useTrip'
import { ApiError } from '@/lib/api'
import { useUi } from '@/store/ui'

// MapLibre is ~1 MB: load it in parallel with the first paint instead of blocking it.
const MapView = lazy(() => import('@/components/map/MapView'))
// Only needed once a plan exists: keep them (and their animation code) out of the first load.
const MapOverlays = lazy(() => import('@/components/map/MapOverlays').then((m) => ({ default: m.MapOverlays })))
const WeatherSheet = lazy(() => import('@/components/WeatherSheet').then((m) => ({ default: m.WeatherSheet })))

function MapMessage({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 grid place-items-center bg-card p-6 text-center text-sm text-muted-foreground">{children}</div>
}

/**
 * Desktop: [trip & routes column | map]. Mobile: trip summary on top, full-height map, routes in a
 * bottom sheet. Either way finished steps fold away and details open on selection.
 */
export default function App() {
  const { trip, errors } = useTrip()
  const query = usePlan(trip)
  const plan = query.data
  const selectedId = useUi((s) => s.selectedRouteId)
  const active = selectedRoute(plan, selectedId)
  const error = query.error && !plan ? query.error : null
  const desktop = useMediaQuery(DESKTOP_QUERY)

  const tripCard = <TripCard errors={errors} ready={!!plan && !query.isPlaceholderData} wrap={!desktop} />
  const errorAlert = error && (
    <div role="alert" className="shrink-0 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
      <p className="font-semibold">Couldn’t plan this trip</p>
      <p className="mt-0.5 opacity-90">{error.message}</p>
      {(!(error instanceof ApiError) || error.retryable) && (
        <Button size="xs" variant="destructive" className="mt-2" onClick={() => query.refetch()}>
          Retry
        </Button>
      )}
    </div>
  )
  const mapPanel = (
    <section data-map-panel aria-label="Map" className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border bg-card">
      <ErrorBoundary fallback={<MapMessage>The map couldn’t be displayed. Your browser may not support WebGL.</MapMessage>}>
        <Suspense fallback={<MapMessage>Loading map…</MapMessage>}>
          <MapView plan={plan} />
        </Suspense>
      </ErrorBoundary>
      {plan && (
        <Suspense fallback={null}>
          <MapOverlays plan={plan} />
        </Suspense>
      )}
    </section>
  )

  return (
    <TooltipProvider>
      {desktop ? (
        <div className="flex h-dvh gap-3 overflow-hidden bg-background p-3">
          <aside aria-label="Trip and routes" className="flex min-h-0 w-[380px] shrink-0 flex-col gap-3">
            {tripCard}
            {errorAlert}
            <RouteList plan={plan} activeId={active?.id ?? null} loading={query.isFetching} />
          </aside>
          {mapPanel}
        </div>
      ) : (
        <div className="flex h-dvh flex-col gap-2 overflow-hidden bg-background p-3">
          <div className="shrink-0">{tripCard}</div>
          {errorAlert}
          {mapPanel}
          <RouteSheet plan={plan} activeId={active?.id ?? null} loading={query.isFetching} />
        </div>
      )}
      {plan && active && (
        <Suspense fallback={null}>
          <WeatherSheet plan={plan} route={active} side={desktop ? 'right' : 'bottom'} />
        </Suspense>
      )}
    </TooltipProvider>
  )
}
