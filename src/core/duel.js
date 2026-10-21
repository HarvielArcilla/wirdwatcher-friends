// Live Leximon duels over the network: one player makes a duel code, the
// other types it in, and they fight turn by turn (the rules are in
// src/shared/duel.js). Like a lobby, it's peer-to-peer and sealed with a key
// from the code; the one who made the code runs the duel.
//
// The seed for the duel's luck comes from both sides, so neither can pick
// it: the challenger sends a hash of their seed when they join, the host
// answers with its own seed, and then the challenger shows theirs.
//   challenger → host   join { v, name, color, team, commit }
//   host → challenger   welcome { seed, scaled, host: { name, color } }
//   challenger → host   seed { seed }
//   either way          act { turn, action }  /  state { ... }  /  closed
// Leaving, or going quiet for too long, forfeits.

import { EventEmitter } from 'node:events'
import crypto from 'node:crypto'
import hcrypto from 'hypercore-crypto'
import { Mesh } from './mesh.js'
import { channel } from './channel.js'
import { codeKeys, newLobbyCode, normalizeCode } from './crypto.js'
import { cleanTeam } from '../shared/leximon.js'
import { newDuel, playTurn, validAction, choosers, defaultAction, forfeit, DUEL_TURN_SECS } from '../shared/duel.js'

const PROTOCOL = 1
const GONE_MS = 30000 // a challenger who loses the connection this long forfeits

