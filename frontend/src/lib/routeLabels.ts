import type { Feature, FeatureCollection, LineString } from 'geojson'
import type { Checkpoint, HeatmapMetric } from '../types/api'
import type { RouteModel } from './routeModel'
import { checkpointColor, metricValue, SCALES, type WeatherMetric } from './weatherScale'

/**
 * Plain-language bands for each layer, so the route can be labelled in words ("Heavy rain")
 * instead of relying on a colour key. Thresholds match the colour-scale stops / risk bands.
 */
const BANDS: Record<WeatherMetric, { limits: number[]; names: string[] }> = {
  wind: { limits: [15, 25, 35, 45, 55], names: ['Calm', 'Breezy', 'Windy', 'Strong wind', 'Severe wind', 'Extreme wind'] },
  rain: { limits: [0.01, 0.1, 0.25, 0.5, 1.0001], names: ['Dry', 'Light rain', 'Moderate rain', 'Heavy rain', 'Very heavy rain', 'Extreme rain'] },
  snow: { limits: [0.05, 0.5, 1, 2, 3.0001], names: ['No snow', 'Light snow', 'Moderate snow', 'Heavy snow', 'Very heavy snow', 'Extreme snow'] },
}
const RISK_NAMES = ['Low risk', 'Moderate risk', 'High risk', 'Severe risk', 'No travel']

/** Band index for a checkpoint (-1 = no forecast). */
export function bandOf(cp: Checkpoint, metric: HeatmapMetric): number {
  const v = metricValue(cp, metric)
  if (v === null) return -1
  if (metric === 'risk') return v
  const i = BANDS[metric].limits.findIndex((limit) => v < limit)
  return i === -1 ? BANDS[metric].limits.length : i
}

export function bandName(metric: HeatmapMetric, band: number): string {
  if (band < 0) return 'No forecast'
  return metric === 'risk' ? RISK_NAMES[band]! : BANDS[metric].names[band]!
}

function formatValue(metric: WeatherMetric, v: number): string {
  return metric === 'wind' ? `${Math.round(v)} ${SCALES.wind.unit}` : `${v.toFixed(2)} ${SCALES[metric].unit}`
}

/**
 * One labelled line per run of consecutive checkpoints in the same band, e.g. "Heavy rain · 0.31 in/hr".
 * Calm bands get the name only; the value shown is the run's peak, the number that matters for safety.
 */
export function routeLabels(model: RouteModel, metric: HeatmapMetric): FeatureCollection<LineString, { text: string; color: string }> {
  const cps = model.route.checkpoints
  const features: Feature<LineString, { text: string; color: string }>[] = []
  let start = 0
  for (let k = 1; k <= cps.length; k++) {
    if (k < cps.length && bandOf(cps[k]!, metric) === bandOf(cps[start]!, metric)) continue
    const run = cps.slice(start, k)
    const band = bandOf(run[0]!, metric)
    let peak = run[0]!
    for (const cp of run) if ((metricValue(cp, metric) ?? -1) > (metricValue(peak, metric) ?? -1)) peak = cp
    const peakValue = metricValue(peak, metric)
    const text =
      metric === 'risk' || band <= 0 || peakValue === null ? bandName(metric, band) : `${bandName(metric, band)} · ${formatValue(metric, peakValue)}`
    const from = run[0]!.seg[0]
    const to = run[run.length - 1]!.seg[1]
    if (to > from) {
      features.push({
        type: 'Feature',
        properties: { text, color: checkpointColor(peak, metric) },
        geometry: { type: 'LineString', coordinates: model.coords.slice(from, to + 1) },
      })
    }
    start = k
  }
  return { type: 'FeatureCollection', features }
}
