import test from 'node:test'
import assert from 'node:assert/strict'
import { network, until } from './helpers.js'
import { closeness, summarize, closePoints, derange } from '../src/core/lobby.js'

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
  assert.equal(p2.lobbyState.summary.scored, false, 'Classic has no points')
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


test('points and raters: close is better, nobody rates their own word', () => {
  assert.equal(closePoints(3, 3), 100)
  assert.equal(closePoints(3, 4), 60)
  assert.equal(closePoints(0, 5), 0)
  for (let i = 0; i < 50; i++) {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const d = derange(ids)
    assert.deepEqual([...d].sort(), ids)
    assert.ok(d.every((x, i) => x !== ids[i]))
  }
})

async function table (t, n = 3) {
  const { make } = await network(t)
  const apps = []
  for (let i = 0; i < n; i++) { const a = await make(); a.setProfile({ name: ['Host', 'Pip', 'Quinn', 'Rosa'][i] }); apps.push(a) }
  return apps
}

async function seat (apps, options) {
  const [host, ...rest] = apps
  const { code } = await host.hostLobby(options)
  for (const a of rest) await a.joinLobby(code)
  await until(() => host.lobbyState.players.length === apps.length)
  host.lobbyAction('begin')
}

const idOf = (app) => app.lobbyState.you

test('High/Low: rate, guess who went highest and lowest, and score the guesses', async (t) => {
  const apps = await table(t)
  const [host, pip, quinn] = apps
  await seat(apps, { style: 'highlow', rounds: 1 })
  await until(() => quinn.lobbyState?.phase === 'rating')
  host.lobbyAction('rate', 3)
  pip.lobbyAction('rate', 4.8)
  quinn.lobbyAction('rate', 0.5)
  await until(() => pip.lobbyState.phase === 'guessing')
  assert.equal(pip.lobbyState.current.result, null)
  assert.equal(JSON.stringify(pip.lobbyState).includes('4.8'), true, 'my own rating is mine to see')
  assert.equal(JSON.stringify(host.lobbyState.players).includes('4.8'), false)
  assert.equal(JSON.stringify(quinn.lobbyState).includes('4.8'), false, 'nobody else sees it before the reveal')
  const [h, p, q] = apps.map(idOf)
  host.lobbyAction('guess', { high: p, low: q }) // both right
  pip.lobbyAction('guess', { high: h, low: q }) // low right
  quinn.lobbyAction('guess', { high: q, low: h }) // both wrong
  await until(() => quinn.lobbyState.phase === 'reveal')
  const res = quinn.lobbyState.current.result
  assert.deepEqual(res.highest, [p])
  assert.deepEqual(res.lowest, [q])
  assert.deepEqual(res.points, { [h]: 250, [p]: 100 }, 'both right is a perfect read: 200 plus 50')
  assert.deepEqual(res.perfect, { [h]: [{ label: 'Perfect read', bonus: 50 }] })
  assert.equal(res.guesses[q].hitHigh, false)
  await until(() => host.store.counter('mindReads') === 1)
  assert.equal(pip.store.rating(res.word), 4.8, 'the rating counts as Pip’s own')
})

test('Hot seat: the picker chooses a word, the seat rates it, everyone else predicts', async (t) => {
  const apps = await table(t)
  const [host, pip, quinn] = apps
  await seat(apps, { style: 'hotseat', rounds: 2 })
  await until(() => quinn.lobbyState?.phase === 'picking')
  const c = quinn.lobbyState.current
  const [h, p, q] = apps.map(idOf)
  assert.equal(c.seat, h, 'the first word is the host’s')
  assert.equal(c.picker, p, 'and the next player picks it')
  assert.equal(c.choices.length, 3)
  assert.ok(c.choices[0].info.senses.length, 'choices come with definitions')
  host.lobbyAction('pick', 1) // not the picker: ignored
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(quinn.lobbyState.phase, 'picking')
  pip.lobbyAction('pick', 2)
  await until(() => quinn.lobbyState.phase === 'rating')
  assert.equal(quinn.lobbyState.current.word, c.choices[2].word)
  host.lobbyAction('rate', 4.6) // the seat's rating
  pip.lobbyAction('rate', 4.5) // predictions
  quinn.lobbyAction('rate', 2)
  await until(() => pip.lobbyState.phase === 'reveal')
  const res = pip.lobbyState.current.result
  assert.equal(res.r, 4.6)
  assert.deepEqual(res.best, [p])
  assert.equal(res.points[p], 96 + 50, 'close prediction, plus the picker’s bonus for a 4.6')
  assert.equal(res.points[q] ?? 0, 0)
  assert.equal(res.points[h], 25, 'the seat beat one prediction by more than 1.0')
  await until(() => host.store.rating(res.word) === 4.6)
  assert.equal(pip.store.rating(res.word), null, 'a prediction isn’t a rating')
  for (const a of apps) a.lobbyAction('next')
  await until(() => quinn.lobbyState.phase === 'picking' && quinn.lobbyState.round === 2)
  assert.equal(quinn.lobbyState.current.seat, p, 'the seat moves round the table')
  assert.equal(quinn.lobbyState.current.picker, q)
})

