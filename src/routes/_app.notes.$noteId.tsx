import { createFileRoute } from '@tanstack/react-router'

import { NoteEditor } from '#/components/notes/note-editor'
import { NoteEditorSkeleton } from '#/components/skeletons'

export const Route = createFileRoute('/_app/notes/$noteId')({
  component: NotePage,
  pendingComponent: NoteEditorSkeleton,
})

function NotePage() {
  const { noteId } = Route.useParams()
  return <NoteEditor key={noteId} noteId={noteId} />
}
