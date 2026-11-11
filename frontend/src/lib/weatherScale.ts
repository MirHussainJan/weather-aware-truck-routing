import type { ExpressionSpecification } from 'maplibre-gl'
import type { Checkpoint, HeatmapMetric, PlannedRoute } from '../types/api'
import { RISK_COLORS, UNKNOWN_COLOR } from './risk'
import type { RouteModel } from './routeModel'

/**
 * Colour scales for painting weather *on the route*. One definition drives the MapLibre line
 * gradient, the checkpoint dots and the DOM condition strip, so map and UI always agree.
 * Every layer uses the same green → yellow → orange → red scale: yellow and warmer always means
 * the brief's Moderate threshold or worse for that factor.
 */
type Stop = readonly [value: number, color: string]
export type WeatherMetric = Exclude<HeatmapMetric, 'risk'>

export const SCALES: Record<WeatherMetric, { label: string; unit: string }> = {
  wind: { label: 'Wind', unit: 'mph' },
  rain: { label: 'Rain', unit: 'in/hr' },
  snow: { label: 'Snow', unit: 'in/hr' },
}

/**
 * The one colour scale used everywhere — risk *and* each weather layer — on a 0–4 severity axis
 * (0 Low · 1 Moderate · 2 High · 3 Severe · 4 No Travel): green = OK … red = not OK.
 * The Low band runs dark green → lime so variation still reads on calm days.
 */
export const SEVERITY_STOPS: readonly Stop[] = [
  [0, '#16a34a'],
  [0.6, '#84cc16'],
  [1, RISK_COLORS[1]],
  [2, RISK_COLORS[2]],
  [3, RISK_COLORS[3]],
  [4, RISK_COLORS[4]],
]

/** The brief's band edges per factor: Low | Moderate | High | Severe | No Travel. */
const RISK_BREAKS: Record<WeatherMetric, readonly number[]> = {
  wind: [0, 25, 35, 45, 55],
  rain: [0, 0.1, 0.25, 0.5, 1],
  snow: [0, 0.5, 1, 2, 3],
}

/** How far a reading is through the risk bands, 0–4 (e.g. 30 mph wind = 1.5, mid-Moderate). */
function bandPosition(value: number, breaks: readonly number[]): number {
  for (let i = 1; i < breaks.length; i++) {
    if (value < breaks[i]!) return i - 1 + (value - breaks[i - 1]!) / (breaks[i]! - breaks[i - 1]!)
  }
  return breaks.length - 1
}

/**
 * Continuous risk score 0–4. It never leaves the checkpoint's classified band (so colour and the
 * rules always agree, including load-rule escalations), but shows how close it is to the next one.
 */
export function riskScore(cp: Checkpoint): number | null {
  if (cp.level === null) return null
  const w = cp.weather
  if (!w) return cp.level
  const raw = Math.max(
    bandPosition(w.wind_mph, RISK_BREAKS.wind),
    bandPosition(w.rain_in_hr, RISK_BREAKS.rain),
    bandPosition(w.snow_in_hr, RISK_BREAKS.snow),
  )
  return Math.min(Math.max(raw, cp.level), cp.level + 0.999)
}

/** The checkpoint's band value for a layer: risk level 0–4, or the raw weather reading; null = no data. */
export function metricValue(cp: Checkpoint, metric: HeatmapMetric): number | null {
  if (metric === 'risk') return cp.level
  const w = cp.weather
  if (!w) return null
  return metric === 'wind' ? w.wind_mph : metric === 'rain' ? w.rain_in_hr : w.snow_in_hr
}

/**
 * Severity 0–4 for colouring: the continuous risk score, or — for a weather layer — how far that
 * reading is through its own risk bands (rain 0.30 in/hr → 2.2, i.e. early High).
 */
