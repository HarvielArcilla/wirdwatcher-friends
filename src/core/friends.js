// Friends: adding them with a one-time code, and keeping each other's
// ratings, comments, favorites and playlists up to date whenever you're both
// online. Nothing goes through a server; nothing is stored anywhere but your
// two computers.
//
// Adding a friend (like commonplace's "move to another computer" code):
//   1. You make a friend code. Your computer waits on a meeting place on the
//      network derived from the code, under fresh keys made just for this.
//   2. Your friend types the code. Both sides derive the same meeting place
//      and encryption key from it, so only someone with the code can talk.
//   3. Each side sends its identity key, a random nonce, and a signature
//      (by that identity key) over this connection's two keys, which proves
//      it owns the identity and that the message wasn't replayed from
//      elsewhere.
//   4. Both store the other as a friend with a shared secret made from both
//      nonces. The code stops working (after one use or when it expires).
//
// Staying in sync: each friendship has its own topic, derived from the shared
// secret, and both computers wait on every friend's topic under their
// identity keys. Only friends' keys are let in. On connecting, each says how
// far along it is with the other ("hello, I have up to #N of yours") and the
// other sends everything after N; then changes flow as they happen.

import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import hcrypto from 'hypercore-crypto'
import { Mesh } from './mesh.js'
import { channel } from './channel.js'
import { derive, codeKeys, newFriendCode, parseFriendCode } from './crypto.js'
import { verify } from './identity.js'

const BATCH = 2000
const PROTOCOL = 2

export const friendTopic = (pairSecretHex) => derive('friend-topic', Buffer.from(pairSecretHex, 'hex'))
const pairProof = (fromKey, toKey) => `wirdwatcher/v2/pair|${fromKey}|${toKey}`

export class Friends extends EventEmitter {
  constructor ({ identity, store, settings, swarm = {}, lan = {} }) {
    super()
    this.identity = identity
    this.store = store
    this.settings = settings
    this.swarmOpts = swarm
    this.lanOpts = lan
    this.links = new Map() // userId -> Set(send) (Wi-Fi and internet can both connect)
    this.pairing = null // { code, mesh, expiresAt, timer }
    this._onRecords = (recs) => this._broadcast(recs)
  }

  async start () {
    this.mesh = new Mesh({
      keyPair: this.identity.keyPair,
      swarm: this.swarmOpts,
      internet: this.settings.get('internet'),
      lan: this.settings.get('lan') ? this.lanOpts : false,
      accept: (remote) => Boolean(this.store.friend(remote)),
      isLonely: (topicHex) => !this._topicOnline(topicHex)
    })
    await this.mesh.start()
    this.mesh.on('connection', (socket, remote) => this._link(socket, remote))
    this.store.on('records', this._onRecords)
    // Not awaited: the window can open while the network finds friends.
    for (const f of this.store.listFriends()) this.mesh.join(friendTopic(f.pairSecret)).catch(() => {})
  }

  async stop () {
    this.store.off('records', this._onRecords)
    await this.cancelCode()
    await this.mesh?.destroy()
  }

  _topicOnline (topicHex) {
    const f = this.store.listFriends().find((x) => friendTopic(x.pairSecret).toString('hex') === topicHex)
    return f ? this.links.has(f.userId) : false
  }

  online () { return [...this.links.keys()] }

  list () {
    return this.store.listFriends().map((f) => {
      const data = this.store.friend(f.userId)
      const me = data.records.me?.v || {}
      return { userId: f.userId, name: f.name, color: f.color, addedAt: f.addedAt, lastSeen: f.lastSeen || null, online: this.links.has(f.userId), level: me.level || 1, title: me.title || '', rated: me.rated ?? Object.keys(data.records).filter((k) => k.startsWith('r/')).length, badges: me.badges || 0, match: this.store.tasteMatch(f.userId) }
    })
  }

  // --- sync -----------------------------------------------------------------

