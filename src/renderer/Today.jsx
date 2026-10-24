import { useCallback, useEffect, useState } from 'react'
import { api, Avatar, Coins, useToast, useInterval } from './ui.jsx'
import { burst, centerOf } from './effects.js'
import { playRating } from './sound.js'

// Today: Daily Clues (one word, the same for everyone), three quests, a
// weekly challenge and the free spin. Everything resets at midnight UTC.
const KIND_TAB = { words: 'play', topic: 'play', streak: 'play', catch: 'play', trade: 'market', spin: 'casino', flip: 'casino', lobby: 'lobby', clues: null, duel: 'leximon', train: 'leximon' }

export default function Today ({ settings, goTo, onChange }) {
  const toast = useToast()
  const [v, setV] = useState(null)
  const [friends, setFriends] = useState([])
  const load = useCallback(() => {
    api('today').then((t) => { setV(t); onChange?.(t) }).catch(() => {})
    api('friendsToday').then(setFriends).catch(() => {})
  }, [onChange])
  useEffect(() => { load() }, [load])
  useInterval(load, 30000)
  const act = async (action, ...args) => {
    try { const { out, today } = await api('todayAction', action, ...args); setV(today); onChange?.(today); return out } catch (err) { toast({ error: true, title: 'Can’t do that', text: err.message }); return null }
  }
  if (!v) return null
  const left = Math.max(0, v.resetsAt - Date.now())
  const claim = async (q, el) => {
    const out = await act('claim', q.id)
    if (!out) return
    const at = centerOf(el); burst(at.x, at.y, out.all ? 'confetti' : 'confetti-small')
    toast({ emoji: out.all ? '🌟' : q.emoji, title: out.all ? `All three done! +${out.coins.toLocaleString()} coins` : `+${out.coins.toLocaleString()} coins`, text: out.all ? `${out.streak} day${out.streak === 1 ? '' : 's'} in a row with every quest done.` : q.text })
  }
  const freeSpin = async () => {
    try {
      const out = await api('economyAction', 'spin', 0, { free: true })
      toast({ emoji: '🎰', title: out.word ? `${out.reels.join('').toUpperCase()}: “${out.word}” pays ×${out.mult}` : `${out.reels.join('').toUpperCase()}: no word`, text: out.word ? `+${out.won.toLocaleString()} coins on the house.` : 'Better luck tomorrow. It was free!' })
      if (out.won) playRating(4.6, settings)
      load()
    } catch (err) { toast({ error: true, title: 'Can’t spin', text: err.message }) }
  }
  return (
    <div className='page today'>
      <div className='mk-head'>
        <div>
          <h1>Today</h1>
          <p className='lede'>A word to guess, three quests and a weekly challenge, the same for everyone. Everything new in {Math.floor(left / 3600e3)} h {Math.floor((left % 3600e3) / 60e3)} min (midnight UTC).</p>
        </div>
        <div className='mk-summary'>
          <div><small>Quest streak</small><b>{v.streak} 🔥</b><small>days with all three</small></div>
        </div>
      </div>
      <div className='td-grid'>
        <Clues c={v.clues} act={act} friends={friends} toast={toast} settings={settings} />
        <div className='td-side'>
          <section className='td-quests panel'>
            <h2>Quests</h2>
            {v.quests.map((q) => (
              <div key={q.id} className={`td-quest ${q.claimed ? 'claimed' : q.have >= q.n ? 'ready' : ''}`}>
                <span className='em'>{q.emoji}</span>
                <div>
                  <b>{q.text}</b>
                  <div className='lx-bar'><i style={{ width: `${(q.have / q.n) * 100}%` }} /></div>
                  <small>{q.have} of {q.n}{KIND_TAB[q.kind] && q.have < q.n ? <> · <button className='linkish' onClick={() => goTo(KIND_TAB[q.kind])}>Go</button></> : ''}</small>
                </div>
                {q.claimed ? <span className='td-done'>✓</span> : <button className='btn small primary' disabled={q.have < q.n} onClick={(e) => claim(q, e.currentTarget)}><Coins n={v.questReward} /></button>}
              </div>
            ))}
            <small className='td-bonus'>{v.allDone ? `All three done today. 🔥 ${v.streak}` : <>Finish all three for <Coins n={v.allBonus} /> more and a day on your streak.</>}</small>
          </section>
          <section className='td-weekly panel'>
            <h2>This week</h2>
            <div className={`td-quest ${v.weekly.claimed ? 'claimed' : v.weekly.have >= v.weekly.n ? 'ready' : ''}`}>
              <span className='em'>{v.weekly.emoji}</span>
              <div>
                <b>{v.weekly.text}</b>
                <div className='lx-bar'><i style={{ width: `${(v.weekly.have / v.weekly.n) * 100}%` }} /></div>
                <small>{v.weekly.have} of {v.weekly.n} · ends {new Date(v.weekly.ends).toLocaleDateString([], { weekday: 'long' })}</small>
              </div>
              {v.weekly.claimed ? <span className='td-done'>✓</span> : <button className='btn small primary' disabled={v.weekly.have < v.weekly.n} onClick={async (e) => { const el = e.currentTarget; const out = await act('claimWeekly'); if (out) { const at = centerOf(el); burst(at.x, at.y, 'confetti'); toast({ emoji: '🏆', title: `+${out.coins.toLocaleString()} coins`, text: 'Weekly challenge done.' }) } }}><Coins n={v.weekly.reward} /></button>}
            </div>
          </section>
          <section className='td-spin panel'>
            <h2>Free spin</h2>
            <p>{v.freeSpin.ready ? <>One spin of Wird Slots, on the house, worth <Coins n={v.freeSpin.amount} />.</> : 'Used today. Another at midnight UTC.'}</p>
            <span><button className='btn small primary' disabled={!v.freeSpin.ready} onClick={freeSpin}>🎰 Spin it</button> <button className='btn small ghost' onClick={() => goTo('casino')}>Casino</button></span>
          </section>
        </div>
      </div>
    </div>
  )
}

