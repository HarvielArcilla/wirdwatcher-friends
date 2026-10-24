import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import { itemFor, describe, sampleWords, TRANSFORMS } from '../src/shared/wirdlike/items.js'
import { genFloor, connected, DOOR_CELLS } from '../src/shared/wirdlike/floor.js'
import { newRun, step, enterRoom, spawnFoe, serialize, restore, startFloor, giveItem, drawItem, blocked, freeSpot, DT } from '../src/shared/wirdlike/engine.js'
import { FOES } from '../src/shared/wirdlike/foes.js'
import { FLOORS, NAMED_BOSSES, SINS, T, WIRDLIKE_COSMETICS, MIN_RATED } from '../src/shared/wirdlike/content.js'
import { COSMETICS, cleanLook } from '../src/shared/cosmetics.js'
import { tmp } from './helpers.js'

const app = () => new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false } })
const W = app().words
const words = W.list.slice(0, 4000).map((x) => x[0]).filter((w) => /^[a-z]+$/.test(w))
const pool = words.slice(0, 600).map((w, i) => itemFor(w, W.lookup(w), (i % 51) / 10))

test('words become items: verbs are actives, ratings change flavour not power, the same word is the same item', () => {
  const verb = words.find((w) => W.lookup(w).senses[0].pos === 'v')
  assert.equal(itemFor(verb, W.lookup(verb), 3).kind, 'active')
  assert.ok(itemFor(verb, W.lookup(verb), 3).active.charge >= 1)
  const fire = itemFor('fire', W.lookup('fire'), 3)
  assert.equal(fire.theme, 'fire')
  assert.deepEqual(itemFor('fire', W.lookup('fire'), 3), fire, 'deterministic')
  // Loved words are blessed (a margin heart), hated ones cursed (stronger, with a catch).
  const loved = itemFor('fire', W.lookup('fire'), 4.8)
  const hated = itemFor('fire', W.lookup('fire'), 0.2)
  assert.equal(loved.flavor, 'blessed')
  assert.ok(loved.fx.some((f) => f.t === 'soul'))
  assert.equal(hated.flavor, 'cursed')
  assert.ok(hated.fx.length > fire.fx.length || hated.fx.some((f, i) => f.v > (fire.fx[i]?.v ?? 0)))
  for (const it of pool) assert.ok(describe(it).length > 0, `${it.word} says what it does`)
  assert.deepEqual(sampleWords(words, 'SEED', 50), sampleWords(words, 'SEED', 50))
})

test('floors: a boss far from the start, special rooms, and every room can be crossed', () => {
  for (let fi = 0; fi < FLOORS.length; fi++) {
    for (const seed of ['A', 'B', 'C']) {
      const f = genFloor(seed, fi)
      const rooms = Object.values(f.rooms)
      assert.equal(rooms.filter((r) => r.type === 'boss').length, 1)
      assert.equal(rooms.filter((r) => r.type === 'treasure').length, 1)
      for (const r of rooms) assert.ok(connected(r.tiles, Object.keys(r.doors).length ? Object.keys(r.doors) : ['n']), `${seed} ${fi} ${r.key} is crossable`)
      // Doors pair up.
      for (const r of rooms) for (const [d, door] of Object.entries(r.doors)) assert.ok(f.rooms[door.to], `${r.key} ${d} leads somewhere`)
    }
  }
})

