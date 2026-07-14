import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, UserX } from 'lucide-react'

import { cn } from '#/lib/utils'
import { disableSharing, enableSharing, removeMember } from '#/server/lists'
import { Button, Modal } from '#/components/ui'

interface Member {
  userId: string
  role: 'owner' | 'editor'
  name: string
}

export function ShareDialog({
  open,
  onClose,
  listId,
  joinCode,
  members,
  isOwner,
  myUserId,
}: {
  open: boolean
  onClose: () => void
  listId: string
  joinCode: string | null
  members: Array<Member>
  isOwner: boolean
  myUserId: string
}) {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)

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
  const kick = useMutation({
    mutationFn: (userId: string) => removeMember({ data: { listId, userId } }),
    onSuccess: invalidate,
  })

  const joinUrl = joinCode
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${joinCode}`
    : null

  async function copy() {
    if (!joinUrl) return
    await navigator.clipboard.writeText(joinUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal open={open} onClose={onClose} title="Share this shelf">
      <div className="space-y-6">
        {isOwner && (
          <section>
            <h3 className="mb-2 text-[13px] font-medium text-ink-soft">
              Invite link
            </h3>
            {joinUrl ? (
              <>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-(--radius-control) border border-line bg-card-deep px-3 py-2.5 text-[13px]">
                    {joinUrl}
                  </code>
                  <Button variant="primary" onClick={copy} className="shrink-0">
                    {copied ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
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
                    onClick={() => {
                      if (confirm(`Remove ${m.name} from this shelf?`))
                        kick.mutate(m.userId)
                    }}
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
  )
}