  _link (socket, remote) {
    const send = channel(socket, {
      maxBytes: 8 * 1024 * 1024,
      onMessage: (msg) => this._message(remote, send, msg),
      onClose: () => {
        const set = this.links.get(remote)
        if (!set?.delete(send) || set.size) return
        this.links.delete(remote)
        this.store.updateFriendInfo(remote, { lastSeen: Date.now() })
        this.emit('presence')
      }
    })
    if (!this.links.has(remote)) this.links.set(remote, new Set())
    this.links.get(remote).add(send)
    send({ type: 'hello', v: PROTOCOL, have: this.store.friend(remote)?.seq || 0 })
    this.store.updateFriendInfo(remote, { lastSeen: Date.now() })
    this.emit('presence')
  }

  _message (remote, send, msg) {
    if (!this.store.friend(remote)) return send.close()
    if (msg.type === 'hello') {
      const have = Number.isSafeInteger(msg.have) ? msg.have : 0
      const recs = Object.entries(this.store.since(have)).sort((a, b) => a[1].seq - b[1].seq)
      for (let i = 0; i < recs.length; i += BATCH) send({ type: 'records', records: Object.fromEntries(recs.slice(i, i + BATCH)) })
    } else if (msg.type === 'records') {
      const n = this.store.applyFriend(remote, msg.records, { maxRecords: this.settings.get('maxFriendRecords'), maxCommentChars: this.settings.get('maxCommentChars') })
      if (n) this.emit('records', remote)
    } else if (msg.type === 'bye') {
      // They removed me: stop syncing too, and keep nothing of theirs.
      this._forget(remote)
    }
  }

  _broadcast (records) {
    for (const set of this.links.values()) set.values().next().value?.({ type: 'records', records })
  }

  // --- adding friends -----------------------------------------------------------

  // Makes a one-time friend code and waits for someone to use it.
  async makeCode () {
    await this.cancelCode()
    if (this.store.listFriends().length >= this.settings.get('maxFriends')) throw new Error('You’re at your friend limit (Settings → Friends).')
    const code = newFriendCode()
    const { topic, key } = codeKeys(parseFriendCode(code))
    const mesh = new Mesh({ keyPair: hcrypto.keyPair(), swarm: this.swarmOpts, internet: this.settings.get('internet'), lan: this.settings.get('lan') ? this.lanOpts : false })
    const expiresAt = Date.now() + this.settings.get('friendCodeMinutes') * 60000
    const pairing = this.pairing = { code, mesh, expiresAt }
    pairing.timer = setTimeout(() => { if (this.pairing === pairing) { this.cancelCode(); this.emit('code', { code, expired: true }) } }, expiresAt - Date.now())
    pairing.timer.unref?.()
    await mesh.start()
    // One friend per code: the first connection gets it (a second one could
    // be the same friend arriving over Wi-Fi and the internet at once).
    mesh.on('connection', (socket) => {
      if (pairing.taken) return socket.destroy()
      pairing.taken = true
      this._pair(socket, mesh, key, (err, friend) => {
        if (err) { pairing.taken = false; return this.emit('code', { code, error: err.message }) }
        if (this.pairing === pairing) this.cancelCode()
        this.emit('code', { code, friend })
      })
    })
    await mesh.join(topic, { server: true, client: false })
    return { code, expiresAt }
  }

  async cancelCode () {
    const p = this.pairing
    if (!p) return
    this.pairing = null
    clearTimeout(p.timer)
    setTimeout(() => p.mesh.destroy().catch(() => {}), 1500).unref?.() // let the last message leave
  }

