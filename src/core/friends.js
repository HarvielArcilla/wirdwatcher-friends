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
import { cleanLook } from '../shared/cosmetics.js'
import { netlog, short } from './netlog.js'

const BATCH = 2000
const PROTOCOL = 3
const CHECK_EVERY_MS = 10 * 60 * 1000 // how often friends who stay connected compare notes

export const friendTopic = (pairSecretHex) => derive('friend-topic', Buffer.from(pairSecretHex, 'hex'))
const pairProof = (fromKey, toKey) => `wirdwatcher/v2/pair|${fromKey}|${toKey}`
const lobbyPairProof = (fromSeat, toSeat, nonce) => `wirdwatcher/v2/lobby-pair|${fromSeat}|${toSeat}|${nonce}`

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
      isLonely: (topicHex) => !this._topicOnline(topicHex),
      label: 'friends'
    })
    await this.mesh.start()
    this.mesh.on('connection', (socket, remote) => this._link(socket, remote))
    this.store.on('records', this._onRecords)
    // Not awaited: the window can open while the network finds friends.
    for (const f of this.store.listFriends()) this.mesh.join(friendTopic(f.pairSecret)).catch(() => {})
    this._checker = setInterval(() => {
      for (const [id, set] of this.links) set.values().next().value?.({ type: 'check', ...this.store.friendDigest(id) })
    }, CHECK_EVERY_MS)
    this._checker.unref?.()
  }

  async stop () {
    clearInterval(this._checker)
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
      return { userId: f.userId, name: f.name, color: f.color, addedAt: f.addedAt, lastSeen: f.lastSeen || null, online: this.links.has(f.userId), level: me.level || 1, title: me.title || '', rated: Math.max(Number(me.rated) || 0, Object.entries(data.records).filter(([k, rec]) => k.startsWith('r/') && rec.v !== null).length), badges: me.badges || 0, look: cleanLook(me.look), edition: Math.max(0, Math.floor(Number(me.look?.edition) || 0)), match: this.store.tasteMatch(f.userId) }
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
    send({ type: 'hello', v: PROTOCOL, ...this.store.friendDigest(remote) })
    this.store.updateFriendInfo(remote, { lastSeen: Date.now() })
    this.emit('presence')
  }

  _message (remote, send, msg) {
    if (!this.store.friend(remote)) return send.close()
    if (msg.type === 'hello' || msg.type === 'check') {
      // "I have your records up to #have, n of them." Sync is a diff: send
      // what they're missing after #have. Then two drift checks:
      //   - they have a higher number than I've ever used: my data went back
      //     in time (restored from a backup), so start them over;
      //   - they hold a different count of records up to #have than I do:
      //     something went missing on the way, so send that stretch again.
      const have = Number.isSafeInteger(msg.have) && msg.have >= 0 ? msg.have : 0
      if (have > this.store.mySeq) {
        netlog('friends', short(remote), 'is ahead of my records; starting them over')
        return this._sendAll(send, Object.entries(this.store.upTo(Infinity)), true)
      }
      if (msg.type === 'hello') this._sendAll(send, Object.entries(this.store.since(have)), false)
      if (Number.isSafeInteger(msg.n) && msg.n !== this.store.countUpTo(have) && !send.repaired) {
        send.repaired = true // once per connection, in case they keep fewer on purpose (their limit)
        netlog('friends', short(remote), `has ${msg.n} of ${this.store.countUpTo(have)} of my records; resending`)
        this._sendAll(send, Object.entries(this.store.upTo(have)), false)
      }
    } else if (msg.type === 'records') {
      const n = this.store.applyFriend(remote, msg.records, { maxRecords: this.settings.get('maxFriendRecords'), maxCommentChars: this.settings.get('maxCommentChars'), reset: msg.reset === true })
      if (n) this.emit('records', remote)
    } else if (msg.type === 'bye') {
      // They removed me: stop syncing too, and keep nothing of theirs.
      this._forget(remote)
    }
  }

  _sendAll (send, entries, reset) {
    entries.sort((a, b) => a[1].seq - b[1].seq)
    if (!entries.length && reset) return send({ type: 'records', records: {}, reset: true })
    for (let i = 0; i < entries.length; i += BATCH) send({ type: 'records', records: Object.fromEntries(entries.slice(i, i + BATCH)), ...(reset && i === 0 ? { reset: true } : {}) })
  }

  _broadcast (records) {
    for (const set of this.links.values()) set.values().next().value?.({ type: 'records', records })
  }

  // --- adding friends -----------------------------------------------------------

  // Adding a friend with a code. Both computers wait on the code's meeting
  // place AND look for each other there, over the internet and the same
  // Wi-Fi, so whichever direction gets through is enough: a computer that
  // can't be reached (a strict firewall, an awkward router) can still reach
  // out. Each side picks one nonce for the whole attempt, so if several
  // connections form, or one drops halfway, every one of them agrees on the
  // same friendship. The handshake is a single message each way; everything
  // else (ratings, comments, playlists) follows later through ordinary sync.

  // Makes a one-time friend code and waits for someone to use it.
  async makeCode () {
    await this.cancelCode()
    if (this.store.listFriends().length >= this.settings.get('maxFriends')) throw new Error('You’re at your friend limit (Settings → Friends).')
    const code = newFriendCode()
    const { topic, key } = codeKeys(parseFriendCode(code))
    const mesh = new Mesh({ keyPair: hcrypto.keyPair(), swarm: this.swarmOpts, internet: this.settings.get('internet'), lan: this.settings.get('lan') ? this.lanOpts : false, refreshMs: 4000, label: 'friend code (made)' })
    const expiresAt = Date.now() + this.settings.get('friendCodeMinutes') * 60000
    const session = { nonce: crypto.randomBytes(32).toString('hex'), friend: null }
    const pairing = this.pairing = { code, mesh, expiresAt, session }
    mesh.isLonely = () => !session.friend
    pairing.timer = setTimeout(() => { if (this.pairing === pairing) { this.cancelCode(); this.emit('code', { code, expired: true }) } }, expiresAt - Date.now())
    pairing.timer.unref?.()
    await mesh.start()
    mesh.on('connection', (socket) => {
      if (session.friend) return socket.destroy()
      this._pair(socket, mesh, key, session, (err, friend) => {
        if (err) { netlog('friend code (made)', 'handshake failed:', err.message); if (!session.friend && !err.transient && !err.quiet) this.emit('code', { code, error: err.message }); return }
        if (this.pairing === pairing) this.cancelCode()
        if (!session.announced) { session.announced = true; this.emit('code', { code, friend }) }
      }, { open: () => this.pairing === pairing && Date.now() < expiresAt, role: 'maker' })
    })
    await mesh.join(topic, { server: true, client: true })
    return { code, expiresAt }
  }

  // The code being shown right now, if there is one, so the screen can show
  // it again after you've been elsewhere in the app.
  currentCode () {
    const p = this.pairing
    return p && Date.now() < p.expiresAt ? { code: p.code, expiresAt: p.expiresAt } : null
  }

  async cancelCode () {
    const p = this.pairing
    if (!p) return
    this.pairing = null
    clearTimeout(p.timer)
    setTimeout(() => p.mesh.destroy().catch(() => {}), 3000).unref?.() // let the last messages leave
  }

  // Uses a friend's code. Resolves with the new friend.
  async redeem (text, { timeoutMs = 90000 } = {}) {
    const secret = parseFriendCode(text)
    if (!secret) throw new Error('That doesn’t look like a friend code. They start with WW.')
    if (this.store.listFriends().length >= this.settings.get('maxFriends')) throw new Error('You’re at your friend limit (Settings → Friends).')
    if (this.pairing?.code && parseFriendCode(this.pairing.code).equals(secret)) throw new Error('That’s your own code. Send it to a friend.')
    const { topic, key } = codeKeys(secret)
    const session = { nonce: crypto.randomBytes(32).toString('hex'), friend: null }
    const mesh = new Mesh({ keyPair: hcrypto.keyPair(), swarm: this.swarmOpts, internet: this.settings.get('internet'), lan: this.settings.get('lan') ? { ...this.lanOpts, dialAll: true } : false, refreshMs: 2000, isLonely: () => !session.friend, label: 'friend code (used)' })
    await mesh.start()
    try {
      return await new Promise((resolve, reject) => {
        let lastError = null
        const timer = setTimeout(() => reject(lastError || new Error('Couldn’t reach your friend. Check the code, and that their wirdwatcher is open and showing it. If it keeps failing, try it the other way round: you make the code and they type it. Or add each other from a lobby.')), timeoutMs)
        mesh.on('connection', (socket) => {
          if (session.friend) return socket.destroy()
          this._pair(socket, mesh, key, session, (err, friend) => {
            if (err) { if (!err.transient && !err.quiet) lastError = err; netlog('friend code (used)', 'handshake failed:', err.message); if (err.final) { clearTimeout(timer); reject(err) } return }
            clearTimeout(timer)
            resolve(friend)
          }, { role: 'guest' })
        })
        mesh.join(topic, { server: true, client: true })
      })
    } finally {
      setTimeout(() => mesh.destroy().catch(() => {}), 3000).unref?.()
    }
  }

  // One handshake over one of the code's connections. `session` is shared by
  // every connection in the same attempt: the first one to finish makes the
  // friendship, and the rest just close.
  //
  // Each side sends a signed hello, and answers a good hello from the other
  // with "done". A side stores the friendship only once it has both the
  // other's hello and their "done", so nobody ends up friends on their own.
  // A code that has already made a friendship, or has run out of time,
  // refuses anyone else. open(): whether this code may still be used.
  _pair (socket, mesh, key, session, done, { open = () => true, role = 'maker' } = {}) {
    const myKey = mesh.publicKey
    const theirKey = socket.remotePublicKey.toString('hex')
    let finished = false
    let theirs = null // their hello, checked
    let accepted = false // they said "done"
    const finish = (err, value) => { if (!finished) { finished = true; done(err, value) } }
    const settle = () => {
      if (!theirs || !accepted || finished) return
      if (!session.friend) {
        session.friendId = theirs.userId
        session.friend = this._befriend({ userId: theirs.userId, name: theirs.name, color: theirs.color, myNonce: session.nonce, theirNonce: theirs.nonce })
      }
      finish(null, session.friend)
    }
    const send = channel(socket, {
      key,
      maxBytes: 64 * 1024,
      onClose: () => finish(Object.assign(new Error('Your friend’s computer went away before you finished. Try a new code.'), { transient: true })),
      onMessage: (msg) => {
        if (msg.type === 'refused') return finish(Object.assign(new Error(msg.reason || 'Your friend couldn’t add you.'), { final: true }))
        if (msg.type === 'done') { accepted = true; return settle() }
        if (msg.type !== 'hello' || theirs) return
        const userId = String(msg.userId || '')
        if (!/^[0-9a-f]{64}$/.test(userId) || !/^[0-9a-f]{64}$/.test(String(msg.nonce)) || !verify(userId, pairProof(theirKey, myKey), String(msg.sig || ''))) {
          send({ type: 'refused', reason: 'That code was answered by something that isn’t wirdwatcher.' })
          return finish(new Error('The other side couldn’t prove who it is.'))
        }
        if (userId === this.identity.userId) return finish(Object.assign(new Error('That’s your own code. Send it to a friend.'), { final: true }))
        // Two people using the same code meet each other too: a guest only
        // pairs with the code's maker (older copies don't say, and are makers).
        if (role === 'guest' && msg.role === 'guest') return finish(Object.assign(new Error('Met someone else using the same code.'), { quiet: true, transient: true }))
        // Someone else, after the code has already made a friend.
        if (session.friendId && session.friendId !== userId) {
          send({ type: 'refused', reason: 'That code has already been used. Ask for a new one.' })
          return finish(Object.assign(new Error('Someone else tried a code that was already used.'), { quiet: true }))
        }
        if (!session.friendId && !open()) {
          send({ type: 'refused', reason: 'That code has expired. Ask for a new one.' })
          return finish(Object.assign(new Error('Someone tried an expired code.'), { quiet: true }))
        }
        if (!this.store.friend(userId) && this.store.listFriends().length >= this.settings.get('maxFriends')) {
          send({ type: 'refused', reason: 'They’re at their friend limit.' })
          return finish(Object.assign(new Error('You’re at your friend limit (Settings → Friends).'), { final: true }))
        }
        theirs = { userId, name: msg.name, color: msg.color, nonce: String(msg.nonce) }
        send({ type: 'done' })
        settle()
      }
    })
    const me = this.identity.toPublic()
    send({ type: 'hello', role, userId: me.userId, name: me.name, color: me.color, nonce: session.nonce, sig: this.identity.sign(pairProof(myKey, theirKey)) })
  }

  // Both sides have each other's identity and nonce: they're friends. The
  // shared secret is made from both nonces in the order of the user IDs, so
  // both sides make the same one. Data follows through sync.
  _befriend ({ userId, name, color, myNonce, theirNonce }) {
    const [a, b] = this.identity.userId < userId ? [myNonce, theirNonce] : [theirNonce, myNonce]
    const pairSecret = derive('pair-secret', Buffer.from(a + b, 'hex')).toString('hex')
    const old = this.store.friend(userId)
    const friend = this.store.addFriend({ userId, name: String(name || '').slice(0, 24) || `Watcher ${userId.slice(0, 4).toUpperCase()}`, color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#e8c686', pairSecret })
    netlog('friends', 'new friend', short(userId))
    this.emit('friends')
    if (old && old.info.pairSecret !== pairSecret) this.mesh?.leave(friendTopic(old.info.pairSecret)).catch(() => {})
    this.mesh?.join(friendTopic(pairSecret)).catch(() => {})
    return friend
  }

  // --- adding friends at a lobby table --------------------------------------
  //
  // Two people at the same table can become friends without a code: the
  // lobby connection already works, so the two hellos travel through it.
  // Each hello is signed by its sender's identity and names both seats, so
  // the host passing it along can't forge or redirect one.

  lobbyHello (fromSeat, toSeat) {
    const nonce = crypto.randomBytes(32).toString('hex')
    const me = this.identity.toPublic()
    return { hello: { userId: me.userId, name: me.name, color: me.color, nonce, sig: this.identity.sign(lobbyPairProof(fromSeat, toSeat, nonce)) }, nonce }
  }

  // Checks a hello that came through a lobby. Returns the sender's userId.
  checkLobbyHello (hello, fromSeat, toSeat) {
    const userId = String(hello?.userId || '')
    if (!/^[0-9a-f]{64}$/.test(userId) || !/^[0-9a-f]{64}$/.test(String(hello?.nonce)) || !verify(userId, lobbyPairProof(fromSeat, toSeat, hello.nonce), String(hello.sig || ''))) throw new Error('That friend request couldn’t be checked.')
    if (userId === this.identity.userId) throw new Error('That’s you.')
    if (!this.store.friend(userId) && this.store.listFriends().length >= this.settings.get('maxFriends')) throw new Error('You’re at your friend limit (Settings → Friends).')
    return userId
  }

  befriendFromLobby (hello, myNonce) {
    return this._befriend({ userId: hello.userId, name: hello.name, color: hello.color, myNonce, theirNonce: hello.nonce })
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
