import { ClockIcon, FileTextIcon, InfoIcon, MapPinLineIcon, NavigationArrowIcon, WarningIcon } from '@phosphor-icons/react'
import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { AnimatedNumber } from '@/components/ui/skiper-ui/animated-number'
import { ProgressiveBlur } from '@/components/ui/skiper-ui/progressive-blur'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatInt } from '@/lib/format'
import { riskColor, safetyScore } from '@/lib/risk'
import { cn } from '@/lib/utils'
import { useUi } from '@/store/ui'
import type { PlanResponse, PlannedRoute } from '@/types/api'
import { Collapse } from './Collapse'

interface CardProps {
  route: PlannedRoute
  selected: boolean
  fastest: boolean
}

function SafetyRing({ value, color, track, className, strokeWidth = 4 }: { value: number; color: string; track: string; className?: string; strokeWidth?: number }) {
  const r = 20
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 48 48" className={cn('-rotate-90', className)} aria-hidden>
      <circle cx="24" cy="24" r={r} fill="none" stroke={track} strokeWidth={strokeWidth} />
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value / 100)}
        className="transition-[stroke-dashoffset] duration-700"
      />
    </svg>
  )
}

/** Values shared by both card styles. */
function cardData(route: PlannedRoute) {
  const s = route.stats
  const blue = route.recommended
  return {
    blue,
    score: safetyScore(s.avg_risk),
    elevated: s.high_mi + s.severe_mi + s.no_travel_mi,
    hours: (route.duration_s / 3600).toFixed(1),
    muted: blue ? 'text-white/70' : 'text-muted-foreground',
    strong: blue ? 'text-white' : 'text-foreground',
    ringColor: blue ? 'var(--lime)' : riskColor(s.max_level),
    ringTrack: blue ? 'rgb(255 255 255 / 0.2)' : 'var(--secondary)',
  }
}

/** Distance, time / checkpoints / elevated miles, and the safety ring: the body of a route card. */
function CardStats({ route, className }: { route: PlannedRoute; className?: string }) {
  const { score, elevated, hours, muted, strong, ringColor, ringTrack } = cardData(route)
  return (
    <span className={cn('flex items-end justify-between gap-3', className)}>
      <span>
        <span className="flex items-center gap-1.5 text-2xl font-semibold">
          <NavigationArrowIcon className="size-5 rotate-90" weight="fill" />
          <AnimatedNumber value={Math.round(route.distance_mi)} suffix=" mi" className="num" />
        </span>
        <span className={cn('mt-2 flex gap-4 text-[11px]', muted)}>
          <span className="flex flex-col gap-0.5" title="Driving time">
            <ClockIcon className="size-3.5" />
            <span className={cn('num', strong)}>{hours} h</span>
          </span>
          <span className="flex flex-col gap-0.5" title="Weather checkpoints">
            <MapPinLineIcon className="size-3.5" />
            <span className={cn('num', strong)}>{route.checkpoints.length}</span>
          </span>
          <span className="flex flex-col gap-0.5" title="Miles at High risk or worse">
            <WarningIcon className="size-3.5" />
            <span className={cn('num', elevated > 0 ? 'text-amber' : strong)}>{Math.round(elevated)} mi</span>
          </span>
        </span>
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex flex-col items-center">
            <span className="relative grid place-items-center">
              <SafetyRing value={score} color={ringColor} track={ringTrack} className="size-14" />
              <span className="num absolute text-[13px] font-semibold">
                <AnimatedNumber value={score} suffix="%" />
              </span>
            </span>
            <span className={cn('text-[10px]', muted)}>Safety</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">Safety score = 100 × (1 − average risk ÷ 4)</TooltipContent>
      </Tooltip>
    </span>
  )
}

/**
 * Desktop: every route shows the full card; the recommended (safest) route is the blue card and
 * the selected one is outlined.
 */