test('Hive mind: secret targets and raters, players choose words, raters rate them', async (t) => {
  const apps = await table(t)
  const [host, pip, quinn] = apps
  await seat(apps, { style: 'hive', rounds: 1 })
  await until(() => quinn.lobbyState?.phase === 'choosing')
  const mine = Object.fromEntries(apps.map((a) => [idOf(a), a.lobbyState.current.mine]))
  for (const [id, m] of Object.entries(mine)) {
    assert.ok(m.target >= 0.3 && m.target <= 4.5)
    assert.notEqual(m.rater, id, 'never your own rater')
  }
  assert.equal(JSON.stringify(pip.lobbyState).includes(`"target":${mine[idOf(quinn)].target},"rater":"${mine[idOf(quinn)].rater}"`), false, 'assignments are private')
  host.lobbyAction('choose', 'notaword')
  await new Promise((resolve) => setTimeout(resolve, 200))
  assert.equal(host.lobbyState.current.mine.pick, null, 'only real words')
  host.lobbyAction('choose', 'cat')
  pip.lobbyAction('choose', 'moist')
  quinn.lobbyAction('choose', 'serendipity')
  await until(() => pip.lobbyState.phase === 'rating')
  // Each rater sees only the word chosen for them.
  const byPicker = { [idOf(host)]: 'cat', [idOf(pip)]: 'moist', [idOf(quinn)]: 'serendipity' }
  for (const a of apps) {
    const toRate = a.lobbyState.current.mine.toRate
    const picker = Object.keys(mine).find((id) => mine[id].rater === idOf(a))
    assert.equal(toRate.word, byPicker[picker])
    assert.equal(JSON.stringify(a.lobbyState.current).includes('"target"'), true) // only their own target
  }
  // Each rater rates exactly their target's value for the host's word, 1 off for the others.
  for (const a of apps) {
    const picker = Object.keys(mine).find((id) => mine[id].rater === idOf(a))
    const target = mine[picker].target
    a.lobbyAction('rate', picker === idOf(host) ? target : Math.min(5, target + 1))
  }
  await until(() => quinn.lobbyState.phase === 'reveal')
  const res = quinn.lobbyState.current.result
  assert.equal(res.entries.length, 3)
  assert.deepEqual(res.best, [idOf(host)])
  assert.equal(res.points[idOf(host)], 200, 'dead on: 100, plus 50 within 0.1, plus 50 for exact')
  await until(() => host.store.counter('bullseyes') === 1)
  const raterOfCat = mine[idOf(host)].rater
  const raterApp = apps.find((a) => idOf(a) === raterOfCat)
  await until(() => raterApp.store.rating('cat') === mine[idOf(host)].target, { timeout: 5000 })
})

test('end-of-game awards for each mode', () => {
  const players = new Map([['a', { name: 'A' }], ['b', { name: 'B' }]])
  assert.ok(summarize([{ style: 'hotseat', seat: 'a', picker: 'b', word: 'cat', r: 5, diffs: { b: 0.1 }, beaten: 0, reaction: true }], players, 'hotseat').awards.some((x) => x.title === 'Knows you best'))
  assert.ok(summarize([{ style: 'hive', entries: [{ picker: 'a', rater: 'b', target: 2, word: 'cat', r: 2.1, diff: 0.1 }, { picker: 'b', rater: 'a', target: 4, word: 'dog', r: 1, diff: 3 }] }], players, 'hive').awards.some((x) => x.title === 'Wildest miss'))
})

