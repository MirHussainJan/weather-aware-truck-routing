import { FileTextIcon, NavigationArrowIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatClock, formatDay, formatDurationShort, formatInt, placeName } from '@/lib/format'
import { weatherText } from '@/lib/risk'
import type { RouteModel } from '@/lib/routeModel'
import { cn } from '@/lib/utils'
import { checkpointColor, timeGradient } from '@/lib/weatherScale'
import { useUi } from '@/store/ui'
import type { Checkpoint, PlanResponse } from '@/types/api'

const STEP_H = 0.25 // 15-minute resolution
const PLAY_TICK_MS = 200
const PLAY_TICKS = 60 // a full sweep takes ~12 s whatever the span
const CLICK_SLOP_PX = 4

/** Tick labels that fit the span: 0, every 1/2/3/4/6/12 h, never more than ~6. */
function ticksFor(span: number): number[] {
  const step = [1, 2, 3, 4, 6, 12].find((s) => span / s <= 6) ?? 12
  const ticks: number[] = []
  for (let t = 0; t <= span + 1e-9; t += step) ticks.push(t)
  return ticks
}

interface Props {
  plan: PlanResponse
  model: RouteModel
  /** Checkpoint nearest the truck at the current time. */
  cp: Checkpoint
  /** Miles driven at the current time. */
  mile: number
  /** Phone header: live readout with conditions; desktop shows place names and the report button. */
  compact?: boolean
}

/**
 * The trip bar is the timeline. By default it spans exactly the journey (departure → arrival);
 * the "48h" option widens it to the full 0–48 h forecast horizon for the heatmap. The knob
 * (a navigation arrow) is dragged to scrub or clicked to play / pause.
 */
