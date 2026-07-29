import { eq } from 'drizzle-orm'

import { userFeatureFlags } from '#/db/schema'
import type { FeatureFlag } from '#/db/schema'
import { getDb } from './db-access'
import { requireUser } from './helpers'

export type UserFeatures = Record<FeatureFlag, boolean>

export const DEFAULT_FEATURES: UserFeatures = {
  sharing: false,
}

/** Resolve a user's feature flags. Missing row → all off. */
export async function getUserFeatures(userId: string): Promise<UserFeatures> {
  const db = await getDb()
  const row = await db.query.userFeatureFlags.findFirst({
    where: eq(userFeatureFlags.userId, userId),
  })
  if (!row) return { ...DEFAULT_FEATURES }
  return {
    sharing: row.sharing,
  }
}

export async function userHasFeature(
  userId: string,
  flag: FeatureFlag,
): Promise<boolean> {
  const features = await getUserFeatures(userId)
  return features[flag]
}

export async function requireFeature(userId: string, flag: FeatureFlag) {
  const enabled = await userHasFeature(userId, flag)
  if (!enabled)
    throw new Error('This feature is not available for your account')
}

/** Auth + feature gate for server mutations that need a flag. */
export async function requireUserWithFeature(flag: FeatureFlag) {
  const me = await requireUser()
  await requireFeature(me.id, flag)
  return me
}
