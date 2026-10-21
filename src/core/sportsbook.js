// The prediction market on this computer: contracts on who wins each game in
// the Wird leagues (src/shared/sports.js). A contract pays PAYOUT coins if its
// team wins (half if a football game ends tied), and nothing if not. The
// house quotes the model's win chance with a small spread either side, buys
// back at any time before the final whistle, and pays out at the end.
//
// Bets are kept in the economy (s.sports) so they save with the coins. The
// casino's rules apply: no betting while bankrupt, and a clock that goes
// backwards can't bet (the games are known in advance; that's how every copy
// agrees on them).

import { LEAGUES, game, gameById, stateAt, outcomes, clockAt, slate, team, gameStart, gameColors } from '../shared/sports.js'

export const PAYOUT = 100
export const PM_SPREAD = 0.02 // two points either side of the fair chance
const clampPrice = (x) => Math.min(99, Math.max(1, x))

// The sides you can back: soccer and fights have the draw too.
export const sidesOf = (g) => (!g.event && (g.league === 'pitch' || g.fight) ? ['home', 'draw', 'away'] : ['home', 'away'])

export function quotes (g, t) {
  const st = stateAt(g, t)
  const o = outcomes(g, t, st)
  const q = (chance) => ({ chance, ask: clampPrice(Math.ceil((chance + PM_SPREAD) * PAYOUT)), bid: clampPrice(Math.floor((chance - PM_SPREAD) * PAYOUT)) })
  const out = { st, p: o.home, o, open: st.status !== 'final' }
  for (const side of sidesOf(g)) out[side] = q(o[side])
  return out
}
const blankBet = () => ({ home: 0, away: 0, draw: 0, cost: 0, homeCost: 0, awayCost: 0, drawCost: 0 })

// A fight's numbers so far: landed and thrown, knockdowns, takedowns,
// submission tries, and each round on the judges' cards.
// The cards are read out only at the end.
function fightView (plays, final) {
  const st = plays.length ? plays[plays.length - 1].snap : null
  if (!st) return null
  if (!final) return { stats: st.stats, rounds: null }
  const rounds = st.cards[0].map((_, i) => {
    const marks = st.cards.map((c) => c[i])
    const h = marks.filter(([a, b]) => a > b).length
    const a = marks.filter(([x, y]) => y > x).length
    return { round: i + 1, team: h >= 2 ? 'home' : a >= 2 ? 'away' : null, cards: marks.map(([x, y]) => `${x}–${y}`).join(', ') }
  })
  return { stats: st.stats, rounds }
}

export class Sportsbook {
  constructor ({ economy, now }) {
    this.economy = economy
    this.now = now
    economy.s.sports = { bets: {}, history: [], net: 0, count: 0, won: 0, lost: 0, best: 0, ...(economy.s.sports || {}) }
  }

  get s () { return this.economy.s.sports }

  _commit () { const e = this.economy; e.dirty = true; e.save(true); e.emit('changed'); e.emit('played', 'bet') }

  // The latest moment this computer has shown the games at. Results are
  // known ahead of time, so a clock wound back past it can't bet.
  _seen (t) {
    if (t < (this.s.seenAt || 0) - 1000) throw new Error('Your computer’s clock is behind the last game you saw. Fix the clock to bet.')
    if (t > (this.s.seenAt || 0)) { this.s.seenAt = t; this.economy.dirty = true }
  }

