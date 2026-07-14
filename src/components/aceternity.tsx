import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '#/lib/utils'

/** Aceternity spotlight — a blurred ellipse that sweeps in on load. */
export function Spotlight({
  className,
  fill = 'white',
}: {
  className?: string
  fill?: string
}) {
  return (
    <svg
      className={cn(
        'animate-spotlight pointer-events-none absolute z-[1] h-[169%] w-[138%] opacity-0 lg:w-[84%]',
        className,
      )}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 3787 2842"
      fill="none"
      aria-hidden="true"
    >
      <g filter="url(#spotlight-blur)">
        <ellipse
          cx="1924.71"
          cy="273.501"
          rx="1924.71"
          ry="273.501"
          transform="matrix(-0.822377 -0.568943 -0.568943 0.822377 3631.88 2291.09)"
          fill={fill}
          fillOpacity="0.21"
        />
      </g>
      <defs>
        <filter
          id="spotlight-blur"
          x="0.860352"
          y="0.838989"
          width="3785.16"
          height="2840.26"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="BackgroundImageFix"
            result="shape"
          />
          <feGaussianBlur stdDeviation="151" result="effect1_foregroundBlur" />
        </filter>
      </defs>
    </svg>
  )
}

/**
 * Aceternity card-hover-effect: a shared highlight that slides between
 * grid cells as the pointer moves.
 */
export function HoverHighlight({
  active,
  children,
  className,
}: {
  active: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('group relative h-full w-full', className)}>
      <AnimatePresence>
        {active && (
          <motion.span
            className="absolute -inset-2 z-0 block rounded-[20px] bg-card-deep"
            layoutId="hover-highlight"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.15 } }}
            exit={{ opacity: 0, transition: { duration: 0.15, delay: 0.2 } }}
          />
        )}
      </AnimatePresence>
      <div className="relative z-10 h-full">{children}</div>
    </div>
  )
}
