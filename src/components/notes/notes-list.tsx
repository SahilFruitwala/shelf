import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Lock, Search } from 'lucide-react'

import { useVault } from '#/contexts/vault-context'
import { listNotes } from '#/server/notes'
import { cn, timeAgo } from '#/lib/utils'
import { CreateNoteButton } from '#/components/notes/create-note-button'
import { Input } from '#/components/ui'

interface DecryptedNoteSummary {
  id: string
  title: string
  updatedAt: Date
}

export function NotesList() {
  const { masterKey, lock } = useVault()
  const [search, setSearch] = useState('')
  const [decrypted, setDecrypted] = useState<DecryptedNoteSummary[]>([])
  const [decrypting, setDecrypting] = useState(false)
  const [decryptError, setDecryptError] = useState<string | null>(null)

  const notesQuery = useQuery({
    queryKey: ['notes'],
    queryFn: () => listNotes(),
    enabled: !!masterKey,
  })

  useEffect(() => {
    if (!masterKey || !notesQuery.data) {
      setDecrypted([])
      setDecrypting(false)
      return
    }

    if (notesQuery.data.length === 0) {
      setDecrypted([])
      setDecrypting(false)
      setDecryptError(null)
      return
    }

    setDecrypting(true)
    let cancelled = false
    ;(async () => {
      try {
        const { decryptField } = await import('#/lib/crypto/vault-crypto')
        const rows = await Promise.all(
          notesQuery.data.map(async (note) => {
            const title = await decryptField(
              masterKey,
              note.encryptedTitle,
              note.titleIv,
            )
            return {
              id: note.id,
              title: title.trim() || 'Untitled',
              updatedAt: new Date(note.updatedAt),
            }
          }),
        )
        if (!cancelled) {
          setDecrypted(rows)
          setDecryptError(null)
        }
      } catch {
        if (!cancelled) {
          setDecryptError('Could not decrypt notes. Try unlocking again.')
        }
      } finally {
        if (!cancelled) setDecrypting(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [masterKey, notesQuery.data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return decrypted
    return decrypted.filter((n) => n.title.toLowerCase().includes(q))
  }, [decrypted, search])

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Notes</h1>
          <p className="text-sm text-ink-soft">
            Encrypted on your device before sync.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={lock}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-(--radius-control) border border-line px-3 py-2 text-sm text-ink-soft hover:bg-card-deep hover:text-ink"
          >
            <Lock className="size-3.5" />
            Lock vault
          </button>
          <CreateNoteButton />
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes (client-side only)…"
          className="pl-9"
        />
      </div>

      {notesQuery.isLoading && (
        <p className="text-sm text-ink-soft">Loading encrypted notes…</p>
      )}
      {decrypting && (
        <p className="text-sm text-ink-soft">Decrypting notes…</p>
      )}
      {decryptError && (
        <p className="text-sm text-danger">{decryptError}</p>
      )}

      {!notesQuery.isLoading &&
        !decrypting &&
        filtered.length === 0 && (
        <div className="rounded-(--radius-card) border border-dashed border-line bg-card/50 px-6 py-12 text-center">
          <p className="mb-1 font-medium text-ink">
            {search ? 'No matching notes' : 'No notes yet'}
          </p>
          <p className="mb-4 text-sm text-ink-soft">
            {search
              ? 'Try a different search term.'
              : 'Create your first encrypted note — only you hold the key.'}
          </p>
          {!search && <CreateNoteButton />}
        </div>
      )}

      <ul className="space-y-2">
        {filtered.map((note) => (
          <li key={note.id}>
            <Link
              to="/notes/$noteId"
              params={{ noteId: note.id }}
              className={cn(
                'block rounded-(--radius-card) border border-line bg-card px-4 py-3 transition-colors hover:border-ink-faint hover:bg-card-deep',
              )}
            >
              <p className="font-medium text-ink">{note.title}</p>
              <p className="text-xs text-ink-faint">
                Updated {timeAgo(note.updatedAt)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
