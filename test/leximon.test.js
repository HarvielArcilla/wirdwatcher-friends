import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import { rarityFor, duel, power, levelCap, xpToNext, TRAIN_MAX_HOURS, RATING_XP, cleanTeam } from '../src/shared/leximon.js'
import { newDuel, playTurn, movesFor, validAction, choosers } from '../src/shared/duel.js'
import { effects } from '../src/shared/economy.js'
import { tmp, network, until } from './helpers.js'

test('rarity is by rank among your own ratings, both ends equally rare', () => {
  const spread = Array.from({ length: 100 }, (_, i) => i / 20) // 0.0 to 4.95
  assert.deepEqual(rarityFor(4.95, spread), { tier: 4, side: 'love', pct: 0.995 })
  assert.equal(rarityFor(0, spread).tier, 4)
  assert.equal(rarityFor(0, spread).side, 'hate')
  assert.equal(rarityFor(2.5, spread).tier, 0)
  // Rating everything 5.0 makes nothing special.
  const generous = new Array(100).fill(5)
  assert.equal(rarityFor(5, generous).tier, 0)
  // A generous rater and a harsh one get the same spread.
  const high = spread.map((x) => 3 + x / 2.5)
  assert.equal(rarityFor(high[99], high).tier, rarityFor(spread[99], spread).tier)
  // Too few ratings to tell: everything's common.
  assert.equal(rarityFor(5, [5, 0, 2]).tier, 0)
})

test('power is about level and tier, never the word', () => {
  const a = { word: 'the', level: 10, tier: 1, rarity: { tier: 0 } }
  const b = { word: 'serendipity', level: 10, tier: 1, rarity: { tier: 0 } }
  assert.equal(power(a), power(b))
  assert.ok(power({ ...a, tier: 2 }) === power(a) * 2)
  assert.ok(power({ ...a, level: 400, tier: 16 }) > 1e18, 'it scales like the shop')
})

function app (t0 = Date.UTC(2026, 9, 20, 12)) {
  const clock = { t: t0 }
  const a = new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false }, now: () => new Date(clock.t) })
  a.clock = clock
  return a
}

test('wild words appear every few new ratings, are caught, and the team grows by rating', () => {
  const a = app()
  // Rate enough words for rarity to mean something.
  const words = a.words.sorted.filter((w) => /^[a-z]{4,8}$/.test(w)).slice(500, 560)
  let encounter = null
  for (const [i, w] of words.entries()) {
    a.clock.t += 5000
    const res = a.rate(w, (i % 11) / 2)
    if (res.leximon?.encounter && !encounter) encounter = res.leximon.encounter
    if (encounter && !a.leximon.s.encounter) break
    if (encounter) break
  }
  assert.ok(encounter, 'a wild word showed up')
  assert.ok(a.store.rating(encounter.word) !== null, 'it’s one you rated')
  const card = a.leximon.catch()
  assert.equal(card.word, encounter.word)
  assert.deepEqual(a.leximon.view().team.map((c) => c.word), [card.word], 'the first catches join the team')
  // Ratings teach it, whatever the score.
  const before = card.xpTotal
  a.clock.t += 5000
  a.rate('zebra', 0)
  assert.equal(a.leximon.s.cards[card.word].xpTotal, before + RATING_XP)
  // Re-rating an old word teaches nothing.
  a.rate('zebra', 5)
  assert.equal(a.leximon.s.cards[card.word].xpTotal, before + RATING_XP)
  // The team helps the wirdhouse a little.
  assert.ok(effects(a.economy.s).leximon > 0)
})

test('coins help only a little: training is capped per day, and tiers gate levels', () => {
  const a = app()
  a.rate('gravy', 4)
  a.leximon.s.encounter = { word: 'gravy', rarity: { tier: 0, side: null, pct: 0.5 }, at: a.clock.t }
  const c = a.leximon.catch()
  a.economy.devAddCoins(1e12)
  a.leximon.train('gravy', TRAIN_MAX_HOURS)
  assert.throws(() => a.leximon.train('gravy', 1), /Already training/)
  a.clock.t += TRAIN_MAX_HOURS * 3600e3
  a.leximon.view()
  assert.ok(c.xpTotal >= 200 && c.xpTotal <= 220, `a full day of training ≈ 20 ratings (${c.xpTotal} XP)`)
  assert.throws(() => a.leximon.train('gravy', 1), /trained all it can today/, 'however many coins you have')
  // The next UTC day it can train again.
  a.clock.t += 24 * 3600e3
  a.leximon.train('gravy', 1)
  // Level cap at a tier: XP banks until it ascends.
  for (let i = 0; i < 400; i++) a.leximon._gain(c, 50)
  assert.equal(c.level, levelCap(1))
  assert.ok(c.xp > xpToNext(c.level), 'banked')
  a.leximon.ascend('gravy')
  assert.equal(c.tier, 2)
  assert.ok(c.level > levelCap(1), 'the banked XP becomes levels')
})

