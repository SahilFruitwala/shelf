import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { LogOut, NotebookPen } from 'lucide-react'

import { authClient } from '#/lib/auth-client'
import { getSessionUser } from '#/server/auth'
import { ThemeToggle } from '#/components/theme-toggle'
import { features } from '#/lib/features'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location }) => {
    const user = await getSessionUser()
    if (!user) {
      // Bare visits get the landing page; deep links go to login and bounce back.
      if (location.pathname === '/') throw redirect({ to: '/welcome' })
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    return { user }
  },
  component: AppLayout,
})

function AppLayout() {
  const router = useRouter()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const onNotes = pathname.startsWith('/notes')

  return (
    <div className="mx-auto min-h-dvh w-full max-w-5xl px-4 pb-24 sm:px-8">
      <header className="sticky top-0 z-40 -mx-4 mb-2 flex items-center justify-between border-b border-line bg-bg/80 px-4 py-3 backdrop-blur-md sm:-mx-8 sm:px-8 sm:py-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-display text-[22px] font-bold">
            Shelf
            <span className="text-cat-restaurant">.</span>
          </Link>
          {features.notes && (
            <nav className="flex items-center gap-1">
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
            </nav>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            onClick={async () => {
              await authClient.signOut()
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
