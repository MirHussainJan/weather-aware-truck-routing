import type { LngLat } from './geo'
import type { RouteModel } from './routeModel'

const SAMPLES = 160

function sample(coords: LngLat[], from = 0, to = coords.length): LngLat[] {
  const step = Math.max(1, Math.floor((to - from) / SAMPLES))
  const out: LngLat[] = []
  for (let i = from; i < to; i += step) out.push(coords[i]!)
  return out
}

/**
 * Where to pin a route's duration callout: the point (within the middle 70% of the route) that is
 * farthest from every other route, so callouts sit on the part of the route that is distinct —
 * the same placement Google Maps uses for alternative-route bubbles.
 */
export function calloutAnchor(route: RouteModel, others: RouteModel[], placed: LngLat[] = []): LngLat {
  const c = route.coords
  const candidates = sample(c, Math.floor(c.length * 0.15), Math.ceil(c.length * 0.85))
  const midLat = (c[0]![1] + c[c.length - 1]![1]) / 2
  const kx = Math.cos((midLat * Math.PI) / 180)
  // Already-placed callouts repel too, so bubbles on overlapping routes don't stack.
  const rivals = [...others.flatMap((o) => sample(o.coords)), ...placed]
  if (!rivals.length || !candidates.length) return c[Math.floor(c.length / 2)]!

  let best = candidates[0]!
  let bestD = -1
  for (const p of candidates) {
    let nearest = Infinity
    for (const q of rivals) {
      const dx = (p[0] - q[0]) * kx
      const dy = p[1] - q[1]
      const d = dx * dx + dy * dy
      if (d < nearest) nearest = d
    }
    if (nearest > bestD) {
      bestD = nearest
      best = p
    }
  }
  return best
}
