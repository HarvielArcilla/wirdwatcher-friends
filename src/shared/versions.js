// Comparing versions and reading release checksums, for the updater
// (src/main/updater.js). Plain functions, so they can be tested.

// Is version a newer than b? (1.2.10 > 1.2.9; a pre-release is older than its release.)
export function newer (a, b) {
  const parse = (v) => {
    const [main, pre] = String(v).replace(/^v/, '').split('-')
    return { n: main.split('.').map((x) => parseInt(x, 10) || 0), pre: pre || null }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < 3; i++) if ((x.n[i] || 0) !== (y.n[i] || 0)) return (x.n[i] || 0) > (y.n[i] || 0)
  if (x.pre && !y.pre) return false
  if (!x.pre && y.pre) return true
  return Boolean(x.pre && y.pre && x.pre > y.pre)
}

// The sha512 for one file in an electron-builder latest*.yml.
export function shaFor (yml, file) {
  const lines = String(yml).split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*-?\s*url:\s*(\S+)/)
    if (m && m[1] === file) {
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        const s = lines[j].match(/^\s*sha512:\s*(\S+)/)
        if (s) return s[1]
      }
    }
  }
  return null
}
