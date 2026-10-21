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
  assert.equal(alice.friends.currentCode().code, code, 'the code stays on show while it waits')
  const friend = await bob.friends.redeem(code.toLowerCase())
  assert.equal(friend.name, 'Alice')
  await until(() => alice.friends.list().length === 1)
  assert.equal(alice.friends.list()[0].name, 'Bob')
  assert.equal(alice.friends.currentCode(), null, 'and goes once it has been used')

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

test('a friend code works even when the code-maker can’t be reached', async (t) => {
  const { make } = await network(t)
  const alice = await make()
  const bob = await make()
  alice.setProfile({ name: 'Alice' })
  bob.setProfile({ name: 'Bob' })
  const { code } = await alice.friends.makeCode()
  // Alice stops announcing herself (as if nobody could connect to her) and
  // only searches. Bob, using the code, is now the one who has to be found.
  const { codeKeys, parseFriendCode } = await import('../src/core/crypto.js')
  const { topic } = codeKeys(parseFriendCode(code))
  const mesh = alice.friends.pairing.mesh
  await mesh.swarm.leave(topic)
  const entry = mesh.topics.get(topic.toString('hex'))
  entry.opts = { server: false, client: true }
  entry.discovery = mesh.swarm.join(topic, entry.opts)
  const friend = await bob.friends.redeem(code)
  assert.equal(friend.name, 'Alice')
  await until(() => alice.friends.list().length === 1)
  await until(() => alice.friends.list()[0].online && bob.friends.list()[0].online)
})

test('two people at a lobby table become friends without a code', async (t) => {
  const { make } = await network(t)
  const host = await make()
  const pip = await make()
  const quinn = await make()
  host.setProfile({ name: 'Host' }); pip.setProfile({ name: 'Pip' }); quinn.setProfile({ name: 'Quinn' })
  const s = await host.hostLobby({})
  await pip.joinLobby(s.code)
  await quinn.joinLobby(s.code)
  await until(() => host.lobbyState.players.length === 3 && pip.lobbyState?.players.length === 3 && quinn.lobbyState?.players.length === 3)
  // Pip asks Quinn (both guests: the request goes through the host).
  const asks = []
  quinn.on('friend-ask', (a) => asks.push(a))
  const quinnSeat = pip.lobbyState.players.find((p) => p.name === 'Quinn').id
  pip.askFriend(quinnSeat)
  await until(() => asks.length === 1)
  assert.equal(asks[0].name, 'Pip')
  quinn.answerFriend(asks[0].from, true)
  await until(() => pip.friends.list().length === 1 && quinn.friends.list().length === 1)
  assert.equal(pip.friends.list()[0].name, 'Quinn')
  assert.equal(quinn.friends.list()[0].userId, pip.identity.userId)
  // And they find each other afterwards, like any friends.
  await until(() => pip.friends.list()[0].online && quinn.friends.list()[0].online)
  // The host can ask too.
  const asksPip = []
  pip.on('friend-ask', (a) => asksPip.push(a))
  host.askFriend(pip.lobbyState.you)
  await until(() => asksPip.length === 1)
  pip.answerFriend(asksPip[0].from, true)
  await until(() => host.friends.list().length === 1 && pip.friends.list().length === 2)
})

test('friends notice drift and repair it', async (t) => {
  const { make } = await network(t)
  const alice = await make()
  const bob = await make()
  alice.setProfile({ name: 'Alice' })
  bob.setProfile({ name: 'Bob' })
  for (const w of ['cat', 'dog', 'owl', 'emu']) alice.game.rate(w, 3)
  const { code } = await alice.friends.makeCode()
  await bob.friends.redeem(code)
  await until(() => bob.store.friendsOn('emu').length === 1)
  const aliceId = alice.identity.userId
  // Something got lost on Bob's side: a record vanished but his "up to"
  // number didn't change.
  delete bob.store.friend(aliceId).records['r/dog']
  // Reconnecting compares counts and fills the gap.
  bob.friends.mesh.drop(aliceId)
  await until(() => bob.store.friendsOn('dog').length === 1, { timeout: 30000 })
  // Alice's data goes back in time (a restore): Bob is told to start over.
  alice.store.mine.seq = 2
  alice.store.mine.records = Object.fromEntries(Object.entries(alice.store.mine.records).filter(([, r]) => r.seq <= 2))
  bob.friends.mesh.drop(aliceId)
  await until(() => !bob.store.friend(aliceId).records['r/emu'], { timeout: 30000 })
})

test('a used or expired code refuses anyone else, and nobody is added on one side only', async (t) => {
  const { make } = await network(t)
  const alice = await make()
  const bob = await make()
  const carol = await make()
  alice.setProfile({ name: 'Alice' })
  bob.setProfile({ name: 'Bob' })
  carol.setProfile({ name: 'Carol' })
  const events = []
  alice.friends.on('code', (e) => events.push(e))
  const { code } = await alice.friends.makeCode()
  await bob.friends.redeem(code)
  // Carol tries the same code straight away, while Alice's side is still listening.
  await assert.rejects(carol.friends.redeem(code, { timeoutMs: 6000 }), /already been used|Couldn’t reach/)
  await new Promise((resolve) => setTimeout(resolve, 500))
  assert.deepEqual(alice.friends.list().map((f) => f.name), ['Bob'])
  assert.equal(carol.friends.list().length, 0, 'Carol didn’t add Alice on her own')
  assert.equal(bob.friends.list().length, 1)
  assert.equal(events.filter((e) => e.friend).length, 1, 'Alice heard about one new friend, once')

  // An expired code is refused too.
  alice.settings.set({ friendCodeMinutes: 1 })
  const second = await alice.friends.makeCode()
  alice.friends.pairing.expiresAt = Date.now() - 1 // as if the time ran out a moment ago
  const p = alice.friends.pairing
  const open = () => alice.friends.pairing === p && Date.now() < p.expiresAt
  assert.equal(open(), false)
  await alice.friends.cancelCode()
  await assert.rejects(carol.friends.redeem(second.code, { timeoutMs: 6000 }), /expired|Couldn’t reach/)
  assert.equal(carol.friends.list().length, 0)
})
