import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'

import { user } from '#/db/schema'
import { getDb } from './db-access'
import { requireUser } from './helpers'

/**
 * GDPR data-retention window. On account deletion we soft-delete the local
 * rows and keep them this long (for legal/audit/fraud obligations) before a
 * scheduled job hard-deletes them. See scripts/purge-deleted-users.ts.
 */
export const RETENTION_DAYS = 30

export const getAccountInfo = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = await getDb()
    const me = await requireUser()
    const row = await db.query.user.findFirst({
      where: eq(user.id, me.id),
    })
    return {
      id: me.id,
      name: row?.name ?? me.name,
      email: row?.email ?? me.email,
      createdAt: row?.createdAt ?? null,
    }
  },
)

/**
 * Delete the signed-in user's account. Soft-deletes the local data (retained
 * for RETENTION_DAYS, then purged) and removes the Clerk user immediately so
 * they can no longer sign in. Idempotent: a second call is a no-op.
 */
export const deleteAccount = createServerFn({ method: 'POST' }).handler(
  async () => {
    const db = await getDb()
    const me = await requireUser()

    const now = new Date()
    const purgeAfter = new Date(
      now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000,
    )

    await db
      .update(user)
      .set({ deletedAt: now, purgeAfter, updatedAt: now })
      .where(eq(user.id, me.id))

    // Remove from Clerk so the session is invalidated and re-login is blocked.
    // Do this last: if it throws, the local soft-delete already stands and the
    // user can retry. A missing Clerk user is fine (already gone).
    try {
      const { clerkClient } = await import('@clerk/tanstack-react-start/server')
      await clerkClient().users.deleteUser(me.id)
    } catch (err) {
      // 404 => already deleted in Clerk (e.g. via webhook). Anything else we
      // surface so the client can prompt a retry.
      const status = (err as { status?: number }).status
      if (status !== 404) throw err
    }

    return { ok: true, purgeAfter }
  },
)
