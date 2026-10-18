// Messages over one peer-to-peer connection: length-prefixed JSON, sealed
// with a code's key when there is one.
//
//   frame = u32 length | body      body = JSON, or AES-GCM(JSON) with a key
//
// Every connection is already Noise-encrypted by Hyperswarm's secret-stream.
// Sealing on top of that proves the other side knows the code (a friend code
// or a lobby code), since anyone can find a topic on the network but only
// people with the code can produce messages that open.
//
// A frame bigger than maxBytes, or one that doesn't open, ends the connection.

import { seal, open } from './crypto.js'

export function channel (socket, { key = null, maxBytes = 4 * 1024 * 1024, onMessage, onClose = () => {} }) {
  let buf = Buffer.alloc(0)
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    onClose()
  }
  socket.on('data', (chunk) => {
    if (closed) return
    buf = buf.length ? Buffer.concat([buf, chunk]) : Buffer.from(chunk)
    while (buf.length >= 4) {
      const len = buf.readUInt32BE(0)
      if (len > maxBytes) { socket.destroy(); return close() }
      if (buf.length < 4 + len) return
      const body = buf.subarray(4, 4 + len)
      buf = buf.subarray(4 + len)
      const plain = key ? open(key, body) : body
      let msg = null
      try { msg = plain && JSON.parse(plain.toString('utf8')) } catch {}
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') { socket.destroy(); return close() }
      try { onMessage(msg) } catch (err) { console.error('wirdwatcher: bad message', err) }
    }
  })
  socket.on('close', close)
  socket.on('error', () => {})
  const send = (msg) => {
    if (closed || socket.destroyed) return false
    const json = Buffer.from(JSON.stringify(msg))
    const body = key ? seal(key, json) : json
    const head = Buffer.alloc(4)
    head.writeUInt32BE(body.length)
    socket.write(Buffer.concat([head, body]))
    return true
  }
  // Lets anything already written leave first, then hangs up.
  send.close = () => { socket.end(); setTimeout(() => socket.destroy?.(), 1000).unref?.() }
  return send
}
