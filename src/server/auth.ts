import { createServerFn } from '@tanstack/react-start'

import { getAuthUser } from './db-access'

export const getSessionUser = createServerFn({ method: 'GET' }).handler(
  async () => {
    return getAuthUser()
  },
)
