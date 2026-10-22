import { useEffect, useRef, useState } from 'react'
import { api, Coins } from './ui.jsx'
import { formatCoins, shortCoins } from '../shared/economy.js'
import { POCKETS, pocketColor, wordLetters, TILE_POINTS, WF_SEGMENTS, WF_MIN_STAKE, wfValue } from '../shared/tables.js'

// The Casino's word tables: Letter Roulette, Wordjack and the Wheel of
// Words, played against the house. The wheels and tiles here are also used
// by the lobby tables.

// Chips go up by tens; you see the ones that fit your coins (the biggest few).
const CHIPS = [10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15]
const SHOWN_CHIPS = 6
export const chipsFor = (coins) => {
  const fit = CHIPS.filter((c) => c <= Math.max(10, coins))
  return fit.slice(Math.max(0, fit.length - SHOWN_CHIPS))
}
const signed = (n) => `${n >= 0 ? '+' : '−'}${formatCoins(Math.abs(n))}`
export const SPIN_MS = 4200

// The chips, a custom chip of any size, and all in (everything not already
// on the table). left: coins you have that aren't on the table yet.
function Chips ({ chip, setChip, coins, left = coins }) {
  const list = chipsFor(coins)
  const [custom, setCustom] = useState('')
  const isCustom = !list.includes(chip)
  return (
    <div className='tb-chips' role='radiogroup' aria-label='Chip size'>
      {list.map((c, i) => <button key={c} className={`tb-chip c${(CHIPS.indexOf(c)) % 6} ${chip === c ? 'on' : ''}`} disabled={c > coins} onClick={() => setChip(c)} aria-pressed={chip === c}>{shortCoins(c)}</button>)}
      <label className={`tb-chip custom ${isCustom && chip !== Math.floor(left) ? 'on' : ''}`} title='A chip of any size'>
        <input inputMode='numeric' placeholder='Custom' value={custom} onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ''); setCustom(v); if (Number(v) >= 1) setChip(Number(v)) }} onFocus={() => { if (Number(custom) >= 1) setChip(Number(custom)) }} aria-label='Custom chip' />
      </label>
      <button className={`tb-chip allin ${chip === Math.floor(left) && left >= 1 ? 'on' : ''}`} disabled={left < 1} onClick={() => setChip(Math.floor(left))} title='Everything you have that isn’t on the table'>All in</button>
    </div>
  )
}

// A stake: type it, pick a round amount that fits your coins, or go all in.
export function StakePicker ({ stake, setStake, coins, min = 1 }) {
  const presets = [100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13].filter((x) => x <= coins && x >= min)
  return (
    <>
      <input className='field tb-stake' inputMode='numeric' value={stake} onChange={(e) => setStake(e.target.value.replace(/[^\d]/g, ''))} aria-label='Stake' />
      {presets.slice(-3).map((x) => <button key={x} className='btn small ghost' onClick={() => setStake(String(x))}>{shortCoins(x)}</button>)}
      <button className='btn small ghost allin' disabled={coins < min} onClick={() => setStake(String(Math.floor(coins)))}>All in</button>
    </>
  )
}

