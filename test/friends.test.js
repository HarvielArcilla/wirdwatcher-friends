import test from 'node:test'
import assert from 'node:assert/strict'
import { network, until, tmp } from './helpers.js'
import { parseFriendCode, normalizeCode } from '../src/core/crypto.js'

test('friend codes are forgiving about case, dashes and look-alikes', () => {
  const a = parseFriendCode('WW-ABCDE-FGH1J-KMNPQ-RSTVW')
  assert.ok(a.equals(parseFriendCode('ww abcde fghij kmnpq rstvw')))
  assert.equal(normalizeCode('o0Il1'), '00111')
  assert.equal(parseFriendCode('WW-ABCDE'), null)
})

test('two people become friends with a code and swap ratings while online', async (t) => {
  const { make } = await network(t)
  const alice = await make()
  const bob = await make()
  alice.setProfile({ name: 'Alice' })
  bob.setProfile({ name: 'Bob' })
  alice.game.rate('cat', 4.5)
  alice.game.comment('cat', 'meow')

  const { code } = await alice.friends.makeCode()
  assert.match(code, /^WW(-[0-9A-Z]{5}){4}$/)
  const friend = await bob.friends.redeem(code.toLowerCase())
  assert.equal(friend.name, 'Alice')
  await until(() => alice.friends.list().length === 1)
  assert.equal(alice.friends.list()[0].name, 'Bob')

  // Catching up on what was rated before.
  await until(() => bob.store.friendsOn('cat').length === 1)
  assert.deepEqual(bob.store.friendsOn('cat')[0], { userId: alice.identity.userId, name: 'Alice', color: alice.identity.color, r: 4.5, comment: 'meow', favorite: false })

  // Live changes, both ways.
  bob.game.rate('dog', 2)
  await until(() => alice.store.friendsOn('dog')[0]?.r === 2)
  const twin = alice.game.rate('dog', 2)
  assert.deepEqual(twin.twins, ['Bob'])
  assert.ok(twin.badges.some((b) => b.id === 'twin'))
  await until(() => bob.friends.list()[0].online)

  // Friends' picks: words a friend rated that I haven't.
  alice.game.rate('owl', 5)
  await until(() => bob.store.friendRatings(alice.identity.userId).some((r) => r.word === 'owl'))
  const pick = bob.game.deal('friends')
  assert.ok(['cat', 'owl'].includes(pick.word))

  // A friend's playlist arrives and can be saved.
  alice.game.createPlaylist({ name: 'Birds', emoji: '🐦', words: ['owl', 'emu', 'wren'] })
  await until(() => bob.game.modes().friendPlaylists.length === 1)
  assert.equal(bob.game.modes().friendPlaylists[0].ownerName, 'Alice')

  // A code works once.
  await assert.rejects(bob.friends.redeem(code, { timeoutMs: 3000 }), /Couldn’t reach/)

  // Removing a friend removes you on their side too.
  await alice.friends.remove(bob.identity.userId)
  await until(() => bob.friends.list().length === 0)
  assert.equal(bob.store.friendsOn('cat').length, 0)
})

test('friends reconnect and catch up after being offline', async (t) => {
  const { make } = await network(t)
  const aliceDir = tmp()
  let alice = await make({ dataDir: aliceDir })
  const bob = await make()
  const { code } = await alice.friends.makeCode()
  await bob.friends.redeem(code)
  await until(() => alice.friends.list().length === 1)
  await alice.stop()
  bob.game.rate('lantern', 3.7) // while Alice is away
  alice = await make({ dataDir: aliceDir })
  await until(() => alice.store.friendsOn('lantern')[0]?.r === 3.7, { timeout: 40000 })
})

test('strangers can’t sync with you', async (t) => {
  const { make } = await network(t)
  const alice = await make()
  const mallory = await make()
  const { friendTopic } = await import('../src/core/friends.js')
  // Mallory guesses nothing useful: even joining a real friendship topic, Alice's firewall refuses her key.
  const bob = await make()
  const { code } = await alice.friends.makeCode()
  await bob.friends.redeem(code)
  const topic = friendTopic(alice.friends.list().length ? alice.store.listFriends()[0].pairSecret : bob.store.listFriends()[0].pairSecret)
  await mallory.friends.mesh.join(topic)
  await new Promise((resolve) => setTimeout(resolve, 3000))
  assert.equal(alice.friends.mesh.connected(mallory.identity.userId), false)
})
