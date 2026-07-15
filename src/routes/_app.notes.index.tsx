import { createFileRoute } from '@tanstack/react-router'

import { useVault } from '#/contexts/vault-context'
import { NotesList } from '#/components/notes/notes-list'
import { VaultSetup } from '#/components/notes/vault-setup'
import { VaultUnlock } from '#/components/notes/vault-unlock'

export const Route = createFileRoute('/_app/notes/')({
  component: NotesPage,
})

function NotesPage() {
  const { state } = useVault()

  if (state === 'loading') {
    return <p className="py-12 text-sm text-ink-soft">Loading vault…</p>
  }
  if (state === 'noVault') return <VaultSetup />
  if (state === 'locked') return <VaultUnlock />
  return <NotesList />
}
