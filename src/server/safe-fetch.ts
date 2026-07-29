/**
 * SSRF guard for fetching user-supplied URLs.
 *
 * Lives in its own module so the guard can be tested directly — see
 * safe-fetch.test.ts. It's the only thing standing between a pasted link and
 * our own internal network, so it's worth being able to assert on.
 */
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/** True for loopback, private, link-local, and other non-public IP ranges. */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) {
    const p = ip.split('.').map(Number)
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true
    const [a, b] = p
    return (
      a === 0 || // "this network"
      a === 10 || // private
      a === 127 || // loopback
      (a === 169 && b === 254) || // link-local (incl. cloud metadata 169.254.169.254)
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      a >= 224 // multicast / reserved
    )
  }
  if (kind === 6) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::') return true
    if (v.startsWith('fe80')) return true // link-local
    if (v.startsWith('fc') || v.startsWith('fd')) return true // unique-local
    // IPv4-mapped (::ffff:a.b.c.d) — check the embedded v4 address.
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIp(mapped[1])
    return false
  }
  return true // not a literal IP → treat as unsafe
}

/** Resolve a hostname and reject if it points at a private/internal address. */
export async function assertPublicHost(hostname: string): Promise<void> {
  // Bracketed IPv6 literal or plain IP literal.
  const literal = hostname.replace(/^\[|\]$/g, '')
  if (isIP(literal)) {
    if (isPrivateIp(literal)) throw new Error('Blocked address')
    return
  }
  const records = await dnsLookup(hostname, { all: true })
  if (records.length === 0 || records.some((r) => isPrivateIp(r.address))) {
    throw new Error('Blocked address')
  }
}

/**
 * A dispatcher that re-checks the resolved address at connect time.
 *
 * `assertPublicHost` alone is a TOCTOU: it resolves the hostname, then fetch
 * resolves it *again* independently, so a low-TTL record can answer with a
 * public IP for the check and 169.254.169.254 for the actual connection. This
 * moves the check into the socket's own DNS lookup, so the address we approve
 * is by construction the address we connect to.
 *
 * Built lazily and tolerantly: if undici can't be loaded in whatever runtime
 * this ends up on, we fall back to the pre-check, which is where we already
 * were. The dispatcher is a hardening layer on top, never the only guard.
 */
let dispatcherPromise: Promise<unknown> | null = null

function getPinnedDispatcher(): Promise<unknown> {
  dispatcherPromise ??= import('undici')
    .then(
      ({ Agent }) =>
        new Agent({
          connect: {
            lookup(hostname, opts, cb) {
              dnsLookup(hostname, { all: true }).then((records) => {
                // Any private address in the answer set fails the whole
                // lookup — a round-robin record that mixes public and private
                // is exactly the shape an attacker wants.
                if (
                  records.length === 0 ||
                  records.some((r) => isPrivateIp(r.address))
                ) {
                  cb(new Error('Blocked address'), '', 0)
                  return
                }
                if (opts.all) {
                  cb(null, records, 0)
                  return
                }
                cb(null, records[0].address, records[0].family)
              }, (err: Error) => cb(err, '', 0))
            },
          },
        }),
    )
    .catch(() => null)
  return dispatcherPromise
}

/**
 * fetch() for untrusted URLs. Follows redirects manually, validating that every
 * hop is http(s) and resolves to a public IP — closing off SSRF to loopback,
 * private ranges, and cloud metadata endpoints.
 */
export async function safeFetch(
  url: string,
  init: RequestInit & { maxRedirects?: number } = {},
): Promise<Response> {
  const { maxRedirects = 5, ...fetchInit } = init
  const dispatcher = await getPinnedDispatcher()
  let current = url
  for (let i = 0; i <= maxRedirects; i++) {
    const parsed = new URL(current)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http(s) links are supported')
    }
    // Cheap fail-fast. The dispatcher above is what actually binds the
    // decision to the connection; this just avoids opening a socket at all
    // for the obvious cases.
    await assertPublicHost(parsed.hostname)

    const res = await fetch(current, {
      ...fetchInit,
      redirect: 'manual',
      // Non-standard but honoured by Node's undici-backed fetch.
      ...(dispatcher ? { dispatcher } : {}),
    })
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) return res
      current = new URL(location, current).toString()
      continue
    }
    return res
  }
  throw new Error('Too many redirects')
}
