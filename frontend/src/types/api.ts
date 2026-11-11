/** Mirrors the Django API contract (routing/services/planner.py). Times are unix seconds. */

export type RiskLevel = 0 | 1 | 2 | 3 | 4
export type Interval = 10 | 25 | 50

export interface Place {
  label: string
  /** Secondary line, e.g. the area resolved for "Your location". */
  detail?: string
  lat: number
  lon: number
  /** True when the place is the device's current location. */
  current?: boolean
}

export interface CheckpointWeather {
  wind_mph: number
  gust_mph: number | null
  rain_in_hr: number
  snow_in_hr: number
  temp_f: number | null
  code: number | null
}

export interface Checkpoint {
  mile: number
  lat: number
  lon: number
  eta: number
  span_mi: number
  /** [start, end] vertex indices into the decoded route geometry. */
  seg: [number, number]
  level: RiskLevel | null
  factors: { wind: RiskLevel; rain: RiskLevel; snow: RiskLevel } | null
  drivers: string[]
  weather: CheckpointWeather | null
}

export interface RouteStats {
  miles_by_level: [number, number, number, number, number]
  unknown_mi: number
  no_travel_mi: number
  severe_mi: number
  high_mi: number
  avg_risk: number
  max_level: RiskLevel | null
}

export interface PlannedRoute {
  id: string
  rank: number
  recommended: boolean
  provider: string
  /** Main roads, e.g. "I-80 and I-25 North" (may be empty). */
  via: string
  distance_mi: number
  duration_s: number
  arrival: number
  /** Encoded polyline, precision 5. */
  geometry: string
  checkpoints: Checkpoint[]
  stats: RouteStats
}

export type HeatmapMetric = 'risk' | 'wind' | 'rain' | 'snow'

export interface Heatmap {
  start: number
  step_s: number
  hours: number
  cell_deg: number
  cells: [number, number][] // [lon, lat]
  risk: (number | null)[][]
  wind: (number | null)[][] // mph
  rain: (number | null)[][] // hundredths of in/hr
  snow: (number | null)[][] // hundredths of in/hr
}

export interface PlanResponse {
  departure: number
  load_lb: number
  interval_mi: Interval
  routes: PlannedRoute[]
  recommendation: { route_id: string; comparisons: string[] }
  warnings: string[]
  heatmap: Heatmap
}

export interface PlanRequest {
  origin: { lat: number; lon: number }
  destination: { lat: number; lon: number }
  departure: string
  load_lb: number
  interval_mi: Interval
}
