import { ClockIcon, CloudSunIcon, GaugeIcon, NavigationArrowIcon } from '@phosphor-icons/react'
import { useMemo, type ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { AnimatedNumber } from '@/components/ui/skiper-ui/animated-number'
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { selectedRoute } from '@/hooks/usePlan'
import { formatInt, placeName } from '@/lib/format'
import { mileAtTime } from '@/lib/geo'
import { riskColor, riskLabel, weatherText } from '@/lib/risk'
import { routeModel } from '@/lib/routeModel'
import { useUi } from '@/store/ui'
import type { PlanResponse } from '@/types/api'
import { LayerBar, LayerMenu } from './LayerSwitcher'
import { TripTimeline } from './TripTimeline'

/** Closest checkpoint to a mile marker (checkpoints are sorted by mile). */
function nearestIndex(miles: Float64Array, mile: number): number {
  let best = 0
  for (let i = 1; i < miles.length; i++) {
    if (Math.abs(miles[i]! - mile) < Math.abs(miles[best]! - mile)) best = i
    else if (miles[i]! > mile) break
  }
  return best
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="num truncate text-xs">{children}</p>
    </div>
  )
}

/**
 * Floating map overlays for the selected route at the current time.
 * Desktop: route-stats pill, layer bar, trip timeline and the conditions card.
 * Phones: just a layer menu and a compact timeline.
 */
export function MapOverlays({ plan }: { plan: PlanResponse }) {
  const hour = useUi((s) => s.hour)
  const selectedId = useUi((s) => s.selectedRouteId)
  const destination = useUi((s) => s.destination)
  const desktop = useMediaQuery(DESKTOP_QUERY)

  const model = useMemo(() => {
    const r = selectedRoute(plan, selectedId)
    return r ? routeModel(r) : null
  }, [plan, selectedId])
  if (!model) return null
  const route = model.route

  const ts = plan.departure + hour * 3600
  const mile = mileAtTime(model.etas, model.miles, ts)
  const cp = route.checkpoints[nearestIndex(model.miles, mile)]!

  if (!desktop) {
    return (
      <>
        <LayerMenu />
        <div data-overlay="bottom" className="absolute inset-x-2 bottom-2 z-10 sm:inset-x-3 sm:bottom-3">
          <Card className="gap-0 rounded-2xl border-white/5 bg-card/90 px-3 pt-2.5 pb-1.5 backdrop-blur-xl sm:px-4 sm:pt-3 sm:pb-2">
            <TripTimeline plan={plan} model={model} cp={cp} mile={mile} compact />
          </Card>
        </div>
      </>
    )
  }

  const arrived = ts >= route.arrival
  const w = cp.weather
  return (
    <>
      <LayerBar />
      {/* Route stats pill (top-left) */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-4 rounded-xl bg-primary px-3.5 py-2 text-primary-foreground shadow-[0_12px_30px_-12px_var(--primary)]">
        {[
          { icon: NavigationArrowIcon, value: Math.round(route.distance_mi), suffix: ' mi', label: 'Distance' },
          { icon: ClockIcon, value: Math.round((route.duration_s / 3600) * 10) / 10, suffix: ' h', label: 'Expected' },
          { icon: GaugeIcon, value: Math.round(route.distance_mi / (route.duration_s / 3600)), suffix: ' mph', label: 'Avg speed' },
        ].map(({ icon: IconC, value, suffix, label }) => (
          <div key={label} className="leading-tight">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <IconC className="size-3.5" weight="bold" />
              <AnimatedNumber value={value} suffix={suffix} className="num" />
            </p>
            <p className="pl-5 text-[10px] text-white/70">{label}</p>
          </div>
        ))}
      </div>

      <div data-overlay="bottom" className="absolute inset-x-3 bottom-3 z-10 flex items-end gap-3">
        {/* Trip bar = timeline / forecast scrubber (bottom) */}
        <Card className="min-w-0 flex-1 gap-0 rounded-2xl border-white/5 bg-card/90 px-4 pt-3.5 pb-2.5 backdrop-blur-xl">
          <TripTimeline plan={plan} model={model} cp={cp} mile={mile} />
        </Card>

        {/* Conditions at the truck (bottom-right; the shot's driver card) */}
        <Card className="hidden w-[270px] shrink-0 gap-0 rounded-2xl border-white/5 bg-card/90 p-4 backdrop-blur-xl xl:flex">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-foreground">
              <CloudSunIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase" style={{ color: riskColor(cp.level) }}>
                <span className="size-1.5 rounded-full" style={{ background: riskColor(cp.level) }} />
                {arrived ? 'Arrived' : `${riskLabel(cp.level)} risk`}
              </p>
              <p className="truncate text-sm font-medium">{arrived ? placeName(destination) : `Truck · mile ${formatInt(mile)}`}</p>
              <p className="truncate text-[11px] text-muted-foreground">{w ? weatherText(w.code) : 'No forecast'}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <Metric label="Wind">{w ? `${Math.round(w.wind_mph)} mph` : '—'}</Metric>
            <Metric label="Gusts">{w?.gust_mph != null ? Math.round(w.gust_mph) : '—'}</Metric>
            <Metric label="Rain">{w ? w.rain_in_hr.toFixed(2) : '—'}</Metric>
            <Metric label="Snow">{w ? w.snow_in_hr.toFixed(2) : '—'}</Metric>
          </div>
        </Card>
      </div>
    </>
  )
}
