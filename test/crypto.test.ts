import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/crypto'

describe('password hashing', () => {
  it('verifies the original password', async () => {
    const h = await hashPassword('correct horse battery staple')
    expect(h).toMatch(/^pbkdf2\$/)
    expect(await verifyPassword('correct horse battery staple', h)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const h = await hashPassword('hunter2')
    expect(await verifyPassword('hunter3', h)).toBe(false)
    expect(await verifyPassword('', h)).toBe(false)
  })

  it('produces different hashes for the same password (salting)', async () => {
    const a = await hashPassword('same')
    const b = await hashPassword('same')
    expect(a).not.toBe(b)
    expect(await verifyPassword('same', a)).toBe(true)
    expect(await verifyPassword('same', b)).toBe(true)
  })

  it('returns false for malformed stored hash', async () => {
    expect(await verifyPassword('any', 'not-a-pbkdf2-string')).toBe(false)
    expect(await verifyPassword('any', 'pbkdf2$0$xx$yy')).toBe(false)
  })
})
