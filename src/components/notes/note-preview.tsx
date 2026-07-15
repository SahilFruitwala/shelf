import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function NotePreview({ content }: { content: string }) {
  return (
    <article className="prose prose-zinc dark:prose-invert min-h-[60vh] max-w-none rounded-(--radius-card) border border-line bg-card px-4 py-3">
      {content.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      ) : (
        <p className="text-ink-faint not-prose">Nothing to preview yet.</p>
      )}
    </article>
  )
}
