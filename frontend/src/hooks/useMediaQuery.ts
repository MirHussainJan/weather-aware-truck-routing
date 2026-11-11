import { useSyncExternalStore } from 'react'

/** Live `matchMedia` result; read synchronously, so the first paint already uses the right layout. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

/** Tailwind's `lg` breakpoint: side-by-side layout above it, stacked mobile layout below. */
export const DESKTOP_QUERY = '(min-width: 1024px)'
