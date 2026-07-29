import { createServerFn } from '@tanstack/react-start'

import { getAuthUser } from './db-access'
import { DEFAULT_FEATURES, getUserFeatures } from './features'
import type { UserFeatures } from './features'
import type { SessionUser } from '#/lib/auth.server'

export const getSessionUser = createServerFn({ method: 'GET' }).handler(
  async () => {
    return getAuthUser()
  },
)

/**
 * Everything the app shell needs to boot, in one call.
 *
 * The `_app` route gates on the user and then gates UI on the feature flags.
 * Asking for those separately cost two client→server round trips *and* two
 * `getAuthUser` lookups, serialized, on every entry into the app.
 */
export const getAppBootstrap = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{
    user: SessionUser | null
    userFeatures: UserFeatures
  }> => {
    const user = await getAuthUser()
    if (!user) return { user: null, userFeatures: { ...DEFAULT_FEATURES } }
    return { user, userFeatures: await getUserFeatures(user.id) }
  },
)
