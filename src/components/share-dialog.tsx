import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, UserX } from 'lucide-react'

import { cn } from '#/lib/utils'
import {
  disableSharing,
  disableViewLink,
  enableSharing,
  enableViewLink,
  removeMember,
} from '#/server/lists'
import { Button, ConfirmDialog, Modal } from '#/components/ui'

interface Member {
  userId: string
  role: 'owner' | 'editor'
  name: string
}

function CopyLinkRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-(--radius-control) border border-line bg-card-deep px-3 py-2.5 text-[13px]">
        {url}
      </code>
      <Button variant="primary" onClick={copy} className="shrink-0">
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

export function ShareDialog({
  open,
  onClose,
  listId,
  joinCode,
  viewCode,
  members,
  isOwner,
  myUserId,
}: {
  open: boolean
  onClose: () => void
  listId: string
  joinCode: string | null
  viewCode: string | null
  members: Array<Member>
  isOwner: boolean
  myUserId: string
}) {
  const queryClient = useQueryClient()
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['list', listId] })

  const enable = useMutation({
    mutationFn: () => enableSharing({ data: listId }),
    onSuccess: invalidate,
  })
  const disable = useMutation({
    mutationFn: () => disableSharing({ data: listId }),
    onSuccess: invalidate,
  })
  const enableView = useMutation({
    mutationFn: () => enableViewLink({ data: listId }),
    onSuccess: invalidate,
  })
  const disableView = useMutation({
    mutationFn: () => disableViewLink({ data: listId }),
    onSuccess: invalidate,
  })
  const kick = useMutation({
    mutationFn: (userId: string) => removeMember({ data: { listId, userId } }),
    onSuccess: invalidate,
  })

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const joinUrl = joinCode ? `${origin}/join/${joinCode}` : null
  const viewUrl = viewCode ? `${origin}/s/${viewCode}` : null

  return (
    <>
      <Modal open={open} onClose={onClose} title="Share this shelf">
      <div className="space-y-6">
        {isOwner && (
          <section>
            <h3 className="mb-2 text-[13px] font-medium text-ink-soft">
              Invite link
            </h3>
            {joinUrl ? (
              <>
                <CopyLinkRow url={joinUrl} />
                <p className="mt-2 text-[13px] text-ink-faint">
                  Anyone with this link can join and edit. Turn it off to stop
                  new people joining — current members stay.
                </p>
                <Button
                  variant="danger"
                  className="mt-2 px-0 hover:bg-transparent underline-offset-2 hover:underline"
                  onClick={() => disable.mutate()}
                  disabled={disable.isPending}
                >
                  Turn off invite link
                </Button>
              </>
            ) : (
              <>
                <p className="mb-3 text-[14px] text-ink-soft">
                  Create a link you can send over any chat app. Whoever opens it
                  joins this shelf and can add and edit items.
                </p>
                <Button
                  variant="primary"
                  onClick={() => enable.mutate()}
                  disabled={enable.isPending}
                >
                  Create invite link
                </Button>
              </>
            )}
          </section>
        )}

        {isOwner && (
          <section>
            <h3 className="mb-2 text-[13px] font-medium text-ink-soft">
              View-only link
            </h3>
            {viewUrl ? (
              <>
                <CopyLinkRow url={viewUrl} />
                <p className="mt-2 text-[13px] text-ink-faint">
                  Anyone with this link can see the shelf but can't change
                  anything. No account needed.
                </p>
                <Button
                  variant="danger"
                  className="mt-2 px-0 hover:bg-transparent underline-offset-2 hover:underline"
                  onClick={() => disableView.mutate()}
                  disabled={disableView.isPending}
                >
                  Turn off view-only link
                </Button>
              </>
            ) : (
              <>
                <p className="mb-3 text-[14px] text-ink-soft">
                  Show this shelf off without letting anyone edit it — good for
                  posting recommendations publicly.
                </p>
                <Button
                  variant="quiet"
                  onClick={() => enableView.mutate()}
                  disabled={enableView.isPending}
                >
                  Create view-only link
                </Button>
              </>
            )}
          </section>
        )}

        <section>
          <h3 className="mb-2 text-[13px] font-medium text-ink-soft">
            {members.length === 1 ? 'Just you so far' : 'Members'}
          </h3>
          <ul className="space-y-1">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-2 rounded-(--radius-control) px-2 py-1.5"
              >
                <span className="text-[15px]">
                  {m.name}
                  {m.userId === myUserId && (
                    <span className="text-ink-faint"> (you)</span>
                  )}
                  <span
                    className={cn(
                      'ml-2 text-[11px] font-semibold uppercase tracking-wide',
                      m.role === 'owner' ? 'text-accent' : 'text-ink-faint',
                    )}
                  >
                    {m.role}
                  </span>
                </span>
                {isOwner && m.userId !== myUserId && (
                  <Button
                    variant="ghost"
                    className="px-2 py-1 hover:text-danger"
                    title={`Remove ${m.name}`}
                    onClick={() => setRemoveTarget(m)}
                  >
                    <UserX className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
      </Modal>
      <ConfirmDialog
        open={removeTarget != null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) kick.mutate(removeTarget.userId)
          setRemoveTarget(null)
        }}
        title="Remove member?"
        description={
          removeTarget
            ? `${removeTarget.name} will lose access to this shelf. You can send them a new invite link later.`
            : ''
        }
        confirmLabel="Remove"
        destructive
        busy={kick.isPending}
      />
    </>
  )
}
