import { useEffect, useRef, useState } from 'react'
import { api, Coins } from './ui.jsx'
import { formatCoins } from '../shared/economy.js'
import { POCKETS, pocketColor, rouletteBet, VOWELS, TILE_POINTS, WHEEL, WHEEL_SEGMENTS, wheelPays } from '../shared/tables.js'

// The Casino's word tables: Letter Roulette, Word Blackjack and the Wheel of
// Words, played against the house. The wheels and tiles here are also used
// by the lobby tables.

const CHIPS = [10, 100, 1000, 10000, 100000]
const signed = (n) => `${n >= 0 ? '+' : '−'}${formatCoins(Math.abs(n))}`
const SPIN_MS = 4200

function Chips ({ chip, setChip, coins }) {
  return (
    <div className='tb-chips' role='radiogroup' aria-label='Chip size'>
      {CHIPS.map((c) => <button key={c} className={`tb-chip ${chip === c ? 'on' : ''}`} disabled={c > coins} onClick={() => setChip(c)} aria-pressed={chip === c}>{formatCoins(c)}</button>)}
    </div>
  )
}

// Bets as a list, with the same bet merged: [{ kind, pick, amount }].
function addBet (bets, kind, pick, amount) {
  const i = bets.findIndex((b) => b.kind === kind && (b.pick || null) === (pick || null))
  if (i < 0) return [...bets, { kind, pick: pick || null, amount }]
  return bets.map((b, j) => (j === i ? { ...b, amount: b.amount + amount } : b))
}
const betLabel = (b) => ({ letter: b.pick, word: `“${b.pick}”`, red: 'Red', black: 'Black', vowel: 'Vowels', consonant: 'Consonants', low: 'A–M', high: 'N–Z' })[b.kind] || b.pick

// --- Letter Roulette ------------------------------------------------------------------------
export function LetterWheel ({ pocket, spinning }) {
  const turn = useRef(0)
  const [angle, setAngle] = useState(0)
  useEffect(() => {
    if (pocket === null || pocket === undefined) return
    const a = 360 / POCKETS.length
    const target = -(pocket * a + a / 2)
    turn.current += 5
    setAngle(turn.current * 360 + target)
  }, [pocket, spinning])
  const r = 100
  const a = (2 * Math.PI) / POCKETS.length
  return (
    <div className='tb-wheelwrap'>
      <i className='tb-pointer' />
      <svg viewBox='-110 -110 220 220' className='tb-wheel' style={{ transform: `rotate(${angle}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(.12,.6,.12,1)` : 'none' }} aria-hidden='true'>
        {POCKETS.map((l, i) => {
          const a0 = i * a - Math.PI / 2; const a1 = a0 + a
          const p = (t, rr) => `${Math.cos(t) * rr},${Math.sin(t) * rr}`
          const col = pocketColor(i)
          const mid = a0 + a / 2
          return (
            <g key={l}>
              <path d={`M0,0 L${p(a0, r)} A${r},${r} 0 0 1 ${p(a1, r)} Z`} className={`tb-pocket ${col}`} />
              <text x={Math.cos(mid) * 84} y={Math.sin(mid) * 84} transform={`rotate(${(mid * 180) / Math.PI + 90} ${Math.cos(mid) * 84} ${Math.sin(mid) * 84})`} className='tb-pocket-l'>{l}</text>
            </g>
          )
        })}
        <circle r='44' className='tb-hub' />
        <circle r='14' className='tb-hub2' />
      </svg>
    </div>
  )
}

