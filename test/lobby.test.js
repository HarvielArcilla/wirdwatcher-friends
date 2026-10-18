import test from 'node:test'
import assert from 'node:assert/strict'
import { network, until } from './helpers.js'
import { closeness, summarize } from '../src/core/lobby.js'

test('closeness scores up to 100 for matching the table', () => {
  assert.equal(closeness(4, [4, 4]), 100)
  assert.equal(closeness(0, [5]), 0)
  assert.equal(closeness(3, [4]), 75)
})

test('three players rate together; ratings stay hidden until everyone locks in', async (t) => {
  const { make } = await network(t)
  const host = await make()
  const p1 = await make()
  const p2 = await make()
  host.setProfile({ name: 'Host' })
  p1.setProfile({ name: 'Pip' })
  p2.setProfile({ name: 'Quinn' })

  // Host and Pip are friends; the lobby should say so.
  const { code: fc } = await host.friends.makeCode()
  await p1.friends.redeem(fc)

  const state = await host.hostLobby({ rounds: 2, mode: 'everyday' })
  const code = state.code
  assert.match(code, /^[0-9A-Z]{5}-[0-9A-Z]{5}$/)
  await p1.joinLobby(code.toLowerCase().replace('-', ' '))
  await p2.joinLobby(code)
  await until(() => host.lobbyState.players.length === 3)
  assert.deepEqual(host.lobbyState.players.map((p) => p.name), ['Host', 'Pip', 'Quinn'])
  await until(() => p1.lobbyState?.players.find((p) => p.name === 'Host')?.friend)
  assert.equal(p2.lobbyState.players.find((p) => p.name === 'Host').friend, false)

  // Only the host can start.
  assert.throws(() => p1.lobbyAction('begin'), /Only the host/)
  host.lobbyAction('begin')
  await until(() => p2.lobbyState?.phase === 'rating')
  const word = p2.lobbyState.current.word
  assert.equal(p1.lobbyState.current.word, word)
  assert.ok(p1.lobbyState.current.info.senses.length)

  host.lobbyAction('rate', 4)
  p1.lobbyAction('rate', 4.4)
  await until(() => p2.lobbyState.players.filter((p) => p.locked).length === 2)
  // Nobody can see a rating before the reveal.
  assert.equal(p2.lobbyState.current.result, null)
  assert.equal(JSON.stringify(p2.lobbyState).includes('4.4'), false)

  const events = []
  host.on('lobby-event', (e) => events.push(e))
  p2.lobbyAction('react', '🔥')
  p2.lobbyAction('rate', 0)
  await until(() => p1.lobbyState.phase === 'reveal')
  const res = p1.lobbyState.current.result
  assert.equal(res.ratings[p2.lobbyState.you], 0)
  assert.equal(res.hotTake, p2.lobbyState.you)
  await until(() => events.some((e) => e.kind === 'react' && e.emoji === '🔥'))

  // The lobby rating became everyone's own rating.
  await until(() => p1.store.rating(word) === 4.4)
  assert.equal(host.store.rating(word), 4)
  assert.equal(p2.store.counter('hotTakes'), 1)

  // Everyone presses Enter → next word.
  for (const a of [host, p1, p2]) a.lobbyAction('next')
  await until(() => p1.lobbyState.round === 2 && p1.lobbyState.phase === 'rating')
  assert.notEqual(p1.lobbyState.current.word, word)
  for (const a of [host, p1, p2]) a.lobbyAction('rate', 3)
  await until(() => host.lobbyState.phase === 'reveal')
  assert.equal(host.lobbyState.current.result.hive, true)
  host.lobbyAction('advance')
  await until(() => p2.lobbyState?.phase === 'results')
  assert.ok(p2.lobbyState.summary.awards.length >= 2)
  await until(() => p2.store.counter('lobbyGames') === 1)

  // A player leaving doesn't stop the others; the host closing ends it.
  const closed = new Promise((resolve) => p2.once('lobby-closed', resolve))
  await p1.leaveLobby()
  await until(() => host.lobbyState.players.length === 2)
  await host.leaveLobby()
  assert.match(await closed, /closed/)
})

test('the host can remove someone, and the lobby keeps a size limit', async (t) => {
  const { make } = await network(t)
  const host = await make({ settings: { lobbySize: 2 } })
  const a = await make()
  const b = await make()
  const { code } = await host.hostLobby({})
  await a.joinLobby(code)
  await assert.rejects(b.joinLobby(code), /full/)
  const kicked = new Promise((resolve) => a.once('lobby-closed', resolve))
  host.lobbyAction('kick', host.lobbyState.players[1].id)
  assert.match(await kicked, /removed/)
  await until(() => host.lobbyState.players.length === 1)
})

test('end-of-game awards', () => {
  const players = new Map([['a', { name: 'A' }], ['b', { name: 'B' }]])
  const s = summarize([
    { word: 'cat', ratings: { a: 5, b: 4.8 }, mean: 4.9, spread: 0.2, hive: true, hotTake: null, players: 2 },
    { word: 'moist', ratings: { a: 0, b: 3 }, mean: 1.5, spread: 3, hive: false, hotTake: null, players: 2 }
  ], players)
  const titles = s.awards.map((x) => x.title)
  assert.ok(titles.includes('Table favorite'))
  assert.ok(titles.includes('Most divisive'))
  assert.equal(s.awards.find((x) => x.title === 'Table favorite').word, 'cat')
})
