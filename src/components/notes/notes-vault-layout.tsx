import { useVault, VaultProvider } from '#/contexts/vault-context'
import { VaultSetup } from './vault-setup'
import { VaultUnlock } from './vault-unlock'

export function NotesVaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <VaultProvider>
      <NotesVaultGate>{children}</NotesVaultGate>
    </VaultProvider>
  )
}

function NotesVaultGate({ children }: { children: React.ReactNode }) {
  const { state } = useVault()

  if (state === 'loading') {
    return <p className="py-12 text-sm text-ink-soft">Loading vault…</p>
  }
  if (state === 'noVault') return <VaultSetup />
  if (state === 'locked') return <VaultUnlock />
  return children
}
