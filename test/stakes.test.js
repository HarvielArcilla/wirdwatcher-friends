import test from 'node:test'
import assert from 'node:assert/strict'
import { Economy } from '../src/core/economy.js'
import { balanced, splitPot } from '../src/shared/stakes.js'
import { tmp, network, until } from './helpers.js'

// --- the invariant ---------------------------------------------------------------

test('a pot pays out exactly what went in', () => {
  assert.deepEqual(splitPot(100, ['a', 'b', 'c'], { a: 5, b: 9, c: 1 }), { a: 0, b: 300, c: 0 })
  // A three-way tie on 100 coins each: 300 splits evenly.
  assert.deepEqual(splitPot(100, ['a', 'b', 'c'], {}), { a: 100, b: 100, c: 100 })
  // A two-way tie of three on an odd pot: the spare coin goes to the first in seat order.
  assert.deepEqual(splitPot(1, ['a', 'b', 'c'], { a: 2, b: 2, c: 0 }), { a: 2, b: 1, c: 0 })
  // Someone who left can't win, but their stake stays in.
  assert.deepEqual(splitPot(10, ['a', 'b'], { a: 99, b: 1 }, ['b']), { a: 0, b: 20 })
  for (let i = 0; i < 300; i++) {
    const n = 2 + (i % 7)
    const ids = Array.from({ length: n }, (_, j) => `p${j}`)
    const scores = Object.fromEntries(ids.map((id) => [id, Math.floor(Math.random() * 4) * 100]))
    const stake = 1 + Math.floor(Math.random() * 1e6)
    assert.ok(balanced(stake, splitPot(stake, ids, scores)))
  }
  assert.equal(balanced(100, { a: 150, b: 49 }), false, 'a coin short')
  assert.equal(balanced(100, { a: 151, b: 50 }), false, 'a coin made up')
  assert.equal(balanced(100, { a: 250, b: -50 }), false, 'nothing negative')
  assert.equal(balanced(100, { a: 100.5, b: 99.5 }), false, 'whole coins')
  assert.equal(balanced(100, {}), false)
})

// --- escrow -------------------------------------------------------------------------

test('escrow: held once, paid once, refunded only if never promised', () => {
  const dir = tmp()
  const e = new Economy({ dir })
  e.devAddCoins(1000)
  assert.equal(e.holdStake('h:1', 300, 'h'), true)
  assert.equal(e.holdStake('h:1', 300, 'h'), true, 'asking again is fine')
  assert.equal(e.s.coins, 700, 'but takes the coins once')
  assert.equal(e.holdStake('h:2', 5000, 'h'), false, 'can’t stake what you don’t have')
  assert.equal(e.refundStake('h:1'), 300)
  assert.equal(e.refundStake('h:1'), 0, 'refunded once')
  assert.equal(e.s.coins, 1000)

  e.holdStake('h:3', 300, 'h')
  e.commitStake('h:3')
  assert.equal(e.refundStake('h:3'), 0, 'a promised stake can’t come back')
  assert.equal(e.settleStake('h:3', { stake: 300, payouts: { me: 901, x: 0, y: 0 }, me: 'me' }), null, 'a payout that doesn’t add up is refused')
  assert.equal(e.settleStake('h:3', { stake: 300, payouts: { me: 900, x: 0, y: 0 }, me: 'me' }), 900)
  assert.equal(e.settleStake('h:3', { stake: 300, payouts: { me: 900, x: 0, y: 0 }, me: 'me' }), null, 'paid once')
  assert.equal(e.s.coins, 1600)
  assert.equal(e.s.stakes.net, 600)

  // Saved as it happens: a crash right after holding loses nothing.
  e.holdStake('h:4', 100, 'h')
  e.holdStake('h:5', 100, 'h')
  e.commitStake('h:5')
  const again = new Economy({ dir })
  assert.equal(again.s.coins, 1400)
  again.start(); again.stop()
  assert.equal(again.s.coins, 1500, 'at startup, the unpromised stake comes back; the promised one is gone')
  assert.deepEqual(again.s.escrow, {})
})

