// Live Leximon duels: two players, a team of up to three each, a turn at a
// time. Each turn both players choose at once, an attack for the Leximon
// they have out or a switch to another, and then the turn plays out.
//
// Nothing here is balanced, on purpose: a Leximon's strength is its power
// (src/shared/leximon.js), which comes from its tier and level, so a team
// that's been trained hard hits harder, coins and all. A level-scaled duel
// is an option: every Leximon fights as if it were tier I, level 25, so
// only rarity, stance and the choices made count.
//
// Every Leximon has 100 HP and four moves:
//   Strike    no type, 35 power, never misses
//   its own   its stance's type, 50 power, 90% accurate
//   another   the next stance's type, 45 power, 85% accurate
//   Brace     goes first; halves the damage it takes this turn (not twice in a row)
// A move's type against the target's stance: Charm beats Spite, Spite beats
// Guard, Guard beats Charm (×1.25 one way, ×0.8 the other). Damage scales
// with attack against defence: both are 1 + log10(power). The faster side
// (the higher attack) moves first. When a Leximon faints, its player sends
// out another before the next turn; a player with none left loses.
//
// The randomness comes from a seed both players put into, so the duel plays
// out the same on both computers.

import { power, stanceEdge, seededRandom, STANCES, cleanTeam } from './leximon.js'
import { hash32 } from './market.js'

export const MAX_HP = 100
export const DUEL_TURN_SECS = 45 // a turn not chosen in time is a Strike (or the first Leximon left)

const NAMES = {
  charm: ['Sweet Talk', 'Heartstring', 'Adoration', 'Swoon', 'Love Letter'],
  spite: ['Cutting Remark', 'Sneer', 'Eye Roll', 'Scathing Review', 'Backhanded Compliment'],
  guard: ['Stonewall', 'Deflect', 'Hold Firm', 'Rebuttal', 'Fine Print']
}
const nextStance = (s) => STANCES[(STANCES.findIndex((x) => x.id === s) + 1) % STANCES.length].id

// The four moves of a Leximon (the names come from its word).
export function movesFor (card) {
  const own = card.stance || 'guard'
  const other = nextStance(own)
  const pick = (type, salt) => NAMES[type][hash32(`${card.word}|${salt}`) % NAMES[type].length]
  return [
    { id: 'strike', name: 'Strike', type: null, power: 35, acc: 1 },
    { id: 'own', name: pick(own, 'own'), type: own, power: 50, acc: 0.9 },
    { id: 'other', name: pick(other, 'other'), type: other, power: 45, acc: 0.85 },
    { id: 'brace', name: 'Brace', type: null, power: 0, acc: 1, brace: true }
  ]
}

// A fighter's attack (and defence) stat.
export function fightStat (card, scaled = false) {
  const c = scaled ? { ...card, tier: 1, level: 25 } : card
  return 1 + Math.log10(power(c))
}

// A new duel. teams: { a: [...cards], b: [...cards] }.
export function newDuel (teams, { scaled = false } = {}) {
  const side = (team) => ({
    team: cleanTeam(team).map((c) => ({ ...c, hp: MAX_HP, stat: Math.round(fightStat(c, scaled) * 1000) / 1000, moves: movesFor(c) })),
    active: 0,
    braced: false,
    lastBrace: false
  })
  return { sides: { a: side(teams.a), b: side(teams.b) }, scaled: Boolean(scaled), turn: 0, need: 'move', over: false, winner: null }
}

const foeOf = (s) => (s === 'a' ? 'b' : 'a')
export const alive = (side) => side.team.map((c, i) => (c.hp > 0 ? i : -1)).filter((i) => i >= 0)
export const activeCard = (st, s) => st.sides[s].team[st.sides[s].active]

// Is this a choice that player can make right now?
export function validAction (st, s, action) {
  if (st.over || !action || typeof action !== 'object') return false
  const side = st.sides[s]
  if (action.kind === 'switch') {
    const to = Number(action.to)
    return Number.isInteger(to) && to !== side.active && side.team[to]?.hp > 0 && (st.need === 'move' || mustReplace(st, s))
  }
  if (action.kind === 'move') {
    if (st.need !== 'move') return false
    const i = Number(action.i)
    return Number.isInteger(i) && i >= 0 && i < 4 && activeCard(st, s).hp > 0
  }
  return false
}

