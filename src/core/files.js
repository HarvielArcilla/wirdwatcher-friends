// Reading and writing wirdwatcher's data files, carefully, so an update or a
// crash never costs anyone their ratings:
//
//   - writes go to a temporary file first and are then renamed into place,
//     so a file is always either the old version or the new one, never half
//   - a file that can't be read (damaged, or written by something else) is
//     kept as name.damaged-<time> instead of being quietly replaced
//   - a missing file is normal (first launch) and just gives the fallback

import fs from 'node:fs'
import path from 'node:path'

export function readJson (file, fallback) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return fallback
    throw err
  }
  try {
    return JSON.parse(text)
  } catch {
    const keep = `${file}.damaged-${new Date().toISOString().replace(/[:.]/g, '-')}`
    try { fs.renameSync(file, keep) } catch {}
    console.error(`wirdwatcher: ${path.basename(file)} couldn’t be read; kept it as ${path.basename(keep)} and started that file fresh.`)
    return fallback
  }
}

export function writeJson (file, value, { mode, pretty = false } = {}) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, pretty ? 2 : 0), mode ? { mode } : undefined)
  try {
    fs.renameSync(tmp, file)
  } catch (err) {
    // Windows can refuse to rename over a file another program has open for
    // a moment (an antivirus scan, a backup tool); try once more, then write.
    if (process.platform === 'win32') {
      try { fs.rmSync(file, { force: true }); fs.renameSync(tmp, file); return } catch {}
      fs.writeFileSync(file, JSON.stringify(value, null, pretty ? 2 : 0))
      fs.rmSync(tmp, { force: true })
    } else {
      throw err
    }
  }
}