test('duels are the same wherever they’re worked out', () => {
  const mine = cleanTeam([{ word: 'hope', level: 20, tier: 1, rarity: { tier: 4, side: 'love' }, stance: 'charm' }, { word: 'tax', level: 5, tier: 1, rarity: { tier: 4, side: 'hate' }, stance: 'spite' }])
  const theirs = cleanTeam([{ word: 'cat', level: 18, tier: 1, rarity: { tier: 1, side: 'love' }, stance: 'spite' }, { word: 'dog', level: 40, tier: 2, rarity: { tier: 0 }, stance: 'guard' }, { word: 'eel', level: 3, tier: 1, rarity: { tier: 0 }, stance: 'charm' }])
  const one = duel(mine, theirs, 12345)
  assert.deepEqual(one, duel(mine, theirs, 12345))
  assert.equal(one.bouts.length, 3)
  assert.equal(one.bouts[2].a, null, 'an empty slot loses its bout')
  // A friend can't send a monster: levels are held to the tier.
  assert.equal(cleanTeam([{ word: 'x', level: 1e9, tier: 1 }])[0].level, levelCap(1))
})

test('duel a friend’s team from their profile', async (t) => {
  const { make } = await network(t)
  const a = await make()
  const b = await make()
  b.setProfile({ name: 'Pip' })
  for (const x of [a, b]) {
    x.rate('gravy', 4)
    x.leximon.s.encounter = { word: 'gravy', rarity: { tier: 0, side: null, pct: 0.5 }, at: 0 }
    x.leximon.catch()
    x.game._refreshProfile()
  }
  const { code } = await a.friends.makeCode()
  await b.friends.redeem(code)
  await until(() => a.game.friendProfile(b.identity.userId)?.leximon?.team?.length === 1)
  const prof = a.game.friendProfile(b.identity.userId)
  assert.equal(prof.leximon.team[0].word, 'gravy')
  const res = a.duelFriend(b.identity.userId)
  assert.equal(res.bouts.length, 1)
  assert.equal(a.leximon.s.duels.history[0].vs, b.identity.userId)
  for (let i = 1; i < 5; i++) a.duelFriend(b.identity.userId)
  assert.throws(() => a.duelFriend(b.identity.userId), /duels today/)
})

test('battles act out the duel faithfully, the same every time', async () => {
  const { battleScript } = await import('../src/shared/battle.js')
  const st = ['charm', 'spite', 'guard']
  for (let s = 0; s < 400; s++) {
    const mk = (w, lv, t, k) => ({ word: w, level: lv, tier: t, rarity: { tier: s % 5, side: s % 2 ? 'love' : 'hate' }, stance: st[k % 3] })
    const mine = cleanTeam([mk(`a${s}`, 1 + (s * 7) % 25, 1, s), mk('b', 10, 1, s + 1), mk('c', 30, 2, s + 2)])
    const theirs = cleanTeam([mk('x', 20, 1, s + 2), mk(`y${s}`, 1 + (s * 13) % 25, 1, s), mk('z', 5, 1, 2)].slice(0, 1 + (s % 3)))
    const res = duel(mine, theirs, s * 977)
    const beats = battleScript(res, 'Pip')
    for (const b of beats) if (b.t === 'attack') for (const v of Object.values(b.hp)) assert.ok(v >= 0 && v <= 100)
    const faints = beats.filter((b) => b.t === 'faint')
    res.bouts.filter((b) => b.a && b.b).forEach((b, k) => assert.equal(faints[k].side, b.win ? 'foe' : 'me', 'the bout’s loser is the one who faints'))
    assert.deepEqual(battleScript(res, 'Pip'), beats)
  }
})

test('words rated at a lobby table bring wild Leximon too, and they stay a few words', () => {
  const a = app()
  const words = a.words.sorted.filter((w) => /^[a-z]{4,8}$/.test(w)).slice(700, 800)
  let enc = null
  let i = 0
  for (; i < words.length && !enc; i++) {
    a.clock.t += 5000
    enc = a.rate(words[i], (i % 11) / 2, { source: 'lobby' }).leximon?.encounter
  }
  assert.ok(enc, 'a wild word showed up from a table rating')
  assert.equal(enc.stay, 4)
  for (let k = 0; k < 3; k++) { a.clock.t += 5000; a.rate(words[i + k], 3, { source: 'lobby' }) }
  assert.equal(a.leximon.s.encounter?.word, enc.word, 'still there three words later')
  a.clock.t += 5000
  const res = a.rate(words[i + 3], 3, { source: 'lobby' })
  assert.equal(res.leximon.fled, enc.word, 'gone after the fourth')
})

