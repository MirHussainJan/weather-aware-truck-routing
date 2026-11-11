import { WarningIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatDurationShort, formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUi } from '@/store/ui'
import type { PlanResponse, PlannedRoute } from '@/types/api'
import { RouteDetails } from './RouteDetails'

/**
 * Weather report: why the recommendation wins, then the forecast stretch by stretch. A side panel
 * on desktop, a bottom sheet on phones.
 */
export function WeatherSheet({ plan, route, side }: { plan: PlanResponse; route: PlannedRoute; side: 'right' | 'bottom' }) {
  const open = useUi((s) => s.detailsOpen)
  const setOpen = useUi((s) => s.setDetailsOpen)
  const best = plan.routes.find((r) => r.recommended)!

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side={side} className={cn('gap-0 bg-card p-0', side === 'right' ? 'w-full border-l sm:max-w-md' : 'max-h-[88dvh] rounded-t-2xl')}>
        <SheetHeader className="border-b p-5">
          <div className="flex items-center gap-2">
            <Badge className="rounded-full">Route {route.id}</Badge>
            {route.recommended && <Badge className="rounded-full bg-lime text-background">Safest</Badge>}
          </div>
          <SheetTitle className="text-xl font-normal tracking-tight">Weather report</SheetTitle>
          <SheetDescription className="num text-xs">
            {route.via ? `via ${route.via} · ` : ''}
            {formatDurationShort(route.duration_s)} · {formatInt(route.distance_mi)} mi · {route.checkpoints.length} checkpoints
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <section className="space-y-2 p-5">
            <p className="text-sm font-medium">{route.recommended ? 'Why this is the safest route' : `Route ${best.id} is safer`}</p>
            <ul className="space-y-1 text-[13px] text-muted-foreground">
              {plan.recommendation.comparisons.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground/80">Ranked by fewest No-Travel, then Severe and High miles, then lowest average risk, then travel time.</p>
            {plan.warnings.map((w) => (
              <p key={w} className="flex gap-2 rounded-lg border border-amber/30 bg-amber/10 p-2.5 text-xs text-amber">
                <WarningIcon className="mt-px size-4 shrink-0" weight="fill" />
                {w}
              </p>
            ))}
          </section>
          <Separator />
          <RouteDetails key={`${route.id}:${plan.interval_mi}:${plan.departure}`} route={route} />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
