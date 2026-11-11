import { CaretUpIcon, FileTextIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatInt } from '@/lib/format'
import { safetyScore } from '@/lib/risk'
import { cn } from '@/lib/utils'
import { useUi } from '@/store/ui'
import type { PlanResponse } from '@/types/api'
import { Collapse } from './Collapse'
import { RouteList } from './RouteList'

/**
 * Mobile route picker: a bottom bar that rests as a one-line summary of the selected route; the
 * full route list rises over the map (the map never resizes). Picking a route, here or on the map,
 * or tapping outside wraps it again.
 */
export function RouteSheet({ plan, activeId, loading }: { plan: PlanResponse | undefined; activeId: string | null; loading: boolean }) {
  const setDetailsOpen = useUi((s) => s.setDetailsOpen)
  const [open, setOpen] = useState(false)
  const [shownId, setShownId] = useState(activeId)
  if (activeId !== shownId) {
    setShownId(activeId)
    setOpen(false)
  }

  const route = plan?.routes.find((r) => r.id === activeId)
  if (!route) return loading ? <Skeleton className="h-16 shrink-0 rounded-2xl" /> : null

  return (
    <section aria-label="Routes" className="relative shrink-0">
      {open && <div className="fixed inset-0 z-20 bg-background/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden />}
      <div className="absolute inset-x-0 bottom-full z-30 mb-2">
        <Collapse open={open}>
          {/* Choosing any route (even the current one) is "done": wrap the sheet. */}
          <div
            className="flex max-h-[60dvh] flex-col rounded-2xl border bg-card p-2 shadow-2xl"
            onClick={(e) => (e.target as HTMLElement).closest('[role="radio"]') && setOpen(false)}
          >
            <RouteList plan={plan} activeId={activeId} loading={loading} accordion fade="var(--card)" />
          </div>
        </Collapse>
      </div>
      <div className="relative z-30 flex items-center gap-2 rounded-2xl border bg-card py-2 pr-2 pl-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Hide route options' : 'Show route options'}
          className="relative min-w-0 flex-1 rounded-lg pt-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="absolute top-0 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/40" aria-hidden />
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            {route.recommended && <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />}
            <span className="truncate">{route.recommended ? `Recommended · Route ${route.id}` : `Route ${route.id}`}</span>
          </span>
          <span className="num block truncate text-xs text-muted-foreground">
            {formatInt(route.distance_mi)} mi · {(route.duration_s / 3600).toFixed(1)} h · Safety {safetyScore(route.stats.avg_risk)}%
          </span>
        </button>
        <Button variant="secondary" size="icon" className="shrink-0 rounded-full" onClick={() => setDetailsOpen(true)} aria-label="Weather report">
          <FileTextIcon />
        </Button>
        <Button variant="ghost" size="icon" className="shrink-0 rounded-full" onClick={() => setOpen(!open)} aria-hidden tabIndex={-1}>
          <CaretUpIcon weight="bold" className={cn('transition-transform duration-300', open && 'rotate-180')} />
        </Button>
      </div>
    </section>
  )
}
