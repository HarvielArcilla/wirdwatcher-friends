// A small seeded random number generator (mulberry32), so a floor, a room
// or a whole run comes out the same from the same seed. Its state is one
// number, so it saves with the run.

export function hashString (s) {
  let h = 1779033703 ^ String(s).length
  for (let i = 0; i < String(s).length; i++) {
    h = Math.imul(h ^ String(s).charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

// A number in [0, 1) that only depends on the text.
export const hash01 = (s) => hashString(s) / 4294967296

export class Rng {
  constructor (seed) { this.s = typeof seed === 'number' ? seed >>> 0 : hashString(seed) }
  next () {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  int (n) { return Math.floor(this.next() * n) }
  range (a, b) { return a + this.next() * (b - a) }
  chance (p) { return this.next() < p }
  pick (arr) { return arr[this.int(arr.length)] }
  // Weighted: items are [value, weight].
  weighted (items) {
    const total = items.reduce((a, [, w]) => a + w, 0)
    let r = this.next() * total
    for (const [v, w] of items) { if ((r -= w) < 0) return v }
    return items[items.length - 1][0]
  }

  shuffle (arr) {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) { const j = this.int(i + 1); [a[i], a[j]] = [a[j], a[i]] }
    return a
  }
}
