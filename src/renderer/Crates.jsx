import { useEffect, useMemo, useRef, useState } from 'react'
import { Coins } from './ui.jsx'
import { COSMETICS } from '../shared/cosmetics.js'
import { packPool, cardValue, cardWeight, crateKinds, crateOdds, RARITIES } from '../shared/packs.js'
import { formatCoins } from '../shared/economy.js'
import { burst, centerOf } from './effects.js'
import { Preview } from './Shop.jsx'
import { synth } from './sound.js'

// Crates: one look each, of a kind you pick (or anything), opened like a
// case in a shooter: a long reel of cards scrolls past a marker and slows
// to a stop on what you got. Cheaper than a card pack, one card instead of
// three. The cards rolling past are drawn with the crate's real odds, so
// what you see go by was really possible. Duplicates turn into scraps.

const RNAME = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' }
const RCOLOR = { common: '#5a8ae8', rare: '#8a5ae8', epic: '#e05ab8', legendary: '#f2b84b' }
const pctText = (p) => (p <= 0 ? '0%' : p < 0.001 ? '<0.1%' : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`)
const TILE_W = 150
const STRIP = 64
const WIN_AT = 55
const ROLL_MS = 6200

export default function Crates ({ v, coins, act, settings }) {
  const pk = v.packs
  const price = pk.cratePrice
  const kinds = useMemo(() => crateKinds(), [])
  const [kind, setKind] = useState(() => { try { return localStorage.getItem('crate-kind') || 'all' } catch { return 'all' } })
  const [res, setRes] = useState(null)
  const [rolling, setRolling] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { try { localStorage.setItem('crate-kind', kind) } catch {} }, [kind])
  const odds = useMemo(() => crateOdds(kind, price), [kind, price])
  const owned = useMemo(() => new Set(v.owned), [v.owned])
  const left = odds.list.filter((c) => !owned.has(`${c.kind}:${c.id}`)).length
  const best = odds.list.filter((c) => !owned.has(`${c.kind}:${c.id}`)).reduce((x, c) => (!x || cardValue(c) > cardValue(x) ? c : x), null)
  const k = kinds.find((x) => x.id === kind) || kinds[0]
  const open = async () => {
    if (busy || rolling) return
    setBusy(true)
    const out = await act('openCrate', kind)
    setBusy(false)
    if (!out) return
    setRes({ ...out, n: Date.now() })
    setRolling(true)
  }
  return (
    <div className='crates'>
      <div className='crate-pick' role='radiogroup' aria-label='Crate'>
        {kinds.map((x) => (
          <button key={x.id} className={`crate-box ${kind === x.id ? 'on' : ''}`} disabled={rolling} onClick={() => { setKind(x.id); if (!rolling) setRes(null) }} aria-pressed={kind === x.id}>
            <span className='crate-lid' aria-hidden='true'>{x.emoji}</span>
            <b>{x.name}</b>
            <small>{x.blurb}</small>
          </button>
        ))}
      </div>
      <div className='crate-bar'>
        <div><strong>{k.name}</strong><span>{left} of {odds.size} still to find{best ? <>, the rarest you don’t have is <b>{best.name}</b> ({pctText(odds.cardChance(best))} a crate)</> : ''}</span></div>
        <button className='btn primary big' disabled={busy || rolling || coins < price} onClick={open}>Open · <Coins n={price} /></button>
      </div>
      {res && <Reel key={res.card.id + res.crate + (res.n || '')} card={res.card} kind={res.crate} price={price} settings={settings} rolling={rolling} onDone={() => setRolling(false)} />}
      {res && !rolling && (
        <div className={`crate-result r-${res.card.rarity}`} style={{ '--rc': RCOLOR[res.card.rarity] }}>
          <div className='pk-art'><Preview c={COSMETICS.find((x) => x.kind === res.card.kind && x.id === res.card.id) || res.card} /></div>
          <div>
            <small className='pk-rar'>{RNAME[res.card.rarity]} · {String(res.card.kindName || res.card.kind).replace(/s$/, '')}</small>
            <b>{res.card.name}</b>
            <small>worth <Coins n={res.card.value} /></small>
            {res.card.dup ? <span className='pk-dup'>Duplicate · +{formatCoins(res.card.scraps)} scraps</span> : <span className='pk-new'>New! It’s in the Shop, ready to wear.</span>}
          </div>
          <button className='btn' disabled={busy || coins < price} onClick={open}>Open another</button>
        </div>
      )}
      <section className='panel pk-odds'>
        <h3>The odds <small>at <Coins n={price} /> a crate</small></h3>
        <table>
          <tbody>{RARITIES.map((r) => <tr key={r}><th><span className={`pk-dot r-${r}`} />{RNAME[r]}</th><td>{pctText(odds.by[r])}</td></tr>)}</tbody>
        </table>
        <small>One card from {odds.size} {kind === 'all' ? 'looks of every kind' : `${k.name.replace(/ crate$/, '').toLowerCase()}s`}, weighed against what the crate costs: anything up to half its price is equally likely, and beyond that each doubling in value makes a card about 2.8 times rarer. A crate costs {Math.round(0.4 * 100)}% of a card pack ({formatCoins(pk.price)}), so its rare cards are rarer than a pack’s. Duplicates give a quarter of their value in scraps, for crafting under Card packs. {pk.crates || 0} opened so far. Looks only.</small>
      </section>
    </div>
  )
}

// --- the reel ---------------------------------------------------------------------------
function fillers (kind, price, n) {
  const list = packPool().filter((c) => kind === 'all' || c.kind === kind)
  const pool = list.length ? list : packPool()
  const w = pool.map((c) => cardWeight(c, price))
  const total = w.reduce((a, b) => a + b, 0)
  return Array.from({ length: n }, () => { let r = Math.random() * total; for (let i = 0; i < pool.length; i++) { if ((r -= w[i]) < 0) return pool[i] } return pool[0] })
}

let gain = null
function tick (settings) {
  try {
    if (!settings?.soundVolume || settings.ratingSound === 'off') return
    const c = synth.audio()
    if (!gain) { gain = c.createGain(); gain.connect(c.destination) }
    gain.gain.value = settings.soundVolume / 100
    synth.noise(c, gain, { decay: 0.015, gain: 0.3, freq: 2800 })
  } catch {}
}
function ding (settings, rarity) {
  try {
    if (!settings?.soundVolume || settings.ratingSound === 'off') return
    const c = synth.audio()
    const out = synth.chain(c, c.destination)
    const notes = { common: [660], rare: [660, 880], epic: [660, 880, 1100], legendary: [523, 659, 784, 1046, 1318] }[rarity] || [660]
    notes.forEach((f, i) => synth.bell(c, out, { freq: f, start: i * 0.08, decay: 0.9, gain: 0.15 * (settings.soundVolume / 100) }))
  } catch {}
}

function Reel ({ card, kind, price, settings, rolling, onDone }) {
  const strip = useMemo(() => {
    const list = fillers(kind, price, STRIP)
    list[WIN_AT] = COSMETICS.find((x) => x.kind === card.kind && x.id === card.id) || card
    return { list, jitter: (Math.random() - 0.5) * TILE_W * 0.7 }
  }, [card, kind, price])
  const view = useRef(null)
  const el = useRef(null)
  const [go, setGo] = useState(false)
  const [skip, setSkip] = useState(false)
  const [landed, setLanded] = useState(false)
  useEffect(() => { const t = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true))); return () => cancelAnimationFrame(t) }, [])
  const target = () => -(WIN_AT * TILE_W + TILE_W / 2 - (view.current?.clientWidth || 700) / 2 + strip.jitter)
  useEffect(() => {
    if (!go) return
    let last = 0
    let raf = 0
    const loop = () => {
      if (el.current) { const n = Math.floor(-new DOMMatrix(getComputedStyle(el.current).transform).m41 / TILE_W); if (n !== last) { last = n; tick(settings) } }
      raf = requestAnimationFrame(loop)
    }
    if (!skip) raf = requestAnimationFrame(loop)
    const t = setTimeout(() => {
      cancelAnimationFrame(raf)
      setLanded(true)
      ding(settings, card.rarity)
      if (card.rarity === 'epic' || card.rarity === 'legendary') { const w = view.current?.querySelector('.crate-tile.win'); if (w) { const at = centerOf(w); burst(at.x, at.y, card.rarity === 'legendary' ? 'confetti' : 'confetti-small') } }
      setTimeout(onDone, 900)
    }, skip ? 300 : ROLL_MS)
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
  }, [go, skip]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className='crate big' ref={view}>
      <div className={`crate-row ${landed ? 'landed' : ''}`}>
        <div className='crate-strip' ref={el} style={{ transform: `translateX(${go ? target() : 0}px)`, transition: go ? (skip ? 'transform .3s ease-out' : `transform ${ROLL_MS}ms cubic-bezier(.08,.62,.12,1)`) : 'none' }}>
          {strip.list.map((c, j) => (
            <div key={j} className={`crate-tile r-${c.rarity} ${j === WIN_AT ? 'win' : ''}`} style={{ '--rc': RCOLOR[c.rarity] }}>
              <div className='crate-art'><Preview c={c} /></div>
              <b>{c.name}</b>
            </div>
          ))}
        </div>
        <i className='crate-marker' aria-hidden='true' />
      </div>
      <div className='crate-foot'>
        <span aria-live='polite'>{landed ? 'Here’s what you got.' : 'Rolling…'}</span>
        {rolling && !landed && !skip && <button className='btn small ghost' onClick={() => setSkip(true)}>Skip</button>}
      </div>
    </div>
  )
}