export function RouletteBoard ({ bets, setBets, chip, disabled, hit = null }) {
  const [word, setWord] = useState('')
  const on = (kind, pick) => bets.find((b) => b.kind === kind && (b.pick || null) === (pick || null))?.amount || 0
  const add = (kind, pick) => { if (!disabled) setBets(addBet(bets, kind, pick, chip)) }
  const wb = rouletteBet('word', word)
  return (
    <div className='tb-board'>
      <div className='tb-letters'>
        {POCKETS.map((l, i) => {
          const n = on('letter', l)
          return <button key={l} className={`tb-cell ${pocketColor(i)} ${hit === l ? 'hit' : ''}`} onClick={() => add('letter', l)} disabled={disabled} title={`${l}: pays 25 to 1`}>{l}{n > 0 && <i className='tb-stack'>{formatCoins(n)}</i>}</button>
        })}
      </div>
      <div className='tb-outside'>
        {[['red', 'Red', '1 to 1'], ['black', 'Black', '1 to 1'], ['low', 'A–M', '1 to 1'], ['high', 'N–Z', '1 to 1'], ['vowel', 'Vowels', '4.2 to 1'], ['consonant', 'Consonants', '1 to 4']].map(([k, label, pays]) => (
          <button key={k} className={`tb-cell wide ${k}`} onClick={() => add(k)} disabled={disabled}>{label}<small>{pays}</small>{on(k) > 0 && <i className='tb-stack'>{formatCoins(on(k))}</i>}</button>
        ))}
      </div>
      <form className='tb-wordbet' onSubmit={(e) => { e.preventDefault(); if (wb) { add('word', word.toUpperCase()); setWord('') } }}>
        <input className='field' value={word} onChange={(e) => setWord(e.target.value.replace(/[^a-z]/gi, '').slice(0, 13))} placeholder='Bet on a word' disabled={disabled} aria-label='A word to bet on' />
        <button className='btn small' disabled={!wb || disabled}>Bet {formatCoins(chip)}</button>
        <small>{wb ? `Wins if the ball lands on any of ${[...new Set(word.toUpperCase())].join(' ')}: pays ${wb.pays} to 1` : 'Wins if the ball lands on any of its letters. Fewer letters pay more.'}</small>
      </form>
    </div>
  )
}

export function Roulette ({ coins, hold, toast }) {
  const [bets, setBets] = useState([])
  const [chip, setChip] = useState(100)
  const [spin, setSpin] = useState(null) // the last result
  const [spinning, setSpinning] = useState(false)
  const [history, setHistory] = useState([])
  const total = bets.reduce((a, b) => a + b.amount, 0)
  const go = async () => {
    try {
      hold(SPIN_MS + 400)
      const res = await api('tablesAction', 'roulette', bets)
      setSpinning(true)
      setSpin(res.out)
      setTimeout(() => {
        setSpinning(false)
        setHistory((h) => [res.out, ...h].slice(0, 14))
        const o = res.out
        toast({ emoji: o.net > 0 ? '🎉' : '🎡', title: `${o.letter}${o.letter === '★' ? '' : ` · ${o.color}`}`, text: o.paid > 0 ? `Paid ${formatCoins(o.paid)}: ${signed(o.net)}.` : `Nothing this time: ${signed(o.net)}.` })
      }, SPIN_MS)
    } catch (err) { hold(0); toast({ error: true, title: 'Can’t spin', text: err.message }) }
  }
  return (
    <div className='tb-game tb-roulette'>
      <div className='tb-left'>
        <LetterWheel pocket={spin?.pocket ?? null} spinning={spinning} />
        <div className='tb-history'>{history.map((h, i) => <span key={i} className={`tb-pip ${h.color}`}>{h.letter}</span>)}</div>
      </div>
      <div className='tb-right'>
        <Chips chip={chip} setChip={setChip} coins={coins} />
        <RouletteBoard bets={bets} setBets={setBets} chip={chip} disabled={spinning} hit={spinning ? null : spin?.letter} />
        <div className='tb-actions'>
          <span className='tb-total'>{bets.length ? <>On the table: <Coins n={total} /> <small>({bets.map(betLabel).join(', ')})</small></> : 'Click letters, colours or groups to place chips.'}</span>
          <button className='btn ghost small' onClick={() => setBets([])} disabled={!bets.length || spinning}>Clear</button>
          <button className='btn primary' onClick={go} disabled={!bets.length || spinning || total > coins}>Spin</button>
        </div>
      </div>
    </div>
  )
}

