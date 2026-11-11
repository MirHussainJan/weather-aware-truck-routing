/**
 * Scroll-edge fade with a backdrop blur ramp — Skiper UI "Progressive Blur" (skiper41).
 * Free component; attribution: Skiper UI by @gurvinder-singh02 — https://skiper-ui.com
 */
import { cn } from '@/lib/utils'

interface Props {
  className?: string
  position?: 'top' | 'bottom'
  height?: string
  blurAmount?: string
  /** Colour the content fades into (the scroll container's background). */
  backgroundColor?: string
}

export function ProgressiveBlur({ className, position = 'bottom', height = '64px', blurAmount = '4px', backgroundColor = 'var(--color-card)' }: Props) {
  const isTop = position === 'top'
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute left-0 z-10 w-full select-none', className)}
      style={{
        [isTop ? 'top' : 'bottom']: 0,
        height,
        background: `linear-gradient(to ${isTop ? 'top' : 'bottom'}, transparent, ${backgroundColor})`,
        maskImage: `linear-gradient(to ${isTop ? 'bottom' : 'top'}, black 50%, transparent)`,
        WebkitBackdropFilter: `blur(${blurAmount})`,
        backdropFilter: `blur(${blurAmount})`,
      }}
    />
  )
}
