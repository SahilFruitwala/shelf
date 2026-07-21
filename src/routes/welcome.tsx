import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { MotionConfig, motion } from 'motion/react'
import { Compass, Sparkles, Users } from 'lucide-react'
import type { CSSProperties } from 'react'

import { getSessionUser } from '#/server/auth'
import { ThemeToggle } from '#/components/theme-toggle'
import { cn } from '#/lib/utils'
import { canonical, seo } from '#/lib/seo'

export const Route = createFileRoute('/welcome')({
  head: () => ({
    meta: seo({
      title: 'Save every recommendation',
      description:
        'Restaurants, movies, books, places and gift ideas — filed the moment you hear about them, on your own or shared with people you invite.',
      path: '/welcome',
    }),
    links: [canonical('/welcome')],
  }),
  beforeLoad: async () => {
    const user = await getSessionUser()
    if (user) throw redirect({ to: '/' })
  },
  component: LandingPage,
})

/* The hero illustration: a shelf of the lists you'd actually keep,
   each spine tinted with its category's color from the app palette. */
const SPINES = [
  { label: 'Date nights', color: 'var(--cat-restaurant)', h: 176, w: 46 },
  { label: 'Watchlist', color: 'var(--cat-movie)', h: 204, w: 52 },
  { label: 'Summer reading', color: 'var(--cat-book)', h: 164, w: 42, lean: true },
  { label: 'Tokyo 2027', color: 'var(--cat-trip)', h: 190, w: 50 },
  { label: 'Sunday spots', color: 'var(--cat-place)', h: 170, w: 44 },
  { label: 'Gift ideas', color: 'var(--cat-wishlist)', h: 148, w: 46 },
]

/* A couple of books lying flat at the end of the row. */
const FLAT_STACK = [
  { color: 'var(--cat-tv)', w: 112 },
  { color: 'var(--cat-mixed)', w: 96 },
]

function ShelfIllustration() {
  return (
    <div className="mx-auto w-full max-w-xl px-2">
      <div className="flex items-end justify-center gap-1.5">
        {SPINES.map((spine, i) => (
          <motion.div
            key={spine.label}
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.35 + i * 0.07,
              type: 'spring',
              stiffness: 320,
              damping: 24,
            }}
            className={cn(
              'spine flex items-start justify-center pt-3',
              spine.lean && 'origin-bottom-right -mr-1.5 rotate-[7deg]',
            )}
            style={
              {
                '--spine': spine.color,
                height: spine.h,
                width: spine.w,
              } as CSSProperties
            }
          >
            <span className="spine-label">{spine.label}</span>
          </motion.div>
        ))}
        <div className="ml-1 flex flex-col items-center gap-1">
          {FLAT_STACK.map((slab, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: -18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.35 + (SPINES.length + i) * 0.07,
                type: 'spring',
                stiffness: 320,
                damping: 24,
              }}
              className="spine h-5"
              style={{ '--spine': slab.color, width: slab.w } as CSSProperties}
            />
          ))}
        </div>
      </div>
      <div className="shelf-board" />
    </div>
  )
}

const FEATURES = [
  {
    icon: Sparkles,
    color: 'text-cat-restaurant',
    title: 'Add in seconds',
    body: 'A title or a Google Maps link becomes a full card — cover, address, the lot.',
  },
  {
    icon: Users,
    color: 'text-cat-place',
    title: 'Shelves you share',
    body: 'A date-night list you both add to. Invite anyone with a link.',
  },
  {
    icon: Compass,
    color: 'text-cat-trip',
    title: 'Trips on a map',
    body: 'Plan a getaway day by day — every saved spot lands on a map.',
  },
]

function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-dvh">
        <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4 sm:px-8">
          <span className="font-display text-[22px] font-bold">
            Shelf
            <span className="text-cat-restaurant">.</span>
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/login"
              search={{ redirect: undefined }}
              className="rounded-full px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-card-deep hover:text-ink"
            >
              Sign in
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-4xl px-4 pb-20 sm:px-8">
          {/* Hero */}
          <section className="pt-12 text-center sm:pt-20">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="text-hero mx-auto max-w-2xl text-balance font-display text-[2rem] font-bold leading-tight sm:text-6xl">
                Every “we should try that” — remembered.
              </h1>
              <p className="mx-auto mt-5 max-w-lg text-[16px] leading-relaxed text-ink-soft sm:text-[17px]">
                Restaurants someone swore by, movies you keep meaning to watch,
                books, places, gift ideas — filed the moment you hear about
                them.
              </p>
              <Link
                to="/login"
                search={{ redirect: undefined }}
                className="mt-8 inline-block rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-bg transition-transform hover:translate-y-[-1px]"
              >
                Start your shelves
              </Link>
            </motion.div>

            <div className="mt-16 sm:mt-20">
              <ShelfIllustration />
            </div>
          </section>

          {/* Features — three quiet lines, no boxes */}
          <section className="mt-20 grid grid-cols-1 gap-10 sm:mt-28 sm:grid-cols-3 sm:gap-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="text-center sm:text-left">
                <f.icon className={cn('mx-auto size-5 sm:mx-0', f.color)} />
                <h2 className="mt-3 font-display text-[17px] font-semibold">
                  {f.title}
                </h2>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
                  {f.body}
                </p>
              </div>
            ))}
          </section>

          {/* Closing CTA */}
          <section className="mt-20 border-t border-line pt-14 text-center sm:mt-28">
            <h2 className="font-display text-2xl font-bold sm:text-3xl">
              Save the next thing before you forget it
            </h2>
            <p className="mt-2 text-[14px] text-ink-faint">
              Free · no app to install · works great on your phone
            </p>
            <Link
              to="/login"
              search={{ redirect: undefined }}
              className="mt-6 inline-block rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-bg transition-transform hover:translate-y-[-1px]"
            >
              Create your account
            </Link>
          </section>

          <footer className="mt-16 text-center text-[13px] text-ink-faint">
            <Link to="/privacy" className="underline hover:text-ink-soft">
              Privacy Policy
            </Link>
          </footer>
        </main>
      </div>
    </MotionConfig>
  )
}
