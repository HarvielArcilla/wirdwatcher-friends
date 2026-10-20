// A duel acted out as a battle, beat by beat: who's sent out, who attacks
// with what, the HP after each blow, who faints. Built from the duel's
// result (src/shared/leximon.js), so the bout winner always wins, and from
// a seed of the bout itself, so it plays the same every time.

import { stanceEdge, seededRandom } from './leximon.js'
import { hash32 } from './market.js'

const MOVES = {
  charm: ['Sweet Talk', 'Heartstring', 'Adoration', 'Swoon', 'Love Letter'],
  spite: ['Cutting Remark', 'Sneer', 'Eye Roll', 'Scathing Review', 'Backhanded Compliment'],
  guard: ['Stonewall', 'Deflect', 'Hold Firm', 'Rebuttal', 'Fine Print']
}

export function battleScript (res, foe) {
  const beats = [{ t: 'say', text: `${foe} wants to duel!` }]
  res.bouts.forEach((b, i) => {
    beats.push({ t: 'clear' })
    if (b.b) beats.push({ t: 'send', side: 'foe', card: b.b, text: `${foe} sent out ${up(b.b.word)}!` })
    if (b.a) beats.push({ t: 'send', side: 'me', card: b.a, text: `Go! ${up(b.a.word)}!` })
    if (!b.a || !b.b) {
      beats.push({ t: 'say', text: !b.b ? `${foe} has no one left to send out! ${up(b.a.word)} wins the bout.` : `You have no one left to send out! ${up(b.b.word)} wins the bout.` })
      return
    }
    const rand = seededRandom(hash32(`battle|${b.a.word}|${b.b.word}|${i}|${b.sa}|${b.sb}`))
    const W = b.win ? 'me' : 'foe'
    const L = b.win ? 'foe' : 'me'
    const card = { me: b.a, foe: b.b }
    const score = { me: b.sa, foe: b.sb }
    // The loser lands some blows, more the closer it was; the winner finishes it.
    const close = Math.min(0.92, score[L] / Math.max(0.01, score[W]))
    const blows = 2 + Math.floor(rand() * 2)
    const parts = Array.from({ length: blows }, () => 0.6 + rand())
    const sum = parts.reduce((a, x) => a + x, 0)
    const winHits = parts.map((x) => Math.max(8, Math.round((x / sum) * 100)))
    const loseHit = Math.round((close * 88) / blows)
    const hp = { me: 100, foe: 100 }
    let turn = rand() < 0.55 ? W : L
    let guard = 0
    while (hp[L] > 0 && guard++ < 12) {
      const from = turn
      const to = from === 'me' ? 'foe' : 'me'
      const dmg = from === W ? (winHits.length > 1 ? winHits.shift() : hp[L]) : loseHit
      hp[to] = Math.max(0, hp[to] - (from === L ? Math.min(dmg, hp[to] - 1) : dmg))
      const st = card[from].stance
      const move = MOVES[st][Math.floor(rand() * MOVES[st].length)]
      const edge = stanceEdge(st, card[to].stance)
      const crit = (card[from].rarity?.tier || 0) >= 3 && rand() < 0.25
      beats.push({ t: 'attack', from, to, move, stance: st, hp: { ...hp }, text: `${from === 'me' ? '' : `${foe}’s `}${up(card[from].word)} used ${move}!` })
      if (crit) beats.push({ t: 'say', text: 'A critical hit!' })
      if (edge > 1) beats.push({ t: 'say', text: 'It’s super effective!' })
      else if (edge < 1) beats.push({ t: 'say', text: 'It’s not very effective…' })
      turn = to
    }
    beats.push({ t: 'faint', side: L, text: `${L === 'foe' ? `${foe}’s ` : ''}${up(card[L].word)} fainted!` })
  })
  beats.push({ t: 'end' })
  return beats
}


const up = (w) => String(w || '').toUpperCase()
