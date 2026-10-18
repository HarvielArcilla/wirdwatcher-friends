// Same-network transport, after commonplace's: computers on one Wi-Fi find
// each other and connect directly, with no internet at all.
//
// Each computer that wants to be found multicasts a small announcement every
// few seconds:
//
//   'WWL2' | public key (32) | TCP port (u16) | nonce (16) | tags (16 each)
//
// A tag is HMAC(topic, nonce) for each topic it's on (a friendship or a
// lobby), so a computer on the same topic recognizes it and nobody else
// learns anything (the nonce changes every time). The connection then runs
// the same Noise handshake as the internet transport (Hyperswarm's
// secret-stream), authenticated by the announced key, so the code above
// can't tell the two transports apart.
//
// Who dials: by default the computer with the smaller key, so two computers
// don't both connect. A lobby is a star around its host instead: the host
// announces (announce: true) and players dial it (announce: false,
// dialAll: true) and never each other.

import dgram from 'node:dgram'
import net from 'node:net'
import crypto from 'node:crypto'
import os from 'node:os'
import SecretStream from '@hyperswarm/secret-stream'

const MAGIC = Buffer.from('WWL2')
export const LAN_GROUP = '239.255.77.18'
export const LAN_PORT = 47616
const HEAD = 4 + 32 + 2 + 16
const MAX_TAGS = 80 // keeps an announcement within one UDP packet

const tagFor = (topic, nonce) => crypto.createHmac('sha256', topic).update(nonce).digest().subarray(0, 16)

export class LanTransport {
  constructor ({ keyPair, topics = () => [], onConnection, isConnected = () => false, accept = () => true, announce = true, dialAll = false, group = LAN_GROUP, port = LAN_PORT, intervalMs = 3000 }) {
    this.keyPair = keyPair
    this.topics = topics
    this.onConnection = onConnection
    this.isConnected = isConnected
    this.accept = accept
    this.announcing = announce
    this.dialAll = dialAll
    this.group = group
    this.port = port
    this.intervalMs = intervalMs
    this.dialing = new Set()
    this.streams = new Set()
    this.closed = false
  }

  async start () {
    this.server = net.createServer((socket) => this._accept(socket))
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, () => resolve()) })
    this.server.on('error', () => {})
    this.udp = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this.udp.on('message', (msg, from) => this._onAnnounce(msg, from))
    // If the port can't be had (another program, or a firewall), give up on
    // same-network discovery instead of waiting forever; the internet still works.
    await new Promise((resolve, reject) => {
      this.udp.once('error', reject)
      this.udp.bind({ port: this.port, exclusive: false }, () => { this.udp.off('error', reject); resolve() })
    })
    this.udp.on('error', () => {}) // later network hiccups: stay quiet
    try { this.udp.setMulticastLoopback(true) } catch {}
    this._join()
    this.timer = setInterval(() => this.announce(), this.intervalMs)
    this.timer.unref?.()
    this.announce()
  }

  // Every IPv4 interface, loopback included. Joining and announcing on each
  // one (not just the system's default) matters on computers with a VPN or
  // several adapters, where the default route isn't the Wi-Fi.
  _interfaces () {
    const out = []
    for (const list of Object.values(os.networkInterfaces())) {
      for (const a of list || []) if (a.family === 'IPv4' || a.family === 4) out.push(a.address)
    }
    return out.length ? out : ['127.0.0.1']
  }

  _join () {
    const ifaces = this._interfaces()
    const key = ifaces.join(',')
    if (key === this._joined) return
    for (const addr of ifaces) {
      if (this._joinedSet?.has(addr)) continue
      try { this.udp.addMembership(this.group, addr) } catch {}
    }
    try { this.udp.addMembership(this.group) } catch {} // and the default, for good measure
    this._joinedSet = new Set(ifaces)
    this._joined = key
  }

  announce () {
    if (this.closed || !this.announcing) return
    const topics = this.topics()
    for (let i = 0; i < topics.length; i += MAX_TAGS) {
      const nonce = crypto.randomBytes(16)
      const head = Buffer.alloc(HEAD)
      MAGIC.copy(head, 0)
      Buffer.from(this.keyPair.publicKey).copy(head, 4)
      head.writeUInt16BE(this.server.address().port, 36)
      nonce.copy(head, 38)
      const tags = topics.slice(i, i + MAX_TAGS).map((t) => tagFor(t, nonce))
      const packet = Buffer.concat([head, ...tags])
      // Out of every interface: the network you share with a friend may not
      // be the one the system would pick.
      // One at a time: the interface applies to the next send, and sends
      // are asynchronous.
      const ifaces = this._interfaces()
      const next = (i) => {
        if (i >= ifaces.length || this.closed) return
        try { this.udp.setMulticastInterface(ifaces[i]) } catch {}
        try { this.udp.send(packet, this.port, this.group, () => next(i + 1)) } catch { next(i + 1) }
      }
      next(0)
    }
    this._join() // Wi-Fi changed, a VPN came up: pick up new interfaces
  }

  _onAnnounce (msg, from) {
    if (this.closed || msg.length < HEAD || !msg.subarray(0, 4).equals(MAGIC) || (msg.length - HEAD) % 16) return
    const key = msg.subarray(4, 36)
    const mine = Buffer.from(this.keyPair.publicKey)
    if (key.equals(mine)) return
    if (!this.dialAll && Buffer.compare(mine, key) > 0) return
    const keyHex = key.toString('hex')
    if (this.dialing.has(keyHex) || this.isConnected(keyHex) || !this.accept(keyHex)) return
    const nonce = msg.subarray(38, 54)
    const tags = new Set()
    for (let off = HEAD; off < msg.length; off += 16) tags.add(msg.subarray(off, off + 16).toString('hex'))
    if (!this.topics().some((t) => tags.has(tagFor(t, nonce).toString('hex')))) return
    this._dial(from.address, msg.readUInt16BE(36), Buffer.from(key))
  }

  _dial (host, port, remotePublicKey) {
    const keyHex = remotePublicKey.toString('hex')
    this.dialing.add(keyHex)
    const socket = net.connect({ host, port })
    socket.setNoDelay(true)
    socket.on('error', () => {})
    const stream = new SecretStream(true, socket, { keyPair: this.keyPair, remotePublicKey })
    const done = () => this.dialing.delete(keyHex)
    stream.on('error', done)
    stream.on('close', done)
    stream.once('open', () => { done(); this._hand(stream) })
    setTimeout(() => { if (!stream.opened) stream.destroy() }, 10000).unref?.()
  }

  _accept (socket) {
    socket.setNoDelay(true)
    socket.on('error', () => {})
    const stream = new SecretStream(false, socket, { keyPair: this.keyPair })
    stream.on('error', () => {})
    stream.once('open', () => {
      const remote = Buffer.from(stream.remotePublicKey).toString('hex')
      if (!this.accept(remote)) { stream.destroy(); return }
      this._hand(stream)
    })
    setTimeout(() => { if (!stream.opened) stream.destroy() }, 10000).unref?.()
  }

  _hand (stream) {
    if (this.closed) { stream.destroy(); return }
    stream.on('error', () => {})
    this.streams.add(stream)
    stream.once('close', () => this.streams.delete(stream))
    this.onConnection(stream, Buffer.from(stream.remotePublicKey).toString('hex'))
  }

  async destroy () {
    this.closed = true
    clearInterval(this.timer)
    try { this.udp?.close() } catch {}
    this.server?.close()
    for (const s of this.streams) s.destroy()
  }
}
