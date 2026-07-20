import { useEffect } from 'react'

/** Fire `handler` when `key` is pressed, unless the user is typing in a
 *  field or a modal/menu already has focus. Bare single-key shortcut. */
export function useHotkey(key: string, handler: () => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== key.toLowerCase()) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (
        el &&
        (el.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
      )
        return
      e.preventDefault()
      handler()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key, handler])
}
