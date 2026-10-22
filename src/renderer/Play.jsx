import { WildWord } from './Leximon.jsx'
import { useEffect, useRef, useState, useCallback } from 'react'
import { typeRating, ratingValue, nudge, formatRating } from '../shared/progress.js'
import { api, R, Avatar, Kbd, Bar, icons, speak, useToast, celebrate, wordSize, ratingColor, Coins, useInterval } from './ui.jsx'
import { playRating } from './sound.js'
import { burst, centerOf, fxFor, burstFor } from './effects.js'

// The solo game. Keyboard first, like the original:
//   digits      type a rating (4 → 4., 7 → 4.7, 5 → 5.0)
//   Enter       rate; Enter again for the next word
//   ↑ ↓         nudge by 0.1 (Shift: 0.5)      Backspace  clear
//   ← →         back and forward through this sitting's words; → on the
//               newest unrated word skips it (with a note, in case)
//   Space       say it      / or Ctrl+K  search
//   F favorite  C comment  A add to playlist   M playlists
export default function Play ({ mode, setMode, modes, settings, refreshTop, focusWord, clearFocusWord, active, econ }) {
  const toast = useToast()
  const [card, setCard] = useState(null) // { word, info, chain, note, empty }
  const [text, setText] = useState('')
  const [rated, setRated] = useState(null) // the result of rating this card
  const [floats, setFloats] = useState([])
  const [stampKey, setStampKey] = useState(0)
  const [panel, setPanel] = useState(null) // 'comment' | 'add' | 'modes'
  const [showAll, setShowAll] = useState(false)
  const [fx, setFx] = useState(null) // { kind: 'perfect' | 'sparkle' | 'zero' | 'wilt', key }
  const [wild, setWild] = useState(null) // a wild word to catch for the Leximon
  useEffect(() => { if (active) api('leximon').then((v) => setWild(v.encounter || null)).catch(() => {}) }, [active])
  // Every word seen this sitting, in order, and where we are in it. Going
  // back and forward walks this list; only stepping past the end deals.
  const trail = useRef({ items: [], pos: -1 })
  const [where, setWhere] = useState({ pos: -1, len: 0 })
  const [skipNote, setSkipNote] = useState(null) // { word, index } just skipped
  const inputRef = useRef(null)
  const autoTimer = useRef(null)
  const loading = useRef(false) // a word is being dealt or a rating saved
  const pending = useRef('') // digits typed meanwhile

  const show = useCallback((dealt) => {
    clearTimeout(autoTimer.current)
    setFx(null)
    setCard(dealt)
    setShowAll(false)
    setFloats([])
    const mine = dealt.info?.mine?.r
    setRated(mine !== null && mine !== undefined ? { r: mine, again: true } : null)
    const typed = pending.current
    pending.current = ''
    setText(typed ? typeRating(typed) : mine !== null && mine !== undefined ? formatRating(mine) : '')
    if (dealt.word && settings.speakOnReveal) speak(dealt.word)
  }, [settings.speakOnReveal])

  const sync = () => setWhere({ pos: trail.current.pos, len: trail.current.items.length })

  const push = (item) => {
    const t = trail.current
    t.items = [...t.items, item].slice(-200)
    t.pos = t.items.length - 1
    sync()
  }

  const goTo = useCallback(async (i) => {
    const t = trail.current
    const item = t.items[i]
    if (!item) return
    loading.current = true
    const info = await api('wordInfo', item.word).finally(() => { loading.current = false })
    if (!info) return
    t.pos = i
    sync()
    setSkipNote(null)
    show({ ...item, chain: i === t.items.length - 1 ? item.chain : null, info })
  }, [show])

  // A new word from the current playlist, added to the end of the trail.
  const dealNew = useCallback(async (m = mode) => {
    try {
      loading.current = true
      const dealt = await api('deal', m, card?.word || null).finally(() => { loading.current = false })
      if (dealt.word) push({ word: dealt.word, mode: m, chain: dealt.chain, note: dealt.note })
      show(dealt)
    } catch (err) { toast({ error: true, title: 'Couldn’t deal a word', text: err.message }) }
  }, [mode, card, show, toast])

  // Forward: the next word already seen, or a new one at the end.
  const next = useCallback(() => {
    const t = trail.current
    setSkipNote(null)
    if (t.pos < t.items.length - 1) goTo(t.pos + 1)
    else dealNew()
  }, [goTo, dealNew])

  const back = useCallback(() => {
    if (trail.current.pos > 0) goTo(trail.current.pos - 1)
  }, [goTo])

  // → on the newest word without a rating: move on, but say so.
  const skip = useCallback(() => {
    const t = trail.current
    const item = t.items[t.pos]
    if (!item) return dealNew()
    item.skipped = true
    setSkipNote({ word: item.word, index: t.pos })
    api('count', 'skips').then((res) => celebrate(toast, res)).catch(() => {})
    dealNew()
  }, [dealNew])

  // Opening a word (search, synonyms, collection) adds it to the trail.
  const open = useCallback(async (word) => {
    const info = await api('wordInfo', word)
    if (!info) return
    setSkipNote(null)
    push({ word, mode })
    show({ mode, word, info })
  }, [mode, show])

  useEffect(() => { dealNew(mode) }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (focusWord) { open(focusWord); clearFocusWord() } }, [focusWord]) // eslint-disable-line react-hooks/exhaustive-deps

  // Friends' ratings arrive in the background.
  useEffect(() => window.ww.on.friendRecords(async () => {
    if (card?.word) {
      const info = await api('wordInfo', card.word)
      setCard((c) => (c && c.word === info?.word ? { ...c, info } : c))
    }
  }), [card?.word])

  const submit = useCallback(async () => {
    const r = ratingValue(text)
    if (r === null || !card?.word || loading.current) return
    try {
      loading.current = true
      const [earned, info] = await (async () => {
        try { const e = await api('rate', card.word, r); return [e, await api('wordInfo', card.word)] } finally { loading.current = false }
      })()
      setCard((c) => ({ ...c, info, chain: earned.chain || c.chain }))
      setRated({ ...earned, r })
      setText(formatRating(r))
      setStampKey((k) => k + 1)
      setFloats([...(earned.coins ? [{ coin: true, amount: earned.coins.coins, why: earned.coins.broke ? `same score ${earned.coins.same.n}× in a row: no streak` : earned.coins.firstToday ? 'first word today' : earned.coins.streak.n > 1 ? `×${earned.coins.streak.mult.toFixed(2)} streak` : '', warn: earned.coins.broke, id: `${stampKey}-c` }] : []), ...earned.xp.map((x, i) => ({ ...x, id: `${stampKey}-${i}` }))])
      setTimeout(() => setFloats([]), 1900)
      playRating(r, settings)
      // The extremes get a moment of their own.
      const kind = fxFor(r, settings.animations)
      setFx(kind ? { kind, key: Date.now() } : null)
      if (burstFor(kind)) {
        const at = centerOf(inputRef.current)
        requestAnimationFrame(() => burst(at.x, at.y, burstFor(kind)))
      }
      setSkipNote(null)
      if (earned.leximon?.encounter) setWild(earned.leximon.encounter)
      else if (earned.leximon?.fled) setWild((w) => (w && w.word === earned.leximon.fled ? null : w))
      for (const u of earned.leximon?.ups || []) toast({ emoji: '🃏', title: `${u.word} reached level ${u.level}`, text: 'Your Leximon team learns from every new word.' })
      celebrate(toast, earned)
      if (earned.coins?.broke && earned.coins.same.n === 5) toast({ emoji: '🧯', title: 'Streak lost', text: `That’s ${formatRating(r)} five times in a row. The pace streak is for real ratings, so the same score over and over ends it. Give each word the score it deserves.`, ms: 7000 })
      if (earned.twins.length) toast({ emoji: '👯', title: `Same as ${earned.twins.join(' and ')}`, text: `You both gave “${card.word}” a ${formatRating(r)}.` })
      refreshTop()
      if (settings.autoAdvanceMs) autoTimer.current = setTimeout(() => next(), settings.autoAdvanceMs)
    } catch (err) { toast({ error: true, title: 'Couldn’t save that rating', text: err.message }) }
  }, [text, card, settings, toast, refreshTop, next, stampKey])

  const isRated = rated && ratingValue(text) === rated.r
  // A word you opened yourself (search, synonyms, Collection) that the game
  // hasn't dealt you: look, don't rate.
  const viewOnly = Boolean(card?.info && card.info.canRate === false)

  // Keys are ignored only while you're typing in a real text box (a comment,
  // a playlist name) or the playlist picker is open. A side panel left open
  // never swallows keys: it just stays there until Esc or you're done.
  const onKey = useCallback((e) => {
    if (!active) return
    if (e.key === 'Escape') { setPanel(null); return }
    if (panel === 'modes') return
    const tag = e.target.tagName
    if ((tag === 'INPUT' && e.target !== inputRef.current) || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key
    // Holding Enter or → down shouldn't fly through words.
    if (e.repeat && (k === 'Enter' || k === 'ArrowRight' || k === 'ArrowLeft')) { e.preventDefault(); return }
    // While the next word is on its way, keep typed digits for it.
    if (loading.current) {
      if (/^[0-9.]$/.test(k)) { e.preventDefault(); pending.current += k }
      else if (k === 'Enter') e.preventDefault()
      return
    }
    if (viewOnly && (/^[0-9.]$/.test(k) || k === 'Enter' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'Backspace')) {
      e.preventDefault()
      if (k === 'Enter') next()
      return
    }
    if (k === 'Enter') {
      e.preventDefault()
      if (card?.empty) return
      if (isRated) next()
      else if (ratingValue(text) !== null) submit()
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault()
      const base = ratingValue(text) ?? (rated?.r ?? 2.5)
      setText(formatRating(nudge(base, (k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.5 : 0.1))))
    } else if (k === 'Backspace') {
      e.preventDefault()
      setText('')
    } else if (/^[0-9.]$/.test(k)) {
      e.preventDefault()
      const start = text.length === 3 || isRated ? '' : text
      setText(typeRating(start + k))
    } else if (k === ' ') {
      e.preventDefault()
      if (card?.word) speak(card.word)
    } else if (k === 'ArrowLeft') {
      e.preventDefault()
      back()
    } else if (k === 'ArrowRight') {
      e.preventDefault()
      if (card?.empty) return
      const t = trail.current
      const atNewest = t.pos >= t.items.length - 1
      const hasRating = isRated || (card?.info?.mine?.r ?? null) !== null
      if (atNewest && !hasRating && !viewOnly) skip()
      else next()
    } else if (k === 'f' || k === 'F') {
      toggleFav()
    } else if (k === 'c' || k === 'C') {
      e.preventDefault(); setPanel('comment')
    } else if (k === 'a' || k === 'A') {
      e.preventDefault(); setPanel('add')
    } else if (k === 'm' || k === 'M') {
      e.preventDefault(); setPanel('modes')
    }
  }, [active, panel, card, text, rated, isRated, viewOnly, next, back, skip, submit]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onKey])

  async function toggleFav () {
    if (!card?.word) return
    const res = await api('favorite', card.word, !card.info.mine.favorite)
    setCard((c) => ({ ...c, info: res.info }))
    celebrate(toast, res)
  }

  const current = modes.all.find((m) => m.id === mode) || { name: 'Shuffle', emoji: '🎲' }
  const info = card?.info
  const senses = info ? (showAll ? info.senses : info.senses.slice(0, 3)) : []
  const r = ratingValue(text)

  return (
    <div className='play'>
      {wild && <WildWord e={wild} toast={toast} active={active} onDone={() => setWild(null)} />}
      <section className='stage'>
        <div className='modebar'>
          <button className='modebtn' onClick={() => setPanel('modes')} title='Choose a playlist (M)'>
            <span className='em'>{current.emoji}</span>{current.name}{icons.chevron()}
          </button>
          {current.total > 1 && <span className='prog'>{current.done.toLocaleString()} of {current.total.toLocaleString()} rated</span>}
          {card?.note && <span className='note'>{card.note}</span>}
        </div>
        <div className='trailbar' aria-live='polite'>
          {skipNote && (
            <span className='skipnote'>
              Skipped “{skipNote.word}”.
              <button onClick={() => { setSkipNote(null); goTo(skipNote.index) }}>Undo</button>
            </span>
          )}
          {!skipNote && where.pos < where.len - 1 && (
            <span className='looking-back'>
              {where.len - 1 - where.pos === 1 ? 'One word back.' : `${where.len - 1 - where.pos} words back.`} <Kbd>→</Kbd> goes forward without dealing new words.
            </span>
          )}
          {!skipNote && trail.current.items[where.pos]?.skipped && (card?.info?.mine?.r ?? null) === null && <span className='skipped-tag'>You skipped this one</span>}
        </div>

        {card?.empty
          ? (
            <div className='empty-state'>
              <div className='big'>🏁</div>
              <p>{card.empty}</p>
              <button className='btn primary' onClick={() => setPanel('modes')}>Choose another playlist</button>
            </div>
            )
          : card?.word && (
            <>
              <div className='word-area'>
                <h1 key={`${card.word}-${fx?.key || 0}`} className={`word ${fx ? `fx-${fx.kind}` : ''}`} style={{ fontSize: wordSize(card.word) }} aria-label={card.word}>
                  {fx?.kind === 'zero' || fx?.kind === 'crumble'
                    ? [...card.word].map((ch, i) => <span key={i} className='fall' aria-hidden='true' style={{ '--d': `${(i * 37) % 11 * 0.03}s`, '--x': `${((i * 53) % 9 - 4) * 14}px`, '--r': `${((i * 71) % 13 - 6) * 18}deg` }}>{ch}</span>)
                    : card.word}
                </h1>
                <div className='say'>
                  <button onClick={() => speak(card.word)} title='Say it (Space)' aria-label='Say it'>{icons.speaker()}</button>
                  {info.ipa.length ? <span>/{info.ipa[0]}/</span> : null}
                  <span className='pos'>{[...new Set(info.senses.map((s) => s.posName))].join(', ')}</span>
                </div>

                {viewOnly && (
                  <div className='view-only'>
                    <b>Just looking</b>
                    <span>Words come to you. You can rate “{card.word}” when it comes up while you play.</span>
                    <span><Kbd>Enter</Kbd> or <Kbd>→</Kbd> back to playing</span>
                  </div>
                )}
                <div className='rate-row' hidden={viewOnly}>
                  <div className='rating-box'>
                    <input
                      ref={inputRef}
                      key={stampKey}
                      className={`rating-input ${isRated ? 'locked stamp' : ''}`}
                      value={text}
                      readOnly
                      placeholder='0.0'
                      aria-label='Your rating out of 5'
                      style={{ color: r !== null ? ratingColor(r) : undefined }}
                    />
                  </div>
                  <div className='rate-help'>
                    <div className='stars' aria-hidden='true'>
                      {[0, 1, 2, 3, 4].map((i) => <span key={i}><i style={{ width: `${Math.max(0, Math.min(1, (r ?? 0) - i)) * 100}%`, background: ratingColor(r) }} /></span>)}
                    </div>
                    {isRated
                      ? <span><Kbd>Enter</Kbd> next word{rated.again && !rated.xp ? ', or type to change your rating' : ''}</span>
                      : r !== null ? <span><Kbd>Enter</Kbd> to rate <b>{text}</b></span> : <span>Type a rating out of 5</span>}
                    <StreakMeter streak={econ?.streak} same={econ?.same} limit={econ?.sameLimit || 5} />
                    <div className='xp-float' aria-hidden='true'>
                      {floats.map((f) => f.coin ? <span key={f.id} className={`coin-float ${f.warn ? 'warn' : ''}`}>+<Coins n={f.amount} /><em>{f.why}</em></span> : <span key={f.id}>+{f.amount} xp<em>{f.why}</em></span>)}
                    </div>
                  </div>
                </div>
                {isRated && info.compare && <Compare key={`${card.word}-${rated.r}`} c={info.compare} r={rated.r} />}
              </div>

              <div className='entry'>
                <ol>
                  {senses.map((s, i) => (
                    <li key={i}><span className='pos'>{s.posName}</span>{s.def}{s.ex[0] && <span className='ex'>{' '}“{s.ex[0]}”</span>}</li>
                  ))}
                </ol>
                {info.senses.length > 3 && <button className='more' onClick={() => setShowAll((v) => !v)}>{showAll ? 'Fewer meanings' : `${info.senses.length - 3} more meanings`}</button>}
              </div>
            </>
            )}

        <div className='keys'>
          <span><Kbd>0–5</Kbd> rate</span>
          <span><Kbd>Enter</Kbd> submit, then next</span>
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> nudge</span>
          <span><Kbd>←</Kbd><Kbd>→</Kbd> back, forward or skip</span>
          <span><Kbd>/</Kbd> search</span>
          <span><Kbd>Space</Kbd> say it</span>
          <span><Kbd>F</Kbd> favorite</span>
          <span><Kbd>C</Kbd> comment</span>
          <span><Kbd>A</Kbd> add to playlist</span>
          <span><Kbd>M</Kbd> playlists</span>
        </div>
      </section>

      <aside className='side'>
        {card?.chain && <Chain chain={card.chain} current={card.word} />}
        <Friends info={info} revealed={Boolean(isRated || info?.mine?.r !== null)} />
        {info && (
          <div>
            <h3>You</h3>
            <div className='my-actions'>
              <button className='chip' onClick={toggleFav} aria-pressed={info.mine.favorite}>{info.mine.favorite ? '💛 Favorite' : '🤍 Favorite'}</button>
              <button className='chip' onClick={() => setPanel('comment')}>✍️ {info.mine.comment ? 'Edit comment' : 'Comment'}</button>
              <button className='chip' onClick={() => setPanel('add')}>➕ Playlist</button>
            </div>
            {info.mine.comment && panel !== 'comment' && <p className='cmt' style={{ fontFamily: 'var(--font-read)', color: 'var(--dim)', marginBottom: 0 }}>“{info.mine.comment}”</p>}
            {panel === 'comment' && <CommentBox word={card.word} initial={info.mine.comment || ''} onDone={(res) => { setPanel(null); if (res) { setCard((c) => ({ ...c, info: res.info })); celebrate(toast, res); refreshTop() } }} />}
            {panel === 'add' && <AddToPlaylist word={card.word} lists={modes.playlists} onDone={() => { setPanel(null); refreshTop() }} />}
          </div>
        )}
        {info?.synonyms.length > 0 && (
          <div>
            <h3>Synonyms</h3>
            <div className='syns'>{info.synonyms.slice(0, 16).map((w) => <button key={w} className='chip' onClick={() => { open(w); api('count', 'synonymsOpened').then((res) => celebrate(toast, res)).catch(() => {}) }}>{w}</button>)}</div>
          </div>
        )}
      </aside>

      {panel === 'modes' && <ModePicker modes={modes} mode={mode} onPick={(m) => { setPanel(null); if (m === mode) dealNew(m); else setMode(m) }} onClose={() => setPanel(null)} />}
    </div>
  )
}

