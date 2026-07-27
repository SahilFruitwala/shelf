import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

import { NotesVaultLayout } from '#/components/notes/notes-vault-layout'
import { vaultStatusQueryOptions } from '#/contexts/vault-context'
import { features } from '#/lib/features'
import { VaultGateSkeleton } from '#/components/skeletons'

export const Route = createFileRoute('/_app/notes')({
  beforeLoad: () => {
    if (!features.notes) throw redirect({ to: '/' })
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(vaultStatusQueryOptions())
  },
  component: NotesLayout,
  pendingComponent: VaultGateSkeleton,
})

function NotesLayout() {
  return (
    <NotesVaultLayout>
      <Outlet />
    </NotesVaultLayout>
  )
}
