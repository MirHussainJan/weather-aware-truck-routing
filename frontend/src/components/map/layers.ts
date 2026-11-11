import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { COLOR_RAMPS } from '../../lib/heatmap'
import { colorExpression, ICON_COLOR, ICON_PATHS, type WeatherIcon } from '../../lib/weatherScale'

export const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

export const SRC = { heat: 'heat', alts: 'alts', selected: 'selected', checkpoints: 'checkpoints', labels: 'labels' } as const
/** `selected` holds one LineString with line metrics, so it can carry a smooth `line-gradient`. */
export const LAYER = {
  heat: 'heat',
  altCasing: 'alt-casing',
  altLine: 'alt-line',
  altHit: 'alt-hit',
  selShadow: 'sel-shadow',
  selCasing: 'sel-casing',
  selLine: 'sel-line',
  checkpoints: 'checkpoints',
  checkpointsHit: 'checkpoints-hit',
  selHit: 'sel-hit',
  conditions: 'conditions',
  routeLabels: 'route-labels',
} as const

/** Layers whose colour follows the active weather layer (risk / wind / rain / snow). */
export const WEATHER_COLORED: [layer: string, prop: 'circle-stroke-color'][] = [[LAYER.checkpoints, 'circle-stroke-color']]

const ICON_PX = 30

/** Rasterise each Phosphor glyph into a dark round badge and register it as a map image. */
function registerConditionIcons(map: MlMap): void {
  const ratio = Math.min(window.devicePixelRatio || 1, 3)
  const size = Math.round(ICON_PX * ratio)
  for (const [name, d] of Object.entries(ICON_PATHS) as [WeatherIcon, string][]) {
    if (map.hasImage(`wx-${name}`)) continue
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    const r = size / 2
    ctx.beginPath()
    ctx.arc(r, r, r - ratio, 0, Math.PI * 2)
    ctx.fillStyle = '#18181b'
    ctx.fill()
    ctx.lineWidth = 1.5 * ratio
    ctx.strokeStyle = ICON_COLOR
    ctx.stroke()
    const glyph = size * 0.58
    ctx.translate(r - glyph / 2, r - glyph / 2)
    ctx.scale(glyph / 256, glyph / 256)
    ctx.fillStyle = ICON_COLOR
    ctx.fill(new Path2D(d))
    map.addImage(`wx-${name}`, ctx.getImageData(0, 0, size, size), { pixelRatio: ratio })
  }
}
const focus: ExpressionSpecification = ['boolean', ['feature-state', 'focus'], false]
const byZoom = (lo: number, hi: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 4, lo, 12, hi]
const round = { 'line-join': 'round', 'line-cap': 'round' } as const

/** Adds all sources/layers once. Data is swapped later with setData; styling via paint props. */
export function addLayers(map: MlMap): void {
  registerConditionIcons(map)
  // Weather sits under the basemap's labels so place names stay legible.
  const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
  for (const id of Object.values(SRC)) map.addSource(id, { type: 'geojson', data: EMPTY, lineMetrics: id === SRC.selected })

  map.addLayer(
    {
      id: LAYER.heat,
      type: 'heatmap',
      source: SRC.heat,
      maxzoom: 11,
      paint: {
        'heatmap-weight': 0,
        'heatmap-color': COLOR_RAMPS.risk,
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.9, 11, 0],
      },
    },
    firstSymbol,
  )

  // Alternatives: muted grey on a dark casing.
  map.addLayer({ id: LAYER.altCasing, type: 'line', source: SRC.alts, layout: round, paint: { 'line-color': '#0c0c0e', 'line-width': byZoom(6.5, 11) } })
  map.addLayer({ id: LAYER.altLine, type: 'line', source: SRC.alts, layout: round, paint: { 'line-color': '#6b6b74', 'line-width': byZoom(3.5, 6.5) } })
  map.addLayer({ id: LAYER.altHit, type: 'line', source: SRC.alts, paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 20 } })

  // Selected route: coloured by the active weather layer, with a soft glow and dark casing.
  map.addLayer({
    id: LAYER.selShadow,
    type: 'line',
    source: SRC.selected,
    layout: round,
    paint: { 'line-color': 'rgba(255,255,255,0.1)', 'line-width': byZoom(14, 22), 'line-blur': 8 },
  })
  map.addLayer({ id: LAYER.selCasing, type: 'line', source: SRC.selected, layout: round, paint: { 'line-color': '#0c0c0e', 'line-width': byZoom(8.5, 14) } })
  map.addLayer({
    id: LAYER.selLine,
    type: 'line',
    source: SRC.selected,
    layout: round,
    // Real colour comes from a per-route `line-gradient` set in MapView; this is a neutral placeholder.
    paint: { 'line-width': byZoom(5.5, 10), 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#a3e635', 1, '#a3e635'] },
  })

  map.addLayer({
    id: LAYER.checkpoints,
    type: 'circle',
    source: SRC.checkpoints,
    minzoom: 5,
    paint: {
      // `zoom` may only drive a top-level interpolate, so the focus case goes inside each stop.
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, ['case', focus, 8, 3], 12, ['case', focus, 11, 6]],
      'circle-color': '#0c0c0e',
      'circle-stroke-color': colorExpression('risk'),
      'circle-stroke-width': ['case', focus, 4, 2.5],
    },
  })

  // Invisible, generous touch targets (drawn on top) so points and the route are easy to click.
  map.addLayer({ id: LAYER.selHit, type: 'line', source: SRC.selected, paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 24 } })
  map.addLayer({
    id: LAYER.checkpointsHit,
    type: 'circle',
    source: SRC.checkpoints,
    paint: { 'circle-radius': 16, 'circle-opacity': 0, 'circle-stroke-width': 0 },
  })

  // Weather condition badges (rain / snow / wind / storm) floating above affected checkpoints.
  map.addLayer({
    id: LAYER.conditions,
    type: 'symbol',
    source: SRC.checkpoints,
    filter: ['!=', ['get', 'icon'], ''],
    layout: {
      'icon-image': ['concat', 'wx-', ['get', 'icon']],
      'icon-anchor': 'bottom',
      'icon-offset': [0, -5],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.75, 9, 1],
      'symbol-sort-key': ['get', 'sev'],
      'icon-padding': 4,
    },
  })

  // Plain-language labels along the highlighted route ("Heavy rain · 0.31 in/hr").
  map.addLayer({
    id: LAYER.routeLabels,
    type: 'symbol',
    source: SRC.labels,
    layout: {
      // Repeated along each stretch (like road names) so labels stay visible around callouts.
      'symbol-placement': 'line',
      'symbol-spacing': 280,
      'text-field': ['get', 'text'],
      'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 10, 13],
      'text-offset': [0, -1.25],
      'text-keep-upright': true,
      'text-max-angle': 35,
    },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#0c0c0e', 'text-halo-width': 2, 'text-halo-blur': 0.5 },
  })
}
