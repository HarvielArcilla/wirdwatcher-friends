// Key derivation, sealing, and the human-typeable codes wirdwatcher uses.
//
// A code is a secret. Everything a code is used for is derived from it:
//   topic - the 32-byte meeting place on the peer-to-peer network
//   key   - AES-256-GCM key for every message sent while using the code
// So knowing where people meet doesn't let anyone read or join: only people
// who were given the code can.
//
// Codes are Crockford base32 (no I, L, O or U, so nothing is misread), in
// groups of five, and forgiving about case, spaces and dashes:
//
//   friend code   WW-XXXXX-XXXXX-XXXXX-XXXXX   100 bits, one-time, 15 minutes
//   lobby code    XXXXX-XXXXX                  50 bits, lasts while the lobby is open

import crypto from 'node:crypto'

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const NONCE_BYTES = 12
const TAG_BYTES = 16

export function derive (label, secret, length = 32) {
  return crypto.createHash('sha256').update(`wirdwatcher/v2/${label}`).update(secret).digest().subarray(0, length)
}

function randomCode (chars) {
  const bytes = crypto.randomBytes(chars)
  let out = ''
  for (let i = 0; i < chars; i++) out += ALPHABET[bytes[i] & 31]
  return out
}

const group = (s) => s.match(/.{1,5}/g).join('-')

// Upper-cases and maps look-alikes (O→0, I/L→1), drops everything else.
export function normalizeCode (text) {
  return String(text || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-HJKMNP-TV-Z]/g, '')
}

export function newFriendCode () { return `WW-${group(randomCode(20))}` }
export function newLobbyCode () { return group(randomCode(10)) }

// Returns the secret bytes behind a code, or null if it isn't one.
export function parseFriendCode (text) {
  let n = normalizeCode(text)
  if (n.length === 22 && n.startsWith('WW')) n = n.slice(2)
  return n.length === 20 ? Buffer.from(`friend|${n}`) : null
}

export function parseLobbyCode (text) {
  const n = normalizeCode(text)
  return n.length === 10 ? Buffer.from(`lobby|${n}`) : null
}

export function codeKeys (secret) {
  return { topic: derive('topic', secret), key: derive('key', secret) }
}

export function seal (key, plaintext) {
  const nonce = crypto.randomBytes(NONCE_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce)
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([nonce, body, cipher.getAuthTag()])
}

// null instead of throwing, so junk from the network is quietly dropped.
export function open (key, sealed) {
  if (!sealed || sealed.length < NONCE_BYTES + TAG_BYTES) return null
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, sealed.subarray(0, NONCE_BYTES))
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES))
    return Buffer.concat([decipher.update(sealed.subarray(NONCE_BYTES, sealed.length - TAG_BYTES)), decipher.final()])
  } catch {
    return null
  }
}