  // Pay out games that have finished.
  sync (t = this.now()) {
    if (t > (this.s.seenAt || 0)) { this.s.seenAt = t; this.economy.dirty = true }
    let changed = false
    for (const [id, b] of Object.entries(this.s.bets)) {
      const g = gameById(id)
      if (!g) {
        // A bet from before the schedule changed: that game has moved, so
        // the bet comes back at what it cost.
        delete this.s.bets[id]
        this.economy.s.coins += b.cost || 0
        this.economy.note('got', 'sports', b.cost || 0)
        this.s.history = [{ id, at: t, home: '', away: '', score: { home: 0, away: 0 }, cost: b.cost || 0, pay: b.cost || 0, gain: 0, how: 'refunded' }, ...this.s.history].slice(0, 40)
        changed = true
        continue
      }
      if (t < g.end) continue
      const tie = !g.event && g.final.home === g.final.away
      // A fight is won however it ends (a knockout can come behind on rounds).
      const winner = g.winner || (tie ? 'draw' : g.final.home > g.final.away ? 'home' : 'away')
      // A football tie pays half on both teams; soccer and fights have a draw to back.
      const per = (side) => (g.league !== 'pitch' && !g.fight && tie ? PAYOUT / 2 : side === winner ? PAYOUT : 0)
      const pay = Math.floor(((b.home || 0) * per('home') + (b.away || 0) * per('away') + (b.draw || 0) * per('draw')) * 100) / 100
      delete this.s.bets[id]
      this.economy.s.coins += pay
      this.economy.note('got', 'sports', pay)
      const gain = pay - b.cost
      this.s.net += gain
      if (gain > 0) this.s.won++; else if (gain < 0) this.s.lost++
      this.s.best = Math.max(this.s.best, gain)
      this.s.history = [{ id, at: g.end, home: g.event ? g.sideNames.home : g.home, away: g.event ? g.sideNames.away : g.away, title: g.question || null, result: g.event ? g.sideNames[g.winner] : null, score: g.final || { home: 0, away: 0 }, method: g.method || null, cost: b.cost, pay, gain, how: 'settled' }, ...this.s.history].slice(0, 40)
      changed = true
    }
    if (changed) { this.economy.dirty = true; this.economy.save(true); this.economy.emit('changed') }
    return changed
  }

  _game (id) {
    const g = gameById(id)
    if (!g) throw new Error('No such game.')
    return g
  }

  // Buy contracts on a side, spending `coins`.
  buy (id, side, coins) {
    const e = this.economy
    e.tick()
    e._casinoOpen()
    this.sync()
    const g = this._game(id)
    if (!sidesOf(g).includes(side)) throw new Error('Pick a side.')
    const t = this.now()
    const q = quotes(g, t)
    if (!q.open) throw new Error('That game is over.')
    if (g.event ? t < g.start : t < gameStart(g.league, g.n) - 6 * LEAGUES[g.league].every) throw new Error(g.event ? 'That question isn’t open yet.' : 'That game isn’t open for betting yet.')
    coins = Math.floor(Number(coins) * 100) / 100
    if (!(coins >= 1)) throw new Error('Bet at least 1 coin.')
    if (coins > e.s.coins + 1e-9) throw new Error('You don’t have that many coins.')
    e._tradeClock()
    this._seen(t)
    const price = q[side].ask
    const shares = Math.floor((coins / price) * 1e6) / 1e6
    e.s.coins -= coins
    e.note('spent', 'sports', coins)
    const b = { ...blankBet(), ...(this.s.bets[id] || {}) }
    b[side] += shares
    b[`${side}Cost`] += coins
    b.cost += coins
    this.s.bets[id] = b
    this.s.count++
    this._commit()
    return { id, side, shares, price, coins, bet: { ...b } }
  }

  // Sell contracts back at the house's bid.
  sell (id, side, shares = 'all') {
    const e = this.economy
    e.tick()
    this.sync()
    const g = this._game(id)
    const b = this.s.bets[id]
    if (!b || !(b[side] > 0)) throw new Error('You don’t hold that.')
    const q = quotes(g, this.now())
    if (!q.open) throw new Error('That game is over.')
    e._tradeClock()
    this._seen(this.now())
    const n = shares === 'all' ? b[side] : Math.min(b[side], Math.floor(Number(shares) * 1e6) / 1e6)
    if (!(n > 0)) throw new Error('Sell at least a little.')
    const pay = Math.floor(n * q[side].bid * 100) / 100
    const costShare = b[`${side}Cost`] * (n / b[side])
    b[side] -= n
    b[`${side}Cost`] -= costShare
    b.cost -= costShare
    e.s.coins += pay
    e.note('got', 'sports', pay)
    const gain = pay - costShare
    this.s.net += gain
    this.s.best = Math.max(this.s.best, gain)
    if (b.home < 1e-6 && b.away < 1e-6 && !(b.draw > 1e-6)) delete this.s.bets[id]
    this.s.history = [{ id, at: this.now(), home: g.event ? g.sideNames.home : g.home, away: g.event ? g.sideNames.away : g.away, title: g.question || null, side, cost: costShare, pay, gain, how: 'sold' }, ...this.s.history].slice(0, 40)
    this._commit()
    return { pay, gain }
  }

