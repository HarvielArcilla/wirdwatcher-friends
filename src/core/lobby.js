// Lobbies: up to 8 people play wirdwatcher around one table.
//
// Network shape: a star around the host, all of it peer-to-peer.
//   - The host makes a lobby code (10 characters). Its computer waits on a
//     meeting place derived from the code, under fresh keys made just for
//     this lobby (players never learn anyone's identity key unless it is
//     offered, see below).
//   - Players type the code and dial the host (on the internet or the same
//     Wi-Fi). Every message is sealed with a key derived from the code, so
//     only people with the code can take part.
//   - The host's computer runs the game. Each player is sent their own view
//     of it: anything secret (ratings before the reveal, guesses, a Hive mind
//     assignment, the word you were given to rate) goes only to the player it
//     belongs to, and everything comes out at the reveal.
//   - Players may include their identity key with a signature over this
//     connection, so friends at the table are shown as friends.
//
// Modes (options.style), each a little sequence of phases:
//   classic  rating → reveal
//            Everyone rates the same word; the reveal shows every rating, the
//            average, and who went highest and lowest. No points: it's for
//            talking about. Next word when everyone is ready.
//   highlow  rating → guessing → reveal
//            Rate, then (before anything is shown) guess who went highest and
//            who went lowest. 100 points for each right guess.
//   hotseat  picking → rating → reveal
//            Each word, one player is in the hot seat and the next player
//            picks the word for them from three. The seat rates it; everyone
//            else predicts the seat's rating. Up to 100 points for a close
//            prediction; the picker gets 50 for drawing a strong reaction
//            (4.5 and up, or 0.5 and below), and the seat gets 25 for each
//            prediction they beat by more than 1.0.
//   hive     choosing → rating → reveal
//            Everyone gets a secret target (say 3.7) and a rater (another
//            player), and finds a word they think that rater will rate near
//            the target. Then each rater rates the word chosen for them, not
//            knowing the target. Up to 100 points for landing close, plus 50
//            for within 0.1.
//   jury     (preparing) → testimony → voting → reveal          Grand Jury
//            Someone at the table is secretly the defendant: their own app
//            offers a few of their strongest past ratings, and the host picks
//            the one the rest of the table disagrees with most (their apps say
//            what they gave those words, if anything, and nothing is shown).
//            The charge is read out ("someone here once gave this 0.4").
//            Everyone testifies (a quick rating; bluffing allowed, nothing is
//            saved), then votes on who did it. Right votes are worth 100. If
//            the defendant isn't the clear top of the vote they walk free:
//            100, plus 25 for every vote that went elsewhere. Needs 3 players.
//   clues    (preparing) → clues → reveal
//            A hidden word, shown as blanks with what everyone at the table
//            rated it (words most of the table has rated come first). A clue
//            appears every few seconds: kind of word, first letter, the
//            definition, a synonym, more letters. Guess any time. A right
//            guess is worth 100, less 12 for every clue shown and 10 for
//            every wrong guess (never under 10); the first to get it gets 20
//            more. Chat can't give the word away.
//
// Only Classic, High or low, Hot seat and Hive mind save ratings: Grand
// Jury testimony is meant for bluffing, and Clues has nothing to rate.
//
// A rating made at the table also counts as that player's own rating of the
// word, so lobbies feed everyone's collection, XP and badges.

import { EventEmitter } from 'node:events'
import crypto from 'node:crypto'
import hcrypto from 'hypercore-crypto'
import { Mesh } from './mesh.js'
import { channel } from './channel.js'
import { codeKeys, newLobbyCode, parseLobbyCode, normalizeCode } from './crypto.js'
import { verify } from './identity.js'
import { roundVerdict } from '../shared/progress.js'
import { netlog, short } from './netlog.js'
import { cleanLook, ALL_REACTIONS } from '../shared/cosmetics.js'

// How long a player who lost their connection keeps their seat while their
// computer reconnects.
export const SEAT_GRACE_MS = 45000

const PROTOCOL = 3
export const LOBBY_STYLES = ['classic', 'highlow', 'hotseat', 'hive', 'jury', 'clues']
export const LOBBY_DEFAULTS = { rounds: 10, mode: 'everyday', timer: 0, style: 'classic' }
export const LOBBY_ROUNDS = [3, 5, 10, 15, 20]
export const LOBBY_TIMERS = [0, 15, 30, 60] // seconds per phase (finding a word gets three times as long); 0 = no timer
export const REACTIONS = ['😂', '😮', '🔥', '💀', '🤔', '❤️', '👏', '🙈']

// Grand Jury and Clues start each round in 'preparing' while the host asks
// the players' apps for what it needs; that isn't one of these steps.
const PHASES = { classic: ['rating'], highlow: ['rating', 'guessing'], hotseat: ['picking', 'rating'], hive: ['choosing', 'rating'], jury: ['testimony', 'voting'], clues: ['clues'] }
const ACTIVE = ['rating', 'guessing', 'picking', 'choosing', 'testimony', 'voting', 'clues']
export const JURY_MIN = 3
export const CLUE_SECS = 10 // between clues
export const CLUE_FINAL_SECS = 15 // after the last one
const REQUEST_MS = 5000 // how long the host waits on a player's app

// What the host asks players' apps for, and what's accepted back.
const cleanCases = (x, lookup) => (Array.isArray(x) ? x : []).slice(0, 8).filter((c) => c && typeof c.word === 'string' && validRating(c.r) && lookup(c.word)).map((c) => ({ word: c.word, r: round1(c.r) }))
const cleanSample = (x, lookup) => (Array.isArray(x) ? x : []).slice(0, 150).filter((c) => c && typeof c.word === 'string' && c.word.length < 60 && validRating(c.r)).map((c) => ({ word: c.word, r: round1(c.r) })).filter((c) => lookup(c.word))
const cleanLookup = (x, words) => { const out = {}; if (x && typeof x === 'object') for (const w of words) if (validRating(x[w])) out[w] = round1(x[w]); return out }

// For Clues: guesses and chat are compared on letters alone.
export const plain = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '')
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The clues for a word, in order, each with the blanks as they stand once
// it's shown. The first is just the blanks; some letters always stay hidden.
export function buildClues (word, info) {
  const chars = [...word]
  const idx = chars.map((ch, i) => (/[a-z]/i.test(ch) ? i : -1)).filter((i) => i >= 0)
  const stem = word.length > 4 ? word.slice(0, -1) : word
  const mask = (t) => String(t || '').replace(new RegExp(`\\b${escapeRe(stem)}\\w*`, 'gi'), '____')
  const fair = (t) => t && !plain(t).includes(plain(stem)) // nothing that still gives it away
  const shown = new Set()
  const hiddenLeft = () => idx.filter((i) => !shown.has(i))
  const keepHidden = Math.max(1, Math.ceil(idx.length / 3))
  const steps = [{ kind: 'start' }]
  const letter = (i) => {
    if (i === undefined || shown.has(i) || hiddenLeft().length <= keepHidden) return
    shown.add(i)
    steps.push({ kind: 'letter', at: i, text: chars[i].toUpperCase() })
  }
  const senses = info?.senses || []
  if (senses[0]?.posName) steps.push({ kind: 'pos', text: senses[0].posName })
  letter(idx[0])
  const def = senses.map((s) => mask(s.def)).find(fair)
  if (def) steps.push({ kind: 'def', text: def })
  const syn = (info?.synonyms || []).find((s) => !plain(s).includes(plain(stem)) && !plain(stem).includes(plain(s)) && s.length > 2)
  if (syn) steps.push({ kind: 'syn', text: syn })
  letter(idx[idx.length - 1])
  const ex = senses.flatMap((s) => s.ex || []).filter((e) => new RegExp(`\\b${escapeRe(stem)}`, 'i').test(e)).map(mask).find(fair)
  if (ex) steps.push({ kind: 'ex', text: ex })
  const def2 = senses.slice(1).map((s) => mask(s.def)).filter(fair).find((d) => d !== def)
  if (def2) steps.push({ kind: 'def', text: def2 })
  // Then letters from the middle out, until only a third are hidden.
  const mid = [...idx].sort((a, b) => Math.abs(a - idx[idx.length >> 1]) - Math.abs(b - idx[idx.length >> 1]))
  for (const i of mid) { if (steps.length >= 10) break; letter(i) }
  // The blanks as each clue leaves them.
  const open = new Set()
  return steps.map((s) => {
    if (s.kind === 'letter') open.add(s.at)
    return { ...s, pattern: chars.map((ch, i) => (/[a-z]/i.test(ch) ? (open.has(i) ? ch.toUpperCase() : null) : ch)) }
  })
}