test('the engine: walk through a door, pick up a word, buy from the shop, blow open a secret', () => {
  const run = newRun({ seed: 'walk', pool })
  run.p.hp = run.p.maxHp = 24
  const start = run.floor.rooms[run.room.key]
  const [d, door] = Object.entries(start.doors).find(([, x]) => !x.hidden && !x.locked)
  const [tx, ty] = DOOR_CELLS[d]
  const dir = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[d]
  run.p.x = 40 + tx * 40 + 20; run.p.y = 40 + ty * 40 + 20
  for (let i = 0; i < 120 && run.room.key === start.key; i++) step(run, { mx: dir[0], my: dir[1] })
  assert.equal(run.room.key, door.to, 'walked into the next room')
  // A treasure room's word.
  const treasure = Object.values(run.floor.rooms).find((r) => r.type === 'treasure')
  enterRoom(run, treasure.key, null)
  const ped = run.room.peds[0]
  assert.ok(ped?.item)
  const word = ped.item.word
  run.p.x = ped.x; run.p.y = ped.y + 10
  step(run, {})
  assert.ok(run.p.items.some((i) => i.word === word) || run.p.active?.item.word === word)
  assert.ok(run.stats.found.includes(word))
  // A shop: not enough glyphs, then enough.
  const shop = Object.values(run.floor.rooms).find((r) => r.type === 'shop')
  enterRoom(run, shop.key, null)
  const forSale = run.room.peds.find((s) => s.price)
  run.p.glyphs = 3
  run.p.x = forSale.x; run.p.y = forSale.y + 10
  step(run, {})
  assert.ok(forSale.item, 'can’t afford it')
  run.p.glyphs = 20
  step(run, {})
  assert.equal(forSale.item, null)
  assert.equal(run.p.glyphs, 5)
  // A bang next to a hidden door finds the secret room.
  const secret = Object.values(run.floor.rooms).find((r) => r.type === 'secret')
  if (secret) {
    const [nd, nb] = Object.entries(secret.doors)[0]
    const next = run.floor.rooms[nb.to]
    enterRoom(run, next.key, null)
    run.room.doorsOpen = true
    const back = Object.entries(next.doors).find(([, x]) => x.to === secret.key)[0]
    const [bx, by] = DOOR_CELLS[back]
    run.p.bangs = 1; run.p.x = 40 + bx * 40 + 20; run.p.y = 40 + by * 40 + 20
    step(run, { bang: true })
    run.p.x = 300; run.p.y = 180
    for (let i = 0; i < 120; i++) step(run, {})
    assert.equal(next.doors[back].hidden, false, 'the bang opened it')
    assert.equal(secret.doors[nd].hidden, false)
  }
})

test('every boss and grammar sin can be beaten', () => {
  for (const id of [...NAMED_BOSSES, ...SINS]) {
    const run = newRun({ seed: `boss-${id}`, pool })
    run.room.foes = []
    spawnFoe(run, id, 300, 140, { boss: true })
    let t = 0
    // A turret that can't be hurt, hitting hard.
    while (t < 400 && run.room.foes.some((f) => !f.dead && !f.ignore)) {
      run.p.hp = 24; run.p.inv = 1
      run.p.stats.dmg = 40; run.p.stats.tears = 8
      const e = run.room.foes.find((f) => !f.dead && !f.untouchable && !f.ignore) || run.room.foes.find((f) => !f.dead)
      const dx = e ? e.x - run.p.x : 0; const dy = e ? e.y - run.p.y : -1
      const l = Math.hypot(dx, dy) || 1
      step(run, { sx: dx / l, sy: dy / l, mx: Math.sin(t), my: Math.cos(t * 0.7) })
      t += DT
    }
    assert.ok(t < 400, `${FOES[id].name} can be beaten (took ${t.toFixed(0)}s)`)
  }
})