const RouteCard = memo(function RouteCard({ route, selected, fastest }: CardProps) {
  const selectRoute = useUi((s) => s.selectRoute)
  const { blue, muted } = cardData(route)

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => selectRoute(route.id)}
      className={cn(
        'w-full rounded-2xl border p-4 text-left transition-[box-shadow,background-color,border-color] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        blue
          ? 'border-transparent bg-primary text-primary-foreground shadow-[0_20px_40px_-20px_rgb(61_61_245/0.8)]'
          : 'bg-card hover:border-muted-foreground/30',
        blue && selected && 'ring-2 ring-white/70',
        !blue && selected && 'border-primary bg-[#17172a] ring-2 ring-primary',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-semibold">{blue ? `Recommended · Route ${route.id}` : `Route ${route.id}`}</span>
        <span className="flex gap-1">
          {blue && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium">Safest</span>}
          {fastest && <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium', blue ? 'bg-white/15' : 'bg-secondary')}>Fastest</span>}
        </span>
      </span>
      <span className={cn('mt-0.5 block truncate text-xs', muted)}>{route.via ? `via ${route.via}` : 'Truck route'}</span>
      <CardStats route={route} className="mt-3" />
    </button>
  )
})

/**
 * Phones, accordion style: every route shows a slim header row; only the selected one opens into
 * the full card plus the weather-report button.
 */
const RouteRow = memo(function RouteRow({ route, selected, fastest }: CardProps) {
  const selectRoute = useUi((s) => s.selectRoute)
  const setDetailsOpen = useUi((s) => s.setDetailsOpen)
  const { blue, score, hours, muted, strong, ringColor, ringTrack } = cardData(route)

  return (
    <div
      className={cn(
        'rounded-2xl border transition-[box-shadow,background-color,border-color] duration-300',
        blue ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card',
        blue && selected && 'shadow-[0_20px_40px_-20px_rgb(61_61_245/0.8)]',
        !blue && selected && 'border-primary/70 bg-[#17172a]',
        !blue && !selected && 'hover:border-muted-foreground/30',
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={() => selectRoute(route.id)}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{blue ? `Recommended · Route ${route.id}` : `Route ${route.id}`}</span>
            {selected && blue && <span className="shrink-0 rounded-full bg-white/15 px-2 py-px text-[10px] font-medium">Safest</span>}
            {selected && fastest && <span className={cn('shrink-0 rounded-full px-2 py-px text-[10px] font-medium', blue ? 'bg-white/15' : 'bg-secondary')}>Fastest</span>}
          </span>
          <span className={cn('block truncate text-xs', muted)}>{route.via ? `via ${route.via}` : 'Truck route'}</span>
        </span>
        {!selected && (
          <span className="flex shrink-0 items-center gap-2.5">
            <span className="num text-right text-xs leading-tight">
              <span className={cn('block font-medium', strong)}>{formatInt(route.distance_mi)} mi</span>
              <span className={muted}>{hours} h</span>
            </span>
            <span className="relative grid place-items-center" title={`Safety ${score}%`}>
              <SafetyRing value={score} color={ringColor} track={ringTrack} className="size-9" strokeWidth={5} />
              <span className="num absolute text-[9px] font-semibold">{score}</span>
            </span>
          </span>
        )}
      </button>

      <Collapse open={selected} className="px-4">
        <CardStats route={route} className="pb-1" />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setDetailsOpen(true)}
          className={cn('mt-2 mb-3 w-full rounded-xl', blue && 'bg-white/15 text-white hover:bg-white/25')}
        >
          <FileTextIcon weight="bold" />
          Weather report
        </Button>
      </Collapse>
    </div>
  )
})

interface ListProps {
  plan: PlanResponse | undefined
  activeId: string | null
  loading: boolean
  /** Accordion rows (phones) instead of full cards (desktop). */
  accordion?: boolean
  /** Colour the bottom blur fades into (the surface the list sits on). */
  fade?: string
}

/** Route options: full cards on desktop, an accordion on phones. */
export function RouteList({ plan, activeId, loading, accordion = false, fade = 'var(--background)' }: ListProps) {
  const fastestId = plan?.routes.reduce((a, b) => (b.duration_s < a.duration_s ? b : a)).id
  const Item = accordion ? RouteRow : RouteCard
  return (
    <div className="relative min-h-0 flex-1">
      <ScrollArea className="h-full">
        <div role="radiogroup" aria-label="Route options" className="space-y-2 pb-10">
          {plan
            ? plan.routes.map((r) => <Item key={r.id} route={r} selected={r.id === activeId} fastest={r.id === fastestId} />)
            : loading
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-37 rounded-2xl" />)
              : (
                  <div className="flex items-start gap-2 rounded-2xl border border-dashed p-4 text-xs leading-relaxed text-muted-foreground">
                    <InfoIcon className="mt-0.5 size-4 shrink-0" />
                    Choose a pick-up and drop-off to compare up to three truck routes against the forecast at the time you’ll be on each road.
                  </div>
                )}
        </div>
      </ScrollArea>
      <ProgressiveBlur position="bottom" height="48px" backgroundColor={fade} />
    </div>
  )
}
