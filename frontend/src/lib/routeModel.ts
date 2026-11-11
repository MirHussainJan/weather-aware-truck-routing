import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { PlannedRoute } from '../types/api'
import { cumulativeMiles, decodePolyline, type LngLat } from './geo'
import { checkpointColor, conditionIcon, type WeatherIcon } from './weatherScale'

/** Per-layer colours carried by checkpoint features (same severity scale for every layer). */
export interface WeatherProps {
  level: number
  col_risk: string
  col_wind: string
  col_rain: string
  col_snow: string
}

export interface RouteModel {
  route: PlannedRoute
  coords: LngLat[]
  cum: Float64Array
  /** Share of the line's projected (Web Mercator) length at each vertex — what `line-progress` measures. */
  progress: Float64Array
  etas: Float64Array
  miles: Float64Array
  line: Feature<LineString, { id: string }>
  checkpoints: FeatureCollection<Point, WeatherProps & { r: string; i: number; icon: WeatherIcon | ''; sev: number }>
}

const cache = new WeakMap<PlannedRoute, RouteModel>()

function projectedProgress(coords: LngLat[]): Float64Array {
  const out = new Float64Array(coords.length)
  const merc = ([lon, lat]: LngLat): [number, number] => [(lon * Math.PI) / 180, Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))]
  let prev = merc(coords[0]!)
  for (let i = 1; i < coords.length; i++) {
    const p = merc(coords[i]!)
    out[i] = out[i - 1]! + Math.hypot(p[0] - prev[0], p[1] - prev[1])
    prev = p
  }
  const total = out[out.length - 1]! || 1
  for (let i = 0; i < out.length; i++) out[i]! /= total
  return out
}

/** Derived, render-ready geometry for a route; computed once per API response object. */
export function routeModel(route: PlannedRoute): RouteModel {
  const hit = cache.get(route)
  if (hit) return hit

  const coords = decodePolyline(route.geometry, 5)
  const cps = route.checkpoints
  const model: RouteModel = {
    route,
    coords,
    cum: cumulativeMiles(coords, route.distance_mi),
    progress: projectedProgress(coords),
    etas: Float64Array.from(cps, (c) => c.eta),
    miles: Float64Array.from(cps, (c) => c.mile),
    line: { type: 'Feature', properties: { id: route.id }, geometry: { type: 'LineString', coordinates: coords } },
    checkpoints: {
      type: 'FeatureCollection',
      features: cps.map((c, i) => {
        return {
          type: 'Feature',
          id: i,
          properties: {
            r: route.id,
            i,
            icon: conditionIcon(c),
            // `sev` orders icons so the most significant condition wins when labels collide.
            sev: -(c.level ?? 0),
            level: c.level ?? -1,
            col_risk: checkpointColor(c, 'risk'),
            col_wind: checkpointColor(c, 'wind'),
            col_rain: checkpointColor(c, 'rain'),
            col_snow: checkpointColor(c, 'snow'),
          },
          geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
        }
      }),
    },
  }
  cache.set(route, model)
  return model
}
