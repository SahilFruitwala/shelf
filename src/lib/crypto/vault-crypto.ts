import { argon2id } from 'hash-wasm'

import type {
  EncryptedField,
  VaultKdfParams,
  VaultRecord,
  VaultSetupPayload,
} from './types'
import { DEFAULT_KDF_PARAMS } from './types'

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length))
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes)
}

export function toBase64(bytes: Uint8Array): string {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  return btoa(bin)
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function deriveWrappingKey(
  passphrase: string,
  salt: Uint8Array,
  params: VaultKdfParams,
): Promise<CryptoKey> {
  const raw = copyBytes(
    await argon2id({
      password: passphrase,
      salt,
      parallelism: params.parallelism,
      iterations: params.iterations,
      memorySize: params.memory,
      hashLength: 32,
      outputType: 'binary',
    }),
  )
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(raw),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function importMasterKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(raw),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function wrapMasterKey(
  wrappingKey: CryptoKey,
  masterKeyRaw: Uint8Array<ArrayBuffer>,
): Promise<{ wrappedKey: string; wrapIv: string }> {
  const wrapIv = randomBytes(12)
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: wrapIv },
    wrappingKey,
    toArrayBuffer(masterKeyRaw),
  )
  return {
    wrappedKey: toBase64(new Uint8Array(wrapped)),
    wrapIv: toBase64(wrapIv),
  }
}

async function unwrapMasterKey(
  wrappingKey: CryptoKey,
  record: Pick<VaultRecord, 'wrappedKey' | 'wrapIv'>,
): Promise<CryptoKey> {
  const wrapped = copyBytes(fromBase64(record.wrappedKey))
  const wrapIv = copyBytes(fromBase64(record.wrapIv))
  let raw: ArrayBuffer
  try {
    raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: wrapIv },
      wrappingKey,
      toArrayBuffer(wrapped),
    )
  } catch {
    throw new Error('Invalid vault passphrase')
  }
  return importMasterKey(new Uint8Array(raw))
}

export interface CreateVaultResult extends VaultSetupPayload {
  masterKey: CryptoKey
}

export async function createVault(
  passphrase: string,
  kdfParams: VaultKdfParams = DEFAULT_KDF_PARAMS,
): Promise<CreateVaultResult> {
  const salt = randomBytes(16)
  const masterKeyRaw = randomBytes(32)
  const wrappingKey = await deriveWrappingKey(passphrase, salt, kdfParams)
  const { wrappedKey, wrapIv } = await wrapMasterKey(wrappingKey, masterKeyRaw)
  const masterKey = await importMasterKey(masterKeyRaw)
  return {
    wrappedKey,
    wrapIv,
    salt: toBase64(salt),
    kdfParams,
    masterKey,
  }
}

export async function unlockVault(
  passphrase: string,
  record: VaultRecord,
): Promise<CryptoKey> {
  const salt = copyBytes(fromBase64(record.salt))
  const wrappingKey = await deriveWrappingKey(
    passphrase,
    salt,
    record.kdfParams,
  )
  return unwrapMasterKey(wrappingKey, record)
}

export async function encryptField(
  masterKey: CryptoKey,
  plaintext: string,
): Promise<EncryptedField> {
  const iv = randomBytes(12)
  const encoded = new TextEncoder().encode(plaintext)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    toArrayBuffer(encoded),
  )
  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
  }
}

export async function decryptField(
  masterKey: CryptoKey,
  ciphertext: string,
  iv: string,
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: copyBytes(fromBase64(iv)) },
    masterKey,
    toArrayBuffer(copyBytes(fromBase64(ciphertext))),
  )
  return new TextDecoder().decode(decrypted)
}
