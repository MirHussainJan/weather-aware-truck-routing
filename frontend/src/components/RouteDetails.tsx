import { CaretDownIcon, CloudRainIcon, SnowflakeIcon, ThermometerIcon, WindIcon } from '@phosphor-icons/react'
import { memo, useMemo, useState } from 'react'
import { formatClock, formatDay, formatInt } from '../lib/format'
import { riskColor, riskLabel, weatherText } from '../lib/risk'
import { useUi } from '../store/ui'
import type { Checkpoint, PlannedRoute } from '../types/api'

interface Run {
  key: string
  level: Checkpoint['level']
  from: number
  to: number
}

/** Consecutive checkpoints with the same level form one stretch, like steps in turn-by-turn directions. */
function toRuns(cps: Checkpoint[]): Run[] {
  const runs: Run[] = []
  cps.forEach((cp, i) => {
    const last = runs[runs.length - 1]
    if (last && last.level === cp.level) last.to = i
    else runs.push({ key: `${i}`, level: cp.level, from: i, to: i })
  })
  return runs
}

function worstDriver(cps: Checkpoint[], run: Run): string {
  for (let i = run.from; i <= run.to; i++) {
    const d = cps[i]!.drivers[0]
    if (d) return d
  }
  return ''
}

function CheckpointRow({ routeId, cp, index, focused }: { routeId: string; cp: Checkpoint; index: number; focused: boolean }) {
  const focus = useUi((s) => s.focusCheckpoint)
  const w = cp.weather
  return (
    <li className="cp-row">
      <button type="button" onClick={() => focus(routeId, index, true)} aria-current={focused} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent aria-[current=true]:bg-primary/15">
        <span className="num w-16 shrink-0 text-xs text-muted-foreground">{formatClock(cp.eta)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[13px] text-foreground">
            <span className="num font-medium">Mile {formatInt(cp.mile)}</span>
            <span style={{ color: riskColor(cp.level) }} className="font-medium">
              {riskLabel(cp.level)}
            </span>
            {w && <span className="truncate text-muted-foreground">{weatherText(w.code)}</span>}
          </span>
          {w ? (
            <span className="num mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <WindIcon className="size-3.5" aria-label="Wind" />
                {Math.round(w.wind_mph)} mph{w.gust_mph !== null && ` (gusts ${Math.round(w.gust_mph)})`}
              </span>
              <span className="inline-flex items-center gap-1">
                <CloudRainIcon className="size-3.5" aria-label="Rain" />
                {w.rain_in_hr.toFixed(2)} in/hr
              </span>
              <span className="inline-flex items-center gap-1">
                <SnowflakeIcon className="size-3.5" aria-label="Snow" />
                {w.snow_in_hr.toFixed(2)} in/hr
              </span>
              {w.temp_f !== null && (
                <span className="inline-flex items-center gap-1">
                  <ThermometerIcon className="size-3.5" aria-label="Temperature" />
                  {w.temp_f}°F
                </span>
              )}
            </span>
          ) : (
            <span className="mt-0.5 block text-xs text-muted-foreground">No forecast available</span>
          )}
        </span>
      </button>
    </li>
  )
}

/** Weather along the selected route as collapsible stretches (elevated ones open by default). */
export const RouteDetails = memo(function RouteDetails({ route }: { route: PlannedRoute }) {
  const cps = route.checkpoints
  const runs = useMemo(() => toRuns(cps), [cps])
  const focused = useUi((s) => (s.focused?.routeId === route.id ? s.focused.index : null))
  const [open, setOpen] = useState<Set<string>>(() => new Set(runs.filter((r) => (r.level ?? 0) >= 2).map((r) => r.key)))

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <section aria-label="Checkpoints" className="px-5 pt-4 pb-8">
      <p className="mb-1 text-[13px] font-semibold">Forecast at your ETA, stretch by stretch</p>
      <ol className="mt-2">
        {runs.map((run) => {
          const first = cps[run.from]!
          const last = cps[run.to]!
          const count = run.to - run.from + 1
          const expanded = open.has(run.key) || (focused !== null && focused >= run.from && focused <= run.to)
          const driver = worstDriver(cps, run)
          const sameDay = formatDay(first.eta) === formatDay(last.eta)
          return (
            <li key={run.key} className="run" style={{ ['--run-color' as string]: riskColor(run.level) }}>
              <button type="button" className="flex w-full items-start gap-2 rounded-xl py-2.5 pr-1 text-left hover:bg-accent/50" aria-expanded={expanded} onClick={() => toggle(run.key)}>
                <span className="run-dot" aria-hidden />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-medium" style={{ color: riskColor(run.level) }}>
                    {riskLabel(run.level)}
                    {run.level !== null && ' risk'}
                    <span className="num font-normal text-muted-foreground">
                      {' '}
                      · mile {formatInt(first.mile)}
                      {count > 1 && `–${formatInt(last.mile)}`}
                    </span>
                  </span>
                  <span className="num block text-xs text-muted-foreground">
                    {formatDay(first.eta)} {formatClock(first.eta)}
                    {count > 1 && ` – ${sameDay ? '' : `${formatDay(last.eta)} `}${formatClock(last.eta)}`} · {count} checkpoint{count > 1 ? 's' : ''}
                  </span>
                  {driver && <span className="mt-0.5 block text-xs font-medium text-foreground">{driver}</span>}
                </span>
                <CaretDownIcon className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {expanded && (
                <ul className="pb-2">
                  {cps.slice(run.from, run.to + 1).map((cp, k) => (
                    <CheckpointRow key={run.from + k} routeId={route.id} cp={cp} index={run.from + k} focused={focused === run.from + k} />
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
})
