import { describe, expect, it } from 'vitest'
import { calloutAnchor } from './callouts'
import type { RouteModel } from './routeModel'

const model = (coords: [number, number][]) => ({ coords }) as unknown as RouteModel

describe('calloutAnchor', () => {
  // Two routes share their ends but diverge in the middle (one goes north).
  const straight = model(Array.from({ length: 21 }, (_, i) => [i, 0] as [number, number]))
  const detour = model(Array.from({ length: 21 }, (_, i) => [i, i > 5 && i < 15 ? 3 : 0] as [number, number]))

  it('pins the bubble where the route is farthest from the others', () => {
    const [, lat] = calloutAnchor(detour, [straight])
    expect(lat).toBe(3)
  })

  it('falls back to the midpoint when there are no other routes', () => {
    expect(calloutAnchor(straight, [])).toEqual([10, 0])
  })
})
