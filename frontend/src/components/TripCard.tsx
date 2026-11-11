import { ArrowRightIcon, ArrowsDownUpIcon, CaretUpIcon, PackageIcon, PencilSimpleIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { TripErrors } from '@/hooks/useTrip'
import { formatDeparture, formatInt, placeName } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUi } from '@/store/ui'
import type { Interval } from '@/types/api'
import { Collapse } from './Collapse'
import { DeparturePicker } from './DeparturePicker'
import { PlaceCombobox } from './PlaceCombobox'

const EXAMPLE = {
  origin: { label: 'Denver, Colorado, US', lat: 39.7392, lon: -104.9903 },
  destination: { label: 'Salt Lake City, Utah, US', lat: 40.7608, lon: -111.891 },
}

function Marker({ m }: { m: 'A' | 'B' }) {
  return (
    <span
      className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold', m === 'A' ? 'bg-primary text-primary-foreground' : 'bg-amber text-background')}
      aria-hidden
    >
      {m}
    </span>
  )
}

/**
 * Trip inputs: places, departure, load and weather sampling interval. With `wrap` (phones), once
 * the routes for a pick-up/drop-off pair arrive the form folds into a one-line summary (tap to
 * edit); tweaking the time or load while editing keeps it open. On desktop it is always open.
 */
export function TripCard({ errors, ready, wrap }: { errors: TripErrors; ready: boolean; wrap: boolean }) {
  const origin = useUi((s) => s.origin)
  const destination = useUi((s) => s.destination)
  const departMode = useUi((s) => s.departMode)
  const departAt = useUi((s) => s.departAt)
  const loadLb = useUi((s) => s.loadLb)
  const interval = useUi((s) => s.interval)
  const { setOrigin, setDestination, swapPlaces, setLoadLb, setInterval } = useUi.getState()
  const [locationError, setLocationError] = useState<string | null>(null)
  const message = locationError ?? errors.destination ?? errors.departure ?? errors.loadLb

  // Wrap once per place pair, as soon as its plan is on screen (state adjusted during render).
  const pair = origin && destination ? `${origin.lat},${origin.lon}>${destination.lat},${destination.lon}` : null
  const [expanded, setExpanded] = useState(true)
  const [wrappedFor, setWrappedFor] = useState<string | null>(null)
  if (ready && pair && pair !== wrappedFor) {
    setWrappedFor(pair)
    setExpanded(false)
  }
  const open = !wrap || expanded || !pair || !!message
  const canWrap = wrap && !!pair && !message && ready

  return (
    <Card className="gap-0 rounded-2xl p-3">
      {wrap && (
        <Collapse open={!open}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Edit trip"
          className="group flex w-full items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
              <Marker m="A" />
              <span className="truncate">{placeName(origin)}</span>
              <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <Marker m="B" />
              <span className="truncate">{placeName(destination)}</span>
            </span>
            <span className="num mt-1 block truncate text-xs text-muted-foreground">
              {departMode === 'now' ? 'Leave now' : formatDeparture(new Date(departAt))} · {formatInt(loadLb ?? 0)} lb · every {interval} mi
            </span>
          </span>
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground transition-colors group-hover:text-foreground">
            <PencilSimpleIcon />
          </span>
        </button>
        </Collapse>
      )}

      <Collapse open={open} className="space-y-3">
        <div className="relative space-y-2 pr-10">
          <PlaceCombobox marker="A" placeholder="Pick-up location" ariaLabel="Starting point" value={origin} near={destination} onChange={setOrigin} onLocationError={setLocationError} />
          <span className="pointer-events-none absolute top-[34px] left-[19px] z-10 h-[22px] border-l border-dashed border-muted-foreground/50" aria-hidden />
          <PlaceCombobox marker="B" placeholder="Drop-off location" ariaLabel="Destination" value={destination} near={origin} onChange={setDestination} onLocationError={setLocationError} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="icon-sm" onClick={swapPlaces} className="absolute top-1/2 right-0 -translate-y-1/2 rounded-full" aria-label="Swap pick-up and drop-off">
                <ArrowsDownUpIcon weight="bold" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Swap</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex gap-2">
          <DeparturePicker invalid={!!errors.departure} />
          <label className="flex h-8 items-center gap-1.5 rounded-lg border border-input bg-muted/60 px-2.5 text-sm focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40 aria-invalid:border-destructive" aria-invalid={!!errors.loadLb}>
            <PackageIcon className="size-4 text-muted-foreground" aria-hidden />
            <input
              type="number"
              inputMode="numeric"
              aria-label="Load weight in pounds"
              min={0}
              max={100_000}
              step={1000}
              className="num w-[4.4rem] bg-transparent outline-none"
              value={loadLb ?? ''}
              onChange={(e) => setLoadLb(e.target.value === '' ? null : e.target.valueAsNumber)}
            />
            <span className="text-xs text-muted-foreground">lb</span>
          </label>
        </div>

        <Tabs value={String(interval)} onValueChange={(v) => setInterval(Number(v) as Interval)}>
          <div className="flex items-center gap-2">
            <span className="mr-auto text-xs whitespace-nowrap text-muted-foreground">
              <span className="max-sm:hidden">Weather check</span>
              <span className="sm:hidden">Check</span> every
            </span>
            <TabsList className="h-8 rounded-full bg-muted/70">
              {[10, 25, 50].map((v) => (
                <TabsTrigger key={v} value={String(v)} className="num rounded-full px-3 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  {v} mi
                </TabsTrigger>
              ))}
            </TabsList>
            {canWrap && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={() => setExpanded(false)} className="rounded-full text-muted-foreground" aria-label="Done editing">
                    <CaretUpIcon weight="bold" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Done</TooltipContent>
              </Tooltip>
            )}
          </div>
        </Tabs>

        {message ? (
          <p role="alert" className="text-xs text-destructive">
            {message}
          </p>
        ) : (
          (!origin || !destination) && (
            <Button
              variant="link"
              size="sm"
              className="h-auto justify-start p-0 text-xs text-muted-foreground"
              onClick={() => {
                setOrigin(EXAMPLE.origin)
                setDestination(EXAMPLE.destination)
              }}
            >
              Try an example: Denver → Salt Lake City
            </Button>
          )
        )}
      </Collapse>
    </Card>
  )
}
