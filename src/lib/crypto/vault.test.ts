import { describe, expect, it } from 'vitest'

import {
  createVault,
  decryptField,
  encryptField,
  fromBase64,
  toBase64,
  unlockVault,
} from './vault-crypto'
import { DEFAULT_KDF_PARAMS } from './types'

describe('vault crypto', () => {
  it('round-trips base64 encoding', () => {
    const bytes = new Uint8Array([1, 2, 3, 255])
    expect(fromBase64(toBase64(bytes))).toEqual(bytes)
  })

  it('encrypts and decrypts note fields', async () => {
    const { masterKey } = await createVault('test-passphrase-123')
    const encrypted = await encryptField(masterKey, '# Hello\n\nWorld')
    const plain = await decryptField(
      masterKey,
      encrypted.ciphertext,
      encrypted.iv,
    )
    expect(plain).toBe('# Hello\n\nWorld')
  })

  it('rejects tampered ciphertext', async () => {
    const { masterKey } = await createVault('test-passphrase-123')
    const encrypted = await encryptField(masterKey, 'do not change')
    const replacement = encrypted.ciphertext[0] === 'A' ? 'B' : 'A'
    const tampered = replacement + encrypted.ciphertext.slice(1)

    await expect(
      decryptField(masterKey, tampered, encrypted.iv),
    ).rejects.toThrow()
  })

  it('unlocks vault with correct passphrase', async () => {
    const passphrase = 'my-secure-vault-pass'
    const setup = await createVault(passphrase)
    const unlocked = await unlockVault(passphrase, setup)
    const encrypted = await encryptField(unlocked, 'secret note')
    const plain = await decryptField(
      unlocked,
      encrypted.ciphertext,
      encrypted.iv,
    )
    expect(plain).toBe('secret note')
  })

  it('rejects wrong passphrase', async () => {
    const setup = await createVault('correct-pass')
    await expect(unlockVault('wrong-pass', setup)).rejects.toThrow(
      'Invalid vault passphrase',
    )
  })

  it('uses deterministic kdf params in setup payload', async () => {
    const setup = await createVault('pass', DEFAULT_KDF_PARAMS)
    expect(setup.kdfParams).toEqual(DEFAULT_KDF_PARAMS)
    expect(setup.salt.length).toBeGreaterThan(0)
    expect(setup.wrappedKey.length).toBeGreaterThan(0)
  })
})
