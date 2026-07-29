/** Lazy server imports — safe to import from client-callable server fn modules. */
export async function getDb() {
  const { db } = await import('#/db/index.server')
  return db
}

export async function getAuthUser() {
  // Aliased so the import doesn't shadow the wrapper it's being called from.
  const { getAuthUser: loadAuthUser } = await import('#/lib/auth.server')
  return loadAuthUser()
}
