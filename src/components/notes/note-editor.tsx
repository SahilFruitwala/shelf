import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Eye, Lock, PenLine } from 'lucide-react'

import { useVault } from '#/contexts/vault-context'
import { SerialSaveQueue } from '#/lib/serial-save-queue'
import { deleteNote, getNote, updateNote } from '#/server/notes'
import { cn } from '#/lib/utils'
import { Button, Input, Textarea } from '#/components/ui'
import { NoteEditorSkeleton, SkeletonText } from '#/components/skeletons'

type EditorMode = 'write' | 'preview'
type NoteDraft = { title: string; content: string }
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const NotePreview = lazy(() =>
  import('./note-preview').then((module) => ({
    default: module.NotePreview,
  })),
)

/** Placeholder for the markdown renderer while its chunk downloads. */
function NotePreviewFallback() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading preview</span>
      <SkeletonText lines={6} />
    </div>
  )
}

export function NoteEditor({ noteId }: { noteId: string }) {
  const { masterKey, lock } = useVault()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<EditorMode>('write')
  const [loaded, setLoaded] = useState(false)
  const [decryptError, setDecryptError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<NoteDraft | null>(null)
  const versionRef = useRef<number | null>(null)
  const persistRef = useRef<(payload: NoteDraft) => Promise<void>>(
    async () => {},
  )
  const mountedRef = useRef(true)
  const decryptRunRef = useRef<symbol | null>(null)
  const saveQueueRef = useRef<SerialSaveQueue<NoteDraft> | null>(null)

  if (!saveQueueRef.current) {
    saveQueueRef.current = new SerialSaveQueue(
      (payload) => persistRef.current(payload),
      (error) => {
        if (!mountedRef.current) return
        setSaveState('error')
        setSaveError(
          error instanceof Error ? error.message : 'Could not save note',
        )
      },
    )
  }

  const noteQuery = useQuery({
    queryKey: ['note', noteId],
    queryFn: () => getNote({ data: noteId }),
    enabled: !!masterKey,
  })

  useEffect(
    () => () => {
      mountedRef.current = false
    },
    [],
  )

  useEffect(() => {
    setLoaded(false)
    setDecryptError(null)
    setTitle('')
    setContent('')
    setSaveState('idle')
    setSaveError(null)
    versionRef.current = null

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      const pending = pendingSaveRef.current
      if (pending) {
        pendingSaveRef.current = null
        saveQueueRef.current?.enqueue(pending)
      }
      void saveQueueRef.current?.flush()
    }
  }, [noteId])

  useEffect(() => {
    if (!masterKey || !noteQuery.data) return

    const run = Symbol('decrypt-note')
    decryptRunRef.current = run
    setDecryptError(null)
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
        if (decryptRunRef.current === run) {
          setTitle(decTitle)
          setContent(decContent)
          versionRef.current = noteQuery.data.version
          setLoaded(true)
        }
      } catch {
        if (decryptRunRef.current === run) {
          setLoaded(false)
          setDecryptError(
            'This note could not be decrypted. It has not been modified.',
          )
        }
      }
    })()

    return () => {
      if (decryptRunRef.current === run) decryptRunRef.current = null
    }
  }, [masterKey, noteQuery.data, noteId])

  const persistSave = useCallback(
    async (payload: NoteDraft) => {
      if (!masterKey) throw new Error('Vault locked')
      const expectedVersion = versionRef.current
      if (expectedVersion === null) throw new Error('Note is not ready to save')

      if (mountedRef.current) {
        setSaveState('saving')
        setSaveError(null)
      }

      const { encryptNoteFields } = await import('#/lib/crypto/note-crypto')
      const encrypted = await encryptNoteFields(masterKey, payload)
      const result = await updateNote({
        data: {
          noteId,
          expectedVersion,
          ...encrypted,
        },
      })
      versionRef.current = result.version

      queryClient.setQueryData<
        Array<{
          id: string
          encryptedTitle: string
          titleIv: string
          createdAt: Date
          updatedAt: Date
        }>
      >(['notes'], (notes) =>
        notes?.map((note) =>
          note.id === noteId
            ? {
                ...note,
                encryptedTitle: encrypted.encryptedTitle,
                titleIv: encrypted.titleIv,
                updatedAt: result.updatedAt,
              }
            : note,
        ),
      )

      if (mountedRef.current) setSaveState('saved')
    },
    [masterKey, noteId, queryClient],
  )
  persistRef.current = persistSave

  const scheduleSave = useCallback(
    (nextTitle: string, nextContent: string) => {
      if (!loaded || !masterKey) return
      pendingSaveRef.current = { title: nextTitle, content: nextContent }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      setSaveState('saving')
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null
        pendingSaveRef.current = null
        saveQueueRef.current?.enqueue({
          title: nextTitle,
          content: nextContent,
        })
      }, 800)
    },
    [loaded, masterKey],
  )

  const deleteMutation = useMutation({
    mutationFn: () => deleteNote({ data: noteId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notes'] })
      queryClient.removeQueries({ queryKey: ['note', noteId] })
      await router.navigate({ to: '/notes' })
    },
  })

  if (noteQuery.isError) {
    return <p className="text-sm text-danger">Note not found.</p>
  }

  if (decryptError) {
    return (
      <div className="space-y-3 py-8">
        <p className="text-sm text-danger">{decryptError}</p>
        <Button variant="quiet" onClick={lock}>
          Lock vault
        </Button>
      </div>
    )
  }

  if (noteQuery.isLoading || !loaded) {
    return <NoteEditorSkeleton />
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
                : saveState === 'error'
                  ? (saveError ?? 'Save failed')
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
          <Button variant="quiet" onClick={lock}>
            <Lock className="size-4" />
            Lock
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm('Delete this note permanently?')) {
                deleteMutation.mutate()
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
        <Suspense fallback={<NotePreviewFallback />}>
          <NotePreview content={content} />
        </Suspense>
      )}
    </div>
  )
}
