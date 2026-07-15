import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, Eye, PenLine } from 'lucide-react'

import { useVault } from '#/contexts/vault-context'
import { deleteNote, getNote, updateNote } from '#/server/notes'
import { cn } from '#/lib/utils'
import { Button, Input, Textarea } from '#/components/ui'

type EditorMode = 'write' | 'preview'

export function NoteEditor({ noteId }: { noteId: string }) {
  const { masterKey } = useVault()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<EditorMode>('write')
  const [loaded, setLoaded] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<{ title: string; content: string } | null>(null)
  const mutateRef = useRef<
    (payload: { title: string; content: string }) => void
  >(() => {})

  const noteQuery = useQuery({
    queryKey: ['note', noteId],
    queryFn: () => getNote({ data: noteId }),
    enabled: !!masterKey,
  })

  useEffect(() => {
    setLoaded(false)
    setTitle('')
    setContent('')
    setSaveState('idle')

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
        const pending = pendingSaveRef.current
        if (pending) {
          pendingSaveRef.current = null
          mutateRef.current(pending)
        }
      }
    }
  }, [noteId])

  useEffect(() => {
    if (!masterKey || !noteQuery.data) return

    let cancelled = false
    ;(async () => {
      try {
        const { decryptField } = await import('#/lib/crypto/vault-crypto')
        const [decTitle, decContent] = await Promise.all([
          decryptField(
            masterKey,
            noteQuery.data.encryptedTitle,
            noteQuery.data.titleIv,
          ),
          decryptField(
            masterKey,
            noteQuery.data.encryptedContent,
            noteQuery.data.contentIv,
          ),
        ])
        if (!cancelled) {
          setTitle(decTitle)
          setContent(decContent)
          setLoaded(true)
        }
      } catch {
        if (!cancelled) setLoaded(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [masterKey, noteQuery.data, noteId])

  const saveMutation = useMutation({
    mutationFn: async (payload: { title: string; content: string }) => {
      if (!masterKey) throw new Error('Vault locked')
      const { encryptField } = await import('#/lib/crypto/vault-crypto')
      const encTitle = await encryptField(masterKey, payload.title)
      const encContent = await encryptField(masterKey, payload.content)
      return updateNote({
        data: {
          noteId,
          encryptedTitle: encTitle.ciphertext,
          titleIv: encTitle.iv,
          encryptedContent: encContent.ciphertext,
          contentIv: encContent.iv,
        },
      })
    },
    onSuccess: async () => {
      setSaveState('saved')
      await queryClient.invalidateQueries({ queryKey: ['notes'] })
      await queryClient.invalidateQueries({ queryKey: ['note', noteId] })
    },
  })

  mutateRef.current = saveMutation.mutate

  const scheduleSave = useCallback(
    (nextTitle: string, nextContent: string) => {
      if (!loaded || !masterKey) return
      pendingSaveRef.current = { title: nextTitle, content: nextContent }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      setSaveState('saving')
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null
        pendingSaveRef.current = null
        saveMutation.mutate({ title: nextTitle, content: nextContent })
      }, 800)
    },
    [loaded, masterKey, saveMutation],
  )

  const deleteMutation = useMutation({
    mutationFn: () => deleteNote({ data: noteId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })

  if (noteQuery.isLoading || !loaded) {
    return <p className="text-sm text-ink-soft">Decrypting note…</p>
  }

  if (noteQuery.isError) {
    return <p className="text-sm text-danger">Note not found.</p>
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/notes"
          className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          All notes
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-faint">
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'saved'
                ? 'Saved'
                : ''}
          </span>
          <div className="flex rounded-(--radius-control) border border-line p-0.5">
            <button
              type="button"
              onClick={() => setMode('write')}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1 rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1.5 text-xs font-medium',
                mode === 'write'
                  ? 'bg-card-deep text-ink'
                  : 'text-ink-soft hover:text-ink',
              )}
            >
              <PenLine className="size-3.5" />
              Write
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1 rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1.5 text-xs font-medium',
                mode === 'preview'
                  ? 'bg-card-deep text-ink'
                  : 'text-ink-soft hover:text-ink',
              )}
            >
              <Eye className="size-3.5" />
              Preview
            </button>
          </div>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm('Delete this note permanently?')) {
                deleteMutation.mutate(undefined, {
                  onSuccess: async () => {
                    await queryClient.invalidateQueries({ queryKey: ['notes'] })
                    await router.navigate({ to: '/notes' })
                  },
                })
              }
            }}
            disabled={deleteMutation.isPending}
          >
            Delete
          </Button>
        </div>
      </div>

      <Input
        value={title}
        onChange={(e) => {
          const next = e.target.value
          setTitle(next)
          scheduleSave(next, content)
        }}
        placeholder="Note title"
        className="mb-3 font-display text-lg font-semibold"
      />

      {mode === 'write' ? (
        <Textarea
          value={content}
          onChange={(e) => {
            const next = e.target.value
            setContent(next)
            scheduleSave(title, next)
          }}
          placeholder="Write markdown…"
          className="min-h-[60vh] font-mono text-sm leading-relaxed"
        />
      ) : (
        <article className="prose prose-zinc dark:prose-invert min-h-[60vh] max-w-none rounded-(--radius-card) border border-line bg-card px-4 py-3">
          {content.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          ) : (
            <p className="text-ink-faint not-prose">Nothing to preview yet.</p>
          )}
        </article>
      )}
    </div>
  )
}
