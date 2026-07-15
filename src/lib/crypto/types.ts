export interface VaultKdfParams {
  memory: number
  iterations: number
  parallelism: number
}

export interface VaultRecord {
  wrappedKey: string
  wrapIv: string
  salt: string
  kdfParams: VaultKdfParams
}

export interface VaultSetupPayload {
  wrappedKey: string
  wrapIv: string
  salt: string
  kdfParams: VaultKdfParams
}

export interface EncryptedField {
  ciphertext: string
  iv: string
}

export const DEFAULT_KDF_PARAMS: VaultKdfParams = {
  memory: 65536,
  iterations: 3,
  parallelism: 1,
}
