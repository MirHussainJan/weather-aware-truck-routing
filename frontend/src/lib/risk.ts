import type { RiskLevel, RouteStats } from '../types/api'
import { formatInt } from './format'

export const RISK_LABELS = ['Low', 'Moderate', 'High', 'Severe', 'No Travel'] as const
// One scale for everything: green = OK → yellow → orange → red = not OK; deep red = No Travel.
export const RISK_COLORS = ['#22c55e', '#facc15', '#f97316', '#ef4444', '#b91c1c'] as const
export const UNKNOWN_COLOR = '#71717a'

export function riskLabel(level: RiskLevel | null): string {
  return level === null ? 'No data' : RISK_LABELS[level]
}

export function riskColor(level: RiskLevel | null): string {
  return level === null ? UNKNOWN_COLOR : RISK_COLORS[level]
}

/** WMO weather interpretation codes (Open-Meteo), condensed. */
export function weatherText(code: number | null): string {
  if (code === null) return '—'
  if (code === 0) return 'Clear'
  if (code <= 3) return 'Partly cloudy'
  if (code <= 48) return 'Fog'
  if (code <= 57) return 'Drizzle'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Rain showers'
  if (code <= 86) return 'Snow showers'
  return 'Thunderstorm'
}

/** "20 mi High · 10 mi Moderate", worst first; or an all-clear message. */
export function riskSummary(stats: RouteStats): { text: string; color: string } {
  const parts: string[] = []
  let worst = 0
  for (let lvl = 4; lvl >= 1; lvl--) {
    const mi = stats.miles_by_level[lvl]!
    if (mi >= 0.5) {
      parts.push(`${formatInt(mi)} mi ${RISK_LABELS[lvl]}`)
      worst = Math.max(worst, lvl)
    }
  }
  if (stats.unknown_mi >= 0.5) parts.push(`${formatInt(stats.unknown_mi)} mi no forecast`)
  return parts.length
    ? { text: parts.join(' · '), color: RISK_COLORS[worst as RiskLevel] }
    : { text: 'Low weather risk the whole way', color: RISK_COLORS[0] }
}

/** 0–100: share of the maximum possible average risk (4 = No Travel everywhere) avoided. */
export function safetyScore(avgRisk: number): number {
  return Math.round(100 * (1 - avgRisk / 4))
}
