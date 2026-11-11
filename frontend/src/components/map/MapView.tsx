import { GpsFixIcon, MinusIcon, PlusIcon } from '@phosphor-icons/react'
import { Map as MlMap, Marker, Popup, setWorkerUrl, type GeoJSONSource, type Point } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { shallow } from 'zustand/shallow'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { selectedRoute } from '../../hooks/usePlan'
import { calloutAnchor } from '../../lib/callouts'
import { cn } from '../../lib/utils'
import { formatDurationShort } from '../../lib/format'
import { boundsOf, headingAtMile, mileAtTime, pointAtMile, type LngLat } from '../../lib/geo'
import { locate } from '../../lib/geolocation'
import { COLOR_RAMPS, heatmapGeoJSON, kernelFor, weightExpression } from '../../lib/heatmap'
import { routeModel } from '../../lib/routeModel'
import { useUi } from '../../store/ui'
import type { HeatmapMetric, PlanResponse } from '../../types/api'
import { colorExpression, lineGradient } from '../../lib/weatherScale'
import { routeLabels } from '../../lib/routeLabels'
import { addLayers, EMPTY, LAYER, SRC, WEATHER_COLORED } from './layers'
import { checkpointPopup } from './popup'

// Minimal grey basemap: colour on the map is reserved for routes and weather risk.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

// MapLibre v6 resolves its worker next to its own module; once bundled, point it at the emitted asset.
setWorkerUrl(workerUrl)

function el(className: string, text = ''): HTMLElement {
  const node = document.createElement('div')
  node.className = className
  node.textContent = text
  return node
}

function callout(duration: string, safest: boolean, selected: boolean, onClick: () => void): HTMLElement {
  const node = el(`callout ${selected ? 'callout--selected' : ''}`)
  node.append(el('callout__time', duration))
  if (safest) node.append(el('callout__tag', 'Safest'))
  node.setAttribute('role', 'button')
  node.setAttribute('aria-label', `${selected ? 'Selected route' : 'Select route'}, ${duration}${safest ? ', safest' : ''}`)
  node.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick()
  })
  return node
}

type CheckpointHit = { r: string; i: number }

/** Checkpoint closest (on screen) to a click on the highlighted route. */
function nearestCheckpoint(map: MlMap, point: Point): CheckpointHit | null {
  let best: CheckpointHit | null = null
  let bestD = Infinity
  for (const f of map.querySourceFeatures(SRC.checkpoints)) {
    if (f.geometry.type !== 'Point') continue
    const p = map.project(f.geometry.coordinates as [number, number])
    const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2
    if (d < bestD) {
      bestD = d
      best = { r: f.properties.r as string, i: f.properties.i as number }
    }
  }
  return best
}

