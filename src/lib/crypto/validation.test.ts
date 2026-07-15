import { describe, expect, it } from 'vitest'

import { toBase64 } from './vault-crypto'
import {
  validateEncryptedNoteInput,
  validateKdfParams,
  validateVaultSetupPayload,
} from './validation'

function encodedBytes(length: number) {
  return toBase64(new Uint8Array(length))
}

describe('vault payload validation', () => {
  it('accepts correctly sized AES-GCM payloads', () => {
    expect(() =>
      validateEncryptedNoteInput({
        encryptedTitle: encodedBytes(17),
        titleIv: encodedBytes(12),
        encryptedContent: encodedBytes(32),
        contentIv: encodedBytes(12),
      }),
    ).not.toThrow()
  })

  it('rejects malformed base64 and incorrectly sized IVs', () => {
    expect(() =>
      validateEncryptedNoteInput({
        encryptedTitle: 'not base64',
        titleIv: encodedBytes(12),
        encryptedContent: encodedBytes(16),
        contentIv: encodedBytes(12),
      }),
    ).toThrow('encoding')

    expect(() =>
      validateEncryptedNoteInput({
        encryptedTitle: encodedBytes(16),
        titleIv: encodedBytes(16),
        encryptedContent: encodedBytes(16),
        contentIv: encodedBytes(12),
      }),
    ).toThrow('titleIv')
  })

  it('rejects oversized ciphertext before accepting the payload', () => {
    expect(() =>
      validateEncryptedNoteInput({
        encryptedTitle: encodedBytes(1024 * 1024 + 17),
        titleIv: encodedBytes(12),
        encryptedContent: encodedBytes(16),
        contentIv: encodedBytes(12),
      }),
    ).toThrow('encryptedTitle')
  })

  it('caps attacker-controlled KDF work factors', () => {
    expect(() =>
      validateKdfParams({
        memory: 262145,
        iterations: 3,
        parallelism: 1,
      }),
    ).toThrow('Invalid KDF parameters')
  })

  it('validates wrapped key, IV, and salt sizes', () => {
    expect(() =>
      validateVaultSetupPayload({
        wrappedKey: encodedBytes(48),
        wrapIv: encodedBytes(12),
        salt: encodedBytes(16),
        kdfParams: { memory: 65536, iterations: 3, parallelism: 1 },
      }),
    ).not.toThrow()
  })
})
