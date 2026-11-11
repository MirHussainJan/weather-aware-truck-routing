export type LngLat = [number, number]

/** Decode a Google encoded polyline into [lon, lat] pairs (GeoJSON order). */
export function decodePolyline(encoded: string, precision = 5): LngLat[] {
  const factor = 10 ** precision
  const out: LngLat[] = []
  let index = 0
  let lat = 0
  let lon = 0
  while (index < encoded.length) {
    for (let axis = 0; axis < 2; axis++) {
      let shift = 0
      let result = 0
      let byte: number
      do {
        byte = encoded.charCodeAt(index++) - 63
        result |= (byte & 0x1f) << shift
        shift += 5
      } while (byte >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (axis === 0) lat += delta
      else lon += delta
    }
    out.push([lon / factor, lat / factor])
  }
  return out
}

const R_MI = 3958.7613
const RAD = Math.PI / 180

export function haversineMi([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const a = Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2
  return 2 * R_MI * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Cumulative distance per vertex, rescaled so the last value equals the route's true length. */
export function cumulativeMiles(coords: LngLat[], totalMi: number): Float64Array {
  const cum = new Float64Array(coords.length)
  for (let i = 1; i < coords.length; i++) cum[i] = cum[i - 1]! + haversineMi(coords[i - 1]!, coords[i]!)
  const scale = cum[cum.length - 1]! > 0 ? totalMi / cum[cum.length - 1]! : 1
  for (let i = 0; i < cum.length; i++) cum[i]! *= scale
  return cum
}

/** Binary search: largest i with arr[i] <= value. */
function lowerIndex(arr: ArrayLike<number>, value: number): number {
  let lo = 0
  let hi = arr.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (arr[mid]! <= value) lo = mid
    else hi = mid - 1
  }
  return lo
}

export function pointAtMile(coords: LngLat[], cum: Float64Array, mile: number): LngLat {
  if (mile <= 0) return coords[0]!
  if (mile >= cum[cum.length - 1]!) return coords[coords.length - 1]!
  const i = lowerIndex(cum, mile)
  const span = cum[i + 1]! - cum[i]!
  const t = span > 0 ? (mile - cum[i]!) / span : 0
  const [ax, ay] = coords[i]!
  const [bx, by] = coords[i + 1]!
  return [ax + (bx - ax) * t, ay + (by - ay) * t]
}

/** Initial compass bearing (degrees clockwise from north) from `a` to `b`. */
export function bearing([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const r = Math.PI / 180
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r)
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r)
  return ((Math.atan2(y, x) / r) + 360) % 360
}

/** Direction of travel at a mile marker, looking `ahead` miles down the road (smooths tiny zig-zags). */
export function headingAtMile(coords: LngLat[], cum: Float64Array, mile: number, ahead = 2): number {
  const end = cum[cum.length - 1]!
  const from = Math.min(Math.max(0, mile), Math.max(0, end - ahead))
  return bearing(pointAtMile(coords, cum, from), pointAtMile(coords, cum, Math.min(end, from + ahead)))
}

/** Where the truck is (in route miles) at a timestamp, interpolating checkpoint ETAs. */
export function mileAtTime(etas: Float64Array, miles: Float64Array, ts: number): number {
  const n = etas.length
  if (n === 0) return 0
  if (ts <= etas[0]!) return miles[0]!
  if (ts >= etas[n - 1]!) return miles[n - 1]!
  const i = lowerIndex(etas, ts)
  return miles[i]! + ((miles[i + 1]! - miles[i]!) * (ts - etas[i]!)) / Math.max(1, etas[i + 1]! - etas[i]!)
}

export function boundsOf(coords: Iterable<LngLat>): [LngLat, LngLat] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of coords) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ]
}