test('a dropped or replaced connection keeps your seat, and your answers still count', async (t) => {
  const { make } = await network(t)
  const host = await make()
  const pip = await make()
  const state = await host.hostLobby({ rounds: 2, mode: 'everyday', style: 'classic' })
  await pip.joinLobby(state.code)
  await until(() => host.lobbyState.players.length === 2)
  host.lobbyAction('begin')
  await until(() => pip.lobbyState?.phase === 'rating')
  const pipId = pip.lobbyState.you
  const hostLobby = host.lobby

  // 1. The link dies under Pip (as when the network swaps in a new path and
  //    closes the old one). Pip reconnects; the seat was held.
  hostLobby.mesh.drop(pipId)
  await until(() => host.lobbyState.players.find((p) => p.id === pipId)?.away === true || pip.lobbyState?.reconnecting === true, { timeout: 10000 }).catch(() => {})
  assert.equal(host.lobbyState.players.length, 2, 'seat held while reconnecting')
  await until(() => host.lobby.links.has(pipId) && !host.lobbyState.players.find((p) => p.id === pipId).away, { timeout: 30000 })
  await until(() => pip.lobbyState && !pip.lobbyState.reconnecting)
  pip.lobbyAction('rate', 3.3)
  host.lobbyAction('rate', 4)
  await until(() => host.lobbyState.phase === 'reveal')
  assert.equal(host.lobbyState.current.result.ratings[pipId], 3.3)

  // 2. A second, newer connection to the host: Pip switches to it, and the
  //    host follows; nothing is lost and nobody leaves.
  const before = pip.lobby.send
  const events = []
  host.on('lobby-event', (e) => events.push(e.kind))
  const hostKey = host.lobby.hostId
  const { codeKeys, parseLobbyCode } = await import('../src/core/crypto.js')
  const { topic } = codeKeys(parseLobbyCode(state.code))
  pip.lobby.mesh.refresh?.()
  // Make a fresh connection by dialing the host directly over the DHT.
  const conn = pip.lobby.mesh.swarm.dht.connect(Buffer.from(hostKey, 'hex'), { keyPair: pip.lobby.keyPair })
  conn.on('error', () => {})
  await new Promise((resolve) => conn.once('open', resolve))
  pip.lobby.mesh._connection(conn, hostKey, 'internet')
  await until(() => pip.lobby.send !== before)
  await until(() => host.lobby.links.get(pipId) && host.lobbyState.players.length === 2)
  pip.lobbyAction('next')
  host.lobbyAction('next')
  await until(() => pip.lobbyState.phase === 'rating' && pip.lobbyState.round === 2, { timeout: 15000 })
  assert.ok(!events.includes('leave'), 'nobody left')
  void topic

  // 3. Leaving on purpose gives the seat up straight away.
  await pip.leaveLobby()
  await until(() => host.lobbyState.players.length === 1, { timeout: 5000 })
})

test('a link that goes silent is noticed and replaced', async (t) => {
  const { make } = await network(t)
  const host = await make()
  const pip = await make()
  const state = await host.hostLobby({ rounds: 1, mode: 'everyday' })
  await pip.joinLobby(state.code)
  await until(() => host.lobbyState.players.length === 2)
  const pipId = pip.lobbyState.you
  // Pip's side stops sending anything at all, like a path that died.
  const sock = [...pip.lobby.mesh.sockets.values()][0].values().next().value
  sock.setKeepAlive(0)
  const send = pip.lobby.send
  pip.lobby.send = Object.assign(() => true, { close: send.close }) // swallow messages too
  await until(() => host.lobbyState.players.find((p) => p.id === pipId)?.away, { timeout: 30000 })
  pip.lobby.send = send
  // Pip hears the close and comes back on a fresh connection.
  await until(() => host.lobby.links.has(pipId) && !host.lobbyState.players.find((p) => p.id === pipId).away, { timeout: 40000 })
  host.lobbyAction('begin')
  await until(() => pip.lobbyState?.phase === 'rating')
  pip.lobbyAction('rate', 2.2)
  host.lobbyAction('rate', 2)
  await until(() => host.lobbyState.phase === 'reveal')
  assert.equal(host.lobbyState.current.result.ratings[pipId], 2.2)
})