// Bets as a list, with the same bet merged: [{ kind, pick, amount }].
function addBet (bets, kind, pick, amount) {
  const i = bets.findIndex((b) => b.kind === kind && (b.pick || null) === (pick || null))
  if (i < 0) return [...bets, { kind, pick: pick || null, amount }]
  return bets.map((b, j) => (j === i ? { ...b, amount: b.amount + amount } : b))
}
const betLabel = (b) => ({ letter: b.pick, red: 'Red', black: 'Black', vowel: 'Vowels', consonant: 'Consonants', low: 'A–M', high: 'N–Z' })[b.kind] || b.pick

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
  const letters = wordLetters(word)
  return (
    <div className='tb-board'>
      <div className='tb-letters'>
        {POCKETS.map((l, i) => {
          const n = on('letter', l)
          return <button key={l} className={`tb-cell ${pocketColor(i)} ${hit === l ? 'hit' : ''}`} onClick={() => add('letter', l)} disabled={disabled} title={`${l}: pays 25 to 1`}>{l}{n > 0 && <i className='tb-stack'>{shortCoins(n)}</i>}</button>
        })}
      </div>
      <div className='tb-outside'>
        {[['red', 'Red', '1 to 1'], ['black', 'Black', '1 to 1'], ['low', 'A–M', '1 to 1'], ['high', 'N–Z', '1 to 1'], ['vowel', 'Vowels', '21 to 5'], ['consonant', 'Consonants', '5 to 21']].map(([k, label, pays]) => (
          <button key={k} className={`tb-cell wide ${k}`} onClick={() => add(k)} disabled={disabled}>{label}<small>{pays}</small>{on(k) > 0 && <i className='tb-stack'>{shortCoins(on(k))}</i>}</button>
        ))}
      </div>
      <form className='tb-wordbet' onSubmit={(e) => { e.preventDefault(); if (letters.length && !disabled) { let next = bets; for (const l of letters) next = addBet(next, 'letter', l, chip); setBets(next); setWord('') } }}>
        <input className='field' value={word} onChange={(e) => setWord(e.target.value.replace(/[^a-z]/gi, '').slice(0, 13))} placeholder='Bet on a word' disabled={disabled} aria-label='A word to bet on' />
        <button className='btn small' disabled={!letters.length || disabled}>Bet {letters.length > 1 ? `${letters.length} × ` : ''}{shortCoins(chip)}</button>
        <small>{letters.length ? `A chip on each of ${letters.join(' ')}: ${shortCoins(chip * letters.length)} in all. The letter that comes up pays 25 to 1.` : 'Type a word to put a chip on each of its letters.'}</small>
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
        <Chips chip={chip} setChip={setChip} coins={coins} left={coins - total} />
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
const SEG_COLORS = ['#4a9ee8', '#3fbf9a', '#e8a03a', '#a66bd8', '#e8648f', '#5bbf5b', '#e86a4a', '#3fa8c8']
const segLabel = (v, stake) => (v === 'bankrupt' ? 'BANKRUPT' : v === 'lose' ? 'LOSE A TURN' : stake ? shortCoins(wfValue(v, stake)) : `×${v}`)
export function WordsWheel ({ segment, spinning, stake }) {
  const turn = useRef(0)
  const [angle, setAngle] = useState(0)
  useEffect(() => {
    if (segment === null || segment === undefined || !spinning) return
    const a = 360 / WF_SEGMENTS.length
    turn.current += 4
    setAngle(turn.current * 360 - (segment * a + a / 2))
  }, [segment, spinning])
  const r = 100
  const a = (2 * Math.PI) / WF_SEGMENTS.length
  return (
    <div className='tb-wheelwrap big'>
      <i className='tb-pointer' />
      <svg viewBox='-110 -110 220 220' className='tb-wheel' style={{ transform: `rotate(${angle}deg)`, transition: spinning ? `transform ${WF_SPIN_MS}ms cubic-bezier(.12,.6,.12,1)` : 'none' }} aria-hidden='true'>
        {WF_SEGMENTS.map((v, i) => {
          const a0 = i * a - Math.PI / 2; const a1 = a0 + a
          const p = (t, rr) => `${Math.cos(t) * rr},${Math.sin(t) * rr}`
          const mid = a0 + a / 2
          const label = segLabel(v, stake)
          const fill = v === 'bankrupt' ? '#1e1e26' : v === 'lose' ? '#f4f0e8' : SEG_COLORS[i % SEG_COLORS.length]
          return (
            <g key={i}>
              <path d={`M0,0 L${p(a0, r)} A${r},${r} 0 0 1 ${p(a1, r)} Z`} fill={fill} stroke='#fff' strokeWidth='.8' />
              <text x={Math.cos(mid) * 64} y={Math.sin(mid) * 64} transform={`rotate(${(mid * 180) / Math.PI} ${Math.cos(mid) * 64} ${Math.sin(mid) * 64})`} className={`tb-seg-l ${v === 'lose' ? 'dark' : ''}`} style={{ fontSize: label.length > 8 ? 5.4 : 8 }}>{label}</text>
            </g>
          )
        })}
        <circle r='16' className='tb-hub' />
      </svg>
    </div>
  )
}

const WF_SPIN_MS = 3200
// What just happened, in a line under the bank.
function lastText (x) {
  if (x.kind === 'hit') return x.n > 1 ? `${x.n} ${x.letter}s × ${formatCoins(x.each)} = +${formatCoins(x.won)} to your bank` : `One ${x.letter}: +${formatCoins(x.won)} to your bank`
  if (x.kind === 'none') return `No ${x.letter} in it: a miss, and the spin’s value is lost.`
  if (x.kind === 'vowel') return `Bought ${x.letter} for ${formatCoins(x.cost)}: ${x.n ? `${x.n} in the word` : 'not in the word'}.`
  if (x.kind === 'bankrupt') return 'Bankrupt! The bank’s back to nothing.'
  if (x.kind === 'lose') return 'Lose a turn: that counts as a miss.'
  if (x.kind === 'wrong') return `Not “${x.guess}”: a miss.`
  return ''
}
const CONSONANTS = [...'BCDFGHJKLMNPQRSTVWXYZ']
const VOWEL_KEYS = [...'AEIOU']

export function Wheel ({ coins, hold, toast }) {
  const [g, setG] = useState(null)
  const [stats, setStats] = useState(null)
  const [stake, setStake] = useState('100')
  const [spinning, setSpinning] = useState(false)
  const [guess, setGuess] = useState('')
  const [solving, setSolving] = useState(false)
  const load = () => api('tables').then((t) => { setG(t.wf); setStats(t.wheel) }).catch(() => {})
  useEffect(() => { load() }, [])
  const act = async (action, ...args) => {
    try {
      const res = await api('tablesAction', action, ...args)
      setStats(res.tables.wheel)
      return res.out
    } catch (err) { toast({ error: true, title: 'Can’t do that', text: err.message }); return null }
  }
  const after = (o) => {
    setG(o)
    if (!o?.done) return
    toast(o.solved ? { emoji: '🎉', title: `${o.word.toUpperCase()}! You keep ${formatCoins(o.paid)}`, text: `${signed(o.paid - o.stake)} on your stake.` } : { emoji: '💔', title: `Out of misses: it was ${o.word.toUpperCase()}`, text: `${signed(-o.stake)}.` })
  }
  const start = async () => { hold(400); const o = await act('wfStart', n); if (o) { setG(o); setGuess('') } }
  const spin = async () => {
    const o = await act('wfSpin')
    if (!o) return
    setG((x) => ({ ...x, segment: o.segment }))
    setSpinning(true)
    setTimeout(() => {
      setSpinning(false)
      after(o)
    }, WF_SPIN_MS)
  }
  const call = async (l) => { const o = await act('wfCall', l); if (o) after(o) }
  const vowel = async (l) => { const o = await act('wfVowel', l); if (o) after(o) }
  const solve = async (e) => { e.preventDefault(); const o = await act('wfSolve', guess); if (o) { after(o); setGuess(''); if (o.done) setSolving(false) } }
  const n = Math.floor(Number(stake) || 0)
  const live = g && !g.done
  const waiting = live && g.value !== null
  return (
    <div className='tb-game tb-wheelgame'>
      <div className='tb-left'>
        <WordsWheel segment={g?.segment ?? null} spinning={spinning} stake={g?.stake || n} />
        {live && <div className='wf-misses' aria-label={`${g.misses} of ${g.maxMisses} misses`}>{Array.from({ length: g.maxMisses }, (_, i) => <i key={i} className={i < g.maxMisses - g.misses ? 'on' : ''}>♥</i>)}</div>}
      </div>
      <div className='tb-right'>
        {g
          ? (
            <>
              <div className='wf-clue'>{g.clue} · {g.pattern.length} letters</div>
              <div className={`wf-board ${g.done ? (g.solved ? 'won' : 'lost') : ''}`}>{g.pattern.map((l, i) => <span key={i} className={`wf-cell ${l ? 'open' : ''}`}>{l || ''}</span>)}</div>
              <div className='wf-bank'><small>Bank</small><b><Coins n={g.bank} /></b>{waiting && !spinning && <span className='wf-value'>Landed on {formatCoins(g.coinsUp)}: call a consonant</span>}</div>
              {!spinning && g.last && <p className={`wf-last ${g.last.kind}`}>{lastText(g.last)}</p>}
            </>
            )
          : <p className='lede'>A hidden word, a wheel and your stake. Spin for a value and call consonants: each one in the word adds the value to your bank. Buy vowels from your bank, and solve the word to keep it all. Six misses and it’s gone.</p>}
        {live && (
          <>
            <div className='wf-keys'>
              {CONSONANTS.map((l) => <button key={l} className='wf-key' disabled={!waiting || spinning || g.called.includes(l)} onClick={() => call(l)}>{l}</button>)}
            </div>
            <div className='wf-keys vowels'>
              {VOWEL_KEYS.map((l) => <button key={l} className='wf-key vowel' disabled={waiting || spinning || g.called.includes(l) || g.bank < g.vowelCost} onClick={() => vowel(l)} title={`Buy for ${formatCoins(g.vowelCost)}`}>{l}</button>)}
              <small>{waiting ? 'Call a consonant first, then you can buy a vowel.' : g.bank < g.vowelCost ? `Vowels cost ${formatCoins(g.vowelCost)} from your bank, and it has ${formatCoins(g.bank)}: call some right consonants first.` : `Vowels cost ${formatCoins(g.vowelCost)} from your bank.`}</small>
            </div>
            {solving
              ? (
                <form className='tb-actions' onSubmit={solve}>
                  <input className='field' autoFocus value={guess} onChange={(e) => setGuess(e.target.value.replace(/[^a-z]/gi, '').slice(0, g.pattern.length))} placeholder='Type the word' aria-label='Your answer' />
                  <button className='btn ghost small' type='button' onClick={() => setSolving(false)}>Back</button>
                  <button className='btn primary' disabled={guess.length !== g.pattern.length}>Solve</button>
                </form>
                )
              : (
                <div className='tb-actions'>
                  <span className='tb-total'>Stake <Coins n={g.stake} /></span>
                  <button className='btn' onClick={() => setSolving(true)} disabled={waiting || spinning}>Solve</button>
                  <button className='btn primary' onClick={spin} disabled={waiting || spinning || !g.consonantsLeft}>{g.consonantsLeft ? 'Spin' : 'No consonants left'}</button>
                </div>
                )}
          </>
        )}
        {!live && (
          <div className='tb-actions'>
            <StakePicker stake={stake} setStake={setStake} coins={coins} min={WF_MIN_STAKE} />
            <button className='btn primary' onClick={start} disabled={!(n >= WF_MIN_STAKE) || n > coins}>{n > 0 && n < WF_MIN_STAKE ? `At least ${WF_MIN_STAKE}` : g ? 'Next word' : 'Play'}</button>
          </div>
        )}
        {stats && <p className='tb-stats'>{stats.words || 0} word{stats.words === 1 ? '' : 's'} · {stats.solved || 0} solved · <span className={stats.net >= 0 ? 'up' : 'down'}>{signed(stats.net)}</span></p>}
      </div>
    </div>
  )
}

// --- Wordjack ------------------------------------------------------------------------
// A tile. In a hand, the tiles the best word uses are lit; the rest wait.
export function Tile ({ l, small = false, fresh = false, lit = null }) {
  if (l === '?') return <span className={`tb-tile back ${small ? 'small' : ''}`} aria-label='face down'>?</span>
  return <span className={`tb-tile ${small ? 'small' : ''} ${fresh ? 'fresh' : ''} ${lit === true ? 'lit' : lit === false ? 'idle' : ''}`}>{l}<sub>{TILE_POINTS[l]}</sub></span>
}

// A hand of tiles with its best word.
export function WordHand ({ tiles, used = [], small = false, fresh = false }) {
  const set = new Set(used)
  return <>{tiles.map((l, i) => <Tile key={i} l={l} small={small} fresh={fresh && i === tiles.length - 1} lit={l === '?' ? null : set.has(i)} />)}</>
}

export function BestWord ({ word, score, bust }) {
  if (score === null || score === undefined) return null
  return (
    <span className={`tb-best ${bust ? 'bust' : score === 21 ? 'jack' : ''}`}>
      {word ? <em className='tb-word'>{word.toUpperCase()}</em> : <em className='tb-word none'>no word yet</em>}
      <b>{score}</b>{bust ? <span> bust!</span> : score === 21 ? <span> Wordjack!</span> : null}
    </span>
  )
}

export function Wordjack ({ coins, hold, toast }) {
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
        const vs = `${o.mineWord ? o.mineWord.toUpperCase() : 'No word'} (${o.mineScore}) against ${o.dealerWord ? o.dealerWord.toUpperCase() : 'no word'} (${o.dealerScore ?? '–'}).`
        toast({ emoji: o.result === 'win' ? '🎉' : o.result === 'bust' ? '💥' : o.result === 'push' ? '🤝' : '🃏', title: o.result === 'win' ? `You win ${formatCoins(o.paid)}` : o.result === 'bust' ? 'Bust' : o.result === 'push' ? 'A push: your stake back' : 'The dealer wins', text: vs })
      }
    } catch (err) { hold(0); toast({ error: true, title: 'Can’t do that', text: err.message }) }
  }
  const n = Math.floor(Number(stake) || 0)
  const playing = h && !h.done
  return (
    <div className='tb-game tb-bj'>
      <div className='tb-felt'>
        <div className='tb-hand'>
          <small>Dealer {h?.done ? <BestWord word={h.dealerWord} score={h.dealerScore} bust={h.dealerScore > 21} /> : null}</small>
          <div className='tb-tiles'>{h ? <WordHand tiles={h.dealer} used={h.done ? h.dealerUsed : []} /> : <span className='tb-empty'>The dealer draws until their best word is worth 17 or more.</span>}</div>
        </div>
        <div className='tb-hand mine'>
          <small>You {h ? <BestWord word={h.mineWord} score={h.mineScore} bust={h.mineScore > 21} /> : null}</small>
          <div className='tb-tiles'>{h ? <WordHand tiles={h.mine} used={h.mineUsed} fresh={playing} /> : <span className='tb-empty'>Each tile is worth its Scrabble points plus 3. Your hand is worth its best word: the highest-scoring word your tiles can spell. Tiles it doesn’t use stay in your hand, so every draw could push your best word over 21. Beat the dealer without going over; a winning word worth exactly 21 is a Wordjack and pays 3 to 2.</span>}</div>
        </div>
        {h?.done && <div className={`tb-result ${h.result}`}>{h.result === 'win' ? `Won ${formatCoins(h.paid)}` : h.result === 'bust' ? 'Bust' : h.result === 'push' ? 'Push' : 'Dealer wins'}</div>}
      </div>
      <div className='tb-actions'>
        {playing
          ? (
            <>
              <span className='tb-total'>Stake <Coins n={h.stake} />{h.doubled ? ' (doubled)' : ''}</span>
              <button className='btn' onClick={() => act('bjHit')} disabled={h.full}>Draw a tile</button>
              <button className='btn' onClick={() => act('bjDouble')} disabled={!h.canDouble}>Double</button>
              <button className='btn primary' onClick={() => act('bjStand')}>Stand</button>
            </>
            )
          : (
            <>
              <StakePicker stake={stake} setStake={setStake} coins={coins} />
              <button className='btn primary' onClick={() => act('bjDeal', n)} disabled={!(n >= 1) || n > coins}>Deal</button>
            </>
            )}
      </div>
      {stats && <p className='tb-stats'>Ties push, a win pays 1 to 1 and a Wordjack pays 3 to 2: no house edge. {stats.hands} hand{stats.hands === 1 ? '' : 's'} · {stats.wins} won · {stats.jacks || 0} Wordjack{stats.jacks === 1 ? '' : 's'} · <span className={stats.net >= 0 ? 'up' : 'down'}>{signed(stats.net)}</span></p>}
    </div>
  )
}