// After you rate: where you landed against your friends (or, with no
// friends on this word yet, against your own ratings). Everyone starts in
// the middle and slides to where they rated, so it plays like a reveal.
function Compare ({ c, r }) {
  const [shown, setShown] = useState(false)
  useEffect(() => { const t = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(t) }, [])
  const at = (v) => `${(shown ? v : 2.5) / 5 * 100}%`
  // Friends who gave the same rating stack up.
  const stacks = {}
  const dots = c.friends.map((f) => { const k = f.r.toFixed(1); stacks[k] = (stacks[k] || 0) + 1; return { ...f, level: stacks[k] } })
  if (!c.friends.length && !c.self) return null
  return (
    <div className='compare'>
      {c.verdict && <div className={`verdict tone-${c.verdict.tone}`}>{c.verdict.text}</div>}
      <div className='scale' role='img' aria-label={`You rated ${formatRating(r)}${c.table ? `, your friends averaged ${formatRating(c.table.avg)}` : ''}`}>
        <div className='track' />
        {[0, 1, 2, 3, 4, 5].map((t) => <span key={t} className='tick' style={{ left: `${t * 20}%` }}>{t}</span>)}
        {c.self && <span className='mark self' style={{ left: at(c.self.avg) }} title={`Your average: ${formatRating(c.self.avg)}`} />}
        {c.table && c.table.n > 1 && <span className='mark avg' style={{ left: at(c.table.avg) }} title={`Friends’ average: ${formatRating(c.table.avg)}`} />}
        {dots.map((f) => (
          <span key={f.userId} className='dot' style={{ left: at(f.r), bottom: `${7 + (f.level - 1) * 26}px`, background: f.color }} title={`${f.name}: ${formatRating(f.r)}`}>{f.name[0].toUpperCase()}</span>
        ))}
        <span className='me' style={{ left: at(r), color: ratingColor(r) }}>{formatRating(r)}<b>you</b></span>
      </div>
      <div className='legend'>
        {c.table && c.table.n > 1 && <span><i className='l-avg' />Friends’ average {formatRating(c.table.avg)}</span>}
        {c.table && c.table.n === 1 && <span>{c.friends[0].name} said {formatRating(c.friends[0].r)}</span>}
        {c.self && <span><i className='l-self' />Your average {formatRating(c.self.avg)}</span>}
      </div>
      {!c.friends.length && c.self && c.self.n < 10 && <div className='verdict tone-self'>Rate {10 - c.self.n} more to see how your words stack up. Add friends to compare with them.</div>}
    </div>
  )
}

