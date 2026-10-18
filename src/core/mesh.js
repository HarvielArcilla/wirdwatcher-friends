// One place on the peer-to-peer network: a key pair and the topics it's on,
// reachable two ways at once, as in commonplace:
//
//   - the internet: Hyperswarm. Peers find each other on a distributed hash
//     table made of users' own machines, punch through NATs, and talk over
//     Noise-encrypted streams. No server of ours is involved (a first-time
//     node asks a few public bootstrap nodes how to join, like any DHT).
//   - the same Wi-Fi: LanTransport, with no internet needed.
//
// Either way a connection arrives as an encrypted duplex stream plus the
// other side's public key, proven by the handshake.
//
// wirdwatcher uses three kinds of mesh: one long-lived one for friends (your
// identity key), a short-lived one for each friend code, and one per lobby
// (fresh keys, so lobby players never learn your identity key).

import { EventEmitter } from 'node:events'
import Hyperswarm from 'hyperswarm'
import hcrypto from 'hypercore-crypto'
import { LanTransport } from './lan.js'

export class Mesh extends EventEmitter {
  // swarm: Hyperswarm options, or a function returning them (tests pass a
  //   local DHT). lan: LanTransport options, or false. accept(remoteHex):
  //   false turns a peer away before anything is said. isLonely(topicHex):
  //   true while nobody is connected for that topic, so it gets looked up
  //   again every refreshMs (two peers joining at the same moment can miss
  //   each other otherwise).
  constructor ({ keyPair = hcrypto.keyPair(), swarm = {}, internet = true, lan = {}, accept = () => true, isLonely = () => true, refreshMs = 15000 } = {}) {
    super()
    this.keyPair = keyPair
    this.publicKey = keyPair.publicKey.toString('hex')
    this.accept = accept
    this.isLonely = isLonely
    this.topics = new Map() // hex -> { topic, opts, discovery }
    this.sockets = new Map() // remoteHex -> Set(socket)
    if (internet) {
      const opts = typeof swarm === 'function' ? swarm() : swarm
      this.swarm = new Hyperswarm({ ...opts, keyPair, firewall: (remote) => !this.accept(remote.toString('hex')) })
      this.swarm.on('connection', (socket) => this._connection(socket, socket.remotePublicKey.toString('hex')))
      this.swarm.on('error', () => {})
    }
    this.lanOpts = lan
    this._timer = setInterval(() => this.refresh(), refreshMs)
    this._timer.unref?.()
  }

  async start () {
    if (this.lanOpts) {
      this.lan = new LanTransport({
        keyPair: this.keyPair,
        topics: () => [...this.topics.values()].map((t) => t.topic),
        onConnection: (stream, remote) => this._connection(stream, remote),
        isConnected: (remote) => this.connected(remote),
        accept: (remote) => this.accept(remote),
        ...this.lanOpts
      })
      try { await this.lan.start() } catch { this.lan = null } // port busy: internet only
    }
    return this
  }

  _connection (socket, remote) {
    socket.on('error', () => {})
    if (!this.accept(remote)) { socket.destroy(); return }
    let set = this.sockets.get(remote)
    if (!set) this.sockets.set(remote, set = new Set())
    set.add(socket)
    socket.once('close', () => {
      set.delete(socket)
      if (!set.size) this.sockets.delete(remote)
      this.emit('disconnect', remote)
    })
    this.emit('connection', socket, remote)
  }

  connected (remote) { return this.sockets.has(remote) }
  get peerCount () { return this.sockets.size }

  // opts: { server, client } as in Hyperswarm. A lobby host is server only;
  // its players are clients only, so they reach the host and not each other.
  async join (topic, { server = true, client = true } = {}) {
    const hex = topic.toString('hex')
    if (this.topics.has(hex)) return
    const entry = { topic, opts: { server, client }, discovery: null }
    this.topics.set(hex, entry)
    if (this.lan && server) this.lan.announce()
    if (!this.swarm) return
    entry.discovery = this.swarm.join(topic, { server, client })
    await entry.discovery.flushed().catch(() => {})
  }

  async leave (topic) {
    const hex = topic.toString('hex')
    if (!this.topics.delete(hex)) return
    if (this.swarm) await this.swarm.leave(topic).catch(() => {})
  }

  refresh () {
    for (const [hex, t] of this.topics) {
      if (t.discovery && this.isLonely(hex)) t.discovery.refresh(t.opts).catch(() => {})
    }
  }

  // Ends every connection with one peer.
  drop (remote) {
    for (const s of this.sockets.get(remote) || []) s.destroy()
  }

  async destroy () {
    clearInterval(this._timer)
    await this.lan?.destroy()
    for (const set of this.sockets.values()) for (const s of set) s.destroy()
    if (this.swarm) await this.swarm.destroy().catch(() => {})
  }
}