  // A game as a card: teams, score, clock, chance, prices, your bet.
  _card (g, t, full = false) {
    if (g.event) return this._eventCard(g, t, full)
    const q = quotes(g, t)
    const H = team(g.league, g.home)
    const A = team(g.league, g.away)
    const b = this.s.bets[g.id] ? { ...blankBet(), ...this.s.bets[g.id] } : null
    const sides = sidesOf(g)
    const worth = b && q.open ? sides.reduce((a, side) => a + b[side] * q[side].bid, 0) : 0
    const last = q.st.last
    const card = {
      id: g.id,
      league: g.league,
      sport: LEAGUES[g.league].sport,
      start: g.start,
      end: t >= g.end ? g.end : null,
      status: q.st.status,
      home: { code: H.code, city: H.city, name: H.name, nickname: H.nickname, score: q.st.home, color: gameColors(H, A).home },
      away: { code: A.code, city: A.city, name: A.name, nickname: A.nickname, score: q.st.away, color: gameColors(H, A).away },
      fighters: Boolean(g.fight),
      method: g.fight && q.st.status === 'final' ? g.method : null,
      winner: g.fight && q.st.status === 'final' ? g.winner : null,
      q: q.st.q,
      clock: q.st.clock,
      periods: g.periods,
      last: q.st.last ? { text: q.st.last.text, team: q.st.last.team, kind: q.st.last.kind } : null,
      ball: q.st.status !== 'live' || !last?.pos
        ? null
        : g.league === 'gridiron'
          ? { side: last.pos, yl: last.yl, down: last.down, togo: last.togo }
          : g.league === 'pitch' && last.x !== undefined ? { side: last.pos, x: last.x } : null,
      clockInfo: clockAt(g, q.st),
      added: g.league === 'pitch' ? (q.st.plays.slice().reverse().find((p) => p.kind === 'added' && p.q === q.st.q)?.added || null) : null,
      chance: q.p,
      chances: q.o,
      sides,
      quotes: Object.fromEntries(sides.map((side) => [side, q[side]])),
      open: q.open && t >= g.start - 6 * LEAGUES[g.league].every,
      bet: b ? { ...b, worth } : null
    }
    if (!full) return card
    // Everything so far: plays (newest first), the chance after each, a box score.
    const plays = q.st.plays
    // The chance of each team winning over the game (soccer's draw is the gap).
    const point = (at) => { const o = outcomes(g, at); return [at, o.home, o.away] }
    const chart = [point(g.start - 1)]
    // Who's scored, by what kind of score. A passing touchdown counts for
    // the passer and the receiver both.
    const box = { home: {}, away: {} }
    const tally = (side, who, key, n = 1) => { const row = box[side][who] || (box[side][who] = {}); row[key] = (row[key] || 0) + n }
    for (const p of plays) {
      if (!p.team) continue
      if (p.kind === 'safety') tally(p.team === 'home' ? 'away' : 'home', 'Defense', 'safety')
      else if (p.kind === 'td-pass') { tally(p.team, p.who, 'rec'); if (p.passer) tally(p.team, p.passer, 'pass') } else if (p.kind === 'td-rush') tally(p.team, p.who, 'rush')
      else if (p.kind === 'fg') tally(p.team, p.who, 'fg')
      else if (p.kind === 'xp' && p.pts) tally(p.team, p.who, 'xp')
      else if (p.kind === 'goal') { tally(p.team, p.who, 'goal'); if (p.assist) tally(p.team, p.assist, 'assist') } else if (p.pts && p.who) tally(p.team, p.who, 'pts', p.pts)
    }
    const order = (rows) => Object.entries(rows).map(([who, r]) => ({ who, ...r })).sort((a, b) => score(b) - score(a))
    const score = (r) => (r.pts || 0) + 6 * ((r.rec || 0) + (r.rush || 0) + (r.pass || 0)) + 3 * (r.fg || 0) + (r.xp || 0) + 2 * (r.safety || 0) + 10 * (r.goal || 0) + (r.assist || 0)
    // Fight chances come from playing the rest of the fight many times, so
    // their chart takes fewer points.
    const step = Math.max(1, Math.floor(plays.length / (g.fight ? 30 : 160)))
    for (let i = 0; i < plays.length; i += step) chart.push(point(plays[i].at))
    if (plays.length) chart.push([plays[plays.length - 1].at, q.o.home, q.o.away])
    return {
      ...card,
      plays: plays.slice(-120).reverse().map((p) => ({ at: p.at, q: p.q, clock: p.clock, team: p.team, text: p.text, pts: p.pts, kind: p.kind, home: p.home, away: p.away })),
      chart,
      box: { home: order(box.home), away: order(box.away) },
      rosters: g.fight ? null : { home: H.players.map((p) => `${p.name} (${p.pos})`), away: A.players.map((p) => `${p.name} (${p.pos})`) },
      fight: g.fight ? fightView(plays, q.st.status === 'final') : null,
      strength: { home: H.strength, away: A.strength },
      startChances: outcomes(g, g.start - 1)
    }
  }