function Friends ({ info, revealed }) {
  if (!info) return null
  const takes = info.friends
  const cmp = Object.fromEntries((info.compare?.friends || []).map((f) => [f.userId, f]))
  return (
    <div>
      <h3>Friends {takes.length > 0 && !revealed && <span style={{ fontWeight: 400, fontSize: 13 }}>Shown once you rate it</span>}</h3>
      {!takes.length && <div className='empty'>None of your friends has rated this one yet.</div>}
      {takes.map((f) => (
        <div key={f.userId} className='friend-take'>
          <Avatar name={f.name} color={f.color} />
          <div>
            <div className='name'>{f.name}{f.favorite && ' 💛'}</div>
            {revealed && (cmp[f.userId]?.match ?? null) !== null && <div className='meta'>{cmp[f.userId].match}% taste match{cmp[f.userId].diff !== 0 ? `, you ${cmp[f.userId].diff > 0 ? '+' : ''}${cmp[f.userId].diff.toFixed(1)}` : ', same as you'}</div>}
            {revealed && f.comment && <div className='cmt'>“{f.comment}”</div>}
          </div>
          {f.r === null ? <span /> : revealed ? <R r={f.r} /> : <span className='hidden-r' aria-label='Hidden until you rate' />}
        </div>
      ))}
    </div>
  )
}

