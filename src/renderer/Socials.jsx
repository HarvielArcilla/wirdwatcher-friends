import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, Coins, useToast, celebrate } from './ui.jsx'
import { STANCES, SUB, SUBS } from '../shared/socials/content.js'
import { render } from '../shared/socials/player.js'

// Socials: Writter, readit and WirdIn. A whole (imaginary) internet that
// every copy of wirdwatcher agrees on, plus your posts and your friends'.

const fmtN = (n) => { n = Math.max(0, Math.round(n || 0)); return n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n) }
const ago = (t, now) => { const s = Math.max(0, (now - t) / 1000); return s < 60 ? `${Math.max(1, Math.floor(s))}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }) }
const APPS = [
  { id: 'writter', name: 'Writter', color: '#1d9bf0' },
  { id: 'readit', name: 'readit', color: '#ff4500' },
  { id: 'wirdin', name: 'WirdIn', color: '#0a66c2' }
]

export default function Socials ({ econ }) {
  const toast = useToast()
  const [app, setApp] = useState(() => { try { return localStorage.getItem('sm-app') || 'writter' } catch { return 'writter' } })
  const [info, setInfo] = useState(null)
  const [v, setV] = useState(null)
  const [sub, setSub] = useState(null)
  const [tab, setTab] = useState('foryou')
  const [page, setPage] = useState('feed') // feed | notifications | profile | blue
  const [thread, setThread] = useState(null)
  const loadInfo = useCallback(() => api('socialsInfo').then(setInfo).catch(() => {}), [])
  const load = useCallback(() => api('socials', app, { sub, tab: page === 'profile' ? 'mine' : tab, limit: 60 }).then(setV).catch(() => {}), [app, sub, tab, page])
  useEffect(() => { try { localStorage.setItem('sm-app', app) } catch {} }, [app])
  useEffect(() => { load(); loadInfo() }, [load, loadInfo])
  // The world keeps posting: refresh while you watch.
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) { load(); loadInfo() } }, 15000); return () => clearInterval(t) }, [load, loadInfo])
  const act = async (action, ...args) => {
    try {
      const out = await api('socialsAction', action, ...args)
      if (out?.looks?.length) for (const l of out.looks) toast({ emoji: '✨', title: `New look: ${l.name}`, text: 'It’s in the Shop, ready to wear.' })
      if (out?.badges) celebrate(toast, { badges: out.badges })
      load(); loadInfo()
      return out || true
    } catch (err) { toast({ error: true, title: 'Can’t do that', text: err.message }); return null }
  }
  const open = async (p) => { const th = await api('socialsThread', p.id); if (th) setThread(th) }
  if (!info || !v) return <div className='page' />
  const me = info.profile
  const W = app === 'writter' && v.w
  return (
    <div className={`sm sm-${app}`}>
      <nav className='sm-apps'>
        {APPS.map((a) => (
          <button key={a.id} className={`sm-app ${app === a.id ? 'on' : ''}`} onClick={() => { setApp(a.id); setSub(null); setPage('feed'); setThread(null) }} style={{ '--ac': a.color }} title={a.name}>
            <AppIcon id={a.id} w={a.id === 'writter' && v.w} />
            <span>{a.id === 'writter' && W ? 'W' : a.name}</span>
          </button>
        ))}
        <span className='sm-gap' />
        <button className={`sm-bell ${page === 'notifications' ? 'on' : ''}`} onClick={() => { setPage('notifications'); setThread(null); act('seenNotifications') }} title='Notifications'>🔔{info.notifications.unseen > 0 && <b>{Math.min(99, info.notifications.unseen)}</b>}</button>
        <button className={`sm-mini ${page === 'profile' ? 'on' : ''}`} onClick={() => { setPage('profile'); setThread(null) }}>
          <Face a={me.author} size={34} />
          <span><b>{me.handle ? `@${me.handle}` : 'Pick a handle'}</b><small>{fmtN(me.followers)} followers · {me.tier.name}</small></span>
        </button>
      </nav>
      <div className='sm-body'>
        {!me.handle
          ? <HandlePicker info={info} onPick={(h) => act('setHandle', h)} />
          : page === 'notifications'
            ? <Notifications info={info} now={v.now} openPost={async (id) => { const th = await api('socialsThread', id); if (th) { setThread(th); setPage('feed') } }} act={act} />
            : page === 'profile'
              ? <Profile info={info} v={v} act={act} open={open} />
              : page === 'blue'
                ? <BluePage info={info} act={act} coins={econ?.coins ?? 0} onBack={() => setPage('feed')} />
                : app === 'writter'
                  ? <Writter v={v} info={info} tab={tab} setTab={setTab} open={open} thread={thread} closeThread={() => setThread(null)} act={act} goBlue={() => setPage('blue')} />
                  : app === 'readit'
                    ? <Readit v={v} info={info} sub={sub} setSub={setSub} open={open} thread={thread} closeThread={() => setThread(null)} act={act} />
                    : <WirdIn v={v} info={info} open={open} thread={thread} closeThread={() => setThread(null)} act={act} />}
      </div>
    </div>
  )
}

// --- bits ----------------------------------------------------------------------------------------
function AppIcon ({ id, w }) {
  if (id === 'writter') return <span className='sm-ico writter'>{w ? 'W' : <svg viewBox='0 0 24 24' aria-hidden='true'><path d='M4 5c4 4.5 7 6 10 6-1 2-3 4-7 4 3 2 8 3 11-1 2-3 2-7 1-9 1 0 2-1 2.5-2-1 .3-2 .4-2.7.2C17.6 1.8 15 2 14 3.5 11 3 7 3 4 5Z' fill='currentColor' /></svg>}</span>
  if (id === 'readit') return <span className='sm-ico readit'><svg viewBox='0 0 24 24' aria-hidden='true'><circle cx='12' cy='14' r='7' fill='#fff' /><circle cx='9.4' cy='13.6' r='1.2' fill='#ff4500' /><circle cx='14.6' cy='13.6' r='1.2' fill='#ff4500' /><path d='M9.2 16.6c1.6 1.1 4 1.1 5.6 0' stroke='#ff4500' strokeWidth='1.1' fill='none' strokeLinecap='round' /><circle cx='17.5' cy='5.5' r='1.5' fill='#fff' /><path d='M12 7l1.2-3.6 4.3 2' stroke='#fff' strokeWidth='1.1' fill='none' /></svg></span>
  return <span className='sm-ico wirdin'>Wi</span>
}

const CHECK_TITLE = { blue: 'Writter Blue (paid)', legacy: 'Legacy verified', grey: 'Official account', gold: 'Verified brand', diamond: 'Diamond Check (paid, a lot)', checkcheck: 'The Check With a Check On It' }
export function Check ({ kind }) {
  if (!kind) return null
  const fill = { blue: '#1d9bf0', legacy: '#1d9bf0', grey: '#829aab', gold: '#e2b719', diamond: '#5ad8ff', checkcheck: '#1d9bf0' }[kind]
  return (
    <span className={`sm-check k-${kind}`} title={CHECK_TITLE[kind]}>
      <svg viewBox='0 0 22 22' aria-hidden='true'><path d='M11 1.5l2.3 1.7 2.9-.1.9 2.7 2.4 1.7-.9 2.7.9 2.7-2.4 1.7-.9 2.7-2.9-.1L11 18.9l-2.3-1.7-2.9.1-.9-2.7-2.4-1.7.9-2.7-.9-2.7 2.4-1.7.9-2.7 2.9.1Z' fill={fill} /><path d='M7 11l2.6 2.6L15.2 8' stroke='#fff' strokeWidth='2' fill='none' strokeLinecap='round' strokeLinejoin='round' /></svg>
      {kind === 'checkcheck' && <svg className='sm-check2' viewBox='0 0 22 22' aria-hidden='true'><path d='M11 1.5l2.3 1.7 2.9-.1.9 2.7 2.4 1.7-.9 2.7.9 2.7-2.4 1.7-.9 2.7-2.9-.1L11 18.9l-2.3-1.7-2.9.1-.9-2.7-2.4-1.7.9-2.7-.9-2.7 2.4-1.7.9-2.7 2.9.1Z' fill='#f2c23e' /><path d='M7 11l2.6 2.6L15.2 8' stroke='#fff' strokeWidth='2' fill='none' strokeLinecap='round' strokeLinejoin='round' /></svg>}
    </span>
  )
}

function Face ({ a, size = 40 }) {
  const ch = (a?.name || a?.handle || '?').replace(/^[^A-Za-z0-9]+/, '').charAt(0).toUpperCase() || '?'
  return <span className={`sm-face ${a?.you ? 'you' : ''} ${a?.friend ? 'friend' : ''}`} style={{ '--c': a?.color || '#888', width: size, height: size, fontSize: size * 0.42 }}>{ch}</span>
}

// #tags, $CASHTAGS and @mentions, highlighted.
function Rich ({ text }) {
  const parts = String(text || '').split(/(#[A-Za-z0-9_]+|\$[A-Z]{2,}|@[A-Za-z0-9_-]+|>!.+?!<)/g)
  return <>{parts.map((s, i) => /^[#$@]/.test(s) ? <span key={i} className='sm-link'>{s}</span> : /^>!/.test(s) ? <span key={i} className='sm-spoiler' title='Spoiler'>{s.slice(2, -2)}</span> : s)}</>
}

function Media ({ m }) {
  if (!m) return null
  if (m.type === 'poll') {
    return (
      <div className='sm-poll'>
        {m.options.map((o, i) => <div key={o} className={`sm-poll-row ${m.pct[i] === Math.max(...m.pct) ? 'win' : ''}`}><i style={{ width: `${m.pct[i]}%` }} /><span>{o}</span><b>{m.pct[i]}%</b></div>)}
        <small>{fmtN(1.2e6 + (m.pct[0] * 31337))} votes</small>
      </div>
    )
  }
  if (m.type === 'ticker') {
    const up = m.pct >= 0
    return <div className={`sm-ticker ${up ? 'up' : 'down'}`}><b>${m.word.toUpperCase()}</b><span>{up ? '▲' : '▼'} {Math.abs(m.pct)}% today</span><small>The Word Exchange</small></div>
  }
  return null
}

// --- composing ----------------------------------------------------------------------------------
function Composer ({ site, info, act, defaultSub, compact }) {
  const me = info.profile
  const [kind, setKind] = useState(site === 'wirdin' ? 'brag' : 'take')
  const [word, setWord] = useState('')
  const [stance, setStance] = useState('love')
  const [dir, setDir] = useState('up')
  const [pct, setPct] = useState(25)
  const [days, setDays] = useState(3)
  const [brag, setBrag] = useState(info.brags[0]?.id || '')
  const [extra, setExtra] = useState('')
  const [sub, setSub] = useState(defaultSub || (site === 'readit' ? 'Wirds' : null))
  const [disclose, setDisclose] = useState(true)
  const [open, setOpen] = useState(!compact)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (defaultSub) setSub(defaultSub) }, [defaultSub])
  const pending = me.pendingSponsor
  const kinds = [['take', 'Take'], ['call', 'Call'], ['brag', 'Brag'], ['say', 'Say'], ...(me.cancelled ? [['apology', 'Apology 📝']] : [])]
  const preview = useMemo(() => render({ site, sub, kind, word: word.toLowerCase().trim(), stance, call: { dir, pct, days }, brag: info.brags.find((b) => b.id === brag)?.text, extra, sponsor: pending && kind !== 'apology' ? pending.id : null, disclosed: disclose }), [site, sub, kind, word, stance, dir, pct, days, brag, extra, pending, disclose, info.brags])
  const send = async () => {
    setBusy(true)
    const out = await act('post', { site, sub, kind, word: word.toLowerCase().trim(), stance, call: { dir, pct, days }, brag, extra, sponsor: pending?.id, disclosed: disclose })
    setBusy(false)
    if (out) { setExtra(''); setWord(''); if (out.pay) act('seenNotifications') }
  }
  if (!open) return <button className='sm-compose-open' onClick={() => setOpen(true)}><Face a={me.author} size={36} /><span>{site === 'wirdin' ? 'Start a post' : site === 'readit' ? 'Create post' : 'What’s happening?'}</span></button>
  return (
    <div className='sm-compose'>
      <div className='sm-compose-top'>
        <Face a={me.author} size={40} />
        <div className='seg sm-kinds'>{kinds.map(([k, label]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{label}</button>)}</div>
        {site === 'readit' && <select className='field sm-sub-pick' value={sub || 'Wirds'} onChange={(e) => setSub(e.target.value)}>{SUBS.map((s) => <option key={s.id} value={s.id}>r/{s.id}</option>)}</select>}
      </div>
      <div className='sm-compose-row'>
        {(kind === 'take' || kind === 'call') && <WordInput value={word} onChange={setWord} />}
        {kind === 'take' && <select className='field' value={stance} onChange={(e) => setStance(e.target.value)}>{STANCES.map((s) => <option key={s.id} value={s.id}>…{s.text.replace(/\.$/, '')}</option>)}</select>}
        {kind === 'call' && (
          <>
            <div className='seg'><button className={dir === 'up' ? 'on' : ''} onClick={() => setDir('up')}>▲ up</button><button className={dir === 'down' ? 'on' : ''} onClick={() => setDir('down')}>▼ down</button></div>
            <label className='sm-num'><input className='field' type='number' min={1} max={500} value={pct} onChange={(e) => setPct(Number(e.target.value))} />%</label>
            <select className='field' value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>in {d} day{d === 1 ? '' : 's'}</option>)}</select>
          </>
        )}
        {kind === 'brag' && <select className='field sm-brag' value={brag} onChange={(e) => setBrag(e.target.value)}>{info.brags.map((b) => <option key={b.id} value={b.id}>{b.text}</option>)}</select>}
      </div>
      <input className='field sm-extra' value={extra} maxLength={140} onChange={(e) => setExtra(e.target.value)} placeholder={kind === 'say' ? 'Say something (your friends will see this)' : 'Add a line of your own (optional)'} />
      <div className='sm-preview'>{preview.title && <b>{preview.title}</b>}<Rich text={preview.text} /></div>
      {pending && kind !== 'apology' && <label className='sm-ad'><input type='checkbox' checked={disclose} onChange={(e) => setDisclose(e.target.checked)} /> Sponsored by {pending.brand}: tag it #ad {disclose ? '' : <i>(people might notice…)</i>}</label>}
      <div className='sm-compose-foot'>
        <small>{kind === 'call' ? 'Calls are graded against the real Word Exchange price when time’s up.' : kind === 'take' ? 'Your ratings stay yours: this is just a take.' : ' '}</small>
        {compact && <button className='btn ghost small' onClick={() => setOpen(false)}>Cancel</button>}
        <button className='btn primary sm-postbtn' disabled={busy} onClick={send}>{site === 'readit' ? 'Post' : site === 'wirdin' ? 'Post' : 'Writ'}</button>
      </div>
    </div>
  )
}

function WordInput ({ value, onChange }) {
  const [hits, setHits] = useState([])
  const timer = useRef(null)
  useEffect(() => {
    clearTimeout(timer.current)
    if (!value.trim()) { setHits([]); return }
    timer.current = setTimeout(() => api('search', value.trim()).then((h) => setHits((h || []).slice(0, 6).map((x) => (typeof x === 'string' ? x : x.word)))).catch(() => {}), 150)
  }, [value])
  return (
    <span className='sm-word'>
      <input className='field' value={value} onChange={(e) => onChange(e.target.value)} placeholder='a word' />
      {hits.length > 0 && !hits.includes(value) && <span className='sm-hits'>{hits.map((h) => <button key={h} onClick={() => { onChange(h); setHits([]) }}>{h}</button>)}</span>}
    </span>
  )
}

// --- Writter -------------------------------------------------------------------------------------
function Writter ({ v, info, tab, setTab, open, thread, closeThread, act, goBlue }) {
  const me = info.profile
  return (
    <div className='wr'>
      <aside className='wr-left'>
        <div className='wr-logo'>{v.w ? <b className='wr-w'>W</b> : <><AppIcon id='writter' /> Writter</>}</div>
        {v.w && <small className='wr-wnote'>Writter is called W today. It’ll be Writter again tomorrow. Probably.</small>}
        <button className='wr-blue' onClick={goBlue}><Check kind='blue' /> {me.blue ? `${me.blue.name}` : 'Get Writter Blue'}</button>
        <p className='wr-pitch'>{me.blue ? `Active until ${new Date(me.blue.until).toLocaleDateString()}. It means nothing.` : 'A checkmark that means nothing, for a price that means something.'}</p>
      </aside>
      <main className='wr-main'>
        {thread
          ? <Thread th={thread} site='writter' close={closeThread} act={act} />
          : (
            <>
              <div className='wr-tabs'>{[['foryou', 'For you'], ['following', 'Following']].map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
              <Composer site='writter' info={info} act={act} compact />
              {tab === 'following' && !v.posts.length && <p className='sm-empty'>You and your friends haven’t posted yet. Posts from friends show up here (and in For you).</p>}
              {v.posts.map((p) => <WPost key={p.id} p={p} now={v.now} open={open} act={act} />)}
            </>
            )}
      </main>
      <aside className='wr-right'>
        <section className='wr-box'>
          <h3>What’s happening</h3>
          {v.trends?.map((t) => <div key={t.tag} className='wr-trend'><small>{t.cat}</small><b>{t.tag}</b><small>{fmtN(t.posts)} posts</small></div>)}
        </section>
        <section className='wr-box'>
          <h3>Who to follow</h3>
          {v.follow?.map((p) => <div key={p.handle} className='wr-follow'><Face a={p} size={36} /><span><b>{p.name}<Check kind={p.check} /></b><small>@{p.handle} · {fmtN(p.followers)}</small></span></div>)}
        </section>
      </aside>
    </div>
  )
}

function WPost ({ p, now, open, act }) {
  const a = p.author
  const s = p.stats
  return (
    <article className={`wr-post ${p.mine ? 'mine' : ''} ${p.friend ? 'friend' : ''} ${p.kind === 'ad' ? 'ad' : ''}`} onClick={() => open(p)}>
      <Face a={a} />
      <div className='wr-post-body'>
        <div className='wr-who'><b>{a.name}</b><Check kind={a.check} /><span>@{a.handle} · {ago(p.t, now)}</span>{p.friend && <i className='sm-tag'>friend</i>}{p.mine && <i className='sm-tag you'>you</i>}{p.cancelled && <i className='sm-tag bad'>main character 💀</i>}{p.ratioed && !p.cancelled && <i className='sm-tag bad'>ratio’d</i>}</div>
        <div className='wr-text'><Rich text={p.text} /></div>
        <Media m={p.media} />
        {p.call && <CallCard call={p.call} word={p.word} />}
        {p.footnote && <div className='wr-note'><b>Readers added context</b>{p.footnote.replace(/^Readers added context: /, '')}</div>}
        {p.kind === 'ad' && <small className='wr-promoted'>Promoted</small>}
        <div className='wr-acts' onClick={(e) => e.stopPropagation()}>
          <span title='Replies'>💬 {fmtN(s.replies)}</span>
          <span title='Reposts'>🔁 {fmtN(s.reposts)}</span>
          <button className={`wr-like ${p.vote === 1 ? 'on' : ''}`} onClick={() => act('vote', p.id, p.vote === 1 ? 0 : 1)}>{p.vote === 1 ? '❤️' : '🤍'} {fmtN((s.likes || 0) + (p.vote === 1 ? 1 : 0))}</button>
          <span title='Views'>📊 {fmtN(s.views)}</span>
        </div>
        {p.friendsLiked?.length > 0 && <small className='sm-liked'>Liked by {p.friendsLiked.join(', ')}</small>}
      </div>
    </article>
  )
}

function CallCard ({ call, word }) {
  const g = call.grade
  return (
    <div className={`sm-call ${g ? (g.right ? 'right' : 'wrong') : ''}`}>
      <b>${word.toUpperCase()} {call.dir === 'up' ? '▲' : '▼'} {call.pct}%</b>
      <span>{g ? (g.right ? `Called it: ${g.move > 0 ? '+' : ''}${g.move}%` : `Wrong: ${g.move > 0 ? '+' : ''}${g.move}%`) : `Graded in ${call.days} day${call.days === 1 ? '' : 's'}`}</span>
    </div>
  )
}

function Thread ({ th, site, close, act }) {
  const p = th.post
  return (
    <div className={`sm-thread site-${site}`}>
      <button className='btn ghost small' onClick={close}>← Back</button>
      {site === 'readit' ? <RPost p={p} now={Date.now()} act={act} full /> : site === 'wirdin' ? <LPost p={p} now={Date.now()} act={act} full /> : <WPost p={p} now={Date.now()} open={() => {}} act={act} />}
      <div className='sm-replies'>
        {th.replies.map((r) => (
          <div key={r.id} className={`sm-reply ${r.sticky ? 'sticky' : ''}`}>
            <Face a={r.author} size={30} />
            <div>
              <div className='sm-reply-who'><b>{site === 'readit' ? `u/${r.author.handle}` : r.author.name}</b><Check kind={r.author.check} />{site === 'writter' && <span>@{r.author.handle}</span>}{r.sticky && <i className='sm-tag mod'>MOD</i>}</div>
              <p><Rich text={r.text} /></p>
              <small>{site === 'readit' ? `▲ ${fmtN(r.score)}` : `❤️ ${fmtN(r.score)}`}</small>
              {r.replies?.map((x) => <div key={x.id} className='sm-reply nested'><Face a={x.author} size={24} /><div><div className='sm-reply-who'><b>u/{x.author.handle}</b></div><p><Rich text={x.text} /></p><small>▲ {fmtN(x.score)}</small></div></div>)}
            </div>
          </div>
        ))}
        {!th.replies.length && <p className='sm-empty'>No replies yet. Give it a minute.</p>}
      </div>
    </div>
  )
}

// --- readit --------------------------------------------------------------------------------------
function Readit ({ v, info, sub, setSub, open, thread, closeThread, act }) {
  const groups = useMemo(() => { const g = {}; for (const s of v.subs || []) (g[s.group] ||= []).push(s); return g }, [v.subs])
  const s = sub ? SUB[sub] : null
  return (
    <div className='rd'>
      <aside className='rd-left'>
        <button className={`rd-sub ${!sub ? 'on' : ''}`} onClick={() => { setSub(null); closeThread() }}>🏠 Home</button>
        {Object.entries(groups).map(([g, list]) => (
          <div key={g}>
            <h4>{g}</h4>
            {list.map((x) => <button key={x.id} className={`rd-sub ${sub === x.id ? 'on' : ''}`} onClick={() => { setSub(x.id); closeThread() }}>r/{x.id}</button>)}
          </div>
        ))}
      </aside>
      <main className='rd-main'>
        {thread
          ? <Thread th={thread} site='readit' close={closeThread} act={act} />
          : (
            <>
              {s && <div className='rd-banner'><span className='rd-sub-ico'>r/</span><div><h2>r/{s.id}</h2><small>{fmtN(s.members)} members</small><p>{s.blurb}</p></div></div>}
              <Composer site='readit' info={info} act={act} defaultSub={sub} compact />
              {v.posts.map((p) => <RPost key={p.id} p={p} now={v.now} open={open} act={act} />)}
            </>
            )}
      </main>
      <aside className='rd-right'>
        <section className='rd-box'>
          <h3>{s ? `About r/${s.id}` : 'readit'}</h3>
          <p>{s ? s.blurb : 'The front page of the dictionary. Upvote what adds to the conversation. (Downvote what you disagree with. Everyone does.)'}</p>
          <div className='rd-karma'><b>{fmtN(info.profile.karma)}</b><small>your karma</small></div>
        </section>
        <section className='rd-box rd-rules'>
          <h3>Rules</h3>
          <ol>{(s?.id === 'Wodleheads' ? ['Buy the total lexicon fund', 'Stay the course', 'No speculation (this means you)', 'Your question has been asked before'] : s?.id === 'WirdStreetBets' ? ['Positions or ban', 'No WTLX', 'Loss posts welcome', 'This is not financial advice'] : ['Be civil', 'No low-effort words', 'Tag your spoilers', 'Search before posting']).map((r) => <li key={r}>{r}</li>)}</ol>
        </section>
      </aside>
    </div>
  )
}

function RPost ({ p, now, open, act, full }) {
  const a = p.author
  const s = p.stats
  const score = (s.score || 0) + (p.vote || 0)
  return (
    <article className={`rd-post ${p.mine ? 'mine' : ''} ${p.friend ? 'friend' : ''}`} onClick={() => !full && open?.(p)}>
      <div className='rd-vote' onClick={(e) => e.stopPropagation()}>
        <button className={p.vote === 1 ? 'up' : ''} onClick={() => act('vote', p.id, p.vote === 1 ? 0 : 1)}>▲</button>
        <b className={p.vote === 1 ? 'up' : p.vote === -1 ? 'down' : ''}>{fmtN(score)}</b>
        <button className={p.vote === -1 ? 'down' : ''} onClick={() => act('vote', p.id, p.vote === -1 ? 0 : -1)}>▼</button>
      </div>
      <div className='rd-body'>
        <div className='rd-meta'><b>r/{p.sub}</b> · Posted by u/{a.handle} {p.friend && <i className='sm-tag'>friend</i>}{p.mine && <i className='sm-tag you'>you</i>} · {ago(p.t, now)}{p.awards > 0 && <span className='rd-awards'>{'🏅'.repeat(Math.min(3, p.awards))}</span>}</div>
        <h3>{p.flair && <span className='rd-flair'>{p.flair}</span>}{p.title}</h3>
        {(full || p.text.length < 220) && <p><Rich text={p.text} /></p>}
        {!full && p.text.length >= 220 && <p className='rd-more'><Rich text={`${p.text.slice(0, 200)}…`} /></p>}
        {p.call && <CallCard call={p.call} word={p.word} />}
        {p.locked && <div className='rd-locked'>🔒 Locked by the moderators: speculation.</div>}
        {p.footnote && <div className='wr-note'><b>Mod note</b>{p.footnote.replace(/^Readers added context: /, '')}</div>}
        <div className='rd-acts'><span>💬 {fmtN(s.comments)} {s.comments === 1 ? 'comment' : 'comments'}</span><span>{Math.round((p.ratio ?? 0.9) * 100)}% upvoted</span>{p.cancelled && <i className='sm-tag bad'>brigaded 💀</i>}</div>
      </div>
    </article>
  )
}

// --- WirdIn --------------------------------------------------------------------------------------
function WirdIn ({ v, info, open, thread, closeThread, act }) {
  const me = info.profile
  return (
    <div className='li'>
      <aside className='li-left'>
        <div className='li-card'>
          <div className='li-banner' />
          <Face a={me.author} size={64} />
          <b>{me.author.name}</b>
          <small>{me.tier.id === 'lurker' ? 'Aspiring Wordsmith' : `${me.tier.name} | Thought Leader in ${me.handle || 'Words'}`} | Open to Work 🌱</small>
          <div className='li-stat'><span>Connections</span><b>{fmtN(me.connections)}</b></div>
          <div className='li-stat'><span>Profile viewers</span><b>{fmtN(me.connections * 3 + 17)}</b></div>
          <div className='li-premium'>Try Premium for 0 coins (it’s 40 coins)</div>
        </div>
      </aside>
      <main className='li-main'>
        {thread
          ? <Thread th={thread} site='wirdin' close={closeThread} act={act} />
          : (
            <>
              <Composer site='wirdin' info={info} act={act} compact />
              {v.posts.map((p) => <LPost key={p.id} p={p} now={v.now} open={open} act={act} />)}
            </>
            )}
      </main>
      <aside className='li-right'>
        <section className='li-box'>
          <h3>WirdIn News</h3>
          <ul>
            <li><b>Words are the new oil</b><small>2h ago · 4,210 readers</small></li>
            <li><b>Is the 4-day rating week here?</b><small>5h ago · 12,880 readers</small></li>
            <li><b>Adjectives: overvalued?</b><small>1d ago · 920 readers</small></li>
            <li><b>Why your nouns aren’t converting</b><small>2d ago · 31,004 readers</small></li>
          </ul>
        </section>
      </aside>
    </div>
  )
}

function LPost ({ p, now, open, act, full }) {
  const a = p.author
  const s = p.stats
  return (
    <article className={`li-post ${p.mine ? 'mine' : ''}`} onClick={() => !full && open?.(p)}>
      <div className='li-who'><Face a={a} size={44} /><span><b>{a.name}</b><small>{a.headline || (a.you ? 'You' : a.friend ? 'Your friend' : '')}</small><small>{ago(p.t, now)} · 🌐</small></span></div>
      <div className='li-text'><Rich text={full || p.text.length < 300 ? p.text : `${p.text.slice(0, 280)}… see more`} /></div>
      <div className='li-counts'><span>👍👏💡 {fmtN((s.likes || 0) + (p.vote === 1 ? 1 : 0))}</span><span>{fmtN(s.comments ?? s.replies)} {(s.comments ?? s.replies) === 1 ? 'comment' : 'comments'} · {fmtN(s.reposts)} {s.reposts === 1 ? 'repost' : 'reposts'}</span></div>
      <div className='li-acts' onClick={(e) => e.stopPropagation()}>
        <button className={p.vote === 1 ? 'on' : ''} onClick={() => act('vote', p.id, p.vote === 1 ? 0 : 1)}>👍 {p.vote === 1 ? 'Celebrated' : 'Celebrate'}</button>
        <button onClick={() => open?.(p)}>💬 Comment</button>
        <button>🔁 Repost</button>
        <button title='Agree?'>🤝 Agree?</button>
      </div>
    </article>
  )
}

// --- you -----------------------------------------------------------------------------------------
function HandlePicker ({ info, onPick }) {
  const [h, setH] = useState(info.handles[0] || '')
  return (
    <div className='sm-handle'>
      <h2>Pick your handle</h2>
      <p>On Socials, everyone is named after a word. Yours has to be one you’ve rated (you can add numbers or an underscore after it). Your display name stays yours.</p>
      <div className='sm-handle-picks'>{info.handles.map((x) => <button key={x} className={`lx-chip ${h === x ? 'on' : ''}`} onClick={() => setH(x)}>@{x}</button>)}</div>
      <div className='sm-handle-row'><span>@</span><input className='field' value={h} maxLength={20} onChange={(e) => setH(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} /><button className='btn primary' disabled={!h} onClick={() => onPick(h)}>That’s me</button></div>
      {!info.handles.length && <p className='wl-note'>Rate some words first: your handle comes from them.</p>}
    </div>
  )
}

function Notifications ({ info, now, openPost, act }) {
  const n = info.notifications
  const ICON = { like: '❤️', ratio: '💀', cancel: '🙊', called: '🔮', wrong: '🥛', sponsor: '💼' }
  return (
    <div className='sm-notes'>
      <h2>Notifications</h2>
      {!n.list.length && <p className='sm-empty'>Nothing yet. Post something.</p>}
      {n.list.map((x, i) => (
        <div key={i} className={`sm-note k-${x.kind}`}>
          <span className='sm-note-ico'>{ICON[x.kind] || '🔔'}</span>
          <div><b>{x.text}</b>{x.sub && <small>“{x.sub}”</small>}<small>{ago(x.t, now)}</small></div>
          {x.post && <button className='btn small ghost' onClick={() => openPost(x.post)}>View</button>}
          {x.sponsor && <button className='btn small primary' onClick={() => act('acceptSponsor', x.sponsor)}>Accept</button>}
        </div>
      ))}
    </div>
  )
}

function Profile ({ info, v, act, open }) {
  const me = info.profile
  const pay = me.payout
  const prog = me.next ? Math.min(1, (me.followers - me.tier.at) / (me.next.at - me.tier.at)) : 1
  return (
    <div className='sm-profile'>
      <div className='sm-prof-head'>
        <div className='sm-prof-banner' />
        <Face a={me.author} size={84} />
        <div className='sm-prof-name'><h2>{me.author.name}<Check kind={me.author.check} /></h2><span>@{me.handle}</span></div>
        <div className='sm-prof-stats'>
          <div><b>{fmtN(me.followers)}</b><small>Writter followers</small></div>
          <div><b>{fmtN(me.karma)}</b><small>readit karma</small></div>
          <div><b>{fmtN(me.connections)}</b><small>WirdIn connections</small></div>
          <div><b>{me.posts}</b><small>posts</small></div>
        </div>
        <div className='sm-ladder'><div><b>{me.tier.name}</b>{me.next && <small>{fmtN(me.next.at - me.followers)} to {me.next.name}</small>}</div><i style={{ '--p': prog }} /></div>
        {me.cancelled && <div className='sm-cancel'>🙊 You’re today’s Main Character, and not in a good way. A Notes-app apology might help (Apology, in the composer).</div>}
      </div>
      <div className='sm-prof-grid'>
        <section className='sm-card'>
          <h3>Creator payout</h3>
          <p>Paid for views, mostly from people replying to tell you you’re wrong. {fmtN(pay.fresh)} new views.</p>
          <div className='sm-pay'><b><Coins n={pay.coins} /></b><button className='btn primary small' disabled={pay.coins <= 0} onClick={() => act('claimPayout')}>Claim</button></div>
          <small>Up to <Coins n={pay.cap} /> a day at your tier · <Coins n={pay.paidToday} /> claimed today</small>
        </section>
        <section className='sm-card'>
          <h3>Sponsors</h3>
          {me.pendingSponsor
            ? <p>💼 {me.pendingSponsor.brand} is waiting for {me.pendingSponsor.ask}. Your next post is the one (tag it #ad).</p>
            : me.sponsor
              ? <><p>💼 <b>{me.sponsor.brand}</b> wants {me.sponsor.ask}. Pays about {me.sponsor.pay} minutes of your income.</p><button className='btn small primary' onClick={() => act('acceptSponsor', me.sponsor.id)}>Accept</button></>
              : <p className='wl-note'>Brands come knocking at 1,000 followers. Bigger ones at 5K, 20K, 50K and 250K.</p>}
        </section>
        <section className='sm-card'>
          <h3>Goals</h3>
          <ul className='wl-goals'>{info.looks.map((l) => <li key={`${l.kind}:${l.id}`} className={l.have ? 'done' : ''}>{l.have ? '✓' : '🔒'} <b>{l.name}</b> · {l.goal}</li>)}</ul>
        </section>
      </div>
      <h3 className='sm-h'>Your posts</h3>
      <div className='sm-myposts'>
        {v.posts.filter((p) => p.mine).map((p) => p.site === 'readit' ? <RPost key={p.id} p={p} now={v.now} open={open} act={act} /> : p.site === 'wirdin' ? <LPost key={p.id} p={p} now={v.now} open={open} act={act} /> : <WPost key={p.id} p={p} now={v.now} open={open} act={act} />)}
        {!v.posts.some((p) => p.mine) && <p className='sm-empty'>Nothing here yet on this app.</p>}
      </div>
    </div>
  )
}

function BluePage ({ info, act, coins, onBack }) {
  const me = info.profile
  return (
    <div className='sm-bluepage'>
      <button className='btn ghost small' onClick={onBack}>← Back</button>
      <div className='sm-blue-hero'>
        <Check kind='blue' />
        <h1>Writter Blue</h1>
        <p>For people who want to be taken seriously by people who will not take them seriously.</p>
        {me.legacy && <p className='sm-blue-warn'>You’re legacy verified. Buying Blue will make people laugh at you. Specifically at you.</p>}
        {me.blue && <p className='sm-blue-now'>You have {me.blue.name} until {new Date(me.blue.until).toLocaleString()}. <button className='linkish' onClick={() => act('cancelBlue')}>Cancel</button></p>}
      </div>
      <div className='sm-blue-tiers'>
        {me.blueTiers.map((b, i) => (
          <div key={b.id} className={`sm-tier ${me.blue?.tier === b.id ? 'on' : ''} t${i}`}>
            <h3>{b.name}</h3>
            <div className='sm-tier-price'><Coins n={b.price} /><small>/week</small></div>
            <ul>{b.perks.map((x) => <li key={x}>✓ {x}</li>)}</ul>
            <button className='btn primary' disabled={coins < b.price} onClick={() => act('buyBlue', b.id)}>{me.blue?.tier === b.id ? 'Extend a week' : 'Subscribe'}</button>
          </div>
        ))}
      </div>
      <p className='wl-note sm-fine'>Blue gives your Writter posts a little more reach. Each tier above it adds almost nothing, and costs four times as much. Refunds are not available (or a word).</p>
    </div>
  )
}