// --- Wheel of Words ----------------------------------------------------------------------
const WHEEL_COLORS = { A: '#4a9ee8', AN: '#3fbf9a', WORDS: '#e8a03a', DICTIONARY: '#a66bd8', UNCHARACTERISTICALLY: '#e8648f', '★ WIRD': '#f4c542', '★ LEXICON': '#f4c542' }
export function WordsWheel ({ segment, spinning }) {
  const turn = useRef(0)
  const [angle, setAngle] = useState(0)
  useEffect(() => {
    if (segment === null || segment === undefined) return
    const a = 360 / WHEEL_SEGMENTS.length
    turn.current += 4
    setAngle(turn.current * 360 - (segment * a + a / 2))
  }, [segment, spinning])
  const r = 100
  const a = (2 * Math.PI) / WHEEL_SEGMENTS.length
  return (
    <div className='tb-wheelwrap big'>
      <i className='tb-pointer' />
      <svg viewBox='-110 -110 220 220' className='tb-wheel' style={{ transform: `rotate(${angle}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(.12,.6,.12,1)` : 'none' }} aria-hidden='true'>
        {WHEEL_SEGMENTS.map((w, i) => {
          const a0 = i * a - Math.PI / 2; const a1 = a0 + a
          const p = (t, rr) => `${Math.cos(t) * rr},${Math.sin(t) * rr}`
          const mid = a0 + a / 2
          const label = w.replace('★ ', '★')
          const fs = label.length > 12 ? 3.4 : label.length > 6 ? 5 : 7
          return (
            <g key={i}>
              <path d={`M0,0 L${p(a0, r)} A${r},${r} 0 0 1 ${p(a1, r)} Z`} fill={WHEEL_COLORS[w]} stroke='#fff' strokeWidth='.6' />
              <text x={Math.cos(mid) * 60} y={Math.sin(mid) * 60} transform={`rotate(${(mid * 180) / Math.PI} ${Math.cos(mid) * 60} ${Math.sin(mid) * 60})`} className='tb-seg-l' style={{ fontSize: fs }}>{label}</text>
            </g>
          )
        })}
        <circle r='18' className='tb-hub' />
      </svg>
    </div>
  )
}

export function Wheel ({ coins, hold, toast }) {
  const [bets, setBets] = useState([])
  const [chip, setChip] = useState(100)
  const [spin, setSpin] = useState(null)
  const [spinning, setSpinning] = useState(false)
  const total = bets.reduce((a, b) => a + b.amount, 0)
  const go = async () => {
    try {
      hold(SPIN_MS + 400)
      const res = await api('tablesAction', 'wheel', bets)
      setSpinning(true)
      setSpin(res.out)
      setTimeout(() => {
        setSpinning(false)
        const o = res.out
        toast({ emoji: o.net > 0 ? '🎉' : '🎡', title: o.word, text: o.paid > 0 ? `Paid ${formatCoins(o.paid)}: ${signed(o.net)}.` : `Nothing this time: ${signed(o.net)}.` })
      }, SPIN_MS)
    } catch (err) { hold(0); toast({ error: true, title: 'Can’t spin', text: err.message }) }
  }
  return (
    <div className='tb-game tb-wheelgame'>
      <div className='tb-left'><WordsWheel segment={spin?.segment ?? null} spinning={spinning} /></div>
      <div className='tb-right'>
        <p className='lede'>Each word pays as many to one as it has letters. The stars pay 40 to 1.</p>
        <Chips chip={chip} setChip={setChip} coins={coins} />
        <div className='tb-wheelbets'>
          {WHEEL.map(([w, n]) => {
            const on = bets.find((b) => b.pick === w)?.amount || 0
            return (
              <button key={w} className='tb-wbet' style={{ '--wc': WHEEL_COLORS[w] }} onClick={() => !spinning && setBets(addBet(bets, 'word', w, chip))} disabled={spinning}>
                <b>{w}</b><small>{wheelPays(w)} to 1 · {n} of 54</small>{on > 0 && <i className='tb-stack'>{formatCoins(on)}</i>}
              </button>
            )
          })}
        </div>
        <div className='tb-actions'>
          <span className='tb-total'>{bets.length ? <>On the wheel: <Coins n={total} /></> : 'Pick the words you think it’ll stop on.'}</span>
          <button className='btn ghost small' onClick={() => setBets([])} disabled={!bets.length || spinning}>Clear</button>
          <button className='btn primary' onClick={go} disabled={!bets.length || spinning || total > coins}>Spin</button>
        </div>
      </div>
    </div>
  )
}

