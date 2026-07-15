import { VaultProvider } from '#/contexts/vault-context'

export function NotesVaultLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <VaultProvider>{children}</VaultProvider>
}
