// Lobbies: up to 8 people rate the same words together, and everyone's
// rating stays hidden until the whole table has locked in.
//
// Network shape: a star around the host, all of it peer-to-peer.
//   - The host makes a lobby code (10 characters). Its computer waits on a
//     meeting place derived from the code, under fresh keys made just for
//     this lobby (players never learn anyone's identity key unless it is
//     offered, see below).
//   - Players type the code and dial the host (on the internet or the same
//     Wi-Fi). Every message is sealed with a key derived from the code, so
//     only people with the code can take part.
//   - The host's computer keeps the game: who is here, which word, who has
//     locked in. Ratings go to the host only, and the host says nothing about
//     them except who has locked in, until everyone has; then it reveals all
//     of them at once. Nobody else's computer ever sees an early rating.
//   - Players may include their identity key with a signature over this
//     connection, so friends at the table are shown as friends.
//
// Round: rating → reveal → (everyone presses Enter, or the host moves on) →
// next word. A rating made at a table also counts as your own rating of the
// word, so lobbies feed your collection, XP and badges.
//
// Scoring is for being in tune with the table: each round you score up to 100
// for how close you were to everyone else's average (losing 25 per point off). Hive mind (everyone
// within 0.5) and hot take (2.0 away from everyone) are called out.

import { EventEmitter } from 'node:events'
import hcrypto from 'hypercore-crypto'
import { Mesh } from './mesh.js'
import { channel } from './channel.js'
import { codeKeys, newLobbyCode, parseLobbyCode, normalizeCode } from './crypto.js'
import { verify } from './identity.js'
import { roundVerdict } from '../shared/progress.js'

const PROTOCOL = 2
// style: 'chill' just reveals (the average, who went highest and lowest:
// something to talk about); 'tune' also scores closeness to the table.
export const LOBBY_DEFAULTS = { rounds: 10, mode: 'everyday', timer: 0, style: 'chill' }
export const LOBBY_STYLES = ['chill', 'tune']
export const LOBBY_ROUNDS = [5, 10, 15, 20, 30]
export const LOBBY_TIMERS = [0, 15, 30, 60] // seconds; 0 = no timer
export const REACTIONS = ['😂', '😮', '🔥', '💀', '🤔', '❤️', '👏', '🙈']

const lobbyProof = (connKey, hostKey) => `wirdwatcher/v2/lobby|${connKey}|${hostKey}`

export function closeness (r, others) {
  if (!others.length) return 0
  const mean = others.reduce((a, b) => a + b, 0) / others.length
  return Math.round(100 * Math.max(0, 1 - Math.abs(r - mean) / 4))
}

const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Guest'
const cleanColor = (c) => /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : '#e8c686'

// --- host ---------------------------------------------------------------------

