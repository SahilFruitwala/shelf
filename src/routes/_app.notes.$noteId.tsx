import { createFileRoute } from '@tanstack/react-router'

import { useVault } from '#/contexts/vault-context'
import { NoteEditor } from '#/components/notes/note-editor'
import { VaultSetup } from '#/components/notes/vault-setup'
import { VaultUnlock } from '#/components/notes/vault-unlock'

export const Route = createFileRoute('/_app/notes/$noteId')({
  component: NotePage,
})

function NotePage() {
  const { noteId } = Route.useParams()
  const { state } = useVault()

  if (state === 'loading') {
    return <p className="py-12 text-sm text-ink-soft">Loading vault…</p>
  }
  if (state === 'noVault') return <VaultSetup />
  if (state === 'locked') return <VaultUnlock />
  return <NoteEditor key={noteId} noteId={noteId} />
}
