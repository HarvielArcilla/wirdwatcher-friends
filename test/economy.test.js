import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { WirdApp } from '../src/core/app.js'
import { Economy } from '../src/core/economy.js'
import { effects, wordPay, buildingCost, BUILDINGS, inkTotalFor, offlinePay } from '../src/shared/economy.js'
import { cleanLook } from '../src/shared/cosmetics.js'
import { tmp, network, until } from './helpers.js'

// A clock the test moves by hand.
const clock = (start = new Date('2026-10-18T12:00:00').getTime()) => { const c = { t: start, now: () => c.t, add: (ms) => { c.t += ms } }; return c }

test('every rating pays the same, whatever the score; only new words pay', () => {
  const c = clock()
  const app = new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false }, now: () => new Date(c.t) })
  app.economy.start()
  const a = app.rate('cat', 0)
  c.add(70000) // past the streak window, so each is a fresh streak
  const b = app.rate('dog', 5)
  assert.equal(a.coins.coins, b.coins.coins * 1, 'a 0.0 and a 5.0 pay the same') // both 3-letter words, both first of a fresh streak... except the first of the day
  c.add(70000)
  const again = app.rate('dog', 2.5)
  assert.equal(again.coins, null, 'changing a rating pays nothing')
  app.economy.stop()
})

test('the pace streak grows with ratings close together, ignores mashing, and lapses', () => {
  const c = clock()
  const e = new Economy({ dir: tmp(), now: c.now })
  const r1 = e.onWord('alpha', { fresh: true })
  c.add(5000)
  const r2 = e.onWord('bravo', { fresh: true })
  assert.equal(r1.streak.n, 1)
  assert.equal(r2.streak.n, 2)
  assert.ok(r2.streak.mult > r1.streak.mult)
  c.add(300) // too quick to be a real rating: doesn't grow
  const r3 = e.onWord('charlie', { fresh: true })
  assert.equal(r3.streak.n, 2)
  c.add(61000) // past the window
  const r4 = e.onWord('delta', { fresh: true })
  assert.equal(r4.streak.n, 1, 'lapsed and started again')
})

test('buildings, upgrades, offline earnings and the muse', () => {
  const c = clock()
  const dir = tmp()
  let e = new Economy({ dir, now: c.now })
  e.devAddCoins(1e6)
  e.buyBuilding('pencil', 10)
  assert.equal(e.view().buildings[0].owned, 10)
  assert.ok(e.s.coins < 1e6)
  assert.throws(() => e.buyUpgrade('word-2'), /Not yet/)
  for (let i = 0; i < 10; i++) { c.add(5000); e.onWord(`w${i}`, { fresh: true }) }
  e.buyUpgrade('word-1')
  const fx = effects(e.s)
  assert.equal(fx.wordFlat, 3)
  assert.equal(e.view().buildings[0].next, buildingCost(BUILDINGS[0], 10))
  // Tiers double a building.
  e.buyUpgrade('pencil-1')
  assert.equal(effects(e.s).building.pencil, 2)
  // Away for 5 hours with the default 2-hour cap at 5%.
  e.save(true)
  const cps = e.view().baseCps
  c.add(5 * 3600 * 1000)
  e = new Economy({ dir, now: c.now })
  const before = e.s.coins
  e.start(); e.stop()
  assert.ok(Math.abs(e.s.coins - before - cps * 0.05 * 7200) < 1, 'capped at 2 hours, at 5%')
  assert.equal(offlinePay(e.s, 3600e3).secs, 3600)
  // The muse speeds the house up after a rating.
  e.buyBuilding('pencil', 5)
  e.devAddCoins(1e6)
  e.buyUpgrade('muse-1')
  e.s.lastTick = c.t
  c.add(1000); e.tick()
  const plain = e.compact().cps
  e.onWord('epsilon', { fresh: true })
  assert.ok(e.compact().cps > plain * 1.15, 'muse is on')
})

