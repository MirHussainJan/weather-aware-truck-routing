/**
 * Rolling digits for live stats — Skiper UI "Animated number" (skiper37), built on NumberFlow.
 * Free component; attribution: Skiper UI by @gurvinder-singh02 — https://skiper-ui.com
 */
import NumberFlow, { type Format } from '@number-flow/react'
import { cn } from '@/lib/utils'

interface Props {
  value: number
  format?: Format
  prefix?: string
  suffix?: string
  className?: string
}

export function AnimatedNumber({ value, format, prefix, suffix, className }: Props) {
  return <NumberFlow value={value} format={format} prefix={prefix} suffix={suffix} willChange className={cn('tabular-nums', className)} />
}
