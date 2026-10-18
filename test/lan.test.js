import test from 'node:test'
import assert from 'node:assert/strict'
import { network, until } from './helpers.js'

// Same Wi-Fi, no internet: everything goes over multicast discovery + TCP.
const lan = { port: 47000 + Math.floor(Math.random() * 900), intervalMs: 300 }
const opts = { lan, settings: { internet: false, lan: true } }

test('friends and lobbies work on the same network with no internet', async (t) => {
  const { make } = await network(t)
  const alice = await make(opts)
  const bob = await make(opts)
  alice.game.rate('harbor', 4.1)
  const { code } = await alice.friends.makeCode()
  await bob.friends.redeem(code, { timeoutMs: 15000 })
  await until(() => bob.store.friendsOn('harbor')[0]?.r === 4.1)

  const { code: lobbyCode } = await alice.hostLobby({ rounds: 1 })
  await bob.joinLobby(lobbyCode)
  await until(() => alice.lobbyState.players.length === 2)
  alice.lobbyAction('begin')
  await until(() => bob.lobbyState?.phase === 'rating')
  alice.lobbyAction('rate', 2)
  bob.lobbyAction('rate', 2.2)
  await until(() => bob.lobbyState.phase === 'reveal')
  assert.equal(bob.lobbyState.current.result.hive, true)
})
