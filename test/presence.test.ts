import { describe, it, expect } from 'vitest'
import {
  isOnline,
  lastSeenLabel,
  getTypingUsers,
  ONLINE_THRESHOLD_MS,
  viewKeyOf,
} from '../src/presence'

describe('isOnline', () => {
  const now = 1_000_000
  it('returns false for missing lastSeen', () => {
    expect(isOnline(undefined, now)).toBe(false)
  })
  it('returns true for an instantaneous activity', () => {
    expect(isOnline(now, now)).toBe(true)
  })
  it('returns true just under the threshold', () => {
    expect(isOnline(now - (ONLINE_THRESHOLD_MS - 1), now)).toBe(true)
  })
  it('returns false exactly at or beyond the threshold', () => {
    expect(isOnline(now - ONLINE_THRESHOLD_MS, now)).toBe(false)
    expect(isOnline(now - (ONLINE_THRESHOLD_MS + 1), now)).toBe(false)
  })
})

describe('lastSeenLabel', () => {
  const now = 60 * 60_000 // arbitrary anchor
  it('says "never seen" when missing', () => {
    expect(lastSeenLabel(undefined, now)).toBe('never seen')
  })
  it('says "active now" when online', () => {
    expect(lastSeenLabel(now - 1000, now)).toBe('active now')
  })
  it('formats minutes when recent', () => {
    expect(lastSeenLabel(now - 5 * 60_000, now)).toBe('last seen 5m ago')
    expect(lastSeenLabel(now - 59 * 60_000, now)).toBe('last seen 59m ago')
  })
  it('formats hours under a day', () => {
    expect(lastSeenLabel(now - 2 * 60 * 60_000, now)).toBe('last seen 2h ago')
    expect(lastSeenLabel(now - 23 * 60 * 60_000, now)).toBe('last seen 23h ago')
  })
  it('formats days under a week', () => {
    expect(lastSeenLabel(now - 3 * 24 * 60 * 60_000, now)).toBe('last seen 3d ago')
  })
})

describe('getTypingUsers', () => {
  const now = 10_000
  it('returns only entries for the requested viewKey', () => {
    const t = {
      'u1::dm:42': now - 100,
      'u2::dm:42': now - 100,
      'u3::group:99': now - 100,
    }
    expect(getTypingUsers(t, 'dm:42', now).sort()).toEqual(['u1', 'u2'])
  })
  it('drops stale entries (>4s old)', () => {
    const t = {
      fresh: now - 100,
      stale: now - 5000,
    } as unknown as Record<string, number>
    // Build keys shaped properly
    const typing = {
      'u1::dm:42': now - 100,
      'u2::dm:42': now - 5000,
    }
    expect(getTypingUsers(typing, 'dm:42', now)).toEqual(['u1'])
    void t
  })
  it('respects the excludeUserId filter', () => {
    const typing = {
      'self::dm:42': now - 100,
      'other::dm:42': now - 100,
    }
    expect(getTypingUsers(typing, 'dm:42', now, 'self')).toEqual(['other'])
  })
})

describe('viewKeyOf', () => {
  it('formats dm and group kinds distinctly', () => {
    expect(viewKeyOf('dm', 'abc')).toBe('dm:abc')
    expect(viewKeyOf('group', 'xyz')).toBe('group:xyz')
  })
})