export function metricIntensity(cp: Checkpoint, metric: HeatmapMetric): number | null {
  if (metric === 'risk') return riskScore(cp)
  const v = metricValue(cp, metric)
  if (v === null) return null
  const pos = bandPosition(v, RISK_BREAKS[metric])
  // Rain/snow No Travel is strictly above the top threshold (exactly 1.00 in/hr rain is Severe).
  return metric !== 'wind' && v === RISK_BREAKS[metric][4] ? 3.999 : pos
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `rgb(${mix(r1, r2)},${mix(g1, g2)},${mix(b1, b2)})`
}

/** Same interpolation MapLibre performs for `interpolate linear` over the stops. */
function colorAt(stops: readonly Stop[], value: number): string {
  if (value <= stops[0]![0]) return stops[0]![1]
  for (let i = 1; i < stops.length; i++) {
    const [v1, c1] = stops[i]!
    const [v0, c0] = stops[i - 1]!
    if (value === v1) return c1
    if (value < v1) return lerpColor(c0, c1, (value - v0) / (v1 - v0))
  }
  return stops[stops.length - 1]![1]
}

export function severityColor(severity: number): string {
  return colorAt(SEVERITY_STOPS, severity)
}

export function checkpointColor(cp: Checkpoint, metric: HeatmapMetric): string {
  const v = metricIntensity(cp, metric)
  return v === null ? UNKNOWN_COLOR : severityColor(v)
}

/** Checkpoint dot colour: precomputed per layer on each feature (`col_risk`, `col_wind`, …). */
export function colorExpression(metric: HeatmapMetric): ExpressionSpecification {
  return ['get', `col_${metric}`]
}

/**
 * MapLibre `line-gradient` for the highlighted route: one colour stop at the middle of each
 * checkpoint's stretch, positioned by projected length (what `line-progress` measures).
 */
export function lineGradient(model: RouteModel, metric: HeatmapMetric): ExpressionSpecification {
  const stops: (number | string)[] = []
  let last = -1
  for (const cp of model.route.checkpoints) {
    const at = (model.progress[cp.seg[0]]! + model.progress[cp.seg[1]]!) / 2
    if (at <= last + 1e-6) continue
    stops.push(at, checkpointColor(cp, metric))
    last = at
  }
  const first = stops[1] as string | undefined
  const end = stops[stops.length - 1] as string | undefined
  if (!first || !end) return ['interpolate', ['linear'], ['line-progress'], 0, UNKNOWN_COLOR, 1, UNKNOWN_COLOR]
  if ((stops[0] as number) > 0) stops.unshift(0, first)
  if (last < 1) stops.push(1, end)
  return ['interpolate', ['linear'], ['line-progress'], ...stops] as ExpressionSpecification
}

/** Colour of the timeline after the truck has arrived (forecast continues, no route conditions). */
export const AFTER_ARRIVAL_COLOR = '#2f2f35'

/**
 * CSS gradient for the 0–N hour timeline: each checkpoint's colour sits at the time the truck
 * passes it; after arrival the bar turns neutral (the heatmap forecast still runs to N hours).
 */
