// Where the ball is, lightly: a thin strip from the away team's end (left)
// to the home team's (right), with the ball on it, which way it's going and,
// in football, the line to gain.

export function Field ({ c, big = false }) {
  const b = c.ball
  if (!b || (c.sport !== 'football' && c.sport !== 'soccer')) return null
  const at = c.sport === 'football' ? (b.side === 'away' ? b.yl : 100 - b.yl) : b.x // 0 = away end, 100 = home end
  const dir = b.side === 'away' ? 1 : -1
  const first = c.sport === 'football' && b.togo < 100 - b.yl ? Math.max(0, Math.min(100, at + dir * b.togo)) : null
  const ticks = c.sport === 'football' ? [10, 20, 30, 40, 50, 60, 70, 80, 90] : [50]
  return (
    <div className={`fbar ${c.sport} ${big ? 'big' : ''}`} aria-hidden='true'>
      <span className='fbar-end away'>{c.away.code}</span>
      <div className='fbar-track'>
        {ticks.map((t) => <i key={t} className={`fbar-tick ${t === 50 ? 'mid' : ''}`} style={{ left: `${t}%` }} />)}
        {first !== null && <i className='fbar-gain' style={{ left: `${Math.min(at, first)}%`, width: `${Math.abs(first - at)}%` }} />}
        <i className={`fbar-ball ${b.side}`} style={{ left: `${at}%` }}><b>{dir > 0 ? '›' : '‹'}</b></i>
      </div>
      <span className='fbar-end home'>{c.home.code}</span>
    </div>
  )
}
