import type { ExpressionSpecification } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import type { Heatmap, HeatmapMetric } from '../types/api'

const PREFIX: Record<HeatmapMetric, string> = { risk: 'r', wind: 'w', rain: 'p', snow: 's' }

/**
 * One feature per corridor cell holding every hour's values as properties (r0..r48, w0..).
 * The slider then only swaps the layer's weight expression: no data re-upload, no re-tiling.
 */
export function heatmapGeoJSON(hm: Heatmap): FeatureCollection<Point> {
  const series = { r: hm.risk, w: hm.wind, p: hm.rain, s: hm.snow }
  return {
    type: 'FeatureCollection',
    features: hm.cells.map((cell, i) => {
      const properties: Record<string, number> = {}
      for (const [prefix, rows] of Object.entries(series)) {
        const row = rows[i]!
        for (let h = 0; h < row.length; h++) {
          const v = row[h]
          if (v !== null && v !== undefined) properties[prefix + h] = v
        }
      }
      return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: cell } }
    }),
  }
}

/** Heatmap weight in [0, 1] for a metric at a forecast hour. */
export function weightExpression(metric: HeatmapMetric, hour: number): ExpressionSpecification {
  // Frames are hourly while the timeline moves in 15-minute steps: show the nearest hour.
  const value: ExpressionSpecification = ['get', PREFIX[metric] + Math.max(0, Math.round(hour))]
  switch (metric) {
    case 'risk': // Low still tints the corridor faintly so coverage is visible
      return ['match', ['coalesce', value, -1], 0, 0.08, 1, 0.3, 2, 0.55, 3, 0.8, 4, 1, 0]
    case 'wind': // mph
      return ['interpolate', ['linear'], ['coalesce', value, 0], 10, 0, 25, 0.3, 35, 0.55, 45, 0.8, 55, 1]
    case 'rain': // hundredths in/hr, same breakpoints as the risk bands
      return ['interpolate', ['linear'], ['coalesce', value, 0], 1, 0, 10, 0.3, 25, 0.55, 50, 0.8, 100, 1]
    case 'snow':
      return ['interpolate', ['linear'], ['coalesce', value, 0], 5, 0, 50, 0.3, 100, 0.55, 200, 0.8, 300, 1]
  }
}

const RISK_RAMP: ExpressionSpecification = [
  'interpolate', ['linear'], ['heatmap-density'],
  0, 'rgba(34,197,94,0)',
  0.08, 'rgba(34,197,94,0.07)',
  0.3, 'rgba(250,204,21,0.42)',
  0.55, 'rgba(249,115,22,0.55)',
  0.8, 'rgba(239,68,68,0.6)',
  1, 'rgba(185,28,28,0.72)',
]

/**
 * Same green → red ramp for every layer: each metric's weight is mapped onto its risk bands
 * (0.3 ≈ Moderate, 0.55 ≈ High, 0.8 ≈ Severe, 1 = No Travel), so a colour means the same thing.
 */
export const COLOR_RAMPS: Record<HeatmapMetric, ExpressionSpecification> = {
  risk: RISK_RAMP,
  wind: RISK_RAMP,
  rain: RISK_RAMP,
  snow: RISK_RAMP,
}

/**
 * Kernel radius and intensity that turn a regular lat/lon lattice into a smooth field whose
 * interior density ≈ the per-cell weight. MapLibre's kernel is a Gaussian with sigma = radius / 3
 * and peak 1/sqrt(2π); summed over a lattice with spacing (sx, sy) that is ≈ 2πσ²/(sx·sy).
 * Everything scales with 2^zoom, so the zoom-0 values plus an exponential base-2 ramp suffice.
 */
export function kernelFor(cellDeg: number, midLat: number) {
  const pxPerDeg0 = 512 / 360
  const sx = cellDeg * pxPerDeg0
  const sy = sx / Math.max(0.2, Math.cos((midLat * Math.PI) / 180))
  const radius0 = 1.5 * sy
  const sigma = radius0 / 3
  const latticeSum = (2 * Math.PI * sigma * sigma) / (sx * sy)
  const intensity = 1 / (0.3989 * latticeSum)
  const radius: ExpressionSpecification = ['interpolate', ['exponential', 2], ['zoom'], 0, radius0, 16, radius0 * 2 ** 16]
  return { radius, intensity }
}
