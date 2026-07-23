import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { SignIn, SignUp } from '@clerk/tanstack-react-start'

import { getSessionUser } from '#/server/auth'
import { Spotlight } from '#/components/aceternity'
import { ThemeToggle } from '#/components/theme-toggle'
import { seo } from '#/lib/seo'

export const Route = createFileRoute('/login')({
  head: () => ({ meta: seo({ title: 'Sign in', noindex: true }) }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const user = await getSessionUser()
    if (user) throw redirect({ to: search.redirect ?? '/' })
  },
  component: LoginPage,
})

function LoginPage() {
  const search = Route.useSearch()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const redirectUrl = search.redirect ?? '/'

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4 sm:p-6">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <Spotlight
        className="-top-40 left-0 md:-top-20 md:left-60"
        fill="#d97706"
      />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 flex w-full max-w-sm flex-col items-center"
      >
        <header className="mb-10 text-center">
          <h1 className="font-display text-5xl font-bold">
            <span className="text-hero">Shelf</span>
            <span className="text-cat-restaurant">.</span>
          </h1>
          <p className="mt-3 text-[15px] text-ink-soft">
            Things to try, watch, read, and visit.
          </p>
        </header>

        {mode === 'signin' ? (
          <SignIn
            routing="hash"
            signUpUrl="#/sign-up"
            forceRedirectUrl={redirectUrl}
          />
        ) : (
          <SignUp
            routing="hash"
            signInUrl="#/sign-in"
            forceRedirectUrl={redirectUrl}
          />
        )}

        <p className="mt-6 text-center text-sm text-ink-soft">
          {mode === 'signin' ? 'New here?' : 'Already have an account?'}{' '}
          <button
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="cursor-pointer font-medium text-ink underline underline-offset-2 decoration-cat-restaurant/50 hover:decoration-cat-restaurant"
          >
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </motion.div>
    </main>
  )
}