export function TripTimeline({ plan, model, cp, mile, compact = false }: Props) {
  const hour = useUi((s) => s.hour)
  const metric = useUi((s) => s.metric)
  const playing = useUi((s) => s.playing)
  const range = useUi((s) => s.timelineRange)
  const origin = useUi((s) => s.origin)
  const destination = useUi((s) => s.destination)
  const { setHour, setPlaying, setTimelineRange, setDetailsOpen } = useUi.getState()
  const pointerX = useRef<number | null>(null)

  const route = model.route
  const tripHours = route.duration_s / 3600
  const forecastHours = plan.heatmap.hours
  const span = range === 'trip' ? Math.ceil(tripHours / STEP_H) * STEP_H : forecastHours
  const strip = useMemo(() => timeGradient(route, plan.departure, span, metric), [route, plan.departure, span, metric])
  const ticks = useMemo(() => ticksFor(span), [span])
  const ts = plan.departure + hour * 3600
  const arrived = ts >= route.arrival
  const arrivalPct = Math.min(100, (tripHours / span) * 100)
  const color = checkpointColor(cp, metric)
  const w = cp.weather

  // Keep the knob on the bar when the span shrinks (e.g. switching 48h → Trip).
  useEffect(() => {
    if (hour > span) setHour(span)
  }, [hour, span, setHour])

  // Playback: advance in steps sized so a full sweep takes ~12 s, stop at the end of the bar.
  useEffect(() => {
    if (!playing) return
    const step = Math.max(STEP_H, Math.round(span / PLAY_TICKS / STEP_H) * STEP_H)
    const id = window.setInterval(() => {
      const next = useUi.getState().hour + step
      if (next >= span) {
        setHour(span)
        setPlaying(false)
      } else setHour(next)
    }, PLAY_TICK_MS)
    return () => window.clearInterval(id)
  }, [playing, span, setHour, setPlaying])

  const spanToggle = (
    <ToggleGroup
      type="single"
      value={range}
      onValueChange={(v) => v && setTimelineRange(v as 'trip' | 'forecast')}
      aria-label="Timeline span"
      className="shrink-0 rounded-full bg-muted/70 p-0.5"
    >
      <ToggleGroupItem value="trip" className="h-7 rounded-full px-2.5 text-xs data-[state=on]:bg-secondary" title="Span the journey">
        Trip
      </ToggleGroupItem>
      <ToggleGroupItem value="forecast" className="num h-7 rounded-full px-2.5 text-xs data-[state=on]:bg-secondary" title="Span the full 0–48 h forecast">
        48h
      </ToggleGroupItem>
    </ToggleGroup>
  )

  const togglePlay = () => {
    if (!playing && hour >= span) setHour(0)
    setPlaying(!playing)
  }

  return (
    <div>
      {compact ? (
        // Phones: live readout (with conditions at the truck) + span toggle; depart/arrive join from `sm` up.
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden min-w-0 shrink-0 sm:block">
            <p className="text-[10px] text-muted-foreground">Depart</p>
            <p className="num text-sm">
              {formatDay(plan.departure)} {formatClock(plan.departure)}
            </p>
          </div>
          <div className="min-w-0 flex-1 sm:text-center" aria-live="polite">
            <p className="num text-sm font-medium">
              +{formatDurationShort(hour * 3600)} · {formatDay(ts)} {formatClock(ts)}
            </p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground sm:justify-center">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
              <span className="truncate">
                {arrived
                  ? `Arrived · ${placeName(destination)}`
                  : `Mile ${formatInt(mile)}${w ? ` · ${weatherText(w.code)} · ${Math.round(w.wind_mph)} mph wind` : ''}`}
              </span>
            </p>
          </div>
          <div className="hidden min-w-0 shrink-0 text-right sm:block">
            <p className="text-[10px] text-muted-foreground">Arrive</p>
            <p className="num text-sm">
              {formatDay(route.arrival)} {formatClock(route.arrival)}
            </p>
          </div>
          {spanToggle}
        </div>
      ) : (
        // Desktop: origin → live readout → destination, span toggle and the weather report.
        <div className="flex items-end gap-4">
          <div className="min-w-0 shrink-0">
            <p className="truncate text-base leading-tight 2xl:text-[20px]">{placeName(origin)}</p>
            <p className="num text-[11px] text-muted-foreground">
              {formatDay(plan.departure)} {formatClock(plan.departure)} →
            </p>
          </div>
          <div className="min-w-0 flex-1 text-center" aria-live="polite">
            <p className="num text-sm font-medium">
              +{formatDurationShort(hour * 3600)} · {formatDay(ts)} {formatClock(ts)}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{arrived ? 'Arrived' : `Truck at mile ${formatInt(mile)}`}</p>
          </div>
          <div className="min-w-0 shrink-0 text-right">
            <p className="truncate text-base leading-tight 2xl:text-[20px]">{placeName(destination)}</p>
            <p className="num text-[11px] text-muted-foreground">
              → {formatDay(route.arrival)} {formatClock(route.arrival)}, {formatInt(route.distance_mi)} mi
            </p>
          </div>
          {spanToggle}
          <Button size="sm" className="shrink-0 rounded-full" onClick={() => setDetailsOpen(true)}>
            Report
            <FileTextIcon weight="bold" />
          </Button>
        </div>
      )}

      <div className="relative mt-3" onPointerDownCapture={(e) => (pointerX.current = e.clientX)}>
        {/* Conditions over time: the route as the truck passes each point (neutral after arrival in 48h mode). */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full" style={{ background: strip }} aria-hidden />
        {arrivalPct < 98 && (
          <span className="pointer-events-none absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-foreground/80" style={{ left: `${arrivalPct}%` }} aria-hidden />
        )}
        <Slider
          value={[Math.min(hour, span)]}
          min={0}
          max={span}
          step={STEP_H}
          onValueChange={([v]) => {
            setPlaying(false)
            setHour(v ?? 0)
          }}
          aria-label={range === 'trip' ? 'Time along the journey' : 'Forecast hour after departure'}
          className="h-9"
          trackClassName="h-2.5! bg-transparent"
          rangeClassName="bg-background/60"
          thumbClassName={cn(
            'grid size-9 cursor-pointer place-items-center border-[3px] border-background text-background shadow-lg ring-0 hover:ring-4',
            playing && 'ring-4 ring-foreground/25',
          )}
          thumbProps={{
            style: { background: color },
            'aria-label': playing ? 'Pause (drag to scrub)' : 'Play (drag to scrub)',
            title: playing ? 'Click to pause · drag to scrub' : 'Click to play · drag to scrub',
            onClick: (e) => {
              // A click (not a drag) toggles playback.
              if (pointerX.current === null || Math.abs(e.clientX - pointerX.current) < CLICK_SLOP_PX) togglePlay()
            },
            onKeyDown: (e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault()
                togglePlay()
              }
            },
          }}
          thumbChildren={<NavigationArrowIcon className={cn('size-4 rotate-135', playing && 'animate-pulse')} weight="fill" />}
        />
      </div>

      <div className="relative mt-0.5 h-3 text-[10px] text-muted-foreground" aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="num absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${(t / span) * 100}%` }}>
            {t}h
          </span>
        ))}
      </div>
    </div>
  )
}
