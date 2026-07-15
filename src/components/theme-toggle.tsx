import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'

function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
  return () => observer.disconnect()
}

function getDarkSnapshot() {
  return document.documentElement.classList.contains('dark')
}

function getDarkServerSnapshot() {
  return true
}

export function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(
    subscribe,
    getDarkSnapshot,
    getDarkServerSnapshot,
  )

  function toggle() {
    const next = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('shelf-theme', next ? 'dark' : 'light')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={
        className ??
        'cursor-pointer rounded-full p-2 text-ink-soft hover:bg-card-deep hover:text-ink'
      }
    >
      {dark ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
    </button>
  )
}
