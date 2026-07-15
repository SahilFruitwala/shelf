import { useState } from 'react'
import { Lock, ShieldAlert } from 'lucide-react'

import { useVault } from '#/contexts/vault-context'
import { Button, Field, Hint, Input } from '#/components/ui'

export function VaultSetup() {
  const { setup } = useVault()
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const canSubmit =
    passphrase.length >= 8 &&
    passphrase === confirm &&
    !busy

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setLocalError(null)
    try {
      await setup(passphrase)
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Could not create vault',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-full bg-accent-soft">
          <Lock className="size-5 text-accent" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">Create your vault</h1>
          <p className="text-sm text-ink-soft">
            End-to-end encrypted notes — only you can read them.
          </p>
        </div>
      </div>

      <Hint className="mb-6">
        <div className="flex gap-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent" />
          <p>
            Your vault passphrase is separate from your login password. If you
            forget it, your notes cannot be recovered — there is no reset.
          </p>
        </div>
      </Hint>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Vault passphrase"
          hint="At least 8 characters. Use something memorable but hard to guess."
        >
          <Input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="new-password"
            placeholder="Choose a strong passphrase"
          />
        </Field>
        <Field label="Confirm passphrase">
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            placeholder="Repeat your passphrase"
          />
        </Field>
        {(localError || (confirm && passphrase !== confirm)) && (
          <p className="text-sm text-danger">
            {localError ??
              (confirm && passphrase !== confirm
                ? 'Passphrases do not match'
                : null)}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={!canSubmit}>
          {busy ? 'Creating vault…' : 'Create vault'}
        </Button>
      </form>
    </div>
  )
}
