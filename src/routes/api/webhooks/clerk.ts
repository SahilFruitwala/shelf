import { createFileRoute } from '@tanstack/react-router'
import { verifyWebhook } from '@clerk/backend/webhooks'
import { eq } from 'drizzle-orm'

import { db } from '#/db/index.server'
import { user } from '#/db/schema'
import { RETENTION_DAYS } from '#/server/account'

/**
 * Clerk → app sync webhook. Keeps the local `user` mirror in step with Clerk
 * for the events we care about:
 *   - user.created / user.updated → upsert name/email/image
 *   - user.deleted               → soft-delete (GDPR retention, then purge)
 *
 * Configure in the Clerk dashboard (Webhooks) pointing at
 *   https://<host>/api/webhooks/clerk
 * and set CLERK_WEBHOOK_SIGNING_SECRET in the environment. Signatures are
 * verified via Standard Webhooks; unverified requests get a 400.
 */

type ClerkUserData = {
  id: string
  first_name?: string | null
  last_name?: string | null
  username?: string | null
  image_url?: string | null
  email_addresses?: Array<{ id: string; email_address: string }>
  primary_email_address_id?: string | null
}

function pickEmail(data: ClerkUserData): string {
  const primary = data.email_addresses?.find(
    (e) => e.id === data.primary_email_address_id,
  )
  return (
    primary?.email_address ?? data.email_addresses?.[0]?.email_address ?? ''
  )
}

function pickName(data: ClerkUserData, email: string): string {
  return (
    [data.first_name, data.last_name].filter(Boolean).join(' ') ||
    data.username ||
    email
  )
}

async function upsertUser(data: ClerkUserData) {
  const email = pickEmail(data)
  const name = pickName(data, email)
  const now = new Date()
  await db
    .insert(user)
    .values({
      id: data.id,
      name,
      email,
      emailVerified: true,
      image: data.image_url ?? null,
    })
    .onConflictDoUpdate({
      target: user.id,
      set: { name, email, image: data.image_url ?? null, updatedAt: now },
    })
}

async function softDeleteUser(id: string) {
  const now = new Date()
  const purgeAfter = new Date(
    now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000,
  )
  // Only stamp the window on the first deletion so a re-delivered webhook
  // doesn't keep pushing the purge date out.
  const existing = await db.query.user.findFirst({ where: eq(user.id, id) })
  if (!existing || existing.deletedAt) return
  await db
    .update(user)
    .set({ deletedAt: now, purgeAfter, updatedAt: now })
    .where(eq(user.id, id))
}

async function handler({ request }: { request: Request }) {
  let evt
  try {
    evt = await verifyWebhook(request, {
      signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
    })
  } catch (err) {
    console.error('Clerk webhook verification failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  switch (evt.type) {
    case 'user.created':
    case 'user.updated':
      await upsertUser(evt.data)
      break
    case 'user.deleted':
      if (evt.data.id) await softDeleteUser(evt.data.id)
      break
    default:
      // Ignore events we don't sync.
      break
  }

  return new Response('ok', { status: 200 })
}

export const Route = createFileRoute('/api/webhooks/clerk')({
  server: {
    handlers: {
      POST: handler,
    },
  },
})
