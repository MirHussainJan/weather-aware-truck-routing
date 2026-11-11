import { CaretDownIcon, CheckIcon, CloudRainIcon, EyeIcon, EyeSlashIcon, ShieldWarningIcon, SnowflakeIcon, WindIcon, type Icon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useUi } from '@/store/ui'
import type { HeatmapMetric } from '@/types/api'

const LAYERS: { id: HeatmapMetric; label: string; hint: string; icon: Icon }[] = [
  { id: 'risk', label: 'Risk', hint: 'Combined, for your load', icon: ShieldWarningIcon },
  { id: 'wind', label: 'Wind', hint: 'Sustained wind and gusts', icon: WindIcon },
  { id: 'rain', label: 'Rain', hint: 'Rainfall rate', icon: CloudRainIcon },
  { id: 'snow', label: 'Snow', hint: 'Snowfall rate', icon: SnowflakeIcon },
]

/**
 * Desktop weather-layer control: a segmented bar (top-right). Picks what the heatmap *and* the
 * highlighted route show; the eye hides the heatmap.
 */
export function LayerBar() {
  const metric = useUi((s) => s.metric)
  const visible = useUi((s) => s.heatmapVisible)
  const { setMetric, toggleHeatmap } = useUi.getState()

  return (
    <Card className="absolute top-3 right-16 z-10 gap-0 rounded-2xl border-white/5 bg-card/90 p-1.5 backdrop-blur-xl">
      <div className="flex items-center gap-1">
        <ToggleGroup type="single" value={metric} onValueChange={(v) => v && setMetric(v as HeatmapMetric)} aria-label="Weather layer" className="gap-0.5">
          {LAYERS.map(({ id, label, icon: IconC }) => (
            <ToggleGroupItem
              key={id}
              value={id}
              aria-label={`${label} layer`}
              className="h-8 gap-1.5 rounded-xl px-2.5 text-xs text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              <IconC weight={metric === id ? 'fill' : 'regular'} />
              <span>{label}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={toggleHeatmap} aria-pressed={!visible} aria-label={visible ? 'Hide heatmap' : 'Show heatmap'} className="rounded-xl text-muted-foreground">
              {visible ? <EyeIcon /> : <EyeSlashIcon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{visible ? 'Hide heatmap' : 'Show heatmap'}</TooltipContent>
        </Tooltip>
      </div>
    </Card>
  )
}

/**
 * Phone weather-layer control, folded into one button showing the active layer; the menu also
 * switches the heatmap off.
 */
export function LayerMenu() {
  const metric = useUi((s) => s.metric)
  const visible = useUi((s) => s.heatmapVisible)
  const { setMetric, toggleHeatmap } = useUi.getState()
  const [open, setOpen] = useState(false)
  const active = LAYERS.find((l) => l.id === metric)!

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" aria-label={`Weather layer: ${active.label}`} className="absolute top-3 left-3 z-10 h-10 gap-2 rounded-xl border border-white/5 bg-card/90 pr-2.5 pl-3 backdrop-blur-xl">
          <active.icon weight="fill" className="text-primary" />
          <span className="text-sm">{active.label}</span>
          <CaretDownIcon className={cn('size-3 text-muted-foreground transition-transform', open && 'rotate-180')} weight="bold" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-60 p-1.5">
        <div role="radiogroup" aria-label="Weather layer">
          {LAYERS.map(({ id, label, hint, icon: IconC }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={metric === id}
              onClick={() => {
                setMetric(id)
                setOpen(false)
              }}
              className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent"
            >
              <span className={cn('grid size-8 place-items-center rounded-lg', metric === id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground')}>
                <IconC weight={metric === id ? 'fill' : 'regular'} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{label}</span>
                <span className="block text-[11px] text-muted-foreground">{hint}</span>
              </span>
              {metric === id && <CheckIcon className="text-primary" weight="bold" />}
            </button>
          ))}
        </div>
        <Separator className="my-1.5" />
        <button
          type="button"
          role="switch"
          aria-checked={visible}
          onClick={toggleHeatmap}
          className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm outline-none hover:bg-accent focus-visible:bg-accent"
        >
          Heatmap
          <span className={cn('relative h-5 w-9 rounded-full transition-colors', visible ? 'bg-primary' : 'bg-secondary')} aria-hidden>
            <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform', visible && 'translate-x-4')} />
          </span>
        </button>
      </PopoverContent>
    </Popover>
  )
}