export function timeGradient(route: PlannedRoute, departure: number, hours: number, metric: HeatmapMetric): string {
  const span = hours * 3600
  const pct = (ts: number) => Math.min(100, Math.max(0, ((ts - departure) / span) * 100)).toFixed(2)
  const stops = route.checkpoints.map((cp) => `${checkpointColor(cp, metric)} ${pct(cp.eta)}%`)
  if (route.arrival - departure < span) stops.push(`${AFTER_ARRIVAL_COLOR} ${pct(route.arrival)}%`, `${AFTER_ARRIVAL_COLOR} 100%`)
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

// --- Condition icons on the route ----------------------------------------------------------

export type WeatherIcon = 'storm' | 'snow' | 'rain' | 'wind'

/** Most significant condition at a checkpoint (worth an icon), or '' when conditions are calm. */
export function conditionIcon(cp: Checkpoint): WeatherIcon | '' {
  const w = cp.weather
  if (!w) return ''
  if (w.code !== null && w.code >= 95) return 'storm'
  if (w.snow_in_hr >= 0.05) return 'snow'
  if (w.rain_in_hr >= 0.02) return 'rain'
  if (w.wind_mph >= 25) return 'wind'
  return ''
}

/** Badges are neutral: the route colour alone carries severity. */
export const ICON_COLOR = '#f4f4f5'

/** Phosphor (bold weight, 256 viewBox) glyphs, rasterised into MapLibre images at runtime. */
export const ICON_PATHS: Record<WeatherIcon, string> = {
  rain: 'M156,12A80.22,80.22,0,0,0,82.39,60.36,56.76,56.76,0,0,0,76,60a56,56,0,0,0,0,112h29.58L86,201.34a12,12,0,1,0,20,13.32L134.42,172H156a80,80,0,0,0,0-160Zm0,136H76a32,32,0,0,1,0-64h.28c-.11,1.1-.2,2.2-.26,3.3a12,12,0,1,0,24,1.39A56.06,56.06,0,1,1,156,148Zm.65,58.66-26.67,40a12,12,0,1,1-20-13.32l26.66-40a12,12,0,1,1,20,13.32Z',
  snow: 'M227.65,149.14a12,12,0,0,1-8.79,14.51l-20.67,5.08,5.4,20.16a12,12,0,0,1-23.18,6.22l-7.29-27.2L140,148.78V187l20.48,20.48a12,12,0,0,1-17,17L128,209l-15.51,15.52a12,12,0,0,1-17-17L116,187V148.78L82.88,167.91l-7.29,27.2a12,12,0,0,1-23.18-6.22l5.4-20.16-20.67-5.08a12,12,0,1,1,5.72-23.3l27.89,6.85L104,128,70.75,108.8l-27.89,6.85A11.8,11.8,0,0,1,40,116a12,12,0,0,1-2.85-23.65l20.67-5.08-5.4-20.16a12,12,0,0,1,23.18-6.22l7.29,27.2L116,107.21V69L95.52,48.48a12,12,0,0,1,17-17L128,47l15.51-15.52a12,12,0,1,1,17,17L140,69v38.24l33.12-19.12,7.29-27.2a12,12,0,0,1,23.18,6.22l-5.4,20.16,20.67,5.08A12,12,0,0,1,216,116a11.8,11.8,0,0,1-2.87-.35l-27.89-6.85L152,128l33.25,19.2,27.89-6.85A12,12,0,0,1,227.65,149.14Z',
  wind: 'M24,104a12,12,0,0,1,0-24h96a12,12,0,0,0,0-24,15.07,15.07,0,0,0-10.26,4.45,12,12,0,0,1-17-16.9A39.34,39.34,0,0,1,120,32a36,36,0,0,1,0,72ZM208,68a39.34,39.34,0,0,0-27.3,11.55,12,12,0,0,0,17,16.9A15.07,15.07,0,0,1,208,92a12,12,0,0,1,0,24H32a12,12,0,0,0,0,24H208a36,36,0,0,0,0-72Zm-56,84H40a12,12,0,0,0,0,24H152a12,12,0,0,1,0,24,15.11,15.11,0,0,1-10.27-4.45,12,12,0,1,0-17,16.9A39.34,39.34,0,0,0,152,224a36,36,0,0,0,0-72Z',
  storm: 'M156,12A80.22,80.22,0,0,0,82.39,60.36,56.76,56.76,0,0,0,76,60a56,56,0,0,0,0,112h30.81l-13.1,21.82A12,12,0,0,0,104,212h18.81l-13.1,21.82a12,12,0,1,0,20.58,12.35l24-40A12,12,0,0,0,144,188H125.19l9.6-16H156a80,80,0,0,0,0-160Zm0,136H76a32,32,0,0,1,0-64h.28c-.11,1.1-.2,2.2-.26,3.3a12,12,0,1,0,24,1.39A56.06,56.06,0,1,1,156,148Z',
}