const lobbyProof = (connKey, hostKey) => `wirdwatcher/v2/lobby|${connKey}|${hostKey}`

// Up to 100 for being close: 40 off for every point away.
export const closePoints = (a, b) => Math.max(0, Math.round(100 - 40 * Math.abs(a - b)))

export function closeness (r, others) {
  if (!others.length) return 0
  const mean = others.reduce((a, b) => a + b, 0) / others.length
  return Math.round(100 * Math.max(0, 1 - Math.abs(r - mean) / 4))
}

// A shuffle where nobody lands on themselves (for Hive mind raters).
export function derange (ids) {
  if (ids.length < 2) return [...ids]
  for (;;) {
    const out = [...ids]
    for (let i = out.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [out[i], out[j]] = [out[j], out[i]] }
    if (out.every((x, i) => x !== ids[i])) return out
  }
}

const round1 = (r) => Math.round(r * 10) / 10
const validRating = (r) => typeof r === 'number' && r >= 0 && r <= 5
const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Guest'
const cleanColor = (c) => /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : '#e8c686'

// --- host ---------------------------------------------------------------------

export class LobbyHost extends EventEmitter {
  // me: { name, color, level, title, userId?, sign? }. dealer(mode, used):
  // { word, info } for a new word. lookup(word): its details, or null if it
  // isn't in the word list. settings: the Settings object. provide(kind,
  // args): the host's own answers to what Grand Jury and Clues ask every
  // player's app (see LobbyClient).
  constructor ({ me, dealer, lookup = () => null, provide = () => null, settings, swarm = {}, lan = {}, code = newLobbyCode(), options = {} }) {
    super()
    this.code = code
    this.provide = provide
    this.pending = new Map() // request id -> { from, done }
    this.me = me
    this.dealer = dealer
    this.lookup = lookup
    this.settings = settings
    this.swarmOpts = swarm
    this.lanOpts = lan
    this.isHost = true
    this.keyPair = hcrypto.keyPair()
    this.hostId = this.keyPair.publicKey.toString('hex')
    this.max = settings.get('lobbySize')
    this.options = { ...LOBBY_DEFAULTS, ...pickOptions(options) }
    this.players = new Map() // id -> player
    this.links = new Map() // id -> send
    this.order = []
    this.phase = 'waiting'
    this.round = 0
    this.history = [] // finished rounds
    this.current = null
    this.used = new Set()
    this.banned = new Set()
    this.closed = false
    this._addPlayer(this.hostId, { name: me.name, color: me.color, level: me.level, title: me.title, look: me.look, userId: me.userId || null })
  }

  async start () {
    const { topic, key } = codeKeys(parseLobbyCode(this.code))
    this.key = key
    this.mesh = new Mesh({
      keyPair: this.keyPair,
      swarm: this.swarmOpts,
      internet: this.settings.get('internet'),
      lan: this.settings.get('lan') ? this.lanOpts : false,
      accept: (remote) => !this.banned.has(remote) && !this.closed,
      isLonely: () => true,
      refreshMs: 10000,
      label: 'lobby (hosting)'
    })
    await this.mesh.start()
    this.mesh.on('connection', (socket, remote) => this._connection(socket, remote))
    await this.mesh.join(topic, { server: true, client: false })
    this._changed()
    return this
  }

  // Every connection is heard out, even from someone already seated: the
  // newest one they join on replaces the old (theirs may have died without
  // either side noticing, or the network replaced it with a better path).
  _connection (socket, remote) {
    const rate = { window: Date.now(), count: 0 }
    const send = channel(socket, {
      key: this.key,
      maxBytes: 64 * 1024,
      onMessage: (msg) => {
        const now = Date.now()
        if (now - rate.window > 60000) { rate.window = now; rate.count = 0 }
        if (++rate.count > this.settings.get('lobbyMessagesPerMinute')) {
          send({ type: 'closed', reason: 'You were sending too much, so the lobby let you go.' })
          return this._drop(remote, send)
        }
        this._message(remote, send, msg)
      },
      onClose: () => this._drop(remote, send)
    })
  }

  _message (id, send, msg) {
    if (msg.type === 'join') {
      if (this.players.has(id) && this.links.get(id) === send) return
      if (Number(msg.v) !== PROTOCOL) { send({ type: 'closed', reason: 'That lobby is running a different version of wirdwatcher. Update both copies.' }); return send.close() }
      const back = this.order.includes(id)
      if (!back && this.order.length >= this.max) { send({ type: 'closed', reason: 'That lobby is full.' }); return send.close() }
      let userId = null
      if (/^[0-9a-f]{64}$/.test(String(msg.userId)) && verify(msg.userId, lobbyProof(id, this.hostId), String(msg.sig || ''))) userId = msg.userId
      const old = this.links.get(id)
      this.links.set(id, send)
      if (old && old !== send) old.close()
      const p = this.players.get(id)
      if (back && p) {
        // Back on a new connection: same seat, same score, same answers.
        clearTimeout(p.awayTimer)
        const wasAway = Boolean(p.away)
        p.away = null
        p.awayTimer = null
        netlog('lobby (hosting)', 'player', short(id), wasAway ? 'reconnected' : 'switched connection')
        send({ type: 'welcome', you: id, host: this.hostId })
        if (wasAway) this._event({ kind: 'back', id })
        return this._changed()
      }
      this._addPlayer(id, { name: msg.name, color: msg.color, level: msg.level, title: msg.title, look: msg.look, userId })
      send({ type: 'welcome', you: id, host: this.hostId })
      this._event({ kind: 'join', id })
      return this._changed()
    }
    if (!this.players.has(id) || this.links.get(id) !== send) return
    this._act(id, msg)
  }

