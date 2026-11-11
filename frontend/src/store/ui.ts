import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { HeatmapMetric, Interval, Place } from '../types/api'

export type DepartMode = 'now' | 'at'

export interface FocusedCheckpoint {
  routeId: string
  index: number
  /** Pan the map to it (list clicks) or not (map clicks). */
  fly: boolean
  /** Bumped on every request so re-selecting the same checkpoint re-centres the map. */
  nonce: number
}

interface UiState {
  // Trip inputs (validated + debounced into a Trip by useTrip)
  origin: Place | null
  destination: Place | null
  departMode: DepartMode
  /** "Leave now" timestamp (ms), refreshed whenever the trip inputs change. */
  nowTs: number
  /** <input type="datetime-local"> value for "Depart at". */
  departAt: string
  loadLb: number | null

  // View state
  interval: Interval
  selectedRouteId: string | null
  /** Hours after departure (continuous; the heatmap shows the nearest hourly frame). */
  hour: number
  /** Timeline span: the journey itself, or the full 0–48 h forecast horizon. */
  timelineRange: 'trip' | 'forecast'
  metric: HeatmapMetric
  heatmapVisible: boolean
  playing: boolean
  focused: FocusedCheckpoint | null
  /** "Weather along route" drawer. */
  detailsOpen: boolean

  setOrigin: (place: Place | null) => void
  setDestination: (place: Place | null) => void
  swapPlaces: () => void
  setDepartMode: (mode: DepartMode) => void
  setDepartAt: (value: string) => void
  setLoadLb: (lb: number | null) => void
  setInterval: (interval: Interval) => void
  selectRoute: (id: string) => void
  setHour: (hour: number) => void
  setTimelineRange: (range: 'trip' | 'forecast') => void
  setMetric: (metric: HeatmapMetric) => void
  toggleHeatmap: () => void
  setPlaying: (playing: boolean) => void
  focusCheckpoint: (routeId: string, index: number, fly: boolean) => void
  clearFocus: () => void
  setDetailsOpen: (open: boolean) => void
}

/** Client/UI state only. Server state (plans, geocoding) lives in TanStack Query. */
export const useUi = create<UiState>()(
  subscribeWithSelector((set) => {
    // "Leave now" means now *at the moment the trip was defined*, so it stays a stable query key.
    const touch = (patch: Partial<UiState>) => set((s) => ({ ...patch, nowTs: s.departMode === 'now' ? Date.now() : s.nowTs }))
    return {
      origin: null,
      destination: null,
      departMode: 'now',
      nowTs: Date.now(),
      departAt: '',
      loadLb: 40_000,

      interval: 25,
      selectedRouteId: null,
      hour: 0,
      timelineRange: 'trip',
      metric: 'risk',
      heatmapVisible: true,
      playing: false,
      focused: null,
      detailsOpen: false,

      setOrigin: (origin) => touch({ origin }),
      setDestination: (destination) => touch({ destination }),
      swapPlaces: () => set((s) => ({ origin: s.destination, destination: s.origin, nowTs: s.departMode === 'now' ? Date.now() : s.nowTs })),
      setDepartMode: (departMode) => set({ departMode, nowTs: Date.now() }),
      setDepartAt: (departAt) => set({ departAt }),
      setLoadLb: (loadLb) => touch({ loadLb }),
      setInterval: (interval) => set({ interval, focused: null }),
      selectRoute: (selectedRouteId) => set({ selectedRouteId, focused: null }),
      setHour: (hour) => set({ hour }),
      setTimelineRange: (timelineRange) => set({ timelineRange }),
      setMetric: (metric) => set({ metric }),
      toggleHeatmap: () => set((s) => ({ heatmapVisible: !s.heatmapVisible })),
      setPlaying: (playing) => set({ playing }),
      focusCheckpoint: (routeId, index, fly) =>
        set((s) => ({ selectedRouteId: routeId, focused: { routeId, index, fly, nonce: (s.focused?.nonce ?? 0) + 1 } })),
      clearFocus: () => set({ focused: null }),
      setDetailsOpen: (detailsOpen) => set({ detailsOpen }),
    }
  }),
)
