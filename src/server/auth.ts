import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { auth } from '#/lib/auth'

export const getSessionUser = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { headers } = getRequest()
    const session = await auth.api.getSession({ headers })
    if (!session?.user) return null
    const { id, name, email } = session.user
    return { id, name, email }
  },
)
