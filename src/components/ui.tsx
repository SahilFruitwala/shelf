import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '#/lib/utils'

type ButtonVariant = 'primary' | 'quiet' | 'ghost' | 'danger'

export function Button({
  variant = 'quiet',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-(--radius-control) px-4 py-2.5 text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary' &&
          'bg-accent text-accent-ink shadow-[0_0_14px_-4px_var(--accent)] hover:shadow-[0_0_22px_-4px_var(--accent)] active:scale-[0.98]',
        variant === 'quiet' &&
          'border border-line bg-card-deep text-ink hover:border-ink-faint',
        variant === 'ghost' &&
          'text-ink-soft hover:bg-card-deep hover:text-ink',
        variant === 'danger' && 'text-danger hover:bg-card-deep',
        className,
      )}
      {...props}
    />
  )
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-(--radius-control) border border-line bg-card-deep px-3.5 py-2.5 text-[15px] text-ink transition-colors placeholder:text-ink-faint focus:border-accent focus:outline-none',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full resize-none rounded-(--radius-control) border border-line bg-card-deep px-3.5 py-2.5 text-[15px] text-ink transition-colors placeholder:text-ink-faint focus:border-accent focus:outline-none',
        className,
      )}
      {...props}
    />
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself) closes.
        if (e.target === ref.current) onClose()
      }}
      className={cn(
        'glow-card m-auto w-[calc(100vw-2rem)] rounded-(--radius-card) p-0 text-ink shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm open:animate-in open:fade-in open:zoom-in-95 open:duration-150',
        wide ? 'max-w-xl' : 'max-w-md',
      )}
    >
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-full p-1.5 text-ink-faint hover:bg-card-deep hover:text-ink"
          >
            <X className="size-4.5" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-label="Loading"
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-ink-faint border-t-transparent',
        className,
      )}
    />
  )
}