function Chain ({ chain, current }) {
  const done = chain.words.filter((w) => w.rated).length
  return (
    <div>
      <h3>Synonym chain <span style={{ fontWeight: 400, fontSize: 13 }}>{done} of {chain.words.length}</span></h3>
      <div className='chain'>
        {chain.words.map((w) => <span key={w.word} className={`link ${w.word === current ? 'now' : w.rated ? 'done' : ''}`}>{w.word}</span>)}
      </div>
    </div>
  )
}

function CommentBox ({ word, initial, onDone }) {
  const [text, setText] = useState(initial)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  const save = async () => onDone(await api('comment', word, text))
  return (
    <div className='comment-box' style={{ marginTop: 10 }}>
      <textarea
        ref={ref}
        className='field'
        maxLength={280}
        value={text}
        placeholder={`What do you think of “${word}”?`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
          if (e.key === 'Escape') { e.stopPropagation(); onDone(null) }
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <small style={{ color: 'var(--faint)' }}>{280 - text.length} left. Friends see this.</small>
        <span><button className='btn small ghost' onClick={() => onDone(null)}>Cancel</button> <button className='btn small primary' onClick={save}>Save comment</button></span>
      </div>
    </div>
  )
}

function AddToPlaylist ({ word, lists, onDone }) {
  const [name, setName] = useState('')
  const toast = useToast()
  const add = async (id) => {
    const res = await api('updatePlaylist', id, { add: word })
    toast({ emoji: res.playlist.emoji, title: `Added to ${res.playlist.name}`, text: `${res.playlist.words.length} words` })
    onDone()
  }
  const create = async () => {
    if (!name.trim()) return
    await api('createPlaylist', { name, words: [word] })
    toast({ emoji: '🎧', title: `Made “${name.trim()}”`, text: `with “${word}” in it` })
    onDone()
  }
  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
      {lists.map((l) => <button key={l.id} className='chip' style={{ justifyContent: 'space-between' }} disabled={l.words.includes(word)} onClick={() => add(l.id.slice(5))}><span>{l.emoji} {l.name}</span><span style={{ color: 'var(--dim)' }}>{l.words.includes(word) ? 'added' : l.total}</span></button>)}
      <form onSubmit={(e) => { e.preventDefault(); create() }} style={{ display: 'flex', gap: 6 }}>
        <input autoFocus className='field' style={{ padding: '7px 10px' }} placeholder='New playlist name' value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onDone() }} />
        <button className='btn small primary'>Make</button>
      </form>
    </div>
  )
}

