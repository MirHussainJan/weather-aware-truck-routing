import { describe, expect, it } from 'vitest'
import { bearing, boundsOf, cumulativeMiles, decodePolyline, haversineMi, headingAtMile, mileAtTime, pointAtMile, type LngLat } from './geo'

describe('decodePolyline', () => {
  it('decodes the reference polyline into [lon, lat]', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ])
  })
})

describe('distance helpers', () => {
  const line: LngLat[] = [
    [-100, 40],
    [-99.5, 40],
    [-99, 40],
  ]

  it('haversine matches a known distance', () => {
    expect(haversineMi([-87.6298, 41.8781], [-104.9903, 39.7392])).toBeCloseTo(920, -1)
  })

  it('cumulative miles are rescaled to the true route length', () => {
    const cum = cumulativeMiles(line, 100)
    expect(cum[0]).toBe(0)
    expect(cum[2]).toBeCloseTo(100)
    expect(cum[1]).toBeCloseTo(50)
  })

  it('pointAtMile interpolates and clamps', () => {
    const cum = cumulativeMiles(line, 100)
    expect(pointAtMile(line, cum, 25)[0]).toBeCloseTo(-99.75)
    expect(pointAtMile(line, cum, -5)).toEqual(line[0])
    expect(pointAtMile(line, cum, 500)).toEqual(line[2])
  })

  it('mileAtTime interpolates between checkpoint ETAs', () => {
    const etas = Float64Array.from([0, 3600, 7200])
    const miles = Float64Array.from([0, 60, 100])
    expect(mileAtTime(etas, miles, 1800)).toBeCloseTo(30)
    expect(mileAtTime(etas, miles, 5400)).toBeCloseTo(80)
    expect(mileAtTime(etas, miles, 99999)).toBe(100)
  })

  it('boundsOf returns the bounding box', () => {
    expect(boundsOf(line)).toEqual([
      [-100, 40],
      [-99, 40],
    ])
  })
})

describe('bearing / headingAtMile', () => {
  it('gives compass bearings', () => {
    expect(bearing([0, 0], [0, 1])).toBeCloseTo(0, 5)
    expect(bearing([0, 0], [1, 0])).toBeCloseTo(90, 5)
    expect(bearing([0, 1], [0, 0])).toBeCloseTo(180, 5)
    expect(bearing([1, 0], [0, 0])).toBeCloseTo(270, 5)
  })
  it('follows the road and holds the last heading at the end', () => {
    const road: LngLat[] = [[-100, 40], [-99, 40], [-99, 41]]
    const cum = cumulativeMiles(road, haversineMi(road[0]!, road[1]!) + haversineMi(road[1]!, road[2]!))
    expect(headingAtMile(road, cum, 1)).toBeCloseTo(90, 0)
    expect(headingAtMile(road, cum, cum[2]!)).toBeCloseTo(0, 0)
  })
})