function MapButton({ label, onClick, children, className }: { label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="secondary" size="icon" onClick={onClick} aria-label={label} className={cn('rounded-xl border border-white/5 bg-card/90 backdrop-blur', className)}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}

/** Keep routes clear of the top overlays and the timeline card (bottom), measured live. */
function fitPadding(container: HTMLElement) {
  const overlay = container.closest('[data-map-panel]')?.querySelector('[data-overlay="bottom"]')?.getBoundingClientRect().height ?? 0
  const bottom = Math.min(overlay + 40, container.clientHeight * 0.6)
  // Phones: the map is narrow and has a single button, so give the route the width.
  const narrow = container.clientWidth < 640
  return { top: narrow ? 72 : 90, bottom, left: narrow ? 24 : 48, right: narrow ? 24 : 72 }
}

export default function MapView({ plan }: { plan: PlanResponse | undefined }) {
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MlMap | null>(null)
  const [locError, setLocError] = useState<string | null>(null)
  const selectedId = useUi((s) => s.selectedRouteId)
  const focused = useUi((s) => s.focused)
  const model = useMemo(() => {
    const route = selectedRoute(plan, selectedId)
    return route ? routeModel(route) : null
  }, [plan, selectedId])

  const fittedKey = useRef<string | null>(null)
  const truck = useRef<Marker | null>(null)
  const you = useRef<Marker | null>(null)

  // --- Create the map once --------------------------------------------------------------------
  useEffect(() => {
    const m = new MlMap({
      container: container.current!,
      style: STYLE_URL,
      center: [-98.5, 39.5],
      zoom: 3.6,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
    })
    m.touchZoomRotate.disableRotation()
    m.on('load', () => {
      addLayers(m)
      // One prioritised hit test instead of per-layer handlers, so a click near a checkpoint can
      // never fall through and switch to an alternative route underneath it.
      const hitTest = (point: Point) => {
        const cp = m.queryRenderedFeatures(point, { layers: [LAYER.checkpointsHit] })[0]?.properties as CheckpointHit | undefined
        if (cp) return { kind: 'checkpoint' as const, ...cp }
        if (m.queryRenderedFeatures(point, { layers: [LAYER.selHit] }).length) {
          const nearest = nearestCheckpoint(m, point)
          if (nearest) return { kind: 'checkpoint' as const, ...nearest }
        }
        const alt = m.queryRenderedFeatures(point, { layers: [LAYER.altHit] })[0]?.properties?.id as string | undefined
        return alt ? { kind: 'route' as const, id: alt } : null
      }
      m.on('click', (e) => {
        const hit = hitTest(e.point)
        if (hit?.kind === 'checkpoint') useUi.getState().focusCheckpoint(hit.r, hit.i, false)
        else if (hit?.kind === 'route') useUi.getState().selectRoute(hit.id)
      })
      m.on('mousemove', (e) => {
        m.getCanvas().style.cursor = hitTest(e.point) ? 'pointer' : ''
      })
      setMap(m)
    })
    return () => m.remove()
  }, [])

  // --- New plan: heatmap data + kernel sizing + camera ----------------------------------------
  useEffect(() => {
    if (!map) return
    const heat = map.getSource<GeoJSONSource>(SRC.heat)!
    if (!plan) {
      heat.setData(EMPTY)
      return
    }
    const models = plan.routes.map(routeModel)
    const [sw, ne] = boundsOf(
      (function* () {
        for (const m of models) yield* m.coords
      })(),
    )
    heat.setData(heatmapGeoJSON(plan.heatmap))
    const { radius, intensity } = kernelFor(plan.heatmap.cell_deg, (sw[1] + ne[1]) / 2)
    map.setPaintProperty(LAYER.heat, 'heatmap-radius', radius)
    map.setPaintProperty(LAYER.heat, 'heatmap-intensity', intensity)

    // Re-frame only when the endpoints change (not for a new interval, load or departure).
    const first = models[0]!.coords
    const key = `${first[0]}|${first[first.length - 1]}`
    if (key !== fittedKey.current) {
      fittedKey.current = key
      map.fitBounds([sw, ne] as [LngLat, LngLat], { padding: fitPadding(map.getContainer()), duration: 900 })
    }
  }, [map, plan])

  // --- Route lines, endpoints and duration callouts -------------------------------------------
  useEffect(() => {
    if (!map) return
    const models = plan?.routes.map(routeModel) ?? []
    const alts = models.filter((m) => m !== model)
    map.getSource<GeoJSONSource>(SRC.alts)!.setData({ type: 'FeatureCollection', features: alts.map((m) => m.line) })
    map.getSource<GeoJSONSource>(SRC.selected)!.setData(model?.line ?? EMPTY)
    map.getSource<GeoJSONSource>(SRC.checkpoints)!.setData(model?.checkpoints ?? EMPTY)
    if (!model) return

    const origin = useUi.getState().origin
    const coords = model.coords
    const markers: Marker[] = [
      new Marker({ element: origin?.current ? el('you-dot') : el('pin', 'A') }).setLngLat(coords[0]!),
      new Marker({ element: el('pin pin--dest', 'B') }).setLngLat(coords[coords.length - 1]!),
    ]
    // Selected route's bubble is placed first; the others avoid it and each other.
    const placed: LngLat[] = []
    const bubbles: Marker[] = []
    for (const m of [model, ...alts]) {
      const at = calloutAnchor(m, models.filter((o) => o !== m), placed)
      placed.push(at)
      bubbles.push(
        new Marker({
          element: callout(formatDurationShort(m.route.duration_s), m.route.recommended, m === model, () => useUi.getState().selectRoute(m.route.id)),
          anchor: 'bottom',
          offset: [0, -6],
        }).setLngLat(at),
      )
    }
    markers.push(...bubbles)

    // Screen-space collision pass: when routes run close together, stack overlapping bubbles
    // upwards instead of drawing them on top of each other. Re-run after every camera move.
    const BUBBLE_W = 96
    const BUBBLE_H = 44
    const relayout = () => {
      const boxes: { x: number; y: number }[] = []
      for (const b of bubbles) {
        const p = map.project(b.getLngLat())
        let lift = 0
        while (boxes.some((o) => Math.abs(o.x - p.x) < BUBBLE_W && Math.abs(o.y - (p.y - lift)) < BUBBLE_H)) lift += BUBBLE_H
        boxes.push({ x: p.x, y: p.y - lift })
        b.setOffset([0, -6 - lift])
      }
    }
    relayout()
    map.on('moveend', relayout)
    for (const mk of markers) mk.addTo(map)
    return () => {
      map.off('moveend', relayout)
      for (const mk of markers) mk.remove()
    }
  }, [map, plan, model])

  // --- Highlighted route speaks for itself: smooth intensity gradient, dot colours and labels ---
  useEffect(() => {
    if (!map) return
    const labels = map.getSource<GeoJSONSource>(SRC.labels)!
    const apply = (metric: HeatmapMetric) => {
      const color = colorExpression(metric)
      for (const [layer, prop] of WEATHER_COLORED) map.setPaintProperty(layer, prop, color)
      if (model) map.setPaintProperty(LAYER.selLine, 'line-gradient', lineGradient(model, metric))
      labels.setData(model ? routeLabels(model, metric) : EMPTY)
    }
    apply(useUi.getState().metric)
    return useUi.subscribe((s) => s.metric, apply)
  }, [map, model])

  // --- Forecast hour / metric: imperative paint updates, no React re-render ----------------
  useEffect(() => {
    if (!map) return
    type HeatView = { hour: number; metric: HeatmapMetric; visible: boolean }
    const apply = ({ hour, metric, visible }: HeatView) => {
      map.setPaintProperty(LAYER.heat, 'heatmap-weight', weightExpression(metric, hour))
      map.setPaintProperty(LAYER.heat, 'heatmap-color', COLOR_RAMPS[metric])
      map.setLayoutProperty(LAYER.heat, 'visibility', visible ? 'visible' : 'none')
    }
    const pick = (s: ReturnType<typeof useUi.getState>): HeatView => ({ hour: s.hour, metric: s.metric, visible: s.heatmapVisible })
    apply(pick(useUi.getState()))
    return useUi.subscribe(pick, apply, { equalityFn: shallow })
  }, [map])

  // --- Truck position (nav arrow, facing the road) at the slider time on the selected route ---
  useEffect(() => {
    if (!map || !model || !plan) {
      truck.current?.remove()
      return
    }
    const t = (truck.current ??= new Marker({ element: el('nav-marker'), rotationAlignment: 'map' }))
    const place = (hour: number) => {
      const mile = mileAtTime(model.etas, model.miles, plan.departure + hour * 3600)
      // The arrow glyph points north-west (315°); turn it to the road's heading.
      t.setLngLat(pointAtMile(model.coords, model.cum, mile)).setRotation(headingAtMile(model.coords, model.cum, mile) - 315)
    }
    place(useUi.getState().hour)
    t.addTo(map)
    return useUi.subscribe((s) => s.hour, place)
  }, [map, model, plan])

  // --- Focused checkpoint: highlight + popup (+ pan when chosen from the list) --------------
  useEffect(() => {
    if (!map || !model || !focused || focused.routeId !== model.route.id) return
    const cp = model.route.checkpoints[focused.index]
    if (!cp) return
    const state = { source: SRC.checkpoints, id: focused.index }
    map.setFeatureState(state, { focus: true })
    const popup = new Popup({ maxWidth: '300px', offset: 14, focusAfterOpen: false, className: 'wx-popup' })
      .setLngLat([cp.lon, cp.lat])
      .setDOMContent(checkpointPopup(model.route.id, cp))
      .addTo(map)
    popup.on('close', () => {
      if (useUi.getState().focused?.nonce === focused.nonce) useUi.getState().clearFocus()
    })
    if (focused.fly) map.easeTo({ center: [cp.lon, cp.lat], zoom: Math.max(map.getZoom(), 8), duration: 700, padding: fitPadding(map.getContainer()) })
    return () => {
      map.removeFeatureState(state)
      popup.remove()
    }
  }, [map, model, focused])

  const showMyLocation = async () => {
    if (!map) return
    setLocError(null)
    try {
      const { lat, lon } = await locate()
      you.current ??= new Marker({ element: el('you-dot') })
      you.current.setLngLat([lon, lat]).addTo(map)
      map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 11), duration: 900 })
    } catch (err) {
      setLocError((err as Error).message)
    }
  }

  return (
    <div className="absolute inset-0" role="region" aria-label="Route and weather map">
      {/* MapLibre forces `position: relative` on its container, so positioning lives on this wrapper. */}
      <div ref={container} className="size-full" />
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        {/* Phones pinch to zoom: the zoom buttons are desktop-only. */}
        <MapButton label="Zoom in" onClick={() => map?.zoomIn()} className="hidden lg:inline-flex">
          <PlusIcon weight="bold" />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => map?.zoomOut()} className="hidden lg:inline-flex">
          <MinusIcon weight="bold" />
        </MapButton>
        <MapButton label="Show your location" onClick={showMyLocation}>
          <GpsFixIcon weight="bold" />
        </MapButton>
      </div>
      {locError && (
        <button type="button" role="alert" onClick={() => setLocError(null)} className="absolute top-3 left-1/2 z-20 max-w-sm -translate-x-1/2 rounded-xl border bg-popover px-4 py-2.5 text-xs text-popover-foreground shadow-xl">
          {locError}
        </button>
      )}
    </div>
  )
}