export class LobbyHost extends EventEmitter {
  // me: { name, color, level, title, userId? , sign? }. dealer(mode, used):
  // { word, info } for the next word. settings: the Settings object.
  constructor ({ me, dealer, settings, swarm = {}, lan = {}, code = newLobbyCode(), options = {} }) {
    super()
    this.code = code
    this.me = me
    this.dealer = dealer
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
    this.current = null // { word, info, ratings: Map, endsAt, next: Set }
    this.used = new Set()
    this.banned = new Set()
    this.closed = false
    this._addPlayer(this.hostId, { name: me.name, color: me.color, level: me.level, title: me.title, userId: me.userId || null })
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
      refreshMs: 10000
    })
    await this.mesh.start()
    this.mesh.on('connection', (socket, remote) => this._connection(socket, remote))
    await this.mesh.join(topic, { server: true, client: false })
    this._changed()
    return this
  }

  _connection (socket, remote) {
    if (this.links.has(remote)) { socket.destroy(); return } // already here (Wi-Fi and internet both reached me)
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
      if (this.order.length >= this.max) { send({ type: 'closed', reason: 'That lobby is full.' }); return send.close() }
      let userId = null
      if (/^[0-9a-f]{64}$/.test(String(msg.userId)) && verify(msg.userId, lobbyProof(id, this.hostId), String(msg.sig || ''))) userId = msg.userId
      this.links.set(id, send)
      this._addPlayer(id, { name: msg.name, color: msg.color, level: msg.level, title: msg.title, userId })
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
      case 'rate': {
        if (this.phase !== 'rating' || !c) return
        const r = msg.r === null ? null : Number(msg.r)
        if (r !== null && !(r >= 0 && r <= 5)) return
        if (r === null) c.ratings.delete(id)
        else c.ratings.set(id, Math.round(r * 10) / 10)
        this._maybeReveal()
        return this._changed()
      }
      case 'next': {
        if (this.phase !== 'reveal' || !c) return
        c.next.add(id)
        if (this.order.every((pid) => c.next.has(pid))) return this._nextRound()
        return this._changed()
      }
      case 'react': {
        if (!REACTIONS.includes(msg.emoji)) return
        return this._event({ kind: 'react', id, emoji: msg.emoji })
      }
      case 'chat': {
        const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 140)
        if (text) this._event({ kind: 'chat', id, text })
        return
      }
      case 'ready': {
        p.ready = Boolean(msg.ready)
        return this._changed()
      }
      case 'profile': {
        p.name = cleanName(msg.name)
        p.color = cleanColor(msg.color)
        return this._changed()
      }
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
      ready: back?.ready || id === this.hostId,
      score: back?.score || 0,
      joinedAt: Date.now()
    })
    if (!this.order.includes(id)) this.order.push(id)
  }

  _drop (id, send) {
    if (this.links.get(id) !== send) return
    this.links.delete(id)
    this.order = this.order.filter((x) => x !== id)
    if (this.current) { this.current.ratings.delete(id); this.current.next.delete(id) }
    this._event({ kind: 'leave', id, name: this.players.get(id)?.name })
    this._maybeReveal()
    if (this.phase === 'reveal' && this.current && this.order.every((pid) => this.current.next.has(pid))) return this._nextRound()
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
    for (const p of this.players.values()) p.score = 0
    this.history = []
    this.round = 0
    this._nextRound()
  }

  // Moves on now, whoever hasn't pressed Enter (or reveals now, while rating).
  advance () {
    if (this.phase === 'rating') return this._reveal()
    if (this.phase === 'reveal') return this._nextRound()
  }

  kick (id) {
    if (id === this.hostId) return
    this.banned.add(id)
    const send = this.links.get(id)
    send?.({ type: 'closed', reason: 'The host removed you from the lobby.' })
    if (send) { this._drop(id, send); send.close() }
  }

  backToLobby () {
    clearTimeout(this._timer)
    this.phase = 'waiting'
    this.current = null
    this._changed()
  }

  _nextRound () {
    clearTimeout(this._timer)
    if (this.round >= this.options.rounds) return this._finish()
    const dealt = this.dealer(this.options.mode, this.used)
    if (!dealt?.word) return this._finish()
    this.used.add(dealt.word)
    this.round++
    const timer = this.options.timer
    this.current = { word: dealt.word, info: dealt.info, ratings: new Map(), next: new Set(), endsAt: timer ? Date.now() + timer * 1000 : null }
    this.phase = 'rating'
    if (timer) {
      this._timer = setTimeout(() => this._reveal(), timer * 1000)
      this._timer.unref?.()
    }
    this._changed()
  }

  _maybeReveal () {
    const c = this.current
    if (this.phase !== 'rating' || !c || !this.order.length) return
    if (this.order.every((id) => c.ratings.has(id))) this._reveal()
  }

  _reveal () {
    clearTimeout(this._timer)
    const c = this.current
    if (this.phase !== 'rating' || !c) return
    this.phase = 'reveal'
    const ratings = Object.fromEntries([...c.ratings].filter(([id]) => this.players.has(id)))
    const verdict = roundVerdict(ratings)
    const points = {}
    const scored = this.options.style === 'tune'
    for (const [id, r] of Object.entries(ratings)) {
      const others = Object.entries(ratings).filter(([o]) => o !== id).map(([, v]) => v)
      points[id] = scored ? closeness(r, others) : 0
      const p = this.players.get(id)
      if (p) p.score += points[id]
    }
    // Who went highest and lowest (everyone tied for it), when it differs.
    const vals = Object.values(ratings)
    const hi = Math.max(...vals)
    const lo = Math.min(...vals)
    const highest = vals.length > 1 && hi !== lo ? Object.keys(ratings).filter((id) => ratings[id] === hi) : []
    const lowest = vals.length > 1 && hi !== lo ? Object.keys(ratings).filter((id) => ratings[id] === lo) : []
    c.result = { ratings, points, scored, highest, lowest, ...verdict }
    this.history.push({ round: this.round, word: c.word, ...c.result, players: Object.keys(ratings).length })
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
    for (const send of this.links.values()) { send({ type: 'closed', reason }); send.close() }
    setTimeout(() => this.mesh?.destroy().catch(() => {}), 500).unref?.()
    this.emit('closed', { reason: null })
  }

  // --- the host is also a player ------------------------------------------------

  rate (r) { this._act(this.hostId, { type: 'rate', r }) }
  next () { this._act(this.hostId, { type: 'next' }) }
  react (emoji) { this._act(this.hostId, { type: 'react', emoji }) }
  chat (text) { this._act(this.hostId, { type: 'chat', text }) }
  setReady (ready) { this._act(this.hostId, { type: 'ready', ready }) }
  setProfile (me) { this._act(this.hostId, { type: 'profile', ...me }) }

  // --- what everyone sees -------------------------------------------------------

  _event (e) {
    const ev = { ...e, at: Date.now() }
    for (const send of this.links.values()) send({ type: 'event', event: ev })
    this.emit('event', ev)
  }

  // Ratings are only included once revealed; until then just who locked in.
  view () {
    const c = this.current
    return {
      v: PROTOCOL,
      code: this.code,
      host: this.hostId,
      max: this.max,
      options: this.options,
      phase: this.phase,
      round: this.round,
      players: this.order.map((id) => {
        const p = this.players.get(id)
        return { id, name: p.name, color: p.color, level: p.level, title: p.title, userId: p.userId, ready: p.ready, score: p.score, locked: Boolean(c && c.ratings.has(id)), next: Boolean(c && c.next.has(id)) }
      }),
      current: c ? { word: c.word, info: c.info, endsIn: c.endsAt ? Math.max(0, c.endsAt - Date.now()) : null, result: this.phase === 'reveal' ? c.result : null } : null,
      history: this.history,
      summary: this.phase === 'results' ? summarize(this.history, this.players) : null
    }
  }

  _changed () {
    if (this.closed) return
    const view = this.view()
    for (const send of this.links.values()) send({ type: 'state', state: view })
    this.emit('state', { ...view, you: this.hostId, isHost: true })
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

// The end-of-game awards.
export function summarize (history, players) {
  if (!history.length) return { awards: [], words: [] }
  const sorted = [...history]
  const byMean = sorted.filter((h) => h.mean !== null).sort((a, b) => b.mean - a.mean)
  const bySpread = [...sorted].sort((a, b) => b.spread - a.spread)
  const name = (id) => players.get(id)?.name || 'Someone'
  const awards = []
  if (byMean[0]) awards.push({ emoji: '👑', title: 'Table favorite', word: byMean[0].word, detail: `averaged ${byMean[0].mean.toFixed(1)}` })
  if (byMean.length > 1) awards.push({ emoji: '🗑️', title: 'Table least favorite', word: byMean[byMean.length - 1].word, detail: `averaged ${byMean[byMean.length - 1].mean.toFixed(1)}` })
  if (bySpread[0] && bySpread[0].spread >= 1) awards.push({ emoji: '⚔️', title: 'Most divisive', word: bySpread[0].word, detail: `${bySpread[0].spread.toFixed(1)} between highest and lowest` })
  const hives = sorted.filter((h) => h.hive && h.players >= 2).length
  if (hives) awards.push({ emoji: '🐝', title: 'Hive mind', detail: `${hives} word${hives === 1 ? '' : 's'} where everyone agreed` })
  // Most hot takes, and the most generous and harshest raters.
  const takes = new Map()
  const totals = new Map()
  for (const h of sorted) {
    if (h.hotTake) takes.set(h.hotTake, (takes.get(h.hotTake) || 0) + 1)
    for (const [id, r] of Object.entries(h.ratings)) { const t = totals.get(id) || { sum: 0, n: 0 }; t.sum += r; t.n++; totals.set(id, t) }
  }
  const spicy = [...takes].sort((a, b) => b[1] - a[1])[0]
  if (spicy) awards.push({ emoji: '🌶️', title: 'Spiciest takes', player: spicy[0], detail: `${name(spicy[0])}, ${spicy[1]} hot take${spicy[1] === 1 ? '' : 's'}` })
  const avgs = [...totals].filter(([, t]) => t.n >= Math.max(1, Math.ceil(sorted.length / 2))).map(([id, t]) => [id, t.sum / t.n]).sort((a, b) => b[1] - a[1])
  if (avgs.length >= 2) {
    awards.push({ emoji: '🧸', title: 'Most generous', player: avgs[0][0], detail: `${name(avgs[0][0])}, averaged ${avgs[0][1].toFixed(1)}` })
    awards.push({ emoji: '🧐', title: 'Toughest critic', player: avgs[avgs.length - 1][0], detail: `${name(avgs[avgs.length - 1][0])}, averaged ${avgs[avgs.length - 1][1].toFixed(1)}` })
  }
  return { awards, words: sorted.map((h) => ({ word: h.word, mean: h.mean, spread: h.spread })) }
}

// --- player ---------------------------------------------------------------------

export class LobbyClient extends EventEmitter {
  constructor ({ code, me, settings, swarm = {}, lan = {} }) {
    super()
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

  // Resolves once the host has let you in.
  async start ({ timeoutMs = 45000 } = {}) {
    const { topic, key } = codeKeys(parseLobbyCode(this.code))
    this.mesh = new Mesh({
      keyPair: this.keyPair,
      swarm: this.swarmOpts,
      internet: this.settings.get('internet'),
      lan: this.settings.get('lan') ? { ...this.lanOpts, announce: false, dialAll: true } : false,
      isLonely: () => !this.send,
      refreshMs: 2000
    })
    await this.mesh.start()
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('Couldn’t find that lobby. Check the code, and that the host still has it open.')); this.leave() }, timeoutMs)
      this.mesh.on('connection', (socket, remote) => {
        if (this.send || this.closed) { socket.destroy(); return }
        const send = channel(socket, {
          key,
          maxBytes: 4 * 1024 * 1024,
          onMessage: (msg) => {
            if (msg.type === 'closed') { clearTimeout(timer); reject(new Error(msg.reason)); return this._end(msg.reason) }
            this._message(msg)
            if (msg.type === 'state') { clearTimeout(timer); resolve() } // in, and we know the table
          },
          onClose: () => {
            if (this.send !== send) return
            this.send = null
            if (!this.closed) this._end('Lost the connection to the host.')
          }
        })
        this.send = send
        const proof = this.me.userId && this.me.sign ? { userId: this.me.userId, sig: this.me.sign(lobbyProof(this.you, remote)) } : {}
        send({ type: 'join', v: PROTOCOL, name: this.me.name, color: this.me.color, level: this.me.level, title: this.me.title, ...proof })
      })
      this.mesh.join(topic, { server: false, client: true })
    })
    return this
  }

  _message (msg) {
    if (msg.type === 'state' && msg.state && typeof msg.state === 'object') {
      this.state = msg.state
      this.emit('state', { ...msg.state, you: this.you, isHost: false })
    } else if (msg.type === 'event' && msg.event) {
      this.emit('event', msg.event)
    }
  }

  _end (reason) {
    if (this.closed) return
    this.closed = true
    setTimeout(() => this.mesh?.destroy().catch(() => {}), 300).unref?.()
    this.emit('closed', { reason })
  }

  rate (r) { this.send?.({ type: 'rate', r }) }
  next () { this.send?.({ type: 'next' }) }
  react (emoji) { this.send?.({ type: 'react', emoji }) }
  chat (text) { this.send?.({ type: 'chat', text }) }
  setReady (ready) { this.send?.({ type: 'ready', ready }) }
  setProfile (me) { this.send?.({ type: 'profile', ...me }) }

  async leave () {
    if (this.closed) return
    this.send?.close()
    this._end(null)
  }

  async close () { return this.leave() }
}
