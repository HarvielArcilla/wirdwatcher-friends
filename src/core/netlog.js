// A small log of what the network did, kept in the data folder as
// network.log, for working out why two computers couldn't reach each other.
// It never holds codes, keys or addresses: peers and topics appear as a few
// characters of a hash, so the log is safe to send to someone helping you.
//
// The file is capped: past 256 KB it moves to network.log.1 (replacing the
// one before) and starts again.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const MAX_BYTES = 256 * 1024
let file = null
let written = 0

export function setNetlogFolder (dir) {
  file = dir ? path.join(dir, 'network.log') : null
  try { written = file && fs.existsSync(file) ? fs.statSync(file).size : 0 } catch { written = 0 }
}

export function netlog (...parts) {
  if (!file) return
  const line = `${new Date().toISOString()} ${parts.join(' ')}\n`
  try {
    if (written + line.length > MAX_BYTES) {
      fs.renameSync(file, `${file}.1`)
      written = 0
    }
    fs.appendFileSync(file, line)
    written += line.length
  } catch {}
}

// A short, stable stand-in for a key or topic: enough to tell two apart in
// the log, useless for anything else.
export const short = (x) => crypto.createHash('sha256').update(String(Buffer.isBuffer(x) ? x.toString('hex') : x)).digest('hex').slice(0, 6)
