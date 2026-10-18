// Who you are: a keypair made on first launch, a name and a color.
//
// The Ed25519 public key is your user ID. It is also the key your computer
// uses on the peer-to-peer network, so when a friend's computer connects,
// the encrypted handshake itself proves it is them (nobody else has the
// private key). There is no account and no server. Names aren't unique;
// keys are.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import hcrypto from 'hypercore-crypto'

export const COLORS = ['#e8c686', '#e88a6b', '#7fc4a8', '#8ab4e8', '#c49ae8', '#e89ac0', '#a8d46f', '#6fd4d4']

export function keyPairFromSeed (seedHex) {
  return hcrypto.keyPair(Buffer.from(seedHex, 'hex'))
}

export class Identity {
  constructor (dir) {
    this.file = path.join(dir, 'identity.json')
    fs.mkdirSync(dir, { recursive: true })
    let saved = null
    try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch {}
    if (!saved?.seed) {
      saved = { version: 2, seed: crypto.randomBytes(32).toString('hex'), name: '', color: null, createdAt: Date.now() }
    }
    this.saved = saved
    this.keyPair = keyPairFromSeed(saved.seed)
    if (!saved.color) saved.color = COLORS[this.keyPair.publicKey[0] % COLORS.length]
    this._write()
  }

  get userId () { return this.keyPair.publicKey.toString('hex') }
  get name () { return this.saved.name || `Watcher ${this.userId.slice(0, 4).toUpperCase()}` }
  get color () { return this.saved.color }
  get hasChosenName () { return Boolean(this.saved.name) }
  get createdAt () { return this.saved.createdAt }

  update ({ name, color } = {}) {
    if (typeof name === 'string') this.saved.name = name.replace(/\s+/g, ' ').trim().slice(0, 24)
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) this.saved.color = color.toLowerCase()
    this._write()
    return this.toPublic()
  }

  sign (text) { return hcrypto.sign(Buffer.from(text), this.keyPair.secretKey).toString('hex') }

  toPublic () {
    return { userId: this.userId, name: this.name, color: this.color, hasChosenName: this.hasChosenName, createdAt: this.createdAt }
  }

  _write () {
    fs.writeFileSync(this.file, JSON.stringify(this.saved, null, 2), { mode: 0o600 })
  }
}

export function verify (userIdHex, text, signatureHex) {
  try {
    return hcrypto.verify(Buffer.from(text), Buffer.from(signatureHex, 'hex'), Buffer.from(userIdHex, 'hex'))
  } catch {
    return false
  }
}