  // A politics or pop culture question: the chance, when it closes, and how
  // it came out.
  _eventCard (g, t, full = false) {
    const q = quotes(g, t)
    const b = this.s.bets[g.id] ? { ...blankBet(), ...this.s.bets[g.id] } : null
    const sides = ['home', 'away']
    const card = {
      id: g.id,
      league: g.league,
      sport: LEAGUES[g.league].sport,
      event: true,
      question: g.question,
      tag: g.tag,
      yesNo: g.yesNo,
      sideNames: g.sideNames,
      start: g.start,
      end: g.end,
      status: q.st.status,
      winner: q.st.status === 'final' ? g.winner : null,
      chance: q.p,
      chances: q.o,
      sides,
      quotes: Object.fromEntries(sides.map((side) => [side, q[side]])),
      open: q.open && t >= g.start,
      bet: b ? { ...b, worth: q.open ? sides.reduce((a, side) => a + b[side] * q[side].bid, 0) : 0 } : null
    }
    if (!full) return card
    const upto = Math.min(t, g.end)
    const chart = []
    const every = Math.max(1, Math.floor(g.steps / 160))
    for (let k = 0; k <= g.steps && g.start + k * 300000 <= upto; k += every) { const at = g.start + k * 300000; const o = outcomes(g, at); chart.push([at, o.home, o.away]) }
    if (t >= g.start) chart.push([upto, q.o.home, q.o.away])
    return { ...card, chart, startChances: outcomes(g, g.start) }
  }

  board (league) {
    if (!LEAGUES[league]) throw new Error('No such league.')
    this.sync()
    const t = this.now()
    const sl = slate(league, t)
    const mine = Object.keys(this.s.bets).filter((id) => id.startsWith(`${league}-`) && gameById(id))
    return {
      league: { id: league, name: LEAGUES[league].name, short: LEAGUES[league].short, emoji: LEAGUES[league].emoji, sport: LEAGUES[league].sport, every: LEAGUES[league].every, event: Boolean(LEAGUES[league].dur) },
      at: t,
      live: sl.live.map((n) => this._card(game(league, n), t)),
      upcoming: sl.upcoming.map((n) => this._card(game(league, n), t)),
      recent: sl.recent.map((n) => this._card(game(league, n), t)),
      mine: mine.map((id) => this._card(gameById(id), t)),
      stats: { net: this.s.net, count: this.s.count, won: this.s.won, lost: this.s.lost, best: this.s.best },
      history: this.s.history.filter((h) => h.id.startsWith(`${league}-`)).slice(0, 12),
      payout: PAYOUT
    }
  }

  view (id) { this.sync(); return this._card(this._game(id), this.now(), true) }

  // What the open bets would sell for now.
  value (t = this.now()) {
    let v = 0
    for (const [id, b] of Object.entries(this.s.bets)) {
      const g = gameById(id)
      if (!g) continue
      const q = quotes(g, t)
      if (q.open) for (const side of sidesOf(g)) v += (b[side] || 0) * q[side].bid
    }
    return v
  }
}
