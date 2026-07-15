import { forwardRef, useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
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

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-(--radius-control) border border-line bg-card-deep px-3.5 py-2.5 text-[15px] text-ink transition-colors placeholder:text-ink-faint focus:border-accent focus:outline-none',
        className,
      )}
      {...props}
    />
  )
})

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
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
        {label}
      </span>
      {hint && (
        <p className="mb-2 text-[13px] leading-relaxed text-ink-faint">{hint}</p>
      )}
      {children}
    </label>
  )
}

/** Short contextual tip — optional dismiss stores a localStorage key. */
export function Hint({
  children,
  dismissKey,
  className,
}: {
  children: ReactNode
  /** When set, a dismiss button hides this hint until localStorage is cleared. */
  dismissKey?: string
  className?: string
}) {
  const [dismissed, setDismissed] = useState(
    () => dismissKey != null && localStorage.getItem(dismissKey) === '1',
  )
  if (dismissed) return null
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 rounded-(--radius-control) border border-line bg-card-deep px-4 py-3 text-[13px] leading-relaxed text-ink-soft',
        className,
      )}
    >
      <div className="min-w-0">{children}</div>
      {dismissKey && (
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(dismissKey, '1')
            setDismissed(true)
          }}
          className="shrink-0 cursor-pointer rounded-full p-1 text-ink-faint hover:bg-card hover:text-ink"
          aria-label="Dismiss tip"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
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
    if (open && !dialog.open) {
      dialog.showModal()
      // showModal() focuses the first focusable element (the close button).
      // Defer to the input marked with autoFocus instead.
      requestAnimationFrame(() => {
        dialog
          .querySelector<HTMLElement>('input[autofocus], textarea[autofocus]')
          ?.focus()
      })
    }
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

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }
>(function Select({ className, compact, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'w-full cursor-pointer appearance-none rounded-(--radius-control) border border-line bg-card-deep text-ink transition-colors hover:border-ink-faint focus:border-accent focus:outline-none',
          compact
            ? 'py-1.5 pl-8 pr-8 text-[13px] font-medium'
            : 'px-3.5 py-2.5 text-[15px]',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className={cn(
          'pointer-events-none absolute top-1/2 size-3.5 -translate-y-1/2 text-ink-faint',
          compact ? 'right-2.5' : 'right-3',
        )}
      />
    </div>
  )
})

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <h2
      className={cn(
        'section-label mb-4 text-[13px] font-semibold uppercase tracking-wide text-ink-faint',
        className,
      )}
    >
      {children}
    </h2>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-(--radius-control) bg-card-deep',
        className,
      )}
    />
  )
}

export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <Spinner className="size-6" />
      <p className="mt-4 text-[15px] text-ink-faint">{label}</p>
    </div>
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  busy,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-[15px] leading-relaxed text-ink-soft">{description}</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? 'quiet' : 'primary'}
          onClick={onConfirm}
          disabled={busy}
          className={
            destructive
              ? 'border-danger/40 text-danger hover:border-danger hover:bg-danger/10'
              : undefined
          }
        >
          {busy ? 'One moment…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
