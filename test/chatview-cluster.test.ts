import { describe, expect, it } from 'vitest'
import { clusterMessages } from '../src/components/ChatView'
import type { Message } from '../src/types'

function makeMsg(id: string, from: string, ts: number): Message {
  return {
    id,
    kind: 'dm',
    fromId: from,
    toUserId: from === 'me' ? 'them' : 'me',
    ciphertext: 'c',
    iv: 'i',
    tag: 't',
    timestamp: ts,
  }
}

describe('clusterMessages', () => {
  const knownUsers = new Map([
    ['me', { name: 'Me Name', username: 'me' }],
    ['them', { name: 'Them Name', username: 'them' }],
  ])

  it('returns empty array for empty input', () => {
    expect(clusterMessages([], 'me', knownUsers)).toEqual([])
  })

  it('makes one cluster per contiguous sender run', () => {
    const msgs = [
      makeMsg('1', 'me', 1),
      makeMsg('2', 'me', 2),
      makeMsg('3', 'them', 3),
      makeMsg('4', 'them', 4),
      makeMsg('5', 'me', 5),
    ]
    const c = clusterMessages(msgs, 'me', knownUsers)
    expect(c.map((x) => x.items.map((m) => m.id))).toEqual([
      ['1', '2'],
      ['3', '4'],
      ['5'],
    ])
  })

  it('marks clusters correctly as mine vs theirs', () => {
    const c = clusterMessages(
      [makeMsg('1', 'me', 1), makeMsg('2', 'them', 2)],
      'me',
      knownUsers,
    )
    expect(c[0].mine).toBe(true)
    expect(c[1].mine).toBe(false)
  })

  it('falls back to a #fragment id for unknown senders', () => {
    const c = clusterMessages(
      [makeMsg('1', 'unknown_user_xyz1234', 1)],
      'me',
      knownUsers,
    )
    expect(c[0].fromName).toBe('#xyz1234')
  })
})
