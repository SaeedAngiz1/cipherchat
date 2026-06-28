import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  generateUniqueGroupCode,
  Groups,
  GroupKeys,
  Keypairs,
  Messages,
  uid,
  Users,
} from '../src/storage'
import type { Group, KeypairRecord, Message, User } from '../src/types'

// Reset localStorage between tests
beforeEach(() => {
  localStorage.clear()
  window.dispatchEvent(new Event('cc:changed'))
})
afterEach(() => {
  localStorage.clear()
})

const baseUser = (
  id: string,
  username: string,
  displayName = username,
): User => ({
  id,
  username,
  displayName,
  passwordHash: 'pbkdf2$600000$AA==$BB==',
  createdAt: Date.now(),
})

describe('uid', () => {
  it('returns ids with the requested prefix', () => {
    expect(uid('usr').startsWith('usr_')).toBe(true)
    expect(uid('grp').startsWith('grp_')).toBe(true)
  })

  it('produces unique ids across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => uid('x')))
    expect(ids.size).toBe(50)
  })

  it('produces RFC4122-shaped v4 UUIDs', () => {
    const id = uid('msg').slice('msg_'.length)
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    // Hex digit 13 (index 12) is the *version* nibble and must be 4.
    expect(id[12]).toBe('4')
    // Hex digit 17 (index 16) is the *variant* nibble and must be 8/9/a/b.
    expect('89ab').toContain(id[16])
  })
})

describe('Users', () => {
  it('create / byId / byUsername', () => {
    const u = Users.create(baseUser('usr_a', 'alice'))
    expect(Users.byId('usr_a')).toEqual(u)
    expect(Users.byUsername('alice')?.id).toBe('usr_a')
    // Case-insensitive lookup.
    expect(Users.byUsername('ALICE')?.id).toBe('usr_a')
  })

  it('isUsernameTaken detects case-insensitive duplicates', () => {
    Users.create(baseUser('usr_a', 'alice'))
    expect(Users.isUsernameTaken('alice')).toBe(true)
    expect(Users.isUsernameTaken('ALICE')).toBe(true)
    expect(Users.isUsernameTaken('bob')).toBe(false)
  })
})

describe('Groups', () => {
  it('creates + looks up by id / byCode (case-insensitive)', () => {
    const g: Group = {
      id: 'grp_a',
      code: 'K7P3QX',
      name: 'Apollo',
      description: '',
      adminId: 'usr_a',
      memberIds: ['usr_a'],
      createdAt: Date.now(),
    }
    Groups.create(g)
    expect(Groups.byId('grp_a')).toEqual(g)
    expect(Groups.byCode('k7p3qx')?.id).toBe('grp_a')
  })

  it('generates 6-char unique codes from an unambiguous alphabet', () => {
    expect(generateUniqueGroupCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  })

  it('rejects colliding codes (allocates a different one)', () => {
    Groups.create({
      id: 'grp_a',
      code: 'AAAAAA',
      name: '',
      description: '',
      adminId: 'usr_a',
      memberIds: ['usr_a'],
      createdAt: Date.now(),
    })
    const next = generateUniqueGroupCode()
    expect(next).not.toBe('AAAAAA')
  })

  it('forUser filters + sorts by createdAt desc', () => {
    Groups.create({
      id: 'grp_old',
      code: 'AAAAAB',
      name: 'old',
      description: '',
      adminId: 'usr_a',
      memberIds: ['usr_a', 'usr_b'],
      createdAt: 100,
    })
    Groups.create({
      id: 'grp_new',
      code: 'AAAAAC',
      name: 'new',
      description: '',
      adminId: 'usr_a',
      memberIds: ['usr_a'],
      createdAt: 200,
    })
    const r = Groups.forUser('usr_a').map((g) => g.id)
    expect(r).toEqual(['grp_new', 'grp_old'])
    expect(Groups.forUser('usr_z')).toEqual([])
  })

  it('leave removes the user from memberIds', () => {
    Groups.create({
      id: 'grp_a',
      code: 'AAAAAA',
      name: '',
      description: '',
      adminId: 'usr_a',
      memberIds: ['usr_a', 'usr_b'],
      createdAt: Date.now(),
    })
    Groups.leave('grp_a', 'usr_b')
    expect(Groups.byId('grp_a')?.memberIds).toEqual(['usr_a'])
  })
})

describe('Messages', () => {
  it('stores + sorts DMs by timestamp and filters by participant', () => {
    Users.create(baseUser('usr_a', 'alice'))
    Users.create(baseUser('usr_b', 'bob'))
    const a: Message = {
      id: 'msg_1',
      kind: 'dm',
      fromId: 'usr_a',
      toUserId: 'usr_b',
      ciphertext: 'c',
      iv: 'i',
      tag: 't',
      timestamp: 2,
    }
    const b: Message = { ...a, id: 'msg_2', timestamp: 1, fromId: 'usr_b', toUserId: 'usr_a' }
    Messages.add(a)
    Messages.add(b)
    const r = Messages.dmBetween('usr_a', 'usr_b').map((m) => m.id)
    expect(r).toEqual(['msg_2', 'msg_1'])
  })
})

describe('Keypairs + GroupKeys', () => {
  it('Keypairs upsert + forUser', () => {
    const r: KeypairRecord = {
      userId: 'usr_a',
      wrappedPrivateJwk: 'xx',
      wrappingSalt: 'aa',
      wrappingIv: 'bb',
    }
    Keypairs.upsert(r)
    expect(Keypairs.forUser('usr_a')).toEqual(r)
    // Upsert replaces existing.
    Keypairs.upsert({ ...r, wrappedPrivateJwk: 'yy' })
    expect(Keypairs.forUser('usr_a')?.wrappedPrivateJwk).toBe('yy')
  })

  it('GroupKeys upsert + filters per group / per user', () => {
    GroupKeys.upsert({
      groupId: 'grp_a',
      userId: 'usr_a',
      wrappedKey: 'w',
      iv: 'i',
    })
    GroupKeys.upsert({
      groupId: 'grp_a',
      userId: 'usr_b',
      wrappedKey: 'w2',
      iv: 'i2',
    })
    expect(GroupKeys.forGroup('grp_a')).toHaveLength(2)
    expect(GroupKeys.forUser('usr_a')).toHaveLength(1)
  })
})