// --- Word Blackjack ------------------------------------------------------------------------
export function Tile ({ l, small = false, fresh = false }) {
  if (l === '?') return <span className={`tb-tile back ${small ? 'small' : ''}`} aria-label='face down'>?</span>
  return <span className={`tb-tile ${small ? 'small' : ''} ${fresh ? 'fresh' : ''} ${VOWELS.has(l) ? 'vowel' : ''}`}>{l}<sub>{TILE_POINTS[l]}</sub></span>
}

export function Blackjack ({ coins, hold, toast }) {
  const [h, setH] = useState(null)
  const [stats, setStats] = useState(null)
  const [stake, setStake] = useState('100')
  const load = () => api('tables').then((t) => { setH(t.bj); setStats(t.blackjack) }).catch(() => {})
  useEffect(() => { load() }, [])
  const act = async (action, ...args) => {
    try {
      hold(600)
      const res = await api('tablesAction', action, ...args)
      setH(res.out)
      setStats(res.tables.blackjack)
      const o = res.out
      if (o.done) {
        const word = o.word ? `${o.word.toUpperCase()}: a word! The win pays double.` : null
        toast({ emoji: o.result === 'win' ? (o.word ? '📝' : '🎉') : o.result === 'bust' ? '💥' : '🃏', title: o.result === 'win' ? `You win ${formatCoins(o.paid)}` : o.result === 'bust' ? 'Bust' : 'The dealer wins', text: word || `${o.mineTotal} against ${o.dealerTotal}.` })
      }
    } catch (err) { hold(0); toast({ error: true, title: 'Can’t do that', text: err.message }) }
  }
  const n = Math.floor(Number(stake) || 0)
  const playing = h && !h.done
  return (
    <div className='tb-game tb-bj'>
      <div className='tb-felt'>
        <div className='tb-hand'>
          <small>Dealer {h ? <b>{h.dealerTotal}{h.done ? '' : ' + ?'}</b> : null}</small>
          <div className='tb-tiles'>{h ? h.dealer.map((l, i) => <Tile key={i} l={l} />) : <span className='tb-empty'>The dealer draws to 20 and wins ties.</span>}</div>
        </div>
        <div className='tb-hand mine'>
          <small>You {h ? <b className={h.mineTotal > 21 ? 'down' : ''}>{h.mineTotal}</b> : null}{h?.word ? <em className='tb-word'>{h.word.toUpperCase()}</em> : null}</small>
          <div className='tb-tiles'>{h ? h.mine.map((l, i) => <Tile key={i} l={l} fresh={i === h.mine.length - 1 && playing} />) : <span className='tb-empty'>Tiles are worth their Scrabble points plus one. Get closer to 21 than the dealer; spell a word of four letters or more and a win pays double.</span>}</div>
        </div>
        {h?.done && <div className={`tb-result ${h.result}`}>{h.result === 'win' ? `Won ${formatCoins(h.paid)}${h.word ? ' (with a word!)' : ''}` : h.result === 'bust' ? 'Bust' : 'Dealer wins'}</div>}
      </div>
      <div className='tb-actions'>
        {playing
          ? (
            <>
              <span className='tb-total'>Stake <Coins n={h.stake} />{h.doubled ? ' (doubled)' : ''}</span>
              <button className='btn' onClick={() => act('bjHit')}>Draw a tile</button>
              <button className='btn' onClick={() => act('bjDouble')} disabled={!h.canDouble}>Double</button>
              <button className='btn primary' onClick={() => act('bjStand')}>Stand</button>
            </>
            )
          : (
            <>
              <input className='field tb-stake' inputMode='numeric' value={stake} onChange={(e) => setStake(e.target.value.replace(/[^\d]/g, ''))} aria-label='Stake' />
              {[100, 1000, 10000].map((x) => <button key={x} className='btn small ghost' onClick={() => setStake(String(x))}>{formatCoins(x)}</button>)}
              <button className='btn primary' onClick={() => act('bjDeal', n)} disabled={!(n >= 1) || n > coins}>Deal</button>
            </>
            )}
      </div>
      {stats && <p className='tb-stats'>Tiles count their points plus one. {stats.hands} hand{stats.hands === 1 ? '' : 's'} · {stats.wins} won · {stats.words} with a word · <span className={stats.net >= 0 ? 'up' : 'down'}>{signed(stats.net)}</span></p>}
    </div>
  )
}

