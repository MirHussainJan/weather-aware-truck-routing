const dayTimeFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const clockFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const numFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })

export const formatTime = (unix: number) => dayTimeFmt.format(unix * 1000)
export const formatClock = (unix: number) => clockFmt.format(unix * 1000)
export const formatDay = (unix: number) => dayFmt.format(unix * 1000)
export const formatInt = (n: number) => numFmt.format(n)

/** Google-Maps-style duration: "8 hr 28 min", "45 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h} hr ${m} min` : `${h} hr`
}

/** Compact duration for cards and summaries: "8h 26m", "45m". */
export function formatDurationShort(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m}m`
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`
}

/** Value for <input type="datetime-local"> in the user's local timezone. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const departFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
/** Planned departure: "Fri, Nov 13, 7:00 PM" in the user's locale. */
export const formatDeparture = (d: Date) => departFmt.format(d)

/** Short place name for compact UI: the first part of the label, or "Your location". */
export const placeName = (p: { label: string; current?: boolean } | null) => (p ? (p.current ? 'Your location' : p.label.split(', ')[0]!) : '—')
