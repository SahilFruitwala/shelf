import { Outlet, createFileRoute } from '@tanstack/react-router'

import { NotesVaultLayout } from '#/components/notes/notes-vault-layout'

export const Route = createFileRoute('/_app/notes')({
  component: NotesLayout,
})

function NotesLayout() {
  return (
    <NotesVaultLayout>
      <Outlet />
    </NotesVaultLayout>
  )
}