  // Uses a friend's code. Resolves with the new friend.
  async redeem (text, { timeoutMs = 60000 } = {}) {
    const secret = parseFriendCode(text)
    if (!secret) throw new Error('That doesn’t look like a friend code. They start with WW.')
    if (this.store.listFriends().length >= this.settings.get('maxFriends')) throw new Error('You’re at your friend limit (Settings → Friends).')
    if (this.pairing?.code && parseFriendCode(this.pairing.code).equals(secret)) throw new Error('That’s your own code. Send it to a friend.')
    const { topic, key } = codeKeys(secret)
    const mesh = new Mesh({ keyPair: hcrypto.keyPair(), swarm: this.swarmOpts, internet: this.settings.get('internet'), lan: this.settings.get('lan') ? { ...this.lanOpts, announce: false, dialAll: true } : false, refreshMs: 2000 })
    await mesh.start()
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Couldn’t reach your friend. Check the code, and that their wirdwatcher is open and showing it.')), timeoutMs)
        let taken = false
        mesh.on('connection', (socket) => {
          if (taken) return socket.destroy()
          taken = true
          this._pair(socket, mesh, key, (err, friend) => { clearTimeout(timer); err ? reject(err) : resolve(friend) })
        })
        mesh.join(topic, { server: false, client: true })
      })
    } finally {
      setTimeout(() => mesh.destroy().catch(() => {}), 1500).unref?.()
    }
  }

  // Both sides of adding a friend run this over the code's connection.
  _pair (socket, mesh, key, done) {
    const myKey = mesh.publicKey
    const theirKey = socket.remotePublicKey.toString('hex')
    const nonce = crypto.randomBytes(32).toString('hex')
    let finished = false
    const finish = (err, value) => { if (!finished) { finished = true; done(err, value) } }
    const send = channel(socket, {
      key,
      maxBytes: 64 * 1024,
      onClose: () => finish(new Error('Your friend’s computer went away before you finished. Try a new code.')),
      onMessage: async (msg) => {
        if (msg.type === 'refused') return finish(new Error(msg.reason || 'Your friend couldn’t add you.'))
        if (msg.type !== 'hello') return
        const userId = String(msg.userId || '')
        if (!/^[0-9a-f]{64}$/.test(userId) || !/^[0-9a-f]{64}$/.test(String(msg.nonce)) || !verify(userId, pairProof(theirKey, myKey), String(msg.sig || ''))) {
          send({ type: 'refused', reason: 'That code was answered by something that isn’t wirdwatcher.' })
          return finish(new Error('The other side couldn’t prove who it is.'))
        }
        if (userId === this.identity.userId) return finish(new Error('That’s your own code. Send it to a friend.'))
        if (!this.store.friend(userId) && this.store.listFriends().length >= this.settings.get('maxFriends')) {
          send({ type: 'refused', reason: 'They’re at their friend limit.' })
          return finish(new Error('You’re at your friend limit (Settings → Friends).'))
        }
        // Same secret on both sides: both nonces, in the order of the user IDs.
        const [a, b] = this.identity.userId < userId ? [nonce, msg.nonce] : [msg.nonce, nonce]
        const pairSecret = derive('pair-secret', Buffer.from(a + b, 'hex')).toString('hex')
        const name = String(msg.name || '').slice(0, 24) || `Watcher ${userId.slice(0, 4).toUpperCase()}`
        const color = /^#[0-9a-f]{6}$/i.test(msg.color) ? msg.color : '#e8c686'
        const old = this.store.friend(userId)
        if (old) await this.mesh?.leave(friendTopic(old.info.pairSecret))
        const friend = this.store.addFriend({ userId, name, color, pairSecret })
        await this.mesh?.join(friendTopic(pairSecret))
        send({ type: 'done' })
        finish(null, friend)
        this.emit('friends')
      }
    })
    const me = this.identity.toPublic()
    send({ type: 'hello', userId: me.userId, name: me.name, color: me.color, nonce, sig: this.identity.sign(pairProof(myKey, theirKey)) })
  }

  // --- removing friends -------------------------------------------------------

  async remove (userId) {
    for (const send of this.links.get(userId) || []) send({ type: 'bye' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    await this._forget(userId)
  }

  async _forget (userId) {
    const f = this.store.friend(userId)
    if (!f) return
    this.store.removeFriend(userId)
    this.links.delete(userId)
    this.mesh?.drop(userId)
    await this.mesh?.leave(friendTopic(f.info.pairSecret))
    this.emit('presence')
    this.emit('friends')
  }
}
