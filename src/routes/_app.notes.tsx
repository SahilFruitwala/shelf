import { Outlet, createFileRoute } from '@tanstack/react-router'

import { NotesVaultLayout } from '#/components/notes/notes-vault-layout'
import { vaultStatusQueryOptions } from '#/contexts/vault-context'

export const Route = createFileRoute('/_app/notes')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(vaultStatusQueryOptions())
  },
  component: NotesLayout,
})

function NotesLayout() {
  return (
    <NotesVaultLayout>
      <Outlet />
    </NotesVaultLayout>
  )
}