test('Grand Jury: a secret defendant, a vote, and a verdict with everyone’s real ratings', async (t) => {
  const { make } = await network(t)
  const host = await make()
  const p1 = await make()
  const p2 = await make()
  // Only p1 has rated anything, so p1 must be the defendant.
  p1.rate('cat', 0.2)
  p1.rate('dog', 3)
  const s = await host.hostLobby({ rounds: 2, style: 'jury' })
  await p1.joinLobby(s.code)
  // Two players aren't enough.
  const notices = []
  host.on('lobby-event', (e) => { if (e.kind === 'notice') notices.push(e.text) })
  host.lobbyAction('begin')
  await until(() => notices.length === 1)
  assert.equal(host.lobbyState.phase, 'waiting')
  await p2.joinLobby(s.code)
  await until(() => host.lobbyState.players.length === 3)
  host.rate('cat', 4.8) // the host's app says what it gave the words on offer
  host.lobbyAction('begin')
  await until(() => p2.lobbyState?.phase === 'voting')
  const cur = p2.lobbyState.current
  // Between cat and dog, cat is the extreme one the table disagrees with,
  // but the host has rated it too, so the host could be in the dock as well.
  const dock = [host, p1].find((a) => a.lobbyState.current.mine.defendant)
  assert.ok(dock)
  assert.equal(cur.mine.defendant, false)
  assert.equal(JSON.stringify(cur).includes('"defendant":"'), false, 'nobody else learns who it is')
  const id = (a) => a.lobbyState.you
  const other = dock === host ? p1 : host
  assert.equal(cur.word, 'cat')
  assert.equal(cur.charge, dock === p1 ? 0.2 : 4.8)
  assert.equal(JSON.stringify(cur).includes('"past"'), false, 'nobody’s old ratings show before the verdict')
  // A vote for yourself doesn't count.
  p2.lobbyAction('vote', id(p2))
  other.lobbyAction('vote', id(dock))
  p2.lobbyAction('vote', id(other))
  dock.lobbyAction('vote', id(p2))
  await until(() => host.lobbyState.phase === 'reveal')
  const res = host.lobbyState.current.result
  // One vote each: no clear top, so the defendant walks free.
  assert.equal(res.convicted, false)
  assert.equal(res.defendant, id(dock))
  assert.deepEqual(res.right, [id(other)])
  assert.equal(res.points[id(other)], 100)
  assert.equal(res.points[id(dock)], 125)
  assert.equal(res.past[id(other)], dock === p1 ? 4.8 : 0.2)
  assert.equal(res.ratings[id(dock)], res.charge, 'the cards show real past ratings')
  await until(() => p2.store.counter('lobbyRounds') === 1)
  assert.equal(p2.store.rating('cat'), null)
  assert.equal(p1.store.rating('cat'), 0.2)
  await until(() => dock.store.counter('acquittals') === 1)
})

test('Clues: blanks and the table’s ratings, clues over time, points for guessing early', async (t) => {
  const { make } = await network(t)
  const host = await make()
  const p1 = await make()
  host.rate('serendipity', 4.9)
  p1.rate('serendipity', 3.2)
  host.rate('dog', 2)
  const s = await host.hostLobby({ rounds: 1, style: 'clues' })
  await p1.joinLobby(s.code)
  await until(() => host.lobbyState.players.length === 2)
  host.lobbyAction('begin')
  await until(() => p1.lobbyState?.phase === 'clues')
  const cur = p1.lobbyState.current
  assert.equal(cur.word, null, 'the word stays hidden')
  assert.equal(cur.pattern.length, 'serendipity'.length, 'the word both have rated')
  assert.equal(cur.table[host.lobbyState.you], 4.9)
  assert.equal(JSON.stringify(p1.lobbyState).toLowerCase().includes('serendipity'), false)
  // Chat can't give it away.
  const seen = []
  host.on('lobby-event', (e) => seen.push(e))
  p1.lobbyAction('chat', 'is it Serendipity?')
  host.lobbyAction('advance') // next clue
  await until(() => p1.lobbyState.current.clue === 1)
  p1.lobbyAction('clueGuess', 'luck')
  await until(() => p1.lobbyState.current.wrong[p1.lobbyState.you] === 1)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  p1.lobbyAction('clueGuess', 'Serendipity')
  await until(() => p1.lobbyState.current.mine.solved)
  assert.equal(p1.lobbyState.current.mine.points, 100 - 12 - 10 + 20)
  assert.equal(p1.lobbyState.current.mine.word, 'serendipity')
  assert.equal(host.lobbyState.current.word, null, 'still hidden from who hasn’t got it')
  assert.ok(!seen.some((e) => e.kind === 'chat'))
  host.lobbyAction('clueGuess', 'serendipity')
  await until(() => host.lobbyState.phase === 'reveal')
  const res = host.lobbyState.current.result
  assert.equal(res.word, 'serendipity')
  assert.equal(res.points[host.lobbyState.you], 100 - 12 + 50, 'after one clue with no misses: flawless')
})

test('Clues are fair: the word never shows up in them', async () => {
  const { buildClues } = await import('../src/core/lobby.js')
  const info = { senses: [{ posName: 'noun', def: 'a run of running', ex: ['she runs a run'] }], synonyms: ['runner', 'tally'] }
  const clues = buildClues('run', info)
  for (const c of clues) assert.ok(!/run/i.test(c.text || ''), c.text)
  assert.ok(clues.at(-1).pattern.includes(null), 'a letter always stays hidden')
  assert.equal(clues[0].pattern.every((x) => x === null), true)
})