export const parseDuelCode = (text) => { const n = normalizeCode(text); return n.length === 10 ? Buffer.from(`duel|${n}`) : null }
export const newDuelCode = () => newLobbyCode()
const hashSeed = (s) => crypto.createHash('sha256').update(String(s)).digest('hex')
const cleanName = (n) => String(n || 'Someone').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Someone'
const cleanColor = (c) => (/^#[0-9a-f]{6}$/i.test(String(c)) ? c : '#888888')

// What both players see: the whole duel (teams are on show), which side
// they are, and who still has to choose.
function duelView (d, you) {
  const st = d.state
  const waiting = st ? choosers(st).filter((s) => !d.pending[s]) : []
  return {
    v: PROTOCOL,
    code: d.code,
    you,
    phase: d.phase, // 'waiting' (for a challenger) → 'fighting' → 'over'
    scaled: d.scaled,
    players: { a: d.players.a, b: d.players.b },
    state: st,
    waiting,
    chosen: { a: Boolean(d.pending.a), b: Boolean(d.pending.b) },
    endsIn: d.endsAt ? Math.max(0, d.endsAt - Date.now()) : null,
    log: d.log.slice(-40),
    seeds: d.phase === 'over' ? d.seeds : null
  }
}

export class DuelHost extends EventEmitter {
  // me: { name, color }. team: my team (cards). scaled: a level-scaled duel.
  constructor ({ me, team, scaled = false, settings, swarm = {}, lan = {}, code = newDuelCode() }) {
    super()
    this.code = code
    this.settings = settings
    this.swarmOpts = swarm
    this.lanOpts = lan
    this.isHost = true
    this.keyPair = hcrypto.keyPair()
    this.scaled = Boolean(scaled)
    this.myTeam = cleanTeam(team)
    this.players = { a: { name: cleanName(me.name), color: cleanColor(me.color), team: this.myTeam }, b: null }
    this.phase = 'waiting'
    this.state = null
    this.pending = {}
    this.log = []
    this.seed = crypto.randomBytes(16).toString('hex')
    this.seeds = null
    this.closed = false
  }

  async start () {
    const { topic, key } = codeKeys(parseDuelCode(this.code))
    this.key = key
    this.mesh = new Mesh({
      keyPair: this.keyPair,
      swarm: this.swarmOpts,
      internet: this.settings.get('internet'),
      lan: this.settings.get('lan') ? this.lanOpts : false,
      accept: (remote) => !this.closed && (!this.foe || this.foe === remote),
      isLonely: () => true,
      refreshMs: 10000,
      label: 'duel (hosting)'
    })
    await this.mesh.start()
    this.mesh.on('connection', (socket, remote) => this._connection(socket, remote))
    await this.mesh.join(topic, { server: true, client: false })
    this._changed()
    return this
  }

  _connection (socket, remote) {
    if (this.foe && this.foe !== remote) { socket.destroy(); return }
    const send = channel(socket, {
      key: this.key,
      maxBytes: 64 * 1024,
      onMessage: (msg) => this._message(remote, send, msg),
      onClose: () => this._lost(remote, send)
    })
  }

  _message (id, send, msg) {
    if (msg.type === 'join') {
      if (Number(msg.v) !== PROTOCOL) { send({ type: 'closed', reason: 'That duel is on a different version of wirdwatcher. Update both copies.' }); return send.close() }
      if (this.foe && this.foe !== id) { send({ type: 'closed', reason: 'Someone’s already taken that duel.' }); return send.close() }
      if (this.foe === id) { // back after a dropped connection
        this._swap(send)
        if (!this.state) send({ type: 'welcome', seed: this.seed, scaled: this.scaled })
        return this._changed()
      }
      const team = cleanTeam(msg.team)
      if (!team.length) { send({ type: 'closed', reason: 'You need a Leximon on your team to duel.' }); return send.close() }
      if (!/^[0-9a-f]{64}$/.test(String(msg.commit))) return send.close()
      this.foe = id
      this.commit = msg.commit
      this.players.b = { name: cleanName(msg.name), color: cleanColor(msg.color), team }
      this._swap(send)
      send({ type: 'welcome', seed: this.seed, scaled: this.scaled })
      return
    }
    if (id !== this.foe || this.link !== send) return
    if (msg.type === 'seed') {
      if (this.state || hashSeed(msg.seed) !== this.commit) return
      this.seeds = { a: this.seed, b: String(msg.seed) }
      this.duelSeed = hashSeed(`${this.seed}|${msg.seed}`)
      this.state = newDuel({ a: this.myTeam, b: this.players.b.team }, { scaled: this.scaled })
      this.phase = 'fighting'
      this._note({ t: 'start' })
      this._startTimer()
      return this._changed()
    }
    if (msg.type === 'act') return this._act('b', msg.action)
    if (msg.type === 'leave') return this._quit('b')
  }

  _swap (send) {
    if (this.link && this.link !== send) this.link.close()
    this.link = send
    clearTimeout(this._goneTimer)
  }

  _lost (id, send) {
    if (this.link !== send) return
    this.link = null
    if (this.phase !== 'fighting') { if (this.phase === 'waiting' && !this.state) { this.foe = null; this.players.b = null; this._changed() } return }
    this._note({ t: 'away', side: 'b' })
    this._changed()
    this._goneTimer = setTimeout(() => { if (!this.link) this._quit('b') }, GONE_MS)
    this._goneTimer.unref?.()
  }

  _note (e) { this.log.push({ ...e, at: Date.now() }) }

  _act (s, action) {
    const st = this.state
    if (!st || this.phase !== 'fighting' || !choosers(st).includes(s) || this.pending[s]) return
    if (!validAction(st, s, action)) return
    this.pending[s] = { kind: action.kind, i: Number(action.i), to: Number(action.to) }
    this._maybePlay()
    this._changed()
  }

  _maybePlay () {
    const st = this.state
    const need = choosers(st)
    if (need.some((s) => !this.pending[s])) return
    clearTimeout(this._timer)
    const events = playTurn(st, this.pending, this.duelSeed)
    this.pending = {}
    this.log.push({ t: 'turn', turn: st.turn, events, at: Date.now() })
    if (st.over) return this._end()
    this._startTimer()
  }

  _startTimer () {
    clearTimeout(this._timer)
    this.endsAt = Date.now() + DUEL_TURN_SECS * 1000
    this._timer = setTimeout(() => {
      const st = this.state
      if (!st || st.over) return
      for (const s of choosers(st)) if (!this.pending[s]) this.pending[s] = defaultAction(st, s)
      this._maybePlay()
      this._changed()
    }, DUEL_TURN_SECS * 1000)
    this._timer.unref?.()
  }

  _quit (s) {
    if (this.phase !== 'fighting') return this.close()
    const events = forfeit(this.state, s)
    this.log.push({ t: 'turn', turn: this.state.turn, events, at: Date.now() })
    this._end()
  }

  _end () {
    clearTimeout(this._timer)
    clearTimeout(this._goneTimer)
    this.phase = 'over'
    this.endsAt = null
    this._changed()
  }

  _changed () {
    if (this.closed) return
    this.link?.({ type: 'state', state: duelView(this, 'b') })
    this.emit('state', duelView(this, 'a'))
  }

  // --- the host plays too ---
  act (action) { this._act('a', action) }

  async leave () {
    if (this.phase === 'fighting') this._quit('a')
    return this.close()
  }

  async close (reason = 'The duel’s closed.') {
    if (this.closed) return
    this._changed()
    this.closed = true
    clearTimeout(this._timer)
    clearTimeout(this._goneTimer)
    if (this.link) { this.link({ type: 'closed', reason }); this.link.close() }
    setTimeout(() => this.mesh?.destroy().catch(() => {}), 500).unref?.()
    this.emit('closed', { reason: null })
  }
}

export class DuelClient extends EventEmitter {
  constructor ({ code, me, team, settings, swarm = {}, lan = {} }) {
    super()
    if (!parseDuelCode(code)) throw new Error('Duel codes are 10 letters and numbers, like K7Q2M-9XD4P.')
    this.code = normalizeCode(code).replace(/(.{5})/, '$1-')
    this.me = me
    this.team = cleanTeam(team)
    if (!this.team.length) throw new Error('Put a Leximon on your team first.')
    this.settings = settings
    this.swarmOpts = swarm
    this.lanOpts = lan
    this.isHost = false
    this.keyPair = hcrypto.keyPair()
    this.seed = crypto.randomBytes(16).toString('hex')
    this.state = null
    this.send = null
    this.closed = false
  }

  async start ({ timeoutMs = 45000 } = {}) {
    const { topic, key } = codeKeys(parseDuelCode(this.code))
    this.key = key
    this.mesh = new Mesh({
      keyPair: this.keyPair,
      swarm: this.swarmOpts,
      internet: this.settings.get('internet'),
      lan: this.settings.get('lan') ? { ...this.lanOpts, announce: false, dialAll: true } : false,
      isLonely: () => !this.send,
      refreshMs: 2000,
      label: 'duel (joining)'
    })
    await this.mesh.start()
    await new Promise((resolve, reject) => {
      this._joined = { resolve, reject }
      this._joinTimer = setTimeout(() => { this._joined = null; reject(new Error('Couldn’t find that duel. Check the code, and that the other player still has it open.')); this.leave() }, timeoutMs)
      this.mesh.on('connection', (socket) => this._connection(socket))
      this.mesh.join(topic, { server: false, client: true })
    })
    return this
  }

  _connection (socket) {
    if (this.closed) { socket.destroy(); return }
    const old = this.send
    const send = channel(socket, {
      key: this.key,
      maxBytes: 1024 * 1024,
      onMessage: (msg) => {
        if (this.send !== send) return
        if (msg.type === 'closed') {
          if (this._joined) { clearTimeout(this._joinTimer); this._joined.reject(new Error(msg.reason)); this._joined = null }
          return this._end(msg.reason)
        }
        if (msg.type === 'welcome') {
          this.hostSeed = String(msg.seed || '')
          send({ type: 'seed', seed: this.seed })
        } else if (msg.type === 'state' && msg.state && typeof msg.state === 'object') {
          this.state = msg.state
          this.emit('state', this.state)
          if (this._joined && this.state.phase !== 'waiting') { clearTimeout(this._joinTimer); this._joined.resolve(); this._joined = null }
        }
      },
      onClose: () => {
        if (this.send !== send) return
        this.send = null
        if (!this.closed && !this._joined) {
          clearTimeout(this._lostTimer)
          this._lostTimer = setTimeout(() => { if (!this.send) this._end('Lost the connection to the other player.') }, GONE_MS - 5000)
          this._lostTimer.unref?.()
          this.mesh.refresh()
        }
      }
    })
    this.send = send
    if (old) old.close()
    clearTimeout(this._lostTimer)
    send({ type: 'join', v: PROTOCOL, name: this.me.name, color: this.me.color, team: this.team, commit: hashSeed(this.seed) })
  }

  // The seeds shown at the end are checked against what was sent.
  fair () {
    const s = this.state?.seeds
    return !s || (s.b === this.seed && s.a === this.hostSeed)
  }

  act (action) { this.send?.({ type: 'act', action }) }

  _end (reason) {
    if (this.closed) return
    this.closed = true
    clearTimeout(this._lostTimer)
    clearTimeout(this._joinTimer)
    setTimeout(() => this.mesh?.destroy().catch(() => {}), 300).unref?.()
    this.emit('closed', { reason })
  }

  async leave () {
    if (this.closed) return
    this.send?.({ type: 'leave' })
    this.send?.close()
    this._end(null)
  }
}