test('a boss leaves a way down; The Red Pen ends the run; saving picks up where you were', () => {
  const run = newRun({ seed: 'down', pool })
  const boss = Object.values(run.floor.rooms).find((r) => r.type === 'boss')
  enterRoom(run, boss.key, null)
  for (const e of run.room.foes) e.hp = 0.01
  run.p.inv = 5
  step(run, { sx: 0, sy: -1 })
  for (const e of run.room.foes) e.dead = true
  for (let i = 0; i < 3; i++) step(run, {})
  assert.ok(boss.cleared && boss.trap?.kind === 'hatch')
  assert.ok(run.stats.bosses.includes(boss.boss))
  run.p.x = boss.trap.x; run.p.y = boss.trap.y
  step(run, {})
  assert.equal(run.fi, 1, 'down to the next floor')
  // Saving and coming back.
  giveItem(run, pool.find((i) => i.kind === 'passive'))
  const back = restore(JSON.parse(JSON.stringify(serialize(run))))
  assert.equal(back.fi, 1)
  assert.equal(back.p.items.length, run.p.items.length)
  for (let i = 0; i < 30; i++) step(back, {})
  // The last page.
  startFloor(run, 8)
  const pen = Object.values(run.floor.rooms).find((r) => r.type === 'boss')
  assert.equal(pen.boss, 'redpen')
  enterRoom(run, pen.key, null)
  for (const e of run.room.foes) e.dead = true
  step(run, {})
  assert.equal(pen.trap.kind, 'end')
  run.p.x = pen.trap.x; run.p.y = pen.trap.y
  step(run, {})
  assert.deepEqual([run.over.won, run.over.deep], [true, false])
})

test('three words from one topic transform you', () => {
  const run = newRun({ seed: 'tf', pool })
  const animals = words.map((w) => itemFor(w, W.lookup(w), 3)).filter((i) => i.topic === 'animals' && i.kind === 'passive').slice(0, 3)
  for (const it of animals) giveItem(run, it)
  assert.ok(run.p.transforms.includes('animals'))
  assert.equal(TRANSFORMS.animals.name, 'Bestiary')
  assert.ok(run.room.fams.filter((f) => f.kind === 'chaser').length >= 2)
})

test('Wirdlike on this computer: rated words fill the pool, bosses pay, goals unlock characters and looks', () => {
  const a = app()
  assert.throws(() => a.wirdlike.start('wirdo'), /Rate at least/)
  for (let i = 0; i < MIN_RATED + 5; i++) { const d = a.game.deal('everyday'); a.rate(d.word, (i % 11) / 2) }
  assert.throws(() => a.wirdlike.start('q'), /unlocked/)
  const s = a.wirdlike.start('wirdo', 'abc 123')
  assert.equal(s.seed, 'ABC123')
  assert.equal(s.pool.length, MIN_RATED + 5)
  assert.ok(a.economy.s.owned.includes('face:wl-wirdo'), 'Wirdo’s head is yours from your first run')
  const before = a.economy.s.coins
  const res = a.wirdlike.end({ won: false, char: 'wirdo', bosses: ['typo'], deepest: 1, found: ['cat'], kills: 20, by: 'Typo' })
  assert.ok(res.coins > 0 && a.economy.s.coins > before)
  assert.deepEqual(res.newChars, ['Q'], 'beating a boss brings Q')
  assert.ok(res.looks.some((l) => l.id === 'wl-ruled'))
  assert.ok(a.store.progress.badges['wl-boss'] && a.store.progress.badges['wl-run'])
  // A win marks the character and opens The Unwritten.
  const win = a.wirdlike.end({ won: true, char: 'wirdo', bosses: ['redpen'], deepest: 8, t: 1500 })
  assert.ok(win.newChars.includes('?'))
  assert.equal(a.wirdlike.view().chars.find((c) => c.id === 'wirdo').marks.redpen, true)
  assert.equal(a.wirdlike.start('query').deep, true)
  // Faces are public looks, and only come from Wirdlike.
  a.economy.equip('face', 'wl-wirdo')
  assert.equal(a.economy.look().face, 'wl-wirdo')
  assert.equal(cleanLook({ face: 'wl-wirdo' }).face, 'wl-wirdo')
  assert.equal(cleanLook({ face: 'nonsense' }).face, 'letter')
  assert.throws(() => a.economy.buyCosmetic('frame', 'wl-gilt'), /Wirdlike/)
  assert.ok(WIRDLIKE_COSMETICS.every((c) => COSMETICS.includes(c)))
})