// --- the lobby tables ------------------------------------------------------------------------
// Letter Roulette and Wordjack around a lobby table: everyone against
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
      <div className='tsub'>Dealer {phase === 'reveal' && res?.dealer ? <BestWord word={res.dealerWord} score={res.dealerTotal} bust={res.dealerTotal > 21} /> : null}</div>
      <div className='tb-tiles center'>{dealer ? <WordHand tiles={dealer} used={phase === 'reveal' ? res?.dealerUsed : []} small /> : <span className='tsub'>{phase === 'betting' ? 'Stakes first. The dealer draws to 17; ties push.' : phase === 'drawing' ? 'Dealing…' : res?.void ? 'Nobody played this hand.' : ''}</span>}</div>
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
      {hand && <span className='tb-seat-tiles'><WordHand tiles={hand.tiles} used={hand.used} small /><b className={hand.total > 21 ? 'down' : ''}>{hand.word ? `${hand.word.toUpperCase()} ` : ''}{hand.total}</b></span>}
      {bet === null && phase !== 'reveal' && <span className='tag'>sitting out</span>}
      {bet && net === undefined && <span className='tag'>{c.style === 'roulette' ? `bet ${formatCoins(bet.total)}` : `stake ${formatCoins(bet.total)}${bet.doubled ? ' ×2' : ''}`}</span>}
      {net !== undefined && <span className={`tag ${net > 0 ? 'ok' : net < 0 ? 'lo' : ''}`}>{net > 0 ? `won ${formatCoins(net)}` : net < 0 ? `lost ${formatCoins(-net)}` : c.style === 'roulette' ? 'even' : 'push'}</span>}
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
        <StakePicker stake={stake} setStake={setStake} coins={coins} />
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
      <Chips chip={chip} setChip={setChip} coins={coins} left={coins - total} />
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
