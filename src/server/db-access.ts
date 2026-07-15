/** Lazy server imports — safe to import from client-callable server fn modules. */
export async function getDb() {
  const { db } = await import('#/db/index.server')
  return db
}

export async function getAuth() {
  const { auth } = await import('#/lib/auth.server')
  return auth
}
