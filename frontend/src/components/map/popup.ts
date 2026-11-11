import { formatTime } from '../../lib/format'
import { riskColor, riskLabel, weatherText } from '../../lib/risk'
import type { Checkpoint } from '../../types/api'

/** Popup body built with DOM APIs (textContent only — never innerHTML). */
export function checkpointPopup(routeId: string, cp: Checkpoint): HTMLElement {
  const root = document.createElement('div')
  root.className = 'cp-popup'

  const head = document.createElement('div')
  head.className = 'cp-popup__head'
  const badge = document.createElement('span')
  badge.className = 'cp-popup__badge'
  badge.style.background = riskColor(cp.level)
  badge.textContent = riskLabel(cp.level)
  const title = document.createElement('strong')
  title.textContent = `Route ${routeId} · mile ${Math.round(cp.mile)}`
  head.append(title, badge)
  root.append(head)

  const rows: [string, string][] = [['ETA', formatTime(cp.eta)]]
  const w = cp.weather
  if (w) {
    rows.push(
      ['Conditions', weatherText(w.code) + (w.temp_f === null ? '' : `, ${w.temp_f}°F`)],
      ['Wind', `${Math.round(w.wind_mph)} mph` + (w.gust_mph === null ? '' : ` (gusts ${Math.round(w.gust_mph)})`)],
      ['Rain', `${w.rain_in_hr.toFixed(2)} in/hr`],
      ['Snow', `${w.snow_in_hr.toFixed(2)} in/hr`],
    )
  } else {
    rows.push(['Weather', 'No forecast available'])
  }
  const dl = document.createElement('dl')
  for (const [k, v] of rows) {
    const dt = document.createElement('dt')
    dt.textContent = k
    const dd = document.createElement('dd')
    dd.textContent = v
    dl.append(dt, dd)
  }
  root.append(dl)

  if (cp.drivers.length) {
    const why = document.createElement('p')
    why.className = 'cp-popup__why'
    why.textContent = cp.drivers.join(' · ')
    root.append(why)
  }
  return root
}
