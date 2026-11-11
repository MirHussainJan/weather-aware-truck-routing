import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Animated show/hide for a block of content (CSS grid-row 0fr ↔ 1fr, no JS measuring). Hidden
 * content is `inert`, so it is skipped by keyboard focus and screen readers.
 */
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      inert={!open}
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
    >
      {/* Negative margin + padding leaves room for focus rings inside the clipped area. */}
      <div className={cn('-m-1 min-h-0 overflow-hidden p-1', className)}>{children}</div>
    </div>
  )
}
