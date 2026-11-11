import type { Place } from '../types/api'
import { api } from './api'

export class LocationError extends Error {}

const MESSAGES: Record<number, string> = {
  1: 'Location access is blocked. Allow it in your browser’s site settings and try again.',
  2: 'Your location is unavailable right now. Check that location services are on.',
  3: 'Finding your location took too long. Please try again.',
}

/** The device's position via the browser Geolocation API (requires HTTPS or localhost). */
export function locate(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new LocationError('This browser can’t share your location.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(new LocationError(MESSAGES[err.code] ?? 'Couldn’t get your location.')),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    )
  })
}

/** Current location as a Place, labelled with the nearby area when reverse geocoding succeeds. */
export async function currentPlace(): Promise<Place> {
  const { lat, lon } = await locate()
  const area = await api.reverse(lat, lon).catch(() => '')
  return { label: 'Your location', detail: area || `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon, current: true }
}