// --- the lobby tables ------------------------------------------------------------------------
// Letter Roulette and Word Blackjack around a lobby table: everyone against
// the house, sharing the spin or the dealer. See src/core/lobby.js.

// On the felt: the wheel, or the dealer's tiles.
export function LobbyTableCenter ({ c, phase, res, name }) {
  const [spinning, setSpinning] = useState(false)
  const pocket = res?.pocket ?? null
  useEffect(() => {
    if (pocket === null) return
    setSpinning(true)
    const t = setTimeout(() => setSpinning(false), SPIN_MS)
    return () => clearTimeout(t)
  }, [pocket, res?.key])
  if (c.style === 'roulette') {
    const bettors = Object.values(c.bets || {}).filter(Boolean).length
    return (
      <div className='tb-lobby-center'>
        <div className='tb-lobby-wheel'><LetterWheel pocket={pocket} spinning={spinning} /></div>
        <div className='tsub'>
          {phase === 'betting' && `Place your bets. ${bettors} in so far.`}
          {phase === 'drawing' && 'No more bets…'}
          {phase === 'reveal' && (res?.void ? 'Nobody bet this time.' : spinning ? 'Spinning…' : <>It’s <b className={`tb-letter ${res.color}`}>{res.letter}</b></>)}
        </div>
      </div>
    )
  }
  const dealer = phase === 'reveal' ? res?.dealer : c.dealer
  return (
    <div className='tb-lobby-center'>
      <div className='tsub'>Dealer{phase === 'reveal' && res?.dealerTotal ? <> · <b>{res.dealerTotal}</b>{res.dealerTotal > 21 ? ' bust!' : ''}</> : null}</div>
      <div className='tb-tiles center'>{dealer ? dealer.map((l, i) => <Tile key={i} l={l} small />) : <span className='tsub'>{phase === 'betting' ? 'Stakes first. The dealer draws to 20 and wins ties.' : phase === 'drawing' ? 'Dealing…' : res?.void ? 'Nobody played this hand.' : ''}</span>}</div>
    </div>
  )
}

// Under a seat: their bet, their tiles, what they won.
export function LobbySeatTable ({ c, phase, res, id }) {
  const bet = c.bets?.[id]
  const net = phase === 'reveal' ? res?.net?.[id] : undefined
  const hand = phase === 'reveal' ? res?.hands?.[id] : c.hands?.[id]
  return (
    <span className='tb-seat'>
      {hand && <span className='tb-seat-tiles'>{hand.tiles.map((l, i) => <Tile key={i} l={l} small />)}<b className={hand.total > 21 ? 'down' : ''}>{hand.total}</b></span>}
      {bet === null && phase !== 'reveal' && <span className='tag'>sitting out</span>}
      {bet && net === undefined && <span className='tag'>{c.style === 'roulette' ? `bet ${formatCoins(bet.total)}` : `stake ${formatCoins(bet.total)}${bet.doubled ? ' ×2' : ''}`}</span>}
      {net !== undefined && <span className={`tag ${net > 0 ? 'ok' : net < 0 ? 'lo' : ''}`}>{net > 0 ? `won ${formatCoins(net)}` : net < 0 ? `lost ${formatCoins(-net)}` : 'even'}{hand?.word ? ` · ${hand.word.toUpperCase()}` : ''}</span>}
    </span>
  )
}

