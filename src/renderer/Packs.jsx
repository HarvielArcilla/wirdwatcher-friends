import { useEffect, useMemo, useRef, useState } from 'react'
import { Coins } from './ui.jsx'
import { COSMETICS, KINDS } from '../shared/cosmetics.js'
import { packPool, packOdds, cardValue, cardWeight, craftCost, RARITIES, BONUS_MIN } from '../shared/packs.js'
import { formatCoins } from '../shared/economy.js'
import { burst, centerOf } from './effects.js'
import { Preview } from './Shop.jsx'
import { synth } from './sound.js'

// Card packs: three cards of looks each, opened like a crate: three reels of
// cards spin past a marker and slow to a stop on what you got. A free
// one comes every five levels; more cost coins. Odds are on the page, the
// third card is always rare or better, and a duplicate becomes scraps that
// craft whatever you like.

const RNAME = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' }
const pctText = (p) => (p <= 0 ? '0%' : p < 0.001 ? '<0.1%' : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`)
const oneIn = (p) => (p <= 0 ? 'never' : p >= 0.5 ? 'most packs' : `1 in ${formatCoins(Math.round(1 / p))} packs`)

export default function Packs ({ v, coins, act, settings }) {
  const pk = v.packs
  const [res, setRes] = useState(null)
  const [shown, setShown] = useState(0) // cards turned over
  const [busy, setBusy] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [craftKind, setCraftKind] = useState('all')
  const owned = useMemo(() => new Set(v.owned), [v.owned])

  const open = async (free, el) => {
    setBusy(true)
    const out = await act('openPack', { free })
    setBusy(false)
    if (!out) return
    setRes(out)
    setShown(0)
    setRolling(true)
    void el
  }
  const pool = packPool()
  const odds = useMemo(() => packOdds(pk.price), [pk.price])
  const craftable = pool.filter((c) => !owned.has(`${c.kind}:${c.id}`) && (craftKind === 'all' || c.kind === craftKind))
    .sort((a, b) => cardValue(a) - cardValue(b) || a.name.localeCompare(b.name))
  const rarest = pool.filter((c) => !owned.has(`${c.kind}:${c.id}`)).reduce((x, c) => (!x || cardValue(c) > cardValue(x) ? c : x), null)
  const kindsInPool = KINDS.filter((k) => pool.some((c) => c.kind === k.id))
  const left = pool.filter((c) => !owned.has(`${c.kind}:${c.id}`)).length

  return (
    <div className='packs'>
      <section className='pk-stage'>
        <div className='pk-buy'>
          <div className='pk-pack' aria-hidden='true'><span>wirdwatcher</span><b>Card pack</b><i>3 cards</i></div>
          <div className='pk-acts'>
            <button className='btn primary' disabled={busy || rolling || pk.free < 1} onClick={(e) => open(true, e.currentTarget)}>
              {pk.free > 0 ? `Open a free pack (${pk.free})` : 'No free packs'}
            </button>
            <button className='btn' disabled={busy || rolling || coins < pk.price} onClick={(e) => open(false, e.currentTarget)}>Buy and open · <Coins n={pk.price} /></button>
            <small>{pk.free > 0 ? 'Free packs never expire.' : `Next free pack at level ${pk.nextFreeAt}.`} A card worth at least the pack is guaranteed within {pk.toPity} more pack{pk.toPity === 1 ? '' : 's'}.</small>
          </div>
          <div className='pk-stats'>
            <span><b>{pk.opened}</b><small>opened</small></span>
            <span><b>{formatCoins(pk.scraps)}</b><small>scraps</small></span>
            <span><b>{left}</b><small>still to find</small></span>
          </div>
        </div>
        {res && rolling && <Crate key={res.cards.map((c) => c.id).join()} cards={res.cards} price={pk.price} settings={settings} onDone={() => { setRolling(false); setShown(3) }} />}
        {res && !rolling && (
          <div className='pk-reveal'>
            {res.cards.map((c, i) => {
              const full = COSMETICS.find((x) => x.kind === c.kind && x.id === c.id)
              return (
                <div key={`${i}${c.id}`} data-i={i} className={`pk-card r-${c.rarity} ${i < shown ? 'up' : ''}`}>
                  <div className='pk-face back' aria-hidden='true'><span>ww</span></div>
                  <div className='pk-face front'>
                    <small className='pk-rar'>{RNAME[c.rarity]}</small>
                    <div className='pk-art'>{full && <Preview c={full} />}</div>
                    <b>{c.name}</b>
                    <small>{String(c.kindName || c.kind).replace(/s$/, '')}</small>
                    <small className='pk-val'>worth <Coins n={c.value} /></small>
                    {c.dup ? <span className='pk-dup'>Duplicate · +{formatCoins(c.scraps)} scraps</span> : <span className='pk-new'>New!</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className='pk-grid'>
        <section className='panel pk-odds'>
          <h3>The odds <small>at <Coins n={pk.price} /> a pack</small></h3>
          <table>
            <thead><tr><th /><th>Cards 1–2</th><th>Bonus card</th></tr></thead>
            <tbody>
              {RARITIES.map((r) => (
                <tr key={r}>
                  <th><span className={`pk-dot r-${r}`} />{RNAME[r]}</th>
                  <td>{pctText(odds.main[r])}</td>
                  <td>{pctText(odds.bonus[r])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className='pk-facts'>
            <span><b>{pctText(odds.worthPack)}</b><small>of packs hold a card worth what the pack cost</small></span>
            {rarest && <span><b>{oneIn(odds.cardChance(rarest))}</b><small>for the priciest card you don’t have ({rarest.name}, <Coins n={cardValue(rarest)} />)</small></span>}
          </div>
          <small>A card’s chance depends on what it’s worth next to the pack: anything up to half the pack’s price is equally likely, and beyond that each doubling in value makes it about 2.8 times rarer. The bonus card is always worth at least a quarter of the pack. Packs cost about fifteen minutes of the wirdhouse, so the rare things come within reach as it grows. If {pk.pity} packs in a row hold nothing worth the pack, the next one’s bonus card is. Duplicates give a quarter of their value in scraps; crafting costs the full value. Never level, badge or edition rewards: those stay earned. Looks only.</small>
        </section>

        <section className='panel pk-craft'>
          <div className='pk-craft-head'>
            <h3>Craft with scraps <small>{formatCoins(pk.scraps)} to spend</small></h3>
            <select className='field' value={craftKind} onChange={(e) => setCraftKind(e.target.value)}>
              <option value='all'>Everything</option>
              {kindsInPool.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </div>
          {craftable.length === 0
            ? <p className='lede'>You’ve found every card{craftKind !== 'all' ? ' of this kind' : ''}.</p>
            : (
              <div className='pk-craft-list'>
                {craftable.map((c) => (
                  <div key={`${c.kind}:${c.id}`} className={`pk-craft-item r-${c.rarity}`}>
                    <span className={`pk-dot r-${c.rarity}`} />
                    <span className='pk-craft-name'><b>{c.name}</b><small>{KINDS.find((k) => k.id === c.kind)?.name.replace(/s$/, '')}{c.pack ? ' · pack only' : ''} · {oneIn(odds.cardChance(c))}</small></span>
                    <button className='btn small' disabled={pk.scraps < craftCost(c)} onClick={() => act('craft', c.kind, c.id)}>{formatCoins(craftCost(c))} scraps</button>
                  </div>
                ))}
              </div>
              )}
        </section>
      </div>
    </div>
  )
}

// --- the crate -------------------------------------------------------------------------
// Three reels, one per card, each a long strip of cards scrolling past a
// marker and easing to a stop on the card you got. The cards rolling past are
// drawn with the pack's real odds (the bonus reel from cards worth at least
// a quarter of the pack), so what you see going by is what was possible.
const TILE_W = 128
const STRIP = 52
const WIN_AT = 44
const ROLL_MS = [4300, 5200, 6300]
const RCOLOR = { common: '#5a8ae8', rare: '#8a5ae8', epic: '#e05ab8', legendary: '#f2b84b' }

function fillers (price, n, min = 0) {
  const pool = packPool().filter((c) => cardValue(c) >= min * price)
  const list = pool.length ? pool : packPool()
  const w = list.map((c) => cardWeight(c, price))
  const total = w.reduce((a, b) => a + b, 0)
  return Array.from({ length: n }, () => { let r = Math.random() * total; for (let i = 0; i < list.length; i++) { if ((r -= w[i]) < 0) return list[i] } return list[0] })
}

let audio = null
function tick (settings, pitch = 1) {
  try {
    if (!settings?.soundVolume || settings.ratingSound === 'off') return
    const c = synth.audio()
    audio = audio || c.createGain()
    if (!audio.connected) { audio.connect(c.destination); audio.connected = true }
    audio.gain.value = settings.soundVolume / 100
    synth.noise(c, audio, { decay: 0.015, gain: 0.25, freq: 2600 * pitch })
  } catch {}
}
function ding (settings, rarity) {
  try {
    if (!settings?.soundVolume || settings.ratingSound === 'off') return
    const c = synth.audio()
    const out = synth.chain(c, c.destination)
    const notes = { common: [660], rare: [660, 880], epic: [660, 880, 1100], legendary: [523, 659, 784, 1046, 1318] }[rarity] || [660]
    notes.forEach((f, i) => synth.bell(c, out, { freq: f, start: i * 0.08, decay: 0.9, gain: 0.14 * (settings.soundVolume / 100) }))
  } catch {}
}

function Crate ({ cards, price, settings, onDone }) {
  const strips = useMemo(() => cards.map((c, i) => {
    const full = COSMETICS.find((x) => x.kind === c.kind && x.id === c.id) || c
    const list = fillers(price, STRIP, i === 2 ? BONUS_MIN : 0)
    list[WIN_AT] = full
    return { list, jitter: (Math.random() - 0.5) * TILE_W * 0.7, won: c }
  }), [cards, price])
  const view = useRef(null)
  const refs = useRef([])
  const [landed, setLanded] = useState([])
  const done = useRef(new Set())
  const [go, setGo] = useState(false)
  const [skip, setSkip] = useState(false)
  useEffect(() => { const t = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true))); return () => cancelAnimationFrame(t) }, [])
  const target = (i) => {
    const w = view.current?.clientWidth || 600
    return -(WIN_AT * TILE_W + TILE_W / 2 - w / 2 + strips[i].jitter)
  }
  // Ticks as each card passes the marker; a ding as each reel stops.
  useEffect(() => {
    if (!go) return
    const last = strips.map(() => 0)
    let raf = 0
    const loop = () => {
      refs.current.forEach((el, i) => {
        if (!el) return
        const x = new DOMMatrix(getComputedStyle(el).transform).m41
        const n = Math.floor(-x / TILE_W)
        if (n !== last[i]) { last[i] = n; tick(settings, 1 + i * 0.15) }
      })
      raf = requestAnimationFrame(loop)
    }
    if (!skip) raf = requestAnimationFrame(loop)
    const timers = strips.map((s, i) => setTimeout(() => {
      if (done.current.has(i)) return
      done.current.add(i)
      setLanded((l) => [...l, i])
      ding(settings, s.won.rarity)
      if (s.won.rarity === 'epic' || s.won.rarity === 'legendary') {
        const el = document.querySelector(`.crate-row[data-i='${i}'] .crate-tile.win`)
        if (el) { const at = centerOf(el); burst(at.x, at.y, s.won.rarity === 'legendary' ? 'confetti' : 'confetti-small') }
      }
    }, skip ? 30 * i : ROLL_MS[i]))
    const end = setTimeout(onDone, skip ? 700 : ROLL_MS[2] + 1600)
    return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); clearTimeout(end) }
  }, [go, skip]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className='crate' ref={view}>
      {strips.map((s, i) => (
        <div key={i} className={`crate-row ${landed.includes(i) ? 'landed' : ''}`} data-i={i}>
          <div className='crate-label'>{i === 2 ? 'Bonus card' : `Card ${i + 1}`}</div>
          <div
            className='crate-strip'
            ref={(el) => { refs.current[i] = el }}
            style={{ transform: `translateX(${go ? target(i) : 0}px)`, transition: go ? (skip ? 'transform .25s ease-out' : `transform ${ROLL_MS[i]}ms cubic-bezier(.08,.62,.12,1)`) : 'none' }}
          >
            {s.list.map((c, j) => (
              <div key={j} className={`crate-tile r-${c.rarity} ${j === WIN_AT ? 'win' : ''}`} style={{ '--rc': RCOLOR[c.rarity] }}>
                <div className='crate-art'><Preview c={c} /></div>
                <b>{c.name}</b>
              </div>
            ))}
          </div>
          <i className='crate-marker' aria-hidden='true' />
        </div>
      ))}
      <div className='crate-foot'>
        <span aria-live='polite'>{landed.length === strips.length ? 'Here’s what you got.' : 'Rolling…'}</span>
        {!skip && landed.length < strips.length && <button className='btn small ghost' onClick={() => setSkip(true)}>Skip</button>}
      </div>
    </div>
  )
}