test('payouts don’t count toward ink', () => {
  const e = new Economy({ dir: tmp() })
  e.devAddCoins(100)
  const all = e.s.allCoins
  e.holdStake('h:1', 100, 'h'); e.commitStake('h:1')
  e.settleStake('h:1', { stake: 100, payouts: { me: 800, a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0 }, me: 'me' })
  assert.equal(e.s.allCoins, all)
})

// --- at the table ---------------------------------------------------------------------

async function table (t, n = 3) {
  const { make } = await network(t)
  const apps = []
  for (let i = 0; i < n; i++) { const a = await make(); a.setProfile({ name: ['Host', 'Pip', 'Quinn'][i] }); a.economy.devAddCoins(10000); apps.push(a) }
  return apps
}
async function seat (apps, options) {
  const [host, ...rest] = apps
  const { code } = await host.hostLobby(options)
  for (const a of rest) await a.joinLobby(code)
  await until(() => host.lobbyState.players.length === apps.length && rest.every((a) => a.lobbyState?.stake === options.stake))
}
const id = (a) => a.lobbyState.you
const net = (apps) => apps.reduce((sum, a) => sum + a.economy.s.stakes.net, 0)
const buyIn = async (apps, amount) => {
  for (const a of apps) a.lobbyAction('stakeIn', { in: true, amount })
  const ids = apps.map(id)
  await until(() => apps.every((a) => a.lobbyState.players.filter((p) => ids.includes(p.id)).every((p) => p.stakeIn)))
}

// Plays one High/Low word where Pip reads the table perfectly.
async function playHighLow (apps) {
  const [host, pip, quinn] = apps
  await until(() => apps.every((a) => a.lobbyState?.phase === 'rating'))
  host.lobbyAction('rate', 1); pip.lobbyAction('rate', 3); quinn.lobbyAction('rate', 5)
  await until(() => apps.every((a) => a.lobbyState?.phase === 'guessing'))
  pip.lobbyAction('guess', { high: id(quinn), low: id(host) })
  host.lobbyAction('guess', { high: id(pip), low: id(quinn) })
  quinn.lobbyAction('guess', { high: id(pip), low: id(quinn) })
  await finish(apps)
}
// Everyone presses Enter on the last reveal.
async function finish (apps) {
  await until(() => apps.every((a) => a.lobbyState?.phase === 'reveal'))
  for (const a of apps) a.lobbyAction('next')
}

test('stakes: everyone buys in, the best score takes the pot, and nothing is made or lost', async (t) => {
  const apps = await table(t)
  const [host, pip, quinn] = apps
  await seat(apps, { style: 'highlow', rounds: 1, stake: 1000 })
  assert.throws(() => pip.lobbyAction('stakeIn', { in: true, amount: 50 }), /isn’t the stake/)
  await buyIn(apps, 1000)
  const before = apps.map((a) => a.economy.s.coins)
  host.lobbyAction('begin')
  await until(() => apps.every((a) => a.economy.stakedNow() === 1000))
  assert.deepEqual(apps.map((a, i) => before[i] - a.economy.s.coins), [1000, 1000, 1000], 'each stake left its owner')
  await playHighLow(apps)
  await until(() => apps.every((a) => a.lobbyState?.pot?.status === 'paid'))
  await until(() => apps.every((a) => a.economy.stakedNow() === 0))
  assert.deepEqual(host.lobbyState.pot.payouts, { [id(host)]: 0, [id(pip)]: 3000, [id(quinn)]: 0 })
  assert.equal(pip.economy.s.stakes.net, 2000)
  assert.equal(host.economy.s.stakes.net, -1000)
  assert.equal(net(apps), 0, 'the table as a whole made and lost nothing')
  // Next game is blocked until... it isn't: the pot is paid.
  host.lobbyAction('begin')
  await until(() => host.lobbyState.phase !== 'results')
})

test('stakes: a game ended early gives every stake back', async (t) => {
  const apps = await table(t)
  const [host] = apps
  await seat(apps, { style: 'highlow', rounds: 3, stake: 1000 })
  await buyIn(apps, 1000)
  const before = apps.map((a) => a.economy.s.coins)
  host.lobbyAction('begin')
  await until(() => apps.every((a) => a.economy.stakedNow() === 1000))
  host.lobbyAction('backToLobby')
  await until(() => apps.every((a) => a.economy.stakedNow() === 0))
  for (const [i, a] of apps.entries()) assert.ok(a.economy.s.coins >= before[i], 'back where they started')
  assert.equal(net(apps), 0)
})

