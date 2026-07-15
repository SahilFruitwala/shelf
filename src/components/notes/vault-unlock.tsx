import { useState } from 'react'
import { LockKeyhole } from 'lucide-react'

import { useVault } from '#/contexts/vault-context'
import { Button, Field, Input } from '#/components/ui'

export function VaultUnlock() {
  const { unlock, error, clearError } = useVault()
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!passphrase || busy) return
    setBusy(true)
    clearError()
    try {
      await unlock(passphrase)
      setPassphrase('')
    } catch {
      // error surfaced via context
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-full bg-accent-soft">
          <LockKeyhole className="size-5 text-accent" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">Unlock your vault</h1>
          <p className="text-sm text-ink-soft">
            Enter your vault passphrase to decrypt your notes.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Vault passphrase">
          <Input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="current-password"
            placeholder="Your vault passphrase"
            autoFocus
          />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" disabled={!passphrase || busy}>
          {busy ? 'Unlocking…' : 'Unlock vault'}
        </Button>
      </form>
    </div>
  )
}
