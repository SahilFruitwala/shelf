import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { Dumbbell, LogOut, NotebookPen, Settings } from 'lucide-react'
import { useClerk } from '@clerk/tanstack-react-start'

import { getSessionUser } from '#/server/auth'
import { getMyFeatures } from '#/server/features'
import { ThemeToggle } from '#/components/theme-toggle'
import { features } from '#/lib/features'
import { cn } from '#/lib/utils'
import { seo } from '#/lib/seo'

export const Route = createFileRoute('/_app')({
  head: () => ({ meta: seo({ noindex: true }) }),
  beforeLoad: async ({ location }) => {
    const user = await getSessionUser()
    if (!user) {
      // Bare visits get the landing page; deep links go to login and bounce back.
      if (location.pathname === '/') throw redirect({ to: '/welcome' })
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    const userFeatures = await getMyFeatures()
    return { user, userFeatures }
  },
  component: AppLayout,
})

function AppLayout() {
  const router = useRouter()
  const { signOut } = useClerk()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const onNotes = pathname.startsWith('/notes')
  const onExercises = pathname.startsWith('/exercises')

  return (
    <div className="mx-auto min-h-dvh w-full max-w-5xl px-4 pb-24 sm:px-8">
      <header className="sticky top-0 z-40 -mx-4 mb-2 flex items-center justify-between border-b border-line bg-bg/80 px-4 py-3 backdrop-blur-md sm:-mx-8 sm:px-8 sm:py-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-display text-[22px] font-bold">
            Shelf
            <span className="text-cat-restaurant">.</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              to="/exercises"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                onExercises
                  ? 'bg-card-deep text-ink'
                  : 'text-ink-soft hover:bg-card-deep hover:text-ink',
              )}
            >
              <Dumbbell className="size-3.5" />
              Exercises
            </Link>
            {features.notes && (
              <Link
                to="/notes"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  onNotes
                    ? 'bg-card-deep text-ink'
                    : 'text-ink-soft hover:bg-card-deep hover:text-ink',
                )}
              >
                <NotebookPen className="size-3.5" />
                Notes
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link
            to="/settings"
            aria-label="Settings"
            className={cn(
              'rounded-full p-2 text-ink-soft hover:bg-card-deep hover:text-ink',
              pathname.startsWith('/settings') && 'bg-card-deep text-ink',
            )}
          >
            <Settings className="size-4.5" />
          </Link>
          <button
            onClick={async () => {
              await signOut()
              await router.navigate({
                to: '/login',
                search: { redirect: undefined },
              })
            }}
            aria-label="Sign out"
            className="rounded-full p-2 text-ink-soft hover:bg-card-deep hover:text-ink cursor-pointer"
          >
            <LogOut className="size-4.5" />
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