// The bottom bar: your bet, or your hand.
export function LobbyTableControls ({ c, phase, act, coins, waiting, name, toast }) {
  const [stake, setStake] = useState('100')
  const mine = c.mine || {}
  const n = Math.floor(Number(stake) || 0)
  const left = [...waiting].map(name).join(', ') || 'nobody'
  if (phase === 'betting' && c.style === 'blackjack') {
    if (mine.bet !== undefined) return <div className='rate-help' style={{ textAlign: 'center' }}><span className='prompt'>{mine.bet ? <>You’re in for <b>{formatCoins(mine.bet.total)}</b>.</> : 'Sitting this hand out.'}</span><span>Waiting on {left}</span></div>
    return (
      <div className='tb-actions center'>
        <input className='field tb-stake' inputMode='numeric' value={stake} onChange={(e) => setStake(e.target.value.replace(/[^\d]/g, ''))} aria-label='Stake' />
        {[100, 1000, 10000].map((x) => <button key={x} className='btn small ghost' onClick={() => setStake(String(x))}>{formatCoins(x)}</button>)}
        <button className='btn primary' onClick={() => act('tableBet', { stake: n })} disabled={!(n >= 1) || n > coins}>Deal me in</button>
        <button className='btn ghost' onClick={() => act('tableBet', { skip: true })}>Sit out</button>
      </div>
    )
  }
  if (phase === 'betting') {
    if (mine.bet !== undefined) return <div className='rate-help' style={{ textAlign: 'center' }}><span className='prompt'>{mine.bet ? <>Your bets are down: <b>{formatCoins(mine.bet.total)}</b>.</> : 'Sitting this spin out.'}</span><span>Waiting on {left}</span></div>
    return <div className='rate-help' style={{ textAlign: 'center' }}><span className='prompt'>Place your bets on the board at the right.</span><span>Waiting on {left}</span></div>
  }
  if (phase === 'drawing') return <span className='rate-help'>{c.style === 'roulette' ? 'No more bets. Everyone’s seed goes in…' : 'Shuffling everyone’s bags…'}</span>
  if (phase === 'playing') {
    const h = mine.hand
    if (!h) return <span className='rate-help'>You’re not in this hand. Waiting on {left}.</span>
    if (h.done) return <div className='rate-help' style={{ textAlign: 'center' }}><span className='prompt'>{h.total > 21 ? 'Bust.' : <>Standing on <b>{h.total}</b>.</>}</span><span>Waiting on {left}</span></div>
    return (
      <div className='tb-actions center'>
        <span className='tb-total'>Your hand: <b>{h.total}</b></span>
        <button className='btn' onClick={() => act('tableMove', 'hit')}>Draw a tile</button>
        <button className='btn' onClick={() => act('tableMove', 'double')} disabled={h.moves > 0 || (mine.bet?.total || 0) > coins}>Double</button>
        <button className='btn primary' onClick={() => act('tableMove', 'stand')}>Stand</button>
      </div>
    )
  }
  return null
}

// The roulette board in the side panel, while the betting's open.
export function LobbyRouletteBets ({ c, act, coins }) {
  const [bets, setBets] = useState([])
  const [chip, setChip] = useState(100)
  useEffect(() => setBets([]), [c.key])
  if (c.mine?.bet !== undefined) {
    const b = c.mine.bet
    return <div className='sect'><h3>Your bets</h3><p className='opt-hint'>{b ? b.bets.map((x) => `${betLabel(x)} ${formatCoins(x.amount)}`).join(' · ') : 'Sitting this spin out.'}</p></div>
  }
  const total = bets.reduce((a, b) => a + b.amount, 0)
  return (
    <div className='sect tb-side'>
      <h3>Place your bets</h3>
      <Chips chip={chip} setChip={setChip} coins={coins} />
      <RouletteBoard bets={bets} setBets={setBets} chip={chip} disabled={false} />
      <div className='tb-actions'>
        <span className='tb-total'>{bets.length ? <>On the table: <Coins n={total} /></> : 'Click to place chips.'}</span>
        <button className='btn ghost small' onClick={() => setBets([])} disabled={!bets.length}>Clear</button>
      </div>
      <div className='tb-actions'>
        <button className='btn primary' onClick={() => act('tableBet', { bets })} disabled={!bets.length || total > coins}>Bets down</button>
        <button className='btn ghost' onClick={() => act('tableBet', { skip: true })}>Sit out</button>
      </div>
    </div>
  )
}