// Who has to choose before the duel can go on.
export const mustReplace = (st, s) => st.need === 'replace' && activeCard(st, s).hp <= 0 && alive(st.sides[s]).length > 0
export const choosers = (st) => (st.over ? [] : st.need === 'move' ? ['a', 'b'] : ['a', 'b'].filter((s) => mustReplace(st, s)))

// What a player who didn't choose in time does.
export function defaultAction (st, s) {
  if (st.need === 'replace') return { kind: 'switch', to: alive(st.sides[s])[0] }
  return { kind: 'move', i: 0 }
}

// Plays a turn (or the replacements after a faint). Returns the events, for
// showing it; st is changed in place.
export function playTurn (st, actions, seed) {
  const rand = seededRandom(hash32(`${seed}|${st.turn}|${st.need}`))
  const events = []
  st.turn++
  if (st.need === 'replace') {
    for (const s of ['a', 'b']) {
      const act = actions[s]
      if (!mustReplace(st, s) || act?.kind !== 'switch') continue
      st.sides[s].active = act.to
      events.push({ t: 'switch', side: s, to: act.to, word: activeCard(st, s).word })
    }
    st.need = 'move'
    return events
  }
  // Switches first, then braces, then attacks by speed.
  for (const s of ['a', 'b']) {
    const side = st.sides[s]
    side.braced = false
    if (actions[s]?.kind === 'switch') {
      side.active = actions[s].to
      side.lastBrace = false
      events.push({ t: 'switch', side: s, to: actions[s].to, word: activeCard(st, s).word })
    }
  }
  const attackers = ['a', 'b'].filter((s) => actions[s]?.kind === 'move')
  for (const s of attackers) {
    const card = activeCard(st, s)
    const m = card.moves[actions[s].i]
    if (!m.brace) continue
    const side = st.sides[s]
    if (side.lastBrace) { events.push({ t: 'brace', side: s, word: card.word, failed: true }); side.lastBrace = false; continue }
    side.braced = true
    side.lastBrace = true
    events.push({ t: 'brace', side: s, word: card.word })
  }
  const order = attackers.filter((s) => !activeCard(st, s).moves[actions[s].i].brace)
    .map((s) => ({ s, speed: activeCard(st, s).stat, tie: rand() }))
    .sort((x, y) => y.speed - x.speed || y.tie - x.tie)
  for (const { s } of order) {
    const me = activeCard(st, s)
    if (me.hp <= 0) continue // fainted before it could move
    st.sides[s].lastBrace = false
    const f = foeOf(s)
    const them = activeCard(st, f)
    if (them.hp <= 0) continue
    const m = me.moves[actions[s].i]
    if (rand() > m.acc) { events.push({ t: 'miss', side: s, word: me.word, move: m.name, type: m.type }); continue }
    const edge = m.type ? stanceEdge(m.type, them.stance) : 1
    const crit = rand() < 0.07
    const roll = 0.85 + 0.15 * rand()
    let dmg = m.power * (me.stat / Math.max(0.5, them.stat)) * edge * roll * (crit ? 1.5 : 1) * (st.sides[f].braced ? 0.5 : 1)
    dmg = Math.max(1, Math.round(dmg))
    them.hp = Math.max(0, them.hp - dmg)
    events.push({ t: 'attack', side: s, word: me.word, move: m.name, type: m.type, dmg, hp: them.hp, edge, crit, braced: st.sides[f].braced })
    if (them.hp <= 0) events.push({ t: 'faint', side: f, word: them.word })
  }
  // Out of Leximon: the duel's over.
  const out = ['a', 'b'].filter((s) => !alive(st.sides[s]).length)
  if (out.length) {
    st.over = true
    st.winner = out.length === 2 ? null : foeOf(out[0])
    events.push({ t: 'end', winner: st.winner })
  } else if (['a', 'b'].some((s) => activeCard(st, s).hp <= 0)) st.need = 'replace'
  return events
}

// One side giving up (or leaving).
export function forfeit (st, s) {
  if (st.over) return []
  st.over = true
  st.winner = foeOf(s)
  return [{ t: 'forfeit', side: s }, { t: 'end', winner: st.winner }]
}
