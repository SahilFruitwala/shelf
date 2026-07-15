import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { VaultRecord } from '#/lib/crypto/types'
import {
  getVaultRecord,
  getVaultStatus,
  setupVault,
} from '#/server/notes'

export type VaultState = 'loading' | 'noVault' | 'locked' | 'unlocked'

interface VaultContextValue {
  state: VaultState
  masterKey: CryptoKey | null
  setup: (passphrase: string) => Promise<void>
  unlock: (passphrase: string) => Promise<void>
  lock: () => void
  error: string | null
  clearError: () => void
}

const VaultContext = createContext<VaultContextValue | null>(null)

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  const statusQuery = useQuery({
    queryKey: ['vault-status'],
    queryFn: () => getVaultStatus(),
  })

  const state: VaultState = useMemo(() => {
    if (statusQuery.isLoading) return 'loading'
    if (!statusQuery.data?.exists) return 'noVault'
    if (!masterKey) return 'locked'
    return 'unlocked'
  }, [statusQuery.isLoading, statusQuery.data?.exists, masterKey])

  const lock = useCallback(() => {
    setMasterKey(null)
    setError(null)
  }, [])

  const setup = useCallback(
    async (passphrase: string) => {
      setError(null)
      const { createVault } = await import('#/lib/crypto/vault-crypto')
      const result = await createVault(passphrase)
      await setupVault({
        data: {
          wrappedKey: result.wrappedKey,
          wrapIv: result.wrapIv,
          salt: result.salt,
          kdfParams: result.kdfParams,
        },
      })
      setMasterKey(result.masterKey)
      await queryClient.invalidateQueries({ queryKey: ['vault-status'] })
    },
    [queryClient],
  )

  const unlock = useCallback(async (passphrase: string) => {
    setError(null)
    try {
      const { unlockVault } = await import('#/lib/crypto/vault-crypto')
      const record: VaultRecord = await getVaultRecord()
      const key = await unlockVault(passphrase, record)
      setMasterKey(key)
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Could not unlock vault'
      setError(message)
      throw e
    }
  }, [])

  useEffect(() => {
    if (state === 'noVault') setMasterKey(null)
  }, [state])

  const value = useMemo(
    () => ({
      state,
      masterKey,
      setup,
      unlock,
      lock,
      error,
      clearError: () => setError(null),
    }),
    [state, masterKey, setup, unlock, lock, error],
  )

  return (
    <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
  )
}

export function useVault() {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error('useVault must be used within VaultProvider')
  return ctx
}
