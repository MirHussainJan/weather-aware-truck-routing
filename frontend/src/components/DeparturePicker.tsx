import { CalendarDotsIcon, CaretDownIcon, ClockIcon, LightningIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { formatDeparture, toLocalInputValue } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUi } from '@/store/ui'

const MAX_DAYS_AHEAD = 5 // departure + 48 h heatmap must fit the 7-day forecast

/** Next quarter hour at least 30 minutes out — a sensible default for a planned departure. */
function nextSlot(): Date {
  const d = new Date(Date.now() + 30 * 60_000)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  return d
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Departure date & time: a calendar with time field, with "Leave now" offered first — the same
 * pattern as "Your location" in the place search.
 */
export function DeparturePicker({ invalid = false }: { invalid?: boolean }) {
  const departMode = useUi((s) => s.departMode)
  const departAt = useUi((s) => s.departAt)
  const { setDepartMode, setDepartAt } = useUi.getState()
  const [open, setOpen] = useState(false)
  const [bounds] = useState(() => {
    const today = startOfDay(new Date())
    return { today, last: new Date(today.getFullYear(), today.getMonth(), today.getDate() + MAX_DAYS_AHEAD) }
  })

  const chosen = departAt ? new Date(departAt) : nextSlot()
  const time = departAt ? departAt.slice(11, 16) : toLocalInputValue(chosen).slice(11, 16)
  const label = departMode === 'now' ? 'Leave now' : formatDeparture(chosen)

  const scheduleOn = (day: Date, hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h ?? 0, m ?? 0)
    setDepartAt(toLocalInputValue(d))
    setDepartMode('at')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Departure: ${label}`}
          aria-invalid={invalid}
          className={cn('h-8 min-w-0 flex-1 justify-start gap-1.5 rounded-lg border-input bg-muted/60 px-2.5 font-normal', departMode === 'now' && 'text-sky-400')}
        >
          {departMode === 'now' ? <LightningIcon weight="fill" /> : <CalendarDotsIcon />}
          <span className="num truncate text-[13px]">{label}</span>
          <CaretDownIcon className="ml-auto size-3 text-muted-foreground" weight="bold" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1.5">
        <button
          type="button"
          onClick={() => {
            setDepartMode('now')
            setOpen(false)
          }}
          aria-pressed={departMode === 'now'}
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent aria-pressed:bg-accent"
        >
          <span className="grid size-8 place-items-center rounded-full bg-sky-500/15 text-sky-400">
            <LightningIcon weight="fill" />
          </span>
          <span>
            <span className="block text-sm font-medium text-sky-400">Leave now</span>
            <span className="block text-xs text-muted-foreground">Depart as soon as the plan is ready</span>
          </span>
        </button>
        <Separator className="my-1.5" />
        <Calendar
          mode="single"
          selected={departMode === 'at' ? chosen : undefined}
          defaultMonth={chosen}
          onSelect={(day) => day && scheduleOn(day, time)}
          disabled={[{ before: bounds.today }, { after: bounds.last }]}
          startMonth={bounds.today}
          endMonth={bounds.last}
        />
        <div className="flex items-center gap-2 px-2 pt-1 pb-1.5">
          <ClockIcon className="size-4 text-muted-foreground" aria-hidden />
          <Input
            type="time"
            step={900}
            aria-label="Departure time"
            value={time}
            onChange={(e) => e.target.value && scheduleOn(departMode === 'at' ? chosen : startOfDay(new Date()), e.target.value)}
            className="num h-8 flex-1 bg-muted/60"
          />
          <Button size="sm" className="h-8" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
