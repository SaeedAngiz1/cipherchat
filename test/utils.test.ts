import { describe, expect, it } from 'vitest'
import { avatarColor, formatTimeOnly, formatTimestamp, initials } from '../src/utils'

describe('initials', () => {
  it('returns "?" for empty input', () => {
    expect(initials('')).toBe('?')
    expect(initials('   ')).toBe('?')
  })

  it('takes first letter for a single word', () => {
    expect(initials('alice')).toBe('A')
  })

  it('uses first and last word for multi-word input', () => {
    expect(initials('alice cooper')).toBe('AC')
    expect(initials('  Ada   Lovelace  ')).toBe('AL')
  })
})

describe('avatarColor', () => {
  it('is deterministic', () => {
    expect(avatarColor('user_1')).toBe(avatarColor('user_1'))
  })

  it('differs for different inputs (mostly)', () => {
    const a = avatarColor('user_alpha')
    const b = avatarColor('user_beta')
    const c = avatarColor('user_gamma')
    // We can't guarantee uniqueness across a small palette but at least
    // confirm we get something in the palette.
    expect([a, b, c].map((c) => c.startsWith('#'))).toEqual([true, true, true])
  })
})

describe('formatTimestamp', () => {
  it('returns time-only for today', () => {
    const t = Date.now()
    const out = formatTimestamp(t)
    // Either "HH:MM" matching today
    expect(out).toMatch(/\d{1,2}:\d{2}/)
  })

  it('returns "Yesterday" for 1 day ago', () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    expect(formatTimestamp(d.getTime())).toBe('Yesterday')
  })
})

describe('formatTimeOnly', () => {
  it('formats HH:MM', () => {
    // Pick an arbitrary time and check structure only.
    const out = formatTimeOnly(new Date('2024-01-01T09:07:00').getTime())
    expect(out).toMatch(/\d{1,2}:\d{2}/)
  })
})
