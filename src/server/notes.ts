import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, isNull } from 'drizzle-orm'

import { encryptedNotes, userVault } from '#/db/schema'
import type { VaultKdfParams } from '#/db/schema'
import { getDb } from './db-access'
import { newId, requireUser } from './helpers'

const BASE64_RE = /^[A-Za-z0-9+/]+=*$/
const MAX_FIELD_BYTES = 1024 * 1024

function validateEncryptedField(value: string, fieldName: string) {
  if (!value || value.length > MAX_FIELD_BYTES * 1.4) {
    throw new Error(`Invalid ${fieldName}`)
  }
  if (!BASE64_RE.test(value)) {
    throw new Error(`Invalid ${fieldName} encoding`)
  }
}

function validateKdfParams(params: VaultKdfParams) {
  if (
    !Number.isFinite(params.memory) ||
    !Number.isFinite(params.iterations) ||
    !Number.isFinite(params.parallelism) ||
    params.memory < 8192 ||
    params.iterations < 1 ||
    params.parallelism < 1
  ) {
    throw new Error('Invalid KDF parameters')
  }
}

interface EncryptedNoteInput {
  encryptedTitle: string
  titleIv: string
  encryptedContent: string
  contentIv: string
}

function validateEncryptedNoteInput(data: EncryptedNoteInput) {
  validateEncryptedField(data.encryptedTitle, 'encryptedTitle')
  validateEncryptedField(data.titleIv, 'titleIv')
  validateEncryptedField(data.encryptedContent, 'encryptedContent')
  validateEncryptedField(data.contentIv, 'contentIv')
}

export const getVaultStatus = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = await getDb()
    const me = await requireUser()
    const vault = await db.query.userVault.findFirst({
      where: eq(userVault.userId, me.id),
    })
    return { exists: !!vault }
  },
)

export const setupVault = createServerFn({ method: 'POST' })
  .validator((data: {
    wrappedKey: string
    wrapIv: string
    salt: string
    kdfParams: VaultKdfParams
  }) => data)
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()

    const existing = await db.query.userVault.findFirst({
      where: eq(userVault.userId, me.id),
    })
    if (existing) throw new Error('Vault already exists')

    validateEncryptedField(data.wrappedKey, 'wrappedKey')
    validateEncryptedField(data.wrapIv, 'wrapIv')
    validateEncryptedField(data.salt, 'salt')
    validateKdfParams(data.kdfParams)

    await db.insert(userVault).values({
      userId: me.id,
      wrappedKey: data.wrappedKey,
      wrapIv: data.wrapIv,
      salt: data.salt,
      kdfParams: data.kdfParams,
    })

    return { ok: true }
  })

export const getVaultRecord = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = await getDb()
    const me = await requireUser()
    const vault = await db.query.userVault.findFirst({
      where: eq(userVault.userId, me.id),
    })
    if (!vault) throw new Error('Vault not found')
    return {
      wrappedKey: vault.wrappedKey,
      wrapIv: vault.wrapIv,
      salt: vault.salt,
      kdfParams: vault.kdfParams,
    }
  },
)

export const listNotes = createServerFn({ method: 'GET' }).handler(async () => {
  const db = await getDb()
  const me = await requireUser()
  return db
    .select({
      id: encryptedNotes.id,
      encryptedTitle: encryptedNotes.encryptedTitle,
      titleIv: encryptedNotes.titleIv,
      encryptedContent: encryptedNotes.encryptedContent,
      contentIv: encryptedNotes.contentIv,
      version: encryptedNotes.version,
      createdAt: encryptedNotes.createdAt,
      updatedAt: encryptedNotes.updatedAt,
    })
    .from(encryptedNotes)
    .where(
      and(
        eq(encryptedNotes.userId, me.id),
        isNull(encryptedNotes.deletedAt),
      ),
    )
    .orderBy(desc(encryptedNotes.updatedAt))
})

export const getNote = createServerFn({ method: 'GET' })
  .validator((noteId: string) => noteId)
  .handler(async ({ data: noteId }) => {
    const db = await getDb()
    const me = await requireUser()
    const note = await db.query.encryptedNotes.findFirst({
      where: and(
        eq(encryptedNotes.id, noteId),
        eq(encryptedNotes.userId, me.id),
        isNull(encryptedNotes.deletedAt),
      ),
    })
    if (!note) throw new Error('Note not found')
    return note
  })

export const createNote = createServerFn({ method: 'POST' })
  .validator((data: EncryptedNoteInput) => {
    validateEncryptedNoteInput(data)
    return data
  })
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()

    const vault = await db.query.userVault.findFirst({
      where: eq(userVault.userId, me.id),
    })
    if (!vault) throw new Error('Vault not set up')

    const id = newId()
    await db.insert(encryptedNotes).values({
      id,
      userId: me.id,
      encryptedTitle: data.encryptedTitle,
      titleIv: data.titleIv,
      encryptedContent: data.encryptedContent,
      contentIv: data.contentIv,
    })
    return { id }
  })

export const updateNote = createServerFn({ method: 'POST' })
  .validator(
    (data: { noteId: string } & EncryptedNoteInput) => {
      if (!data.noteId) throw new Error('Note id required')
      validateEncryptedNoteInput(data)
      return data
    },
  )
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()

    const note = await db.query.encryptedNotes.findFirst({
      where: and(
        eq(encryptedNotes.id, data.noteId),
        eq(encryptedNotes.userId, me.id),
        isNull(encryptedNotes.deletedAt),
      ),
    })
    if (!note) throw new Error('Note not found')

    await db
      .update(encryptedNotes)
      .set({
        encryptedTitle: data.encryptedTitle,
        titleIv: data.titleIv,
        encryptedContent: data.encryptedContent,
        contentIv: data.contentIv,
        updatedAt: new Date(),
      })
      .where(eq(encryptedNotes.id, data.noteId))

    return { ok: true }
  })

export const deleteNote = createServerFn({ method: 'POST' })
  .validator((noteId: string) => noteId)
  .handler(async ({ data: noteId }) => {
    const db = await getDb()
    const me = await requireUser()

    const note = await db.query.encryptedNotes.findFirst({
      where: and(
        eq(encryptedNotes.id, noteId),
        eq(encryptedNotes.userId, me.id),
        isNull(encryptedNotes.deletedAt),
      ),
    })
    if (!note) throw new Error('Note not found')

    await db
      .update(encryptedNotes)
      .set({ deletedAt: new Date() })
      .where(eq(encryptedNotes.id, noteId))

    return { ok: true }
  })