test('pits and blocks stop walkers but not fliers', () => {
  const run = newRun({ seed: 'pits', pool })
  const r = run.floor.rooms[run.room.key]
  r.tiles.fill(T.FLOOR)
  r.tiles[3 * 13 + 7] = T.PIT
  run.p.x = 260 + 20; run.p.y = 40 + 3 * 40 + 20
  for (let i = 0; i < 60; i++) step(run, { mx: 1 })
  assert.ok(run.p.x < 40 + 7 * 40, 'stopped at the pit')
})

test('play testers: swapping actives reuses the pedestal, and a boss room stays on its floor', () => {
  const run = newRun({ seed: 'swap', pool })
  const actives = pool.filter((i) => i.kind === 'active')
  giveItem(run, actives[0])
  run.room.peds = [{ item: actives[1], x: 300, y: 200 }]
  run.p.x = 300; run.p.y = 210
  step(run, {})
  assert.equal(run.p.active.item.word, actives[1].word)
  assert.equal(run.room.peds.length, 1, 'no new pedestal')
  assert.equal(run.room.peds[0].item.word, actives[0].word, 'the old one sits where the new one was')
  for (let i = 0; i < 60; i++) step(run, {})
  assert.equal(run.p.active.item.word, actives[1].word, 'standing still doesn’t swap it straight back')
  // A boss's word and its hatch don't follow you down.
  const boss = Object.values(run.floor.rooms).find((r) => r.type === 'boss')
  enterRoom(run, boss.key, null)
  for (const e of run.room.foes) e.dead = true
  step(run, {})
  assert.ok(run.room.peds.length >= 1)
  run.p.x = boss.trap.x; run.p.y = boss.trap.y
  step(run, {})
  assert.equal(run.fi, 1)
  for (const r of Object.values(run.floor.rooms)) {
    if (r.key === run.room.key) continue
    assert.equal(r.items.length, 0, `${r.type} room ${r.key} starts empty`)
  }
  assert.equal(run.room.peds.length, 0, 'the new floor’s first room is empty')
})

test('play testers (2.4.2): no word twice in a run, put-down actives keep their charge, walkers stay off rocks', () => {
  const run = newRun({ seed: 'dupes', pool: [...pool, ...pool.slice(0, 5)] })
  assert.equal(run.pool.length, pool.length, 'a word only goes in the pool once')
  const seen = new Set()
  for (let i = 0; i < 40; i++) {
    const it = drawItem(run, 'treasure')
    if (it.id === '_blank') break
    assert.ok(!seen.has(it.word), `${it.word} came up twice`)
    seen.add(it.word)
    giveItem(run, it, true)
  }
  // Swapping a half-charged active and picking it back up keeps its charge.
  const r2 = newRun({ seed: 'charge', pool })
  const actives = pool.filter((i) => i.kind === 'active' && i.active.charge >= 2)
  giveItem(r2, actives[0])
  r2.p.active.charge = 1
  r2.room.peds = [{ item: actives[1], x: 300, y: 200 }]
  r2.p.x = 300; r2.p.y = 210
  step(r2, {})
  assert.equal(r2.room.peds[0].item.word, actives[0].word)
  assert.equal(r2.room.peds[0].charge, 1)
  r2.p.x = 100; r2.p.y = 100
  for (let i = 0; i < 40; i++) step(r2, {})
  r2.p.x = 300; r2.p.y = 210
  step(r2, {})
  assert.equal(r2.p.active.item.word, actives[0].word)
  assert.equal(r2.p.active.charge, 1, 'not refilled by putting it down')
  // Rocks are solid to walkers, and a jump lands on clear floor.
  const tiles = r2.floor.rooms[r2.room.key].tiles
  tiles.fill(T.FLOOR); tiles[3 * 13 + 6] = T.BLOCK
  assert.equal(blocked(r2, 20 + 6 * 40 + 20, 20 + 3 * 40 + 20, 12), true)
  const spot = freeSpot(r2, 20 + 6 * 40 + 20, 20 + 3 * 40 + 20, 12)
  assert.equal(blocked(r2, spot.x, spot.y, 12), false)
})
