import { CircleNotchIcon, MapPinIcon, NavigationArrowIcon, XIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Command as CommandPrimitive } from 'cmdk'
import { useState } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { useDebounced } from '@/hooks/useDebounced'
import { api } from '@/lib/api'
import { currentPlace } from '@/lib/geolocation'
import { cn } from '@/lib/utils'
import type { Place } from '@/types/api'

const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/

/** "41.88, -87.63" typed directly is accepted as a coordinate place. */
function parseCoords(text: string): Place | null {
  const m = COORDS.exec(text)
  if (!m) return null
  const lat = Number(m[1])
  const lon = Number(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { label: `${lat}, ${lon}`, lat, lon } : null
}

function splitLabel(label: string): [string, string] {
  const i = label.indexOf(', ')
  return i < 0 ? [label, ''] : [label.slice(0, i), label.slice(i + 2)]
}

interface Props {
  marker: 'A' | 'B'
  placeholder: string
  ariaLabel: string
  value: Place | null
  /** The trip's other end: suggestions near it rank first. */
  near: Place | null
  onChange: (place: Place | null) => void
  onLocationError: (message: string | null) => void
}

/** Place autocomplete: shadcn Command (cmdk) in a Popover anchored to the input. */
export function PlaceCombobox({ marker, placeholder, ariaLabel, value, near, onChange, onLocationError }: Props) {
  const [text, setText] = useState(value?.label ?? '')
  const [open, setOpen] = useState(false)
  const [locating, setLocating] = useState(false)

  // Reflect external value changes (swap, example) in the input, adjusted during render.
  const [shownValue, setShownValue] = useState(value)
  if (value !== shownValue) {
    setShownValue(value)
    setText(value?.label ?? '')
  }

  const query = useDebounced(text.trim(), 220)
  const coord = parseCoords(text)
  const searching = text.trim() !== '' && text !== value?.label
  const typing = query.length >= 2 && !coord && query !== value?.label
  const bias = near ? { lat: Math.round(near.lat * 10) / 10, lon: Math.round(near.lon * 10) / 10 } : null
  const { data, isFetching, isError } = useQuery({
    queryKey: ['geocode', query.toLowerCase(), bias],
    queryFn: ({ signal }) => api.geocode(query, bias, signal),
    enabled: open && typing,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 0,
  })
  const results = searching ? (coord ? [coord] : typing ? (data ?? []) : []) : []
  // Like Google Maps: "Your location" is offered while the field is empty; typing never triggers GPS.
  // Only while the field is empty (as in Google Maps): never re-offered under a chosen place.
  const offerCurrent = text.trim() === '' && !locating
  const placeKey = (p: Place) => `${p.lat},${p.lon},${p.label}`
  const optionKeys = [...(offerCurrent ? ['__current'] : []), ...results.map(placeKey)]

  // cmdk keeps its highlighted item when the list changes (filtering is ours, not cmdk's), so a
  // stale "Your location" row could win on Enter. Re-highlight the first option on every change.
  const listSignature = optionKeys.join('|')
  const [highlighted, setHighlighted] = useState(optionKeys[0] ?? '')
  const [shownSignature, setShownSignature] = useState(listSignature)
  if (listSignature !== shownSignature) {
    setShownSignature(listSignature)
    setHighlighted(optionKeys[0] ?? '')
  }

  const choose = (place: Place) => {
    onChange(place)
    setText(place.label)
    setOpen(false)
  }

  const fillCurrentLocation = async () => {
    setOpen(false)
    setLocating(true)
    onLocationError(null)
    try {
      choose(await currentPlace())
    } catch (err) {
      onLocationError((err as Error).message)
    } finally {
      setLocating(false)
    }
  }

  return (
    <Command shouldFilter={false} loop value={highlighted} onValueChange={setHighlighted} className="h-auto overflow-visible rounded-none bg-transparent">
      <Popover open={open && (offerCurrent || results.length > 0 || (isError && typing))}>
        <PopoverAnchor asChild>
          <div className="relative">
            <span
              className={cn(
                'pointer-events-none absolute top-1/2 left-2.5 z-10 grid size-5 -translate-y-1/2 place-items-center rounded-full text-[10px] font-semibold',
                marker === 'A' ? 'bg-primary text-primary-foreground' : 'bg-amber text-background',
              )}
              aria-hidden
            >
              {marker}
            </span>
            <CommandPrimitive.Input
              aria-label={ariaLabel}
              placeholder={locating ? 'Finding your location…' : placeholder}
              title={value?.detail}
              value={locating ? '' : text}
              disabled={locating}
              onValueChange={(next) => {
                setText(next)
                setOpen(true)
                if (value) onChange(null)
              }}
              onFocus={(e) => {
                setOpen(true)
                e.currentTarget.select()
              }}
              onBlur={() => setOpen(false)}
              onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
              className={cn(
                'h-10 w-full rounded-lg border border-input bg-muted/60 pr-9 pl-10 text-sm text-foreground transition-[color,box-shadow] outline-none placeholder:text-muted-foreground',
                'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-60',
                value?.current && 'font-medium text-sky-400',
              )}
            />
            {(locating || (isFetching && open)) && (
              <CircleNotchIcon className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
            )}
            {value && !locating && (
              <button
                type="button"
                className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={`Clear ${ariaLabel.toLowerCase()}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(null)
                  setText('')
                }}
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={6}
          // A closing list must not catch clicks meant for the field underneath it.
          className="w-(--radix-popover-trigger-width) p-1 data-[state=closed]:pointer-events-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerDown={(e) => e.preventDefault()}
        >
          <CommandList>
            {isError && typing && <CommandEmpty>Search is unavailable — type “lat, lon”.</CommandEmpty>}
            <CommandGroup>
              {offerCurrent && (
                <CommandItem value="__current" onSelect={() => void fillCurrentLocation()} className="gap-3 py-2">
                  <span className="grid size-8 place-items-center rounded-full bg-sky-500/15 text-sky-400">
                    <NavigationArrowIcon weight="fill" />
                  </span>
                  <span>
                    <span className="block font-medium text-sky-400">Your location</span>
                    <span className="block text-xs text-muted-foreground">Use your device’s GPS</span>
                  </span>
                </CommandItem>
              )}
              {results.map((place) => {
                const [primary, secondary] = splitLabel(place.label)
                return (
                  <CommandItem key={placeKey(place)} value={placeKey(place)} onSelect={() => choose(place)} className="gap-3 py-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                      <MapPinIcon />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{primary}</span>
                      {secondary && <span className="block truncate text-xs text-muted-foreground">{secondary}</span>}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  )
}
