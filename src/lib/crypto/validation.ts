import type { VaultKdfParams } from './types'

const BASE64_RE =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

const AES_GCM_TAG_BYTES = 16
const MAX_PLAINTEXT_BYTES = 1024 * 1024

export interface EncryptedNotePayload {
  encryptedTitle: string
  titleIv: string
  encryptedContent: string
  contentIv: string
}

function decodedByteLength(value: string) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return (value.length / 4) * 3 - padding
}

function validateBase64(
  value: string,
  fieldName: string,
  bounds: { minBytes?: number; maxBytes?: number; exactBytes?: number },
) {
  const maxBytes = bounds.exactBytes ?? bounds.maxBytes
  const maxEncodedLength =
    maxBytes === undefined ? undefined : Math.ceil(maxBytes / 3) * 4
  if (maxEncodedLength !== undefined && value.length > maxEncodedLength) {
    throw new Error(`Invalid ${fieldName}`)
  }
  if (!value || value.length % 4 !== 0 || !BASE64_RE.test(value)) {
    throw new Error(`Invalid ${fieldName} encoding`)
  }

  const bytes = decodedByteLength(value)
  if (
    (bounds.exactBytes !== undefined && bytes !== bounds.exactBytes) ||
    (bounds.minBytes !== undefined && bytes < bounds.minBytes) ||
    (bounds.maxBytes !== undefined && bytes > bounds.maxBytes)
  ) {
    throw new Error(`Invalid ${fieldName}`)
  }
}

export function validateKdfParams(params: VaultKdfParams) {
  if (
    !Number.isInteger(params.memory) ||
    !Number.isInteger(params.iterations) ||
    !Number.isInteger(params.parallelism) ||
    params.memory < 8192 ||
    params.memory > 262144 ||
    params.iterations < 1 ||
    params.iterations > 10 ||
    params.parallelism < 1 ||
    params.parallelism > 4
  ) {
    throw new Error('Invalid KDF parameters')
  }
}

export function validateVaultSetupPayload(data: {
  wrappedKey: string
  wrapIv: string
  salt: string
  kdfParams: VaultKdfParams
}) {
  validateBase64(data.wrappedKey, 'wrappedKey', { exactBytes: 48 })
  validateBase64(data.wrapIv, 'wrapIv', { exactBytes: 12 })
  validateBase64(data.salt, 'salt', { exactBytes: 16 })
  validateKdfParams(data.kdfParams)
}

export function validateEncryptedNoteInput(data: EncryptedNotePayload) {
  validateBase64(data.encryptedTitle, 'encryptedTitle', {
    minBytes: AES_GCM_TAG_BYTES,
    maxBytes: MAX_PLAINTEXT_BYTES + AES_GCM_TAG_BYTES,
  })
  validateBase64(data.titleIv, 'titleIv', { exactBytes: 12 })
  validateBase64(data.encryptedContent, 'encryptedContent', {
    minBytes: AES_GCM_TAG_BYTES,
    maxBytes: MAX_PLAINTEXT_BYTES + AES_GCM_TAG_BYTES,
  })
  validateBase64(data.contentIv, 'contentIv', { exactBytes: 12 })
}
