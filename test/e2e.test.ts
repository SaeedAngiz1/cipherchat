import { describe, expect, it } from 'vitest'
import {
  decryptDm,
  decryptGroupMessage,
  encryptDm,
  encryptGroupMessage,
  generateGroupKey,
  generateKeypair,
  unwrapGroupKeyForMember,
  unwrapPrivateKey,
  wrapGroupKeyForMember,
  wrapPrivateKey,
} from '../src/e2e'

describe('ECDH keypairs', () => {
  it('generates a usable keypair', async () => {
    const { publicKeyJwk, privateKey } = await generateKeypair()
    expect(publicKeyJwk.kty).toBe('EC')
    expect(publicKeyJwk.crv).toBe('P-256')
    expect(publicKeyJwk.x).toBeTruthy()
    expect(publicKeyJwk.y).toBeTruthy()
    expect(privateKey.type).toBe('private')
  })

  it('round-trips wrap/unwrap with the same password', async () => {
    const { privateKey, publicKeyJwk } = await generateKeypair()
    const wrapped = await wrapPrivateKey(privateKey, 'sekret-123')
    expect(wrapped.wrappedPrivateJwk).toBeTruthy()
    expect(wrapped.wrappingSalt).toBeTruthy()
    expect(wrapped.wrappingIv).toBeTruthy()

    const recovered = await unwrapPrivateKey(
      wrapped.wrappedPrivateJwk,
      wrapped.wrappingSalt,
      wrapped.wrappingIv,
      'sekret-123',
    )
    expect(recovered.type).toBe('private')
    // Verify functionality: encrypt + decrypt with recovered key.
    const otherSide = await generateKeypair()
    const ct = await encryptDm(
      'hello there',
      recovered,
      otherSide.publicKeyJwk,
      'me',
      'them',
    )
    // We can decrypt from the recovered side (proving it has the same key).
    const pt = await decryptDm(
      ct.ciphertext,
      ct.iv,
      ct.tag,
      recovered,
      otherSide.publicKeyJwk,
      'me',
      'them',
    )
    expect(pt).toBe('hello there')
  })

  it('rejects wrong password on unwrap', async () => {
    const { privateKey } = await generateKeypair()
    const wrapped = await wrapPrivateKey(privateKey, 'right')
    await expect(
      unwrapPrivateKey(
        wrapped.wrappedPrivateJwk,
        wrapped.wrappingSalt,
        wrapped.wrappingIv,
        'wrong',
      ),
    ).rejects.toBeTruthy()
  })
})

describe('DM encryption', () => {
  it('round-trips between two users', async () => {
    const alice = await generateKeypair()
    const bob = await generateKeypair()
    const sent = await encryptDm(
      'secret hi from alice',
      alice.privateKey,
      bob.publicKeyJwk,
      'alice',
      'bob',
    )
    // Alice reads her own copy.
    expect(
      await decryptDm(
        sent.ciphertext,
        sent.iv,
        sent.tag,
        alice.privateKey,
        bob.publicKeyJwk,
        'alice',
        'bob',
      ),
    ).toBe('secret hi from alice')
    // Bob reads it too — same shared secret.
    expect(
      await decryptDm(
        sent.ciphertext,
        sent.iv,
        sent.tag,
        bob.privateKey,
        alice.publicKeyJwk,
        'alice',
        'bob',
      ),
    ).toBe('secret hi from alice')
  })

  it('fails when peer identity is swapped', async () => {
    const alice = await generateKeypair()
    const mallory = await generateKeypair()
    const ct = await encryptDm(
      'for bob only',
      alice.privateKey,
      mallory.publicKeyJwk,
      'alice',
      'bob',
    )
    await expect(
      decryptDm(
        ct.ciphertext,
        ct.iv,
        ct.tag,
        alice.privateKey,
        mallory.publicKeyJwk,
        // Wrong partner id — HKDF salt mismatch.
        'mallory',
        'bob',
      ),
    ).rejects.toBeTruthy()
  })
})

describe('Group keys', () => {
  it('round-trips a group key envelope', async () => {
    const admin = await generateKeypair()
    const member = await generateKeypair()
    const groupId = 'grp_test_1'

    const { rawB64 } = await generateGroupKey()
    const env = await wrapGroupKeyForMember(
      rawB64,
      admin.privateKey,
      member.publicKeyJwk,
      groupId,
      'member_1',
    )
    expect(env.wrappedKey).toBeTruthy()
    expect(env.iv).toBeTruthy()

    const recovered = await unwrapGroupKeyForMember(
      env.wrappedKey,
      env.iv,
      member.privateKey,
      admin.publicKeyJwk,
      groupId,
      'member_1',
    )
    expect(recovered.type).toBe('secret')

    // Now encrypt / decrypt a group message with the recovered key.
    const ct = await encryptGroupMessage('group hello', recovered)
    const pt = await decryptGroupMessage(
      ct.ciphertext,
      ct.iv,
      ct.tag,
      recovered,
    )
    expect(pt).toBe('group hello')
  })
})