export function ModePicker ({ modes, mode, onPick, onClose }) {
  const Group = ({ title, items }) => items.length > 0 && (
    <>
      <h4>{title}</h4>
      <div className='modes'>
        {items.map((m) => (
          <button key={m.id} className={`mode ${m.id === mode ? 'on' : ''}`} onClick={() => onPick(m.id)} title={m.blurb || ''}>
            <span className='em'>{m.emoji}</span>
            <strong>{m.name}</strong>
            <small>{m.ownerName ? `from ${m.ownerName}` : m.id === 'friends' ? `${m.total} waiting` : m.total > 1 ? `${m.done.toLocaleString()} / ${m.total.toLocaleString()}` : m.done ? 'Done today' : 'Not yet today'}</small>
            {m.total > 1 && m.id !== 'friends' && <Bar done={m.done} total={m.total} />}
          </button>
        ))}
      </div>
    </>
  )
  return (
    <div className='overlay' onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className='sheet' role='dialog' aria-label='Choose a playlist'>
        <h2>What do you want to rate?</h2>
        <Group title='Ways to play' items={modes.modes} />
        <Group title='Your playlists' items={modes.playlists} />
        <Group title='Friends’ playlists' items={modes.friendPlaylists} />
        <Group title='Friends’ words' items={modes.friendWords || []} />
        <Group title='Topics' items={modes.topics} />
      </div>
    </div>
  )
}

