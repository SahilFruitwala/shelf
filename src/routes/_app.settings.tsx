import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useClerk } from '@clerk/tanstack-react-start'

import { deleteAccount, getAccountInfo, RETENTION_DAYS } from '#/server/account'
import { Button, ConfirmDialog, SectionLabel } from '#/components/ui'
import {
  AccountRowsSkeleton,
  SettingsPageSkeleton,
  SkeletonScreen,
} from '#/components/skeletons'
import { seo } from '#/lib/seo'

export const Route = createFileRoute('/_app/settings')({
  head: () => ({ meta: seo({ title: 'Settings', noindex: true }) }),
  component: SettingsPage,
  pendingComponent: SettingsPageSkeleton,
})

function SettingsPage() {
  const router = useRouter()
  const { signOut } = useClerk()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accountQuery = useQuery({
    queryKey: ['account'],
    queryFn: () => getAccountInfo(),
  })

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await deleteAccount()
      // Clerk user is gone; clear the local session and bounce to the landing.
      await signOut()
      await router.navigate({ to: '/welcome' })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not delete your account. Please try again.',
      )
      setDeleting(false)
      setConfirmOpen(false)
    }
  }

  const account = accountQuery.data

  return (
    <div className="mx-auto max-w-2xl py-6">
      <h1 className="font-display text-2xl font-bold text-ink">Settings</h1>

      <section className="mt-8">
        <SectionLabel>Account</SectionLabel>
        <div className="rounded-(--radius-card) border border-line bg-card px-5 py-4">
          {accountQuery.isPending ? (
            <SkeletonScreen label="Loading account details">
              <AccountRowsSkeleton />
            </SkeletonScreen>
          ) : (
            <dl className="space-y-3 text-[15px]">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Name</dt>
                <dd className="text-right text-ink">{account?.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Email</dt>
                <dd className="text-right text-ink">{account?.email}</dd>
              </div>
              {account?.createdAt && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">Member since</dt>
                  <dd className="text-right text-ink">
                    {new Date(account.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </section>

      <section className="mt-10">
        <SectionLabel>Danger zone</SectionLabel>
        <div className="rounded-(--radius-card) border border-danger/30 bg-card px-5 py-4">
          <h3 className="text-[15px] font-semibold text-ink">Delete account</h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
            Permanently closes your account and signs you out everywhere. Your
            shelves, items, and notes are scheduled for deletion and fully
            removed after {RETENTION_DAYS} days, in line with our data-retention
            policy. This can't be undone.
          </p>
          {error && (
            <p className="mt-3 text-[14px] text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="mt-4">
            <Button
              variant="quiet"
              onClick={() => setConfirmOpen(true)}
              className="border-danger/40 text-danger hover:border-danger hover:bg-danger/10"
            >
              Delete account
            </Button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !deleting && setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete your account?"
        description={`This closes your account and signs you out. Your data is retained for ${RETENTION_DAYS} days, then permanently deleted. This action can't be undone.`}
        confirmLabel="Delete account"
        cancelLabel="Keep account"
        destructive
        busy={deleting}
      />
    </div>
  )
}
