import type { EncryptedNotePayload } from './validation'
import { encryptField } from './vault-crypto'

export async function encryptNoteFields(
  masterKey: CryptoKey,
  note: { title: string; content: string },
): Promise<EncryptedNotePayload> {
  const [title, content] = await Promise.all([
    encryptField(masterKey, note.title),
    encryptField(masterKey, note.content),
  ])

  return {
    encryptedTitle: title.ciphertext,
    titleIv: title.iv,
    encryptedContent: content.ciphertext,
    contentIv: content.iv,
  }
}
