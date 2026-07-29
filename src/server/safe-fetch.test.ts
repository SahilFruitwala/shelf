import { describe, expect, it } from 'vitest'

import { assertPublicHost, isPrivateIp, safeFetch } from './safe-fetch'

describe('isPrivateIp', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['10.1.2.3', 'private class A'],
    ['172.16.0.1', 'private class B, low edge'],
    ['172.31.255.255', 'private class B, high edge'],
    ['192.168.1.1', 'private class C'],
    ['169.254.169.254', 'cloud metadata'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['0.0.0.0', 'this network'],
    ['224.0.0.1', 'multicast'],
    ['::1', 'IPv6 loopback'],
    ['fe80::1', 'IPv6 link-local'],
    ['fd00::1', 'IPv6 unique-local'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata'],
    ['not-an-ip', 'non-literal'],
  ])('blocks %s (%s)', (ip) => {
    expect(isPrivateIp(ip)).toBe(true)
  })

  it.each([
    ['8.8.8.8', 'public v4'],
    ['1.1.1.1', 'public v4'],
    ['172.15.0.1', 'just below the private class B range'],
    ['172.32.0.1', 'just above the private class B range'],
    ['100.63.0.1', 'just below CGNAT'],
    ['100.128.0.1', 'just above CGNAT'],
    ['2606:4700::1111', 'public v6'],
  ])('allows %s (%s)', (ip) => {
    expect(isPrivateIp(ip)).toBe(false)
  })
})

describe('assertPublicHost', () => {
  it('rejects a private IP literal', async () => {
    await expect(assertPublicHost('127.0.0.1')).rejects.toThrow(
      'Blocked address',
    )
  })

  it('rejects a bracketed IPv6 loopback literal', async () => {
    await expect(assertPublicHost('[::1]')).rejects.toThrow('Blocked address')
  })

  it('allows a public IP literal', async () => {
    await expect(assertPublicHost('8.8.8.8')).resolves.toBeUndefined()
  })

  // nip.io resolves <ip>.nip.io -> <ip>, which is exactly the shape of a DNS
  // rebinding payload: a perfectly ordinary public hostname whose A record
  // points somewhere internal.
  it.each([
    '127.0.0.1.nip.io',
    '169.254.169.254.nip.io',
    '10.0.0.1.nip.io',
    '192.168.0.1.nip.io',
  ])('rejects %s, which resolves to a private address', async (host) => {
    await expect(assertPublicHost(host)).rejects.toThrow('Blocked address')
  })
})

describe('safeFetch', () => {
  it.each(['file:///etc/passwd', 'ftp://example.com', 'gopher://example.com'])(
    'refuses the %s scheme',
    async (url) => {
      await expect(safeFetch(url)).rejects.toThrow(
        'Only http(s) links are supported',
      )
    },
  )

  it('refuses a hostname that resolves to the cloud metadata endpoint', async () => {
    await expect(
      safeFetch('http://169.254.169.254.nip.io/latest/meta-data/'),
    ).rejects.toThrow('Blocked address')
  })

  it('refuses loopback by literal address', async () => {
    await expect(safeFetch('http://127.0.0.1:3000/')).rejects.toThrow(
      'Blocked address',
    )
  })
})
