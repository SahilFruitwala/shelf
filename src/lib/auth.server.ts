import '@tanstack/react-start/server-only'

import { auth, clerkClient } from '@clerk/tanstack-react-start/server'
import { eq } from 'drizzle-orm'

import { db } from '#/db/index.server'
import { user } from '#/db/schema'

export type SessionUser = { id: string; name: string; email: string }

/**
 * Clerk owns the user records; our tables key everything off `user.id`, which
 * we keep equal to the Clerk user id. On first sight of a Clerk user we mirror
 * their name/email into the local `user` table so joins and display keep
 * working without a Clerk API call on every request.
 */
async function syncUser(userId: string): Promise<SessionUser> {
  const existing = await db.query.user.findFirst({
    where: eq(user.id, userId),
  })
  if (existing) {
    return { id: existing.id, name: existing.name, email: existing.email }
  }

  const cu = await clerkClient().users.getUser(userId)
  const email =
    cu.primaryEmailAddress?.emailAddress ??
    cu.emailAddresses[0]?.emailAddress ??
    ''
  const name =
    [cu.firstName, cu.lastName].filter(Boolean).join(' ') ||
    cu.username ||
    email

  await db
    .insert(user)
    .values({ id: userId, name, email, emailVerified: true })
    .onConflictDoNothing()

  return { id: userId, name, email }
}

/** The signed-in user, mirrored locally, or null if signed out. */
export async function getAuthUser(): Promise<SessionUser | null> {
  const { userId } = await auth()
  if (!userId) return null
  return syncUser(userId)
}
