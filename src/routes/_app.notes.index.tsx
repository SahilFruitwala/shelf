import { createFileRoute } from '@tanstack/react-router'

import { NotesList } from '#/components/notes/notes-list'

export const Route = createFileRoute('/_app/notes/')({
  component: NotesList,
})
