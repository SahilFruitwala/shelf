import { createFileRoute } from '@tanstack/react-router'

import { NotesList } from '#/components/notes/notes-list'
import { NotesListSkeleton } from '#/components/skeletons'

export const Route = createFileRoute('/_app/notes/')({
  component: NotesList,
  pendingComponent: NotesListSkeleton,
})