test('prestige: ink, a permanent bonus, perks, and edition cosmetics', () => {
  const c = clock()
  const e = new Economy({ dir: tmp(), now: c.now })
  assert.throws(() => e.prestige(), /Not enough/)
  e.devAddCoins(8e9) // cube root of 8 (billion) = 2 ink
  e.buyBuilding('pencil', 20)
  const res = e.prestige()
  assert.equal(res.gain, 2)
  assert.equal(inkTotalFor(8e9), 2)
  assert.equal(e.s.edition, 1)
  assert.equal(e.s.coins, 0)
  assert.deepEqual(e.s.upgrades, [])
  assert.equal(e.s.buildings.pencil || 0, 0)
  assert.ok(effects(e.s).prestige > 1.03)
  assert.ok(e.owns('frame', 'first-edition') && e.owns('title', 'author'), 'first edition brings its own frame and title')
  e.buyPerk('headstart')
  e.devAddCoins(19e9) // all-time 27 billion: 3 ink in total, 1 new
  e.prestige()
  assert.equal(e.s.buildings.pencil, 5, 'head start')
})

test('the coinflip is 50/50, keeps stats, and never counts as earning', () => {
  const e = new Economy({ dir: tmp(), now: clock().now })
  e.devAddCoins(1000)
  const all = e.s.allCoins
  let wins = 0
  for (let i = 0; i < 200; i++) { const r = e.flip(1, 'heads'); if (r.win) wins++ }
  assert.ok(wins > 60 && wins < 140)
  assert.equal(e.s.flips.count, 200)
  assert.equal(e.s.allCoins, all, 'flips don’t make ink')
  assert.throws(() => e.flip(1e9), /don’t have/)
  assert.throws(() => e.flip(0), /at least 1/)
})

test('the shop: buy, wear, and only real items reach others', () => {
  const e = new Economy({ dir: tmp(), now: clock().now })
  assert.throws(() => e.buyCosmetic('frame', 'gold'), /Not enough/)
  e.devAddCoins(1e5)
  e.buyCosmetic('frame', 'gold')
  assert.equal(e.look().frame, 'gold')
  assert.throws(() => e.equip('table', 'night'), /don’t have/)
  e.equip('frame', 'none')
  assert.equal(e.look().frame, 'none')
  assert.throws(() => e.buyCosmetic('frame', 'legend'), /publishing 5 times/)
  assert.deepEqual(cleanLook({ frame: 'made-up', table: 'velvet', evil: 'x' }), { table: 'velvet', frame: 'none', cardBack: 'stripes', title: 'none', name: 'plain' })
})

test('economy survives an update, and the dev account has everything', () => {
  const dir = tmp()
  let app = new WirdApp({ dataDir: dir, settings: { lan: false, internet: false } })
  app.economy.devAddCoins(500)
  app.economy.stop()
  assert.ok(fs.existsSync(path.join(dir, 'economy.json')))
  app = new WirdApp({ dataDir: dir, settings: { lan: false, internet: false }, dev: true })
  assert.ok(app.economy.s.coins >= 500)
  app.economy.start(); app.economy.stop()
  assert.ok(app.economy.owns('table', 'cosmos') && app.economy.owns('frame', 'legend'))
})

test('the host’s table and everyone’s frames show up at the table', async (t) => {
  const { make } = await network(t)
  const host = await make()
  const pip = await make()
  host.economy.devUnlockAll()
  pip.economy.devUnlockAll()
  host.economy.equip('table', 'night')
  pip.economy.equip('frame', 'rainbow')
  pip.economy.equip('title', 'oracle')
  const s = await host.hostLobby({})
  await pip.joinLobby(s.code)
  await until(() => host.lobbyState.players.length === 2)
  await until(() => pip.lobbyState?.table === 'night')
  const seen = host.lobbyState.players.find((p) => !p.me)
  assert.equal(seen.look.frame, 'rainbow')
  assert.equal(seen.look.title, 'oracle')
  // Changing your look mid-lobby shows up too.
  pip.economy.equip('frame', 'crown')
  await until(() => host.lobbyState.players.find((p) => !p.me).look.frame === 'crown')
  void wordPay
})