test('live duel rules: moves, types, switching, fainting and winning', () => {
  const card = (word, level, stance, tier = 1) => ({ word, tier, level, rarity: { tier: 0, side: null }, stance })
  const st = newDuel({ a: [card('tea', 25, 'charm'), card('pie', 5, 'guard')], b: [card('ink', 1, 'spite')] })
  assert.equal(movesFor(st.sides.a.team[0]).length, 4)
  assert.equal(st.sides.a.team[0].moves[1].type, 'charm', 'its own move has its stance’s type')
  assert.ok(st.sides.a.team[0].stat > st.sides.b.team[0].stat, 'levels count')
  assert.equal(validAction(st, 'a', { kind: 'switch', to: 0 }), false, 'already out')
  assert.equal(validAction(st, 'a', { kind: 'move', i: 4 }), false)
  // Charm beats Spite: tea's own move is super effective against ink.
  let ev = []
  let guard = 0
  while (!st.over && guard++ < 20) ev = playTurn(st, { a: { kind: 'move', i: 1 }, b: { kind: 'move', i: 0 } }, 'seed')
  assert.ok(st.over)
  assert.equal(st.winner, 'a')
  assert.ok(ev.some((e) => e.t === 'end'))
  // The same choices and seed play out the same way.
  const run = () => { const s = newDuel({ a: [card('tea', 3, 'charm')], b: [card('ink', 3, 'spite')] }); const log = []; while (!s.over) log.push(...playTurn(s, { a: { kind: 'move', i: 2 }, b: { kind: 'move', i: 1 } }, 'x')); return log }
  assert.deepEqual(run(), run())
  // A level-scaled duel evens out levels and tiers.
  const sc = newDuel({ a: [card('tea', 25, 'charm', 3)], b: [card('ink', 1, 'charm')] }, { scaled: true })
  assert.equal(sc.sides.a.team[0].stat, sc.sides.b.team[0].stat)
  // After a faint, the player sends out another before the next turn.
  const f = newDuel({ a: [card('a', 1, 'guard'), card('b', 1, 'guard')], b: [card('z', 75, 'charm', 3)] })
  playTurn(f, { a: { kind: 'move', i: 0 }, b: { kind: 'move', i: 1 } }, 's')
  assert.equal(f.need, 'replace')
  assert.deepEqual(choosers(f), ['a'])
  assert.ok(validAction(f, 'a', { kind: 'switch', to: 1 }))
  playTurn(f, { a: { kind: 'switch', to: 1 } }, 's')
  assert.equal(f.sides.a.active, 1)
  assert.equal(f.need, 'move')
})

test('a live duel between two computers, turn by turn', async (t) => {
  const { make } = await network(t)
  const a = await make()
  const b = await make()
  b.setProfile({ name: 'Pip' })
  for (const [x, w] of [[a, 'gravy'], [b, 'mango']]) {
    x.rate(w, 4)
    x.leximon.s.encounter = { word: w, rarity: { tier: 0, side: null, pct: 0.5 }, at: 0 }
    x.leximon.catch()
  }
  const s = await a.hostDuel({ scaled: true })
  await b.joinDuel(s.code)
  await until(() => a.duelState?.phase === 'fighting' && b.duelState?.phase === 'fighting')
  assert.equal(b.duelState.you, 'b')
  assert.equal(a.duelState.players.b.name, 'Pip')
  assert.equal(a.duelState.scaled, true)
  let guard = 0
  while (a.duelState.phase === 'fighting' && guard++ < 60) {
    const turn = a.duelState.state.turn
    a.duelAction({ kind: 'move', i: 1 })
    await until(() => b.duelState.waiting.includes('b') || b.duelState.phase === 'over')
    if (b.duelState.phase === 'over') break
    b.duelAction({ kind: 'move', i: 2 })
    await until(() => a.duelState.state.turn > turn || a.duelState.phase === 'over')
  }
  await until(() => a.duelState?.phase === 'over' && b.duelState?.phase === 'over')
  const w = a.duelState.state.winner
  assert.ok(w === 'a' || w === 'b' || w === null)
  assert.deepEqual(a.duelState.state, b.duelState.state, 'both see the same duel')
  await until(() => a.leximon.s.duels.history.length === 1 && b.leximon.s.duels.history.length === 1)
  assert.equal(a.leximon.s.duels.history[0].live, true)
  if (w) assert.equal(a.leximon.s.duels.wins + b.leximon.s.duels.wins, 1)
})

test('leaving a live duel forfeits it', async (t) => {
  const { make } = await network(t)
  const a = await make()
  const b = await make()
  for (const [x, w] of [[a, 'gravy'], [b, 'mango']]) {
    x.rate(w, 4)
    x.leximon.s.encounter = { word: w, rarity: { tier: 0, side: null, pct: 0.5 }, at: 0 }
    x.leximon.catch()
  }
  const s = await a.hostDuel()
  await b.joinDuel(s.code)
  await until(() => a.duelState?.phase === 'fighting')
  await b.leaveDuel()
  await until(() => a.duelState?.phase === 'over')
  assert.equal(a.duelState.state.winner, 'a')
  await until(() => a.leximon.s.duels.wins === 1)
})