// The pace streak: how much more each new word pays while you keep going,
// and how long until it runs out.
// A warning shows when the same score keeps coming up: at `limit` in a row
// the streak ends.
function StreakMeter ({ streak, same, limit }) {
  const [, tick] = useState(0)
  useInterval(() => tick((x) => x + 1), streak?.endsAt ? 250 : 0)
  if (!streak || streak.n < 2 || !streak.endsAt) return null
  const left = Math.max(0, streak.endsAt - Date.now())
  if (!left) return null
  const frac = left / (streak.window * 1000)
  const repeats = same && same.r !== null && same.n >= 3 ? same.n : 0
  return (
    <span className='streak-wrap'>
      <span className={`streak-meter ${frac < 0.25 ? 'ending' : ''}`} title='Rate another new word before it runs out to keep the streak'>
        <b>🔥 ×{streak.mult.toFixed(2)}</b> {streak.n} in a row
        <i><u style={{ width: `${frac * 100}%` }} /></i>
        <small>{Math.ceil(left / 1000)}s</small>
      </span>
      {repeats > 0 && <span className='same-warn'>⚠ {formatRating(same.r)} {repeats} times running. {limit - repeats === 1 ? 'One more' : `${limit - repeats} more`} and the streak ends.</span>}
    </span>
  )
}
