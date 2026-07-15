import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import { encryptedNotes, userVault } from '#/db/schema'
import type { VaultKdfParams } from '#/lib/crypto/types'
import type { EncryptedNotePayload } from '#/lib/crypto/validation'
import {
  validateEncryptedNoteInput,
  validateVaultSetupPayload,
} from '#/lib/crypto/validation'
import { getDb } from './db-access'
import { newId, requireUser } from './helpers'

function validateNoteId(noteId: string) {
  if (!noteId || noteId.length > 64) throw new Error('Invalid note id')
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
  .validator(
    (data: {
      wrappedKey: string
      wrapIv: string
      salt: string
      kdfParams: VaultKdfParams
    }) => {
      validateVaultSetupPayload(data)
      return data
    },
  )
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()

    const existing = await db.query.userVault.findFirst({
      where: eq(userVault.userId, me.id),
    })
    if (existing) throw new Error('Vault already exists')

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
      createdAt: encryptedNotes.createdAt,
      updatedAt: encryptedNotes.updatedAt,
    })
    .from(encryptedNotes)
    .where(
      and(eq(encryptedNotes.userId, me.id), isNull(encryptedNotes.deletedAt)),
    )
    .orderBy(desc(encryptedNotes.updatedAt))
})

export const getNote = createServerFn({ method: 'GET' })
  .validator((noteId: string) => {
    validateNoteId(noteId)
    return noteId
  })
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
    return {
      id: note.id,
      encryptedTitle: note.encryptedTitle,
      titleIv: note.titleIv,
      encryptedContent: note.encryptedContent,
      contentIv: note.contentIv,
      version: note.version,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    }
  })

export const createNote = createServerFn({ method: 'POST' })
  .validator((data: EncryptedNotePayload) => {
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
    (
      data: {
        noteId: string
        expectedVersion: number
      } & EncryptedNotePayload,
    ) => {
      validateNoteId(data.noteId)
      if (!Number.isInteger(data.expectedVersion) || data.expectedVersion < 1) {
        throw new Error('Invalid note version')
      }
      validateEncryptedNoteInput(data)
      return data
    },
  )
  .handler(async ({ data }) => {
    const db = await getDb()
    const me = await requireUser()

    const updatedRows = await db
      .update(encryptedNotes)
      .set({
        encryptedTitle: data.encryptedTitle,
        titleIv: data.titleIv,
        encryptedContent: data.encryptedContent,
        contentIv: data.contentIv,
        version: sql`${encryptedNotes.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(encryptedNotes.id, data.noteId),
          eq(encryptedNotes.userId, me.id),
          eq(encryptedNotes.version, data.expectedVersion),
          isNull(encryptedNotes.deletedAt),
        ),
      )
      .returning({
        version: encryptedNotes.version,
        updatedAt: encryptedNotes.updatedAt,
      })

    if (updatedRows.length === 0) {
      throw new Error('Note changed elsewhere. Reload before saving again.')
    }
    return updatedRows[0]
  })

export const deleteNote = createServerFn({ method: 'POST' })
  .validator((noteId: string) => {
    validateNoteId(noteId)
    return noteId
  })
  .handler(async ({ data: noteId }) => {
    const db = await getDb()
    const me = await requireUser()

    const deletedRows = await db
      .update(encryptedNotes)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(encryptedNotes.id, noteId),
          eq(encryptedNotes.userId, me.id),
          isNull(encryptedNotes.deletedAt),
        ),
      )
      .returning({ id: encryptedNotes.id })

    if (deletedRows.length === 0) throw new Error('Note not found')
    return { ok: true }
  })