function Clues ({ c, act, friends, toast, settings }) {
  const [text, setText] = useState('')
  const done = c.solved || c.gaveUp
  const shown = c.clues.filter((x) => x.kind !== 'start' && x.kind !== 'letter')
  const go = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    const out = await act('guess', text)
    setText('')
    if (out?.solved) { const at = centerOf(document.querySelector('.td-clues .blanks')); burst(at.x, at.y, 'confetti'); playRating(5, settings) }
  }
  const played = friends.filter((f) => f.done)
  return (
    <section className='td-clues panel'>
      <div className='td-clues-head'><h2>Daily Clues <small>#{c.number}</small></h2>{!done && <span className='td-worth'>Worth <b>{c.worth}</b></span>}</div>
      <div className='blanks big'>
        {c.pattern.map((x, i) => <span key={`${i}${x}`} className={`blank ${x ? 'open' : ''}`}>{x || ''}</span>)}
      </div>
      <div className='clue-list'>
        {shown.map((x, i) => <div key={i} className={`clue ${i === shown.length - 1 && !done ? 'new' : ''}`}><i>{({ pos: 'kind', def: 'means', syn: 'like', ex: 'as in' })[x.kind]}</i> {x.kind === 'ex' ? `“${x.text}”` : x.text}</div>)}
        {!shown.length && <div className='clue'><i>start</i> {c.pattern.length} letters. Ask for a clue when you’re ready.</div>}
      </div>
      {!done
        ? (
          <>
            <form className='clue-form' onSubmit={go}>
              <input className='field' value={text} maxLength={40} onChange={(e) => setText(e.target.value)} placeholder='Your guess' aria-label='Your guess' />
            </form>
            <div className='td-clue-acts'>
              <button className='btn small' disabled={c.clue >= c.count - 1} onClick={() => act('nextClue')}>Next clue (−12)</button>
              <button className='btn small ghost' onClick={() => act('giveUp')}>Give up</button>
              {c.guesses.length > 0 && <small>Not: {c.guesses.join(', ')}</small>}
            </div>
          </>
          )
        : (
          <div className='td-result'>
            <div className='tword' style={{ fontSize: 34 }}>{c.word}</div>
            <p>{c.solved ? <>Solved with {c.clue ? `${c.clue} extra clue${c.clue === 1 ? '' : 's'}` : 'no extra clues'} and {c.wrong} miss{c.wrong === 1 ? '' : 'es'}: <b>{c.points}</b> points, +<Coins n={c.coins} /></> : 'Stumped today. A new one at midnight UTC.'}</p>
            {c.info?.senses?.[0] && <p className='td-def'><i>{c.info.senses[0].posName}</i> {c.info.senses[0].def}</p>}
            <pre className='td-share'>{c.share}</pre>
            <button className='btn small' onClick={() => { api('copy', c.share); toast({ emoji: '📋', title: 'Copied', text: 'Paste it anywhere. It doesn’t give the word away.' }) }}>Copy result</button>
          </div>
          )}
      {friends.length > 0 && (
        <div className='td-friends'>
          <h3>Friends today</h3>
          {friends.map((f) => (
            <div key={f.userId} className='td-friend'><Avatar name={f.name} color={f.color} size={24} /><b title={f.name}>{f.name}</b><span className='td-pts'>{f.done && f.solved ? `${f.points} pts` : ''}</span><span className='td-how'>{!f.done ? 'not yet' : f.solved ? `${f.clue} clue${f.clue === 1 ? '' : 's'}${f.wrong ? `, ${f.wrong} miss${f.wrong === 1 ? '' : 'es'}` : ''}` : 'stumped'}</span></div>
          ))}
          {!played.length && <small>Nobody else has played yet{done ? '' : ' (their results show once you’ve been online together)'}.</small>}
        </div>
      )}
    </section>
  )
}
