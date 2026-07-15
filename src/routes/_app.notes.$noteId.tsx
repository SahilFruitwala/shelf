import { createFileRoute } from '@tanstack/react-router'

import { NoteEditor } from '#/components/notes/note-editor'

export const Route = createFileRoute('/_app/notes/$noteId')({
  component: NotePage,
})

function NotePage() {
  const { noteId } = Route.useParams()
  return <NoteEditor key={noteId} noteId={noteId} />
}
