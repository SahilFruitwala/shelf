import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { motion } from 'motion/react'

import { authClient } from '#/lib/auth-client'
import { getSessionUser } from '#/server/auth'
import { Spotlight } from '#/components/aceternity'
import { ThemeToggle } from '#/components/theme-toggle'
import { Button, Field, Input } from '#/components/ui'

export const Route = createFileRoute('/login')({
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
  const router = useRouter()
  const search = Route.useSearch()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const result =
      mode === 'signin'
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: name.trim() })
    setBusy(false)
    if (result.error) {
      setError(result.error.message ?? 'Something went wrong — try again')
      return
    }
    await router.navigate({ to: search.redirect ?? '/', replace: true })
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4 sm:p-6">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <Spotlight
        className="-top-40 left-0 md:-top-20 md:left-60"
        fill="#10b981"
      />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-sm"
      >
        <header className="mb-10 text-center">
          <h1 className="text-hero font-display text-5xl font-bold">Shelf</h1>
          <p className="mt-3 text-[15px] text-ink-soft">
            Things to try, watch, read, and visit.
          </p>
        </header>

        <form
          onSubmit={submit}
          className="glow-card space-y-4 rounded-(--radius-card) p-5 sm:p-6"
        >
          {mode === 'signup' && (
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Your name"
              />
            </Field>
          )}
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={
                mode === 'signin' ? 'current-password' : 'new-password'
              }
              placeholder="At least 8 characters"
            />
          </Field>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button
            type="submit"
            variant="primary"
            disabled={busy}
            className="w-full py-3"
          >
            {busy
              ? 'One moment…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          {mode === 'signin' ? 'New here?' : 'Already have an account?'}{' '}
          <button
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError(null)
            }}
            className="cursor-pointer font-medium text-accent underline-offset-2 hover:underline"
          >
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </motion.div>
    </main>
  )
}