  // Everything a player can do, for remote players and for the host alike.
  _act (id, msg) {
    const p = this.players.get(id)
    const c = this.current
    switch (msg.type) {
      case 'rate': return this._rate(id, msg.r === null ? null : Number(msg.r))
      case 'guess': return this._guess(id, msg)
      case 'pick': return this._pick(id, Number(msg.index))
      case 'choose': return this._choose(id, msg.word)
      case 'vote': return this._vote(id, msg.accused)
      case 'clueGuess': return this._clueGuess(id, msg.text)
      case 'answer': {
        const req = this.pending.get(msg.id)
        if (req && req.from === id) req.done(msg.data ?? null)
        return
      }
      case 'next': {
        if (this.phase !== 'reveal' || !c) return
        c.next.add(id)
        // Everyone who played this word (and is still here) is ready.
        if (this._live(c.roster).every((pid) => c.next.has(pid))) return this._nextRound()
        return this._changed()
      }
      case 'react': {
        if (!ALL_REACTIONS.includes(msg.emoji)) return
        return this._event({ kind: 'react', id, emoji: msg.emoji })
      }
      case 'chat': {
        const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 140)
        // No giving the Clues word away in chat.
        if (text && this.phase === 'clues' && c?.word && plain(text).includes(plain(c.word))) return this._tell(id, { kind: 'notice', text: 'That would give the word away, so it wasn’t sent. Guess it in the box instead.' })
        if (text) this._event({ kind: 'chat', id, text })
        return
      }
      case 'ready': {
        p.ready = Boolean(msg.ready)
        return this._changed()
      }
      // A friend request (or its answer) for another seat: passed along as
      // is. Both ends check the signatures; the host can't make one up.
      case 'friendAsk':
      case 'friendAnswer': {
        const to = String(msg.to || '')
        if (to === id || !this.players.has(to)) return
        const out = { type: 'friend', kind: msg.type === 'friendAsk' ? 'ask' : 'answer', from: id, hello: msg.hello && typeof msg.hello === 'object' ? msg.hello : null }
        if (to === this.hostId) return this.emit('friend', out)
        return this.links.get(to)?.(out)
      }
      case 'leave': {
        // Leaving on purpose: no seat held.
        this.links.delete(id)
        return this._remove(id)
      }
      case 'profile': {
        p.name = cleanName(msg.name)
        p.color = cleanColor(msg.color)
        if (msg.look) { p.look = cleanLook(msg.look); p.edition = Math.max(0, Math.min(9999, Math.floor(Number(msg.look.edition) || 0))) }
        return this._changed()
      }
    }
  }

  // --- the actions of each phase -------------------------------------------------

  // A rating, or (in the hot seat, for everyone but the seat) a prediction.
  // null takes it back while the phase is still open.
  _rate (id, r) {
    const c = this.current
    if ((this.phase !== 'rating' && this.phase !== 'testimony') || !c || !c.roster.includes(id)) return
    if (r !== null && !validRating(r)) return
    const map = c.style === 'hotseat' && id !== c.seat ? c.predictions : c.ratings
    if (c.style === 'hive' && !c.toRate.has(id)) return
    if (r === null) map.delete(id)
    else map.set(id, round1(r))
    this._maybeAdvance()
    this._changed()
  }

  _guess (id, { high, low }) {
    const c = this.current
    if (this.phase !== 'guessing' || !c || !c.roster.includes(id)) return
    const ok = (x) => typeof x === 'string' && c.ratings.has(x)
    if (high === null && low === null) c.guesses.delete(id)
    else if (ok(high) && ok(low)) c.guesses.set(id, { high, low })
    else return
    this._maybeAdvance()
    this._changed()
  }

  _pick (id, index) {
    const c = this.current
    if (this.phase !== 'picking' || !c || id !== c.picker || !c.choices[index]) return
    c.word = c.choices[index].word
    c.info = c.choices[index].info
    this.used.add(c.word)
    this._advance()
  }

  _choose (id, word) {
    const c = this.current
    if (this.phase !== 'choosing' || !c || !c.assign.has(id)) return
    const w = String(word || '').toLowerCase().trim()
    if (word === null) c.picks.delete(id)
    else {
      const info = this.lookup(w)
      if (!info) return
      c.picks.set(id, { word: w, info })
    }
    this._maybeAdvance()
    this._changed()
  }

  // Grand Jury: a vote for who gave the rating (anyone but yourself).
  _vote (id, accused) {
    const c = this.current
    if (this.phase !== 'voting' || !c || !c.roster.includes(id)) return
    if (accused === null) c.votes.delete(id)
    else if (typeof accused === 'string' && accused !== id && c.roster.includes(accused)) c.votes.set(id, accused)
    else return
    this._maybeAdvance()
    this._changed()
  }

  // Clues: a guess at the word. Wrong guesses are said out loud (and cost).
  _clueGuess (id, text) {
    const c = this.current
    if (this.phase !== 'clues' || !c || !c.roster.includes(id) || c.solved.has(id)) return
    const g = plain(text).slice(0, 40)
    if (!g) return
    const now = Date.now()
    if (now - (c.lastGuess.get(id) || 0) < 900) return // one a second
    c.lastGuess.set(id, now)
    if (g === plain(c.word)) {
      const wrong = c.wrong.get(id) || 0
      const first = c.solved.size === 0
      const points = Math.max(10, 100 - 12 * c.clue - 10 * wrong) + (first ? 20 : 0)
      c.solved.set(id, { clue: c.clue, wrong, points, first, at: now })
      this._event({ kind: 'solved', id, points, first })
      this._maybeAdvance()
      return this._changed()
    }
    c.wrong.set(id, (c.wrong.get(id) || 0) + 1)
    this._event({ kind: 'guess', id, text: String(text).trim().slice(0, 40) })
    this._changed()
  }

  // Asks one player's app for something (the host answers its own). Settles
  // with null if they're gone or take too long.
  _request (pid, kind, args) {
    if (pid === this.hostId) {
      try { return Promise.resolve(this.provide(kind, args) ?? null) } catch { return Promise.resolve(null) }
    }
    const send = this.links.get(pid)
    if (!send) return Promise.resolve(null)
    const id = crypto.randomBytes(8).toString('hex')
    return new Promise((resolve) => {
      const done = (data) => { clearTimeout(timer); this.pending.delete(id); resolve(data) }
      const timer = setTimeout(() => done(null), REQUEST_MS)
      timer.unref?.()
      this.pending.set(id, { from: pid, done })
      send({ type: 'request', id, kind, args })
    })
  }

  // Grand Jury: find a defendant and the charge.
  async _prepareJury (c) {
    const live = this._live(c.roster)
    const skip = [...this.used]
    const offers = await Promise.all(live.map((id) => this._request(id, 'case', { skip })))
    if (this.current !== c) return
    const cases = new Map(live.map((id, i) => [id, cleanCases(offers[i], this.lookup).filter((x) => !this.used.has(x.word))]).filter(([, v]) => v.length))
    // Everyone takes a turn in the dock before anyone goes twice, in a
    // shuffled order, so nobody can work out whose turn it is.
    let bag = (this.juryBag || []).filter((id) => cases.has(id))
    if (!bag.length) {
      bag = [...cases.keys()]
      for (let i = bag.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [bag[i], bag[j]] = [bag[j], bag[i]] }
    }
    const defendant = bag.shift()
    this.juryBag = bag
    if (!defendant || this._live(c.roster).length < JURY_MIN) {
      this._event({ kind: 'notice', text: defendant ? `Grand Jury needs at least ${JURY_MIN} players.` : 'Nobody here has rated enough words for a case yet. Rate some, then try again.' })
      return this._finish()
    }
    // Of their offers, the one the rest of the table would argue with most.
    const offered = cases.get(defendant)
    const words = offered.map((x) => x.word)
    const others = this._live(c.roster).filter((id) => id !== defendant)
    const said = (await Promise.all(others.map((id) => this._request(id, 'lookup', { words })))).map((x) => cleanLookup(x, words))
    if (this.current !== c) return
    const score = (x) => {
      const gaps = said.map((m) => m[x.word]).filter((r) => r !== undefined).map((r) => Math.abs(r - x.r))
      return (gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length + 0.3 * gaps.length : 0) + Math.abs(x.r - 2.5) / 2.5 + Math.random() * 0.3
    }
    const pick = [...offered].sort((a, b) => score(b) - score(a))[0]
    this.used.add(pick.word)
    const past = { [defendant]: pick.r }
    others.forEach((id, i) => { if (said[i][pick.word] !== undefined) past[id] = said[i][pick.word] })
    Object.assign(c, { defendant, word: pick.word, info: this.lookup(pick.word), charge: pick.r, past })
    this.phase = 'testimony'
    this._startTimer()
    this._changed()
  }

  // Clues: everyone's app sends a sample of their ratings once a game; each
  // round's word is one as many players as possible have rated.
  async _prepareClues (c) {
    if (!this.clueSamples) {
      const live = this._live(c.roster)
      const got = await Promise.all(live.map((id) => this._request(id, 'sample', {})))
      if (this.current !== c) return
      this.clueSamples = new Map(live.map((id, i) => [id, new Map(cleanSample(got[i], this.lookup).map((x) => [x.word, x.r]))]))
    }
    const roster = this._live(c.roster)
    const count = new Map()
    for (const id of roster) for (const w of this.clueSamples.get(id)?.keys() || []) if (!this.used.has(w) && /^[a-z][a-z' -]{2,15}$/i.test(w)) count.set(w, (count.get(w) || 0) + 1)
    const top = Math.max(0, ...count.values())
    const best = [...count].filter(([, n]) => n === top && n > 0).map(([w]) => w)
    let word = best.length ? best[crypto.randomInt(best.length)] : null
    let info = word ? this.lookup(word) : null
    if (!info) {
      const dealt = this._deal()
      if (!dealt) return this._finish()
      word = dealt.word
      info = dealt.info
    }
    this.used.add(word)
    const table = Object.fromEntries(roster.map((id) => [id, this.clueSamples.get(id)?.get(word) ?? null]))
    Object.assign(c, { word, info, table, clues: buildClues(word, info), clue: 0, solved: new Map(), wrong: new Map(), lastGuess: new Map() })
    this.phase = 'clues'
    this._startTimer()
    this._changed()
  }

  // The next clue, or the end of the round after the last one.
  _nextClue () {
    const c = this.current
    if (this.phase !== 'clues' || !c) return
    if (c.clue >= c.clues.length - 1) return this._advance()
    c.clue++
    this._startTimer()
    this._changed()
  }

  // Who still has to act for the current phase to finish.
  _waitingOn () {
    const c = this.current
    if (!c) return []
    const live = this._live(c.roster)
    switch (this.phase) {
      case 'rating':
        if (c.style === 'hotseat') return live.filter((id) => (id === c.seat ? !c.ratings.has(id) : !c.predictions.has(id)))
        if (c.style === 'hive') return live.filter((id) => c.toRate.has(id) && !c.ratings.has(id))
        return live.filter((id) => !c.ratings.has(id))
      case 'guessing': return live.filter((id) => !c.guesses.has(id))
      case 'picking': return live.includes(c.picker) ? [c.picker] : []
      case 'choosing': return live.filter((id) => c.assign.has(id) && !c.picks.has(id))
      case 'testimony': return live.filter((id) => !c.ratings.has(id))
      case 'voting': return live.filter((id) => !c.votes.has(id))
      case 'clues': return live.filter((id) => !c.solved.has(id))
      default: return []
    }
  }

  _live (ids) { return ids.filter((id) => this.order.includes(id)) }

  _maybeAdvance () {
    if (ACTIVE.includes(this.phase) && this.current && !this._waitingOn().length) this._advance()
  }

  // To the next phase of this round, or to the reveal.
  _advance () {
    clearTimeout(this._timer)
    const c = this.current
    if (!c) return
    const phases = PHASES[c.style]
    const at = phases.indexOf(this.phase)
    if (at < 0) return
    if (c.style === 'hotseat') {
      // No seat, no round. A picker who ran out of time (or left) gets the
      // first word picked for them.
      if (!this.order.includes(c.seat)) return this._nextRound()
      if (this.phase === 'picking' && !c.word) {
        c.word = c.choices[0].word
        c.info = c.choices[0].info
        this.used.add(c.word)
      }
    }
    if (c.style === 'hive' && this.phase === 'choosing') {
      if (!c.picks.size) return this._nextRound()
      // Each rater gets the word chosen for them.
      c.toRate = new Map()
      for (const [picker, pick] of c.picks) {
        const rater = c.assign.get(picker).rater
        if (this.order.includes(rater)) c.toRate.set(rater, { picker, word: pick.word, info: pick.info })
      }
    }
    const next = phases[at + 1]
    if (!next) return this._reveal()
    this.phase = next
    c.next = new Set()
    this._startTimer()
    if (!this._waitingOn().length) return this._advance()
    this._changed()
  }

  _startTimer () {
    clearTimeout(this._timer)
    const c = this.current
    if (this.phase === 'clues') {
      // Clues keep their own time, whatever the lobby's timer.
      const secs = c.clue >= c.clues.length - 1 ? CLUE_FINAL_SECS : CLUE_SECS
      c.endsAt = Date.now() + secs * 1000
      this._timer = setTimeout(() => this._nextClue(), secs * 1000)
      this._timer.unref?.()
      return
    }
    const secs = this.options.timer * (this.phase === 'choosing' ? 3 : 1)
    c.endsAt = secs ? Date.now() + secs * 1000 : null
    if (secs) {
      this._timer = setTimeout(() => this._advance(), secs * 1000)
      this._timer.unref?.()
    }
  }

  _addPlayer (id, info) {
    const back = this.players.get(id)
    this.players.set(id, {
      id,
      name: cleanName(info.name),
      color: cleanColor(info.color),
      level: Math.max(1, Math.min(9999, Number(info.level) || 1)),
      title: String(info.title || '').slice(0, 40),
      userId: info.userId || null,
      look: cleanLook(info.look),
      edition: Math.max(0, Math.min(9999, Math.floor(Number(info.look?.edition) || 0))),
      ready: back?.ready || id === this.hostId,
      score: back?.score || 0,
      joinedAt: Date.now()
    })
    if (!this.order.includes(id)) this.order.push(id)
  }

  // A connection ended. The player keeps their seat for a while in case
  // their computer is reconnecting; then they're gone.
  _drop (id, send) {
    if (this.links.get(id) !== send) return
    this.links.delete(id)
    const p = this.players.get(id)
    if (p && !this.closed && !this.banned.has(id) && this.order.includes(id)) {
      p.away = Date.now()
      clearTimeout(p.awayTimer)
      p.awayTimer = setTimeout(() => { if (p.away && !this.links.has(id)) this._remove(id) }, SEAT_GRACE_MS)
      p.awayTimer.unref?.()
      netlog('lobby (hosting)', 'player', short(id), 'lost connection; holding the seat')
      return this._changed()
    }
    this._remove(id)
  }

  _remove (id) {
    const p = this.players.get(id)
    if (p) { clearTimeout(p.awayTimer); p.away = null }
    if (!this.order.includes(id)) return
    this.order = this.order.filter((x) => x !== id)
    this._event({ kind: 'leave', id, name: this.players.get(id)?.name })
    const c = this.current
    if (c && this.phase !== 'reveal') {
      if (c.style === 'hotseat' && (id === c.seat || (id === c.picker && this.phase === 'picking'))) return this._advance()
      if (c.style === 'jury' && id === c.defendant) { this._event({ kind: 'notice', text: 'The defendant left the table, so that case is dropped.' }); return this._nextRound() }
      this._maybeAdvance()
    }
    if (this.phase === 'reveal' && c && this._live(c.roster).every((pid) => c.next.has(pid))) return this._nextRound()
    this._changed()
  }

  // --- host-only ----------------------------------------------------------------

  configure (options) {
    if (this.phase !== 'waiting' && this.phase !== 'results') return
    this.options = { ...this.options, ...pickOptions(options) }
    this._changed()
  }

  begin () {
    if (this.phase !== 'waiting' && this.phase !== 'results') return
    if (this.options.style === 'jury' && this.order.length < JURY_MIN) return this._event({ kind: 'notice', text: `Grand Jury needs at least ${JURY_MIN} players: one of you is secretly on trial, and the others need someone to suspect.` })
    this.clueSamples = null
    this.juryBag = null
    for (const p of this.players.values()) p.score = 0
    this.history = []
    this.round = 0
    this.game = (this.game || 0) + 1
    this._nextRound()
  }

  // Moves on now, whoever hasn't acted (or hasn't pressed Enter).
  advance () {
    if (this.phase === 'reveal') return this._nextRound()
    if (this.phase === 'clues') return this._nextClue() // the host can hurry the clues along
    if (ACTIVE.includes(this.phase)) return this._advance()
  }

  kick (id) {
    if (id === this.hostId) return
    this.banned.add(id)
    const send = this.links.get(id)
    send?.({ type: 'closed', reason: 'The host removed you from the lobby.' })
    if (send) { this.links.delete(id); send.close() }
    this._remove(id)
  }

  backToLobby () {
    clearTimeout(this._timer)
    this.phase = 'waiting'
    this.current = null
    this._changed()
  }

  _deal () {
    const dealt = this.dealer(this.options.mode, this.used)
    if (dealt?.word) this.used.add(dealt.word)
    return dealt?.word ? dealt : null
  }

  _nextRound () {
    clearTimeout(this._timer)
    if (this.round >= this.options.rounds || !this.order.length) return this._finish()
    const style = this.options.style
    const roster = [...this.order]
    const c = { style, roster, ratings: new Map(), next: new Set(), endsAt: null, result: null }
    if (style === 'classic' || style === 'highlow') {
      const dealt = this._deal()
      if (!dealt) return this._finish()
      Object.assign(c, { word: dealt.word, info: dealt.info, guesses: new Map() })
    } else if (style === 'hotseat') {
      const seat = roster[this.round % roster.length]
      const picker = roster.length > 1 ? roster[(this.round + 1) % roster.length] : seat
      const choices = []
      const taken = new Set(this.used)
      for (let i = 0; i < 3; i++) {
        const d = this.dealer(this.options.mode, taken)
        if (d?.word) { taken.add(d.word); choices.push(d) }
      }
      if (!choices.length) return this._finish()
      Object.assign(c, { seat, picker, choices, word: null, info: null, predictions: new Map() })
    } else if (style === 'hive') {
      const raters = derange(roster)
      const assign = new Map(roster.map((id, i) => [id, { rater: raters[i], target: round1(0.3 + crypto.randomInt(43) / 10) }]))
      Object.assign(c, { assign, picks: new Map(), toRate: new Map() })
    } else if (style === 'jury' || style === 'clues') {
      if (style === 'jury') Object.assign(c, { votes: new Map(), defendant: null, word: null })
      this.round++
      this.current = c
      this.phase = 'preparing'
      this._changed()
      const prep = style === 'jury' ? this._prepareJury(c) : this._prepareClues(c)
      prep.catch((err) => { netlog('lobby (hosting)', 'round setup failed', err.message); if (this.current === c) this._finish() })
      return
    }
    this.round++
    this.current = c
    this.phase = PHASES[style][0]
    this._startTimer()
    this._changed()
  }

  // The reveal: work out the round, award points, and show everything.
  _reveal () {
    clearTimeout(this._timer)
    const c = this.current
    if (!c) return
    this.phase = 'reveal'
    c.next = new Set()
    const live = (id) => this.players.has(id)
    const ratings = Object.fromEntries([...c.ratings].filter(([id]) => live(id)))
    const points = {}
    const give = (id, n) => { if (!n) return; points[id] = (points[id] || 0) + n; const p = this.players.get(id); if (p) p.score += n }
    let result
    if (c.style === 'classic' || c.style === 'highlow') {
      const verdict = roundVerdict(ratings)
      const vals = Object.values(ratings)
      const hi = Math.max(...vals)
      const lo = Math.min(...vals)
      const split = vals.length > 1 && hi !== lo
      const highest = split ? Object.keys(ratings).filter((id) => ratings[id] === hi) : []
      const lowest = split ? Object.keys(ratings).filter((id) => ratings[id] === lo) : []
      result = { style: c.style, word: c.word, ratings, highest, lowest, ...verdict, rated: Object.entries(ratings).map(([by, r]) => ({ by, word: c.word, r })) }
      if (c.style === 'highlow') {
        const guesses = {}
        for (const [id, g] of c.guesses) {
          const hitHigh = split && highest.includes(g.high)
          const hitLow = split && lowest.includes(g.low)
          guesses[id] = { ...g, hitHigh, hitLow }
          give(id, (hitHigh ? 100 : 0) + (hitLow ? 100 : 0))
        }
        result.guesses = guesses
        result.split = split
        // Who fooled the most people (nobody saw them coming).
        const fooled = {}
        for (const g of Object.values(guesses)) {
          for (const id of highest) if (g.high !== id) fooled[id] = (fooled[id] || 0) + 1
          for (const id of lowest) if (g.low !== id) fooled[id] = (fooled[id] || 0) + 1
        }
        result.fooled = fooled
      }
    } else if (c.style === 'hotseat') {
      const r = c.ratings.get(c.seat) ?? null
      const predictions = Object.fromEntries([...c.predictions].filter(([id]) => live(id)))
      const diffs = {}
      for (const [id, pr] of Object.entries(predictions)) {
        diffs[id] = r === null ? null : round1(Math.abs(pr - r))
        if (r !== null) give(id, closePoints(pr, r))
      }
      const best = r === null ? [] : Object.keys(diffs).filter((id) => diffs[id] === Math.min(...Object.values(diffs)))
      const reaction = r !== null && (r >= 4.5 || r <= 0.5)
      if (reaction && c.picker !== c.seat) give(c.picker, 50)
      const beaten = r === null ? 0 : Object.values(diffs).filter((d) => d > 1).length
      give(c.seat, beaten * 25)
      result = { style: 'hotseat', word: c.word, seat: c.seat, picker: c.picker, r, predictions, diffs, best, reaction, beaten, ratings: r === null ? {} : { [c.seat]: r }, rated: r === null ? [] : [{ by: c.seat, word: c.word, r }] }
    } else if (c.style === 'jury') {
      const votes = Object.fromEntries([...c.votes].filter(([id]) => live(id)))
      const tally = {}
      for (const a of Object.values(votes)) tally[a] = (tally[a] || 0) + 1
      const most = Math.max(0, ...Object.values(tally))
      const top = Object.keys(tally).filter((id) => tally[id] === most)
      const convicted = most > 0 && top.length === 1 && top[0] === c.defendant
      const right = Object.keys(votes).filter((id) => id !== c.defendant && votes[id] === c.defendant)
      for (const id of right) give(id, 100)
      const missed = Object.keys(votes).filter((id) => id !== c.defendant && votes[id] !== c.defendant).length
      if (!convicted) give(c.defendant, 100 + 25 * missed)
      result = { style: 'jury', word: c.word, info: c.info, charge: c.charge, defendant: c.defendant, testimony: ratings, votes, tally, convicted, right, missed, past: c.past, ratings, rated: [] }
    } else if (c.style === 'clues') {
      const solved = Object.fromEntries([...c.solved].filter(([id]) => live(id)))
      for (const [id, s] of Object.entries(solved)) give(id, s.points)
      const wrong = Object.fromEntries([...c.wrong].filter(([id]) => live(id)))
      const ratings = Object.fromEntries(Object.entries(c.table).filter(([id, r]) => live(id) && r !== null))
      result = { style: 'clues', word: c.word, info: c.info, table: c.table, clues: c.clues.length, solved, wrong, ratings, rated: [] }
    } else {
      const entries = []
      for (const [picker, a] of c.assign) {
        const pick = c.picks.get(picker)
        const r = c.ratings.get(a.rater) ?? null
        const counted = pick && r !== null && c.toRate.get(a.rater)?.picker === picker
        const diff = counted ? round1(Math.abs(r - a.target)) : null
        const pts = counted ? closePoints(r, a.target) + (diff <= 0.1 ? 50 : 0) : 0
        give(picker, pts)
        entries.push({ picker, rater: a.rater, target: a.target, word: pick?.word || null, info: pick?.info || null, r: counted ? r : null, diff, points: pts })
      }
      const scored = entries.filter((e) => e.diff !== null)
      const bestD = Math.min(...scored.map((e) => e.diff))
      const worstD = Math.max(...scored.map((e) => e.diff))
      const best = scored.filter((e) => e.diff === bestD).map((e) => e.picker)
      const worst = scored.length > 1 && worstD !== bestD ? scored.filter((e) => e.diff === worstD).map((e) => e.picker) : []
      // Each picker's card shows the rating their word got.
      const cards = Object.fromEntries(entries.filter((e) => e.r !== null).map((e) => [e.picker, e.r]))
      result = { style: 'hive', entries, best, worst, ratings: cards, rated: entries.filter((e) => e.r !== null).map((e) => ({ by: e.rater, word: e.word, r: e.r })) }
    }
    result.points = points
    c.result = result
    this.history.push({ round: this.round, ...result, players: c.roster.length })
    this._changed()
  }

  _finish () {
    clearTimeout(this._timer)
    this.phase = 'results'
    this.current = null
    for (const p of this.players.values()) p.ready = p.id === this.hostId
    this._changed()
  }

  async close (reason = 'The host closed the lobby.') {
    if (this.closed) return
    this.closed = true
    clearTimeout(this._timer)
    for (const p of this.players.values()) clearTimeout(p.awayTimer)
    for (const send of this.links.values()) { send({ type: 'closed', reason }); send.close() }
    setTimeout(() => this.mesh?.destroy().catch(() => {}), 500).unref?.()
    this.emit('closed', { reason: null })
  }

  // --- the host is also a player ------------------------------------------------

  rate (r) { this._act(this.hostId, { type: 'rate', r }) }
  guess (g) { this._act(this.hostId, { type: 'guess', ...g }) }
  pick (index) { this._act(this.hostId, { type: 'pick', index }) }
  choose (word) { this._act(this.hostId, { type: 'choose', word }) }
  vote (accused) { this._act(this.hostId, { type: 'vote', accused }) }
  clueGuess (text) { this._act(this.hostId, { type: 'clueGuess', text }) }
  next () { this._act(this.hostId, { type: 'next' }) }
  react (emoji) { this._act(this.hostId, { type: 'react', emoji }) }
  chat (text) { this._act(this.hostId, { type: 'chat', text }) }
  setReady (ready) { this._act(this.hostId, { type: 'ready', ready }) }
  setProfile (me) { const { sign, ...pub } = me; this._act(this.hostId, { type: 'profile', ...pub }) }
  friendAsk (to, hello) { this._act(this.hostId, { type: 'friendAsk', to, hello }) }
  friendAnswer (to, hello) { this._act(this.hostId, { type: 'friendAnswer', to, hello }) }

  // --- what each player sees --------------------------------------------------

  _event (e) {
    const ev = { ...e, at: Date.now() }
    for (const send of this.links.values()) send({ type: 'event', event: ev })
    this.emit('event', ev)
  }

  // An event for one player only.
  _tell (id, e) {
    const ev = { ...e, at: Date.now() }
    if (id === this.hostId) this.emit('event', ev)
    else this.links.get(id)?.({ type: 'event', event: ev })
  }

  // The table as one player sees it. Before the reveal, nobody's secrets are
  // in it except that player's own.
  view (forId) {
    const c = this.current
    const waiting = new Set(this._waitingOn())
    const role = (id) => (c?.style === 'hotseat' ? (id === c.seat ? 'seat' : id === c.picker ? 'picker' : null) : c?.style === 'jury' && this.phase === 'reveal' && id === c.defendant ? 'defendant' : null)
    let current = null
    if (c) {
      current = { style: c.style, endsIn: c.endsAt ? Math.max(0, c.endsAt - Date.now()) : null, result: this.phase === 'reveal' ? c.result : null, roster: c.roster }
      if (c.style === 'classic' || c.style === 'highlow') {
        Object.assign(current, { word: c.word, info: c.info, mine: { r: c.ratings.get(forId) ?? null, guess: c.guesses.get(forId) || null } })
      } else if (c.style === 'hotseat') {
        Object.assign(current, { seat: c.seat, picker: c.picker, choices: c.choices.map(({ word, info }) => ({ word, info })), word: c.word, info: c.info, mine: { r: (forId === c.seat ? c.ratings.get(forId) : c.predictions.get(forId)) ?? null } })
      } else if (c.style === 'hive') {
        const a = c.assign.get(forId)
        const pick = c.picks.get(forId)
        const give = c.toRate.get(forId)
        Object.assign(current, {
          mine: {
            target: a?.target ?? null,
            rater: a?.rater ?? null,
            pick: pick?.word || null,
            pickInfo: pick?.info || null,
            toRate: give ? { word: give.word, info: give.info } : null, // you don't learn who chose it, or why
            r: c.ratings.get(forId) ?? null
          }
        })
      } else if (c.style === 'jury') {
        // Nobody learns who the defendant is (except the defendant) until
        // the verdict. Testimony is shown once everyone has given theirs.
        const open = this.phase === 'voting' || this.phase === 'reveal'
        Object.assign(current, {
          word: c.word,
          info: c.info,
          charge: c.charge ?? null,
          testimony: open ? Object.fromEntries(c.ratings) : null,
          mine: { r: c.ratings.get(forId) ?? null, vote: c.votes.get(forId) || null, defendant: c.defendant === forId }
        })
      } else if (c.style === 'clues' && c.clues) {
        const done = c.solved.get(forId)
        const over = this.phase === 'reveal'
        Object.assign(current, {
          word: over ? c.word : null,
          info: over ? c.info : null,
          clue: c.clue,
          clueCount: c.clues.length,
          clues: c.clues.slice(0, c.clue + 1).map(({ pattern, ...x }) => x),
          pattern: over ? [...c.word].map((ch) => (/[a-z]/i.test(ch) ? ch.toUpperCase() : ch)) : c.clues[c.clue].pattern,
          table: c.table,
          solved: Object.fromEntries([...c.solved].map(([id, s]) => [id, { clue: s.clue, first: s.first }])),
          wrong: Object.fromEntries(c.wrong),
          final: c.clue >= c.clues.length - 1,
          mine: { solved: Boolean(done), word: done ? c.word : null, info: done ? c.info : null, points: done?.points ?? null, wrong: c.wrong.get(forId) || 0 }
        })
      }
    }
    return {
      v: PROTOCOL,
      code: this.code,
      host: this.hostId,
      max: this.max,
      options: this.options,
      phase: this.phase,
      game: this.game || 0,
      table: this.players.get(this.hostId)?.look?.table || 'classic',
      room: this.players.get(this.hostId)?.look?.room || 'plain',
      round: this.round,
      players: this.order.map((id) => {
        const p = this.players.get(id)
        const inRound = Boolean(c && c.roster.includes(id))
        return { id, name: p.name, color: p.color, level: p.level, title: p.title, userId: p.userId, ready: p.ready, score: p.score, away: Boolean(p.away), look: p.look, edition: p.edition, playing: inRound, role: role(id), locked: inRound && !waiting.has(id) && this.phase !== 'reveal' && this.phase !== 'preparing', next: Boolean(c && c.next.has(id)) }
      }),
      waitingOn: [...waiting],
      current,
      history: this.history,
      summary: this.phase === 'results' ? summarize(this.history, this.players, this.options.style) : null
    }
  }

  _changed () {
    if (this.closed) return
    for (const [id, send] of this.links) send({ type: 'state', state: this.view(id) })
    this.emit('state', { ...this.view(this.hostId), you: this.hostId, isHost: true })
  }
}

function pickOptions (o = {}) {
  const out = {}
  if (Number.isInteger(Number(o.rounds)) && o.rounds >= 1 && o.rounds <= 50) out.rounds = Number(o.rounds)
  if (LOBBY_TIMERS.includes(Number(o.timer))) out.timer = Number(o.timer)
  if (typeof o.mode === 'string' && o.mode.length < 80) out.mode = o.mode
  if (LOBBY_STYLES.includes(o.style)) out.style = o.style
  return out
}

// The end-of-game awards for each mode.
export function summarize (history, players, style = 'classic') {
  if (!history.length) return { awards: [], words: [], scored: style !== 'classic' }
  const name = (id) => players.get(id)?.name || 'Someone'
  const awards = []
  const scored = style !== 'classic'
  if (style === 'classic' || style === 'highlow') {
    const byMean = history.filter((h) => h.mean !== null && h.mean !== undefined).sort((a, b) => b.mean - a.mean)
    const bySpread = [...history].sort((a, b) => (b.spread || 0) - (a.spread || 0))
    if (byMean[0]) awards.push({ emoji: '👑', title: 'Table favorite', word: byMean[0].word, detail: `averaged ${byMean[0].mean.toFixed(1)}` })
    if (byMean.length > 1) awards.push({ emoji: '🗑️', title: 'Table least favorite', word: byMean[byMean.length - 1].word, detail: `averaged ${byMean[byMean.length - 1].mean.toFixed(1)}` })
    if (bySpread[0] && bySpread[0].spread >= 1) awards.push({ emoji: '⚔️', title: 'Most divisive', word: bySpread[0].word, detail: `${bySpread[0].spread.toFixed(1)} between highest and lowest` })
    const synced = history.filter((h) => h.hive && h.players >= 2).length
    if (synced) awards.push({ emoji: '🤝', title: 'In sync', detail: `${synced} word${synced === 1 ? '' : 's'} where everyone was within 0.5` })
    const totals = new Map()
    for (const h of history) for (const [id, r] of Object.entries(h.ratings || {})) { const t = totals.get(id) || { sum: 0, n: 0 }; t.sum += r; t.n++; totals.set(id, t) }
    const avgs = [...totals].filter(([, t]) => t.n >= Math.max(1, Math.ceil(history.length / 2))).map(([id, t]) => [id, t.sum / t.n]).sort((a, b) => b[1] - a[1])
    if (avgs.length >= 2) {
      awards.push({ emoji: '🧸', title: 'Most generous', player: avgs[0][0], detail: `${name(avgs[0][0])}, averaged ${avgs[0][1].toFixed(1)}` })
      awards.push({ emoji: '🧐', title: 'Toughest critic', player: avgs[avgs.length - 1][0], detail: `${name(avgs[avgs.length - 1][0])}, averaged ${avgs[avgs.length - 1][1].toFixed(1)}` })
    }
  }
  if (style === 'highlow') {
    const fooled = new Map()
    const reads = new Map()
    for (const h of history) {
      for (const [id, n] of Object.entries(h.fooled || {})) fooled.set(id, (fooled.get(id) || 0) + n)
      for (const [id, g] of Object.entries(h.guesses || {})) reads.set(id, (reads.get(id) || 0) + (g.hitHigh ? 1 : 0) + (g.hitLow ? 1 : 0))
    }
    const sneak = [...fooled].sort((a, b) => b[1] - a[1])[0]
    if (sneak) awards.push({ emoji: '🕵️', title: 'Poker face', player: sneak[0], detail: `${name(sneak[0])} fooled the table ${sneak[1]} time${sneak[1] === 1 ? '' : 's'}` })
    const reader = [...reads].sort((a, b) => b[1] - a[1])[0]
    if (reader?.[1]) awards.push({ emoji: '🔮', title: 'Mind reader', player: reader[0], detail: `${name(reader[0])}, ${reader[1]} right guess${reader[1] === 1 ? '' : 'es'}` })
  }
  if (style === 'hotseat') {
    const seats = history.filter((h) => h.r !== null)
    const wild = [...seats].sort((a, b) => b.beaten - a.beaten)[0]
    if (wild?.beaten) awards.push({ emoji: '🎭', title: 'Unpredictable', player: wild.seat, detail: `${name(wild.seat)} beat ${wild.beaten} prediction${wild.beaten === 1 ? '' : 's'} with “${wild.word}”` })
    const reactions = new Map()
    for (const h of seats) if (h.reaction) reactions.set(h.picker, (reactions.get(h.picker) || 0) + 1)
    const stirrer = [...reactions].sort((a, b) => b[1] - a[1])[0]
    if (stirrer) awards.push({ emoji: '🧨', title: 'Button pusher', player: stirrer[0], detail: `${name(stirrer[0])} picked ${stirrer[1]} word${stirrer[1] === 1 ? '' : 's'} that got a strong reaction` })
    const hits = new Map()
    for (const h of seats) for (const [id, d] of Object.entries(h.diffs || {})) if (d !== null && d <= 0.2) hits.set(id, (hits.get(id) || 0) + 1)
    const knower = [...hits].sort((a, b) => b[1] - a[1])[0]
    if (knower) awards.push({ emoji: '🫂', title: 'Knows you best', player: knower[0], detail: `${name(knower[0])}, ${knower[1]} prediction${knower[1] === 1 ? '' : 's'} within 0.2` })
  }
  if (style === 'hive') {
    const all = history.flatMap((h) => h.entries || []).filter((e) => e.diff !== null)
    const bull = [...all].sort((a, b) => a.diff - b.diff)[0]
    if (bull) awards.push({ emoji: '🎯', title: 'Closest shot', player: bull.picker, word: bull.word, detail: `${name(bull.picker)} aimed ${bull.target.toFixed(1)} for ${name(bull.rater)}, got ${bull.r.toFixed(1)}` })
    const miss = [...all].sort((a, b) => b.diff - a.diff)[0]
    if (miss && all.length > 1) awards.push({ emoji: '🙃', title: 'Wildest miss', player: miss.picker, word: miss.word, detail: `aimed ${miss.target.toFixed(1)}, ${name(miss.rater)} gave it ${miss.r.toFixed(1)}` })
  }
  if (style === 'jury') {
    const free = history.filter((h) => !h.convicted && h.defendant).sort((a, b) => b.missed - a.missed)[0]
    if (free) awards.push({ emoji: '🎭', title: 'Got away with it', player: free.defendant, word: free.word, detail: `${name(free.defendant)} gave “${free.word}” ${free.charge.toFixed(1)} and fooled ${free.missed} juror${free.missed === 1 ? '' : 's'}` })
    const sleuth = new Map()
    for (const h of history) for (const id of h.right || []) sleuth.set(id, (sleuth.get(id) || 0) + 1)
    const best = [...sleuth].sort((a, b) => b[1] - a[1])[0]
    if (best) awards.push({ emoji: '🔎', title: 'Detective', player: best[0], detail: `${name(best[0])} named the right person ${best[1]} time${best[1] === 1 ? '' : 's'}` })
    const blamed = new Map()
    for (const h of history) for (const [id, n] of Object.entries(h.tally || {})) if (id !== h.defendant) blamed.set(id, (blamed.get(id) || 0) + n)
    const usual = [...blamed].sort((a, b) => b[1] - a[1])[0]
    if (usual?.[1] >= 2) awards.push({ emoji: '🚨', title: 'Usual suspect', player: usual[0], detail: `${name(usual[0])} drew ${usual[1]} votes for things they didn’t do` })
  }
  if (style === 'clues') {
    const solves = history.flatMap((h) => Object.entries(h.solved || {}).map(([id, s]) => ({ id, word: h.word, ...s })))
    const quick = [...solves].sort((a, b) => a.clue - b.clue || a.wrong - b.wrong)[0]
    if (quick) awards.push({ emoji: '⚡', title: 'Quickest mind', player: quick.id, word: quick.word, detail: `${name(quick.id)} got “${quick.word}” ${quick.clue === 0 ? 'from the blanks alone' : `after ${quick.clue} clue${quick.clue === 1 ? '' : 's'}`}` })
    const count = new Map()
    for (const x of solves) count.set(x.id, (count.get(x.id) || 0) + 1)
    const most = [...count].sort((a, b) => b[1] - a[1])[0]
    if (most && history.length > 1) awards.push({ emoji: '📚', title: 'Wordsmith', player: most[0], detail: `${name(most[0])} solved ${most[1]} of ${history.length}` })
    const tries = new Map()
    for (const h of history) for (const [id, n] of Object.entries(h.wrong || {})) tries.set(id, (tries.get(id) || 0) + n)
    const bold = [...tries].sort((a, b) => b[1] - a[1])[0]
    if (bold?.[1] >= 3) awards.push({ emoji: '🎲', title: 'Never stopped guessing', player: bold[0], detail: `${name(bold[0])}, ${bold[1]} wrong guesses` })
  }
  const words = history.flatMap((h) => (h.style === 'hive' ? (h.entries || []).filter((e) => e.word).map((e) => ({ word: e.word, mean: e.r, spread: 0 })) : h.word ? [{ word: h.word, mean: h.mean ?? h.r ?? null, spread: h.spread || 0 }] : []))
  return { awards, words, scored }
}

// --- player ---------------------------------------------------------------------

export class LobbyClient extends EventEmitter {
  // provide(kind, args): this app's answers when the host asks (Grand Jury
  // and Clues). 'case' → a few of my strongest ratings, [{ word, r }];
  // 'lookup' { words } → what I gave any of them, { word: r }; 'sample' →
  // some of my ratings, [{ word, r }]. Only what's asked for is sent, to the
  // host, and the host only shows it to the table as the game describes.
  constructor ({ code, me, settings, swarm = {}, lan = {}, provide = () => null }) {
    super()
    this.provide = provide
    if (!parseLobbyCode(code)) throw new Error('Lobby codes are 10 letters and numbers, like K7Q2M-9XD4P.')
    this.code = normalizeCode(code).replace(/(.{5})/, '$1-')
    this.me = me
    this.settings = settings
    this.swarmOpts = swarm
    this.lanOpts = lan
    this.isHost = false
    this.keyPair = hcrypto.keyPair()
    this.you = this.keyPair.publicKey.toString('hex')
    this.state = null
    this.send = null
    this.closed = false
  }

  // Resolves once the host has let you in. After that, a lost connection is
  // retried for a while (the host keeps your seat), and a newer connection
  // to the host always replaces the one in use: the network may have found a
  // better path, or the old one may be dead without either side knowing.
  async start ({ timeoutMs = 45000, reconnectMs = SEAT_GRACE_MS - 5000 } = {}) {
    const { topic, key } = codeKeys(parseLobbyCode(this.code))
    this.key = key
    this.reconnectMs = reconnectMs
    this.mesh = new Mesh({
      keyPair: this.keyPair,
      swarm: this.swarmOpts,
      internet: this.settings.get('internet'),
      lan: this.settings.get('lan') ? { ...this.lanOpts, announce: false, dialAll: true } : false,
      isLonely: () => !this.send,
      refreshMs: 2000,
      label: 'lobby (joining)'
    })
    await this.mesh.start()
    await new Promise((resolve, reject) => {
      this._joined = { resolve, reject }
      this._joinTimer = setTimeout(() => { this._joined = null; reject(new Error('Couldn’t find that lobby. Check the code, and that the host still has it open.')); this.leave() }, timeoutMs)
      this.mesh.on('connection', (socket, remote) => this._connection(socket, remote))
      this.mesh.join(topic, { server: false, client: true })
    })
    return this
  }

  _connection (socket, remote) {
    if (this.closed) { socket.destroy(); return }
    const old = this.send
    const send = channel(socket, {
      key: this.key,
      maxBytes: 4 * 1024 * 1024,
      onMessage: (msg) => {
        if (this.send !== send) return
        if (msg.type === 'closed') {
          if (this._joined) { clearTimeout(this._joinTimer); this._joined.reject(new Error(msg.reason)); this._joined = null }
          return this._end(msg.reason)
        }
        this._message(msg)
        if (msg.type === 'state' && this._joined) { clearTimeout(this._joinTimer); this._joined.resolve(); this._joined = null } // in, and we know the table
      },
      onClose: () => {
        if (this.send !== send) return
        this.send = null
        if (!this.closed) this._lost()
      }
    })
    this.send = send
    if (old) old.close() // the newer connection wins
    this._found()
    const proof = this.me.userId && this.me.sign ? { userId: this.me.userId, sig: this.me.sign(lobbyProof(this.you, remote)) } : {}
    send({ type: 'join', v: PROTOCOL, name: this.me.name, color: this.me.color, level: this.me.level, title: this.me.title, look: this.me.look, ...proof })
  }

  // The connection to the host dropped: look for it again until the host
  // would give the seat away.
  _lost () {
    if (this._joined) return // still joining: start() is waiting anyway
    netlog('lobby (joining)', 'lost the host; reconnecting')
    this.reconnecting = Date.now()
    this.mesh.refresh()
    this._emitState()
    clearTimeout(this._lostTimer)
    this._lostTimer = setTimeout(() => { if (!this.send) this._end('Lost the connection to the host.') }, this.reconnectMs)
    this._lostTimer.unref?.()
  }

  _found () {
    clearTimeout(this._lostTimer)
    if (!this.reconnecting) return
    netlog('lobby (joining)', 'back with the host')
    this.reconnecting = null
    this._emitState()
  }

  _emitState () {
    if (this.state) this.emit('state', { ...this.state, you: this.you, isHost: false, reconnecting: Boolean(this.reconnecting) })
  }

  _message (msg) {
    if (msg.type === 'state' && msg.state && typeof msg.state === 'object') {
      this.state = msg.state
      this._emitState()
    } else if (msg.type === 'event' && msg.event) {
      this.emit('event', msg.event)
    } else if (msg.type === 'friend' && typeof msg.from === 'string') {
      this.emit('friend', { kind: msg.kind, from: msg.from, hello: msg.hello || null })
    } else if (msg.type === 'request' && typeof msg.id === 'string' && ['case', 'lookup', 'sample'].includes(msg.kind)) {
      let data = null
      try { data = this.provide(msg.kind, msg.args && typeof msg.args === 'object' ? msg.args : {}) ?? null } catch {}
      this.send?.({ type: 'answer', id: msg.id, data })
    }
  }

  _end (reason) {
    if (this.closed) return
    this.closed = true
    clearTimeout(this._lostTimer)
    clearTimeout(this._joinTimer)
    setTimeout(() => this.mesh?.destroy().catch(() => {}), 300).unref?.()
    this.emit('closed', { reason })
  }

  rate (r) { this.send?.({ type: 'rate', r }) }
  guess (g) { this.send?.({ type: 'guess', ...g }) }
  pick (index) { this.send?.({ type: 'pick', index }) }
  choose (word) { this.send?.({ type: 'choose', word }) }
  vote (accused) { this.send?.({ type: 'vote', accused }) }
  clueGuess (text) { this.send?.({ type: 'clueGuess', text }) }
  next () { this.send?.({ type: 'next' }) }
  react (emoji) { this.send?.({ type: 'react', emoji }) }
  chat (text) { this.send?.({ type: 'chat', text }) }
  setReady (ready) { this.send?.({ type: 'ready', ready }) }
  setProfile (me) { this.me = { ...this.me, ...me }; const { sign, ...pub } = me; this.send?.({ type: 'profile', ...pub }) }
  friendAsk (to, hello) { this.send?.({ type: 'friendAsk', to, hello }) }
  friendAnswer (to, hello) { this.send?.({ type: 'friendAnswer', to, hello }) }

  async leave () {
    if (this.closed) return
    this.send?.({ type: 'leave' })
    this.send?.close()
    this._end(null)
  }

  async close () { return this.leave() }
}