test('stakes: the host closing mid-game, and a player leaving on purpose', async (t) => {
  const apps = await table(t)
  const [host, pip, quinn] = apps
  await seat(apps, { style: 'highlow', rounds: 1, stake: 100 })
  await buyIn(apps, 100)
  host.lobbyAction('begin')
  await until(() => apps.every((a) => a.economy.stakedNow() === 100))
  // Quinn walks out mid-game: the stake stays in the pot.
  await quinn.leaveLobby()
  assert.equal(quinn.economy.stakedNow(), 0)
  assert.equal(quinn.economy.s.stakes.net, -100)
  await until(() => host.lobbyState.players.length === 2)
  await until(() => host.lobbyState.phase === 'rating')
  host.lobbyAction('rate', 1); pip.lobbyAction('rate', 4)
  await until(() => pip.lobbyState.phase === 'guessing')
  pip.lobbyAction('guess', { high: id(pip), low: id(host) })
  host.lobbyAction('guess', { high: id(host), low: id(pip) })
  await finish([host, pip])
  await until(() => pip.lobbyState?.pot?.status === 'paid')
  await until(() => pip.economy.stakedNow() === 0 && host.economy.stakedNow() === 0)
  assert.equal(pip.economy.s.stakes.net, 200, 'Pip won all three stakes')
  assert.equal(net(apps), 0)

  // Another game; this time the host closes the lobby halfway.
  await buyIn([host, pip], 100)
  host.lobbyAction('begin')
  await until(() => host.economy.stakedNow() === 100 && pip.economy.stakedNow() === 100)
  const pipCoins = pip.economy.s.coins
  await host.leaveLobby()
  await until(() => pip.economy.stakedNow() === 0)
  assert.equal(pip.economy.s.coins, pipCoins + 100, 'Pip’s stake came back')
  assert.equal(host.economy.stakedNow(), 0)
  assert.equal(net(apps), 0)
})

test('stakes: nobody’s coins move without their say-so', async (t) => {
  const apps = await table(t)
  const [host, pip, quinn] = apps
  await seat(apps, { style: 'highlow', rounds: 1, stake: 1000 })
  // Only the host and Pip buy in; Quinn plays for points only.
  await buyIn([host, pip], 1000)
  const q = quinn.economy.s.coins
  // A host asking Quinn's app to hold anyway is turned down.
  assert.equal(quinn._lobbyProvide('hold', { key: `${host.lobbyState.host}:9`, amount: 1000, host: host.lobbyState.host }), false)
  host.lobbyAction('begin')
  await until(() => host.lobbyState.pot?.status === 'open')
  assert.deepEqual(host.lobbyState.pot.members, [id(host), id(pip)])
  assert.equal(quinn.economy.s.coins >= q, true)
  assert.equal(quinn.economy.stakedNow(), 0)
  // Changing the stake means buying in again.
  host.lobbyAction('backToLobby')
  host.lobbyAction('configure', { stake: 100 })
  await until(() => host.lobbyState.players.every((p) => !p.stakeIn))
  // Classic has no points, so no stakes.
  host.lobbyAction('configure', { style: 'classic' })
  await until(() => host.lobbyState.stake === 0)
})

test('stakes: a promise that never reaches the host loses coins rather than copying them', async (t) => {
  const apps = await table(t)
  const [host, pip, quinn] = apps
  await seat(apps, { style: 'highlow', rounds: 1, stake: 100 })
  await buyIn(apps, 100)
  host.lobbyAction('begin')
  await until(() => apps.every((a) => a.economy.stakedNow() === 100))
  quinn.lobby.stakeAck = () => {} // Quinn's app promises, but the message is lost
  await playHighLow(apps)
  await until(() => host.lobbyState?.pot?.status === 'paid', { timeout: 15000 })
  // The host paid out among those it heard from.
  assert.deepEqual(Object.keys(host.lobbyState.pot.payouts).sort(), [id(host), id(pip)].sort())
  await until(() => apps.every((a) => a.economy.stakedNow() === 0))
  assert.equal(quinn.economy.s.stakes.net, -100, 'Quinn’s promised stake is gone')
  assert.equal(net(apps), -100, 'short by one stake, never over')
})
