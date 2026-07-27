import { useVault, VaultProvider } from '#/contexts/vault-context'
import { VaultGateSkeleton } from '#/components/skeletons'
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
    return <VaultGateSkeleton />
  }
  if (state === 'noVault') return <VaultSetup />
  if (state === 'locked') return <VaultUnlock />
  return children
}
