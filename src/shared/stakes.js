// Staking coins on a lobby game: the rules every computer checks.
//
// There is no bank. Each player's coins live on their own computer, so a pot
// is a promise between apps, and the one rule that keeps it honest is:
//
//   A POT PAYS OUT EXACTLY WHAT WENT IN.
//   Every member put in the same stake; the payouts are whole, never
//   negative, and add up to stake × members. Not a coin more, not a coin
//   less.
//
// The host works the payouts out with splitPot (which checks itself), and
// every player's app checks them again with balanced() before taking a coin.
// A settlement that doesn't add up is refused.
//
// How a stake moves (see Economy and the lobby):
//   1. hold      You buy in: the stake leaves your coins for an escrow record
//                on your own disk, saved at once.
//   2. commit    The game ended and your app saw the result: it promises
//                (on disk, then to the host) never to take the stake back.
//   3. pay       Once every member has promised, the host announces the
//                payouts and each app credits its own share, once, by using
//                up its escrow record.
//   Otherwise    a stake that was never promised comes back: the host ended
//                the game early or closed the lobby, the game wasn't staked
//                after all, you were dropped, or your app closed mid-game.
//                Leaving on purpose mid-game gives your stake to the pot.
//
// So a stake is never both refunded and paid out: the host pays only after
// every loser has promised, and only an unpromised stake is refunded. The
// one rare case that can't be closed without a bank (an app or connection
// that dies between promising and payout) loses those coins rather than
// copying them.

// Quick picks for the host; any whole amount up to MAX_STAKE works too.
// MAX_STAKE is as high as the pot can go and still add up to the exact
// coin with a table of 64 (stake × members stays a safe whole number).
export const STAKES = [0, 100, 1000, 10000, 100000, 1000000]
export const MAX_STAKE = 1e14

export const validStake = (n) => Number.isSafeInteger(n) && n > 0 && n <= MAX_STAKE

// The invariant itself.
export function balanced (stake, payouts) {
  if (!validStake(stake) || !payouts || typeof payouts !== 'object') return false
  const values = Object.values(payouts)
  if (!values.length) return false
  let sum = 0
  for (const v of values) {
    if (!Number.isSafeInteger(v) || v < 0) return false
    sum += v
  }
  return Number.isSafeInteger(sum) && sum === stake * values.length
}

// The pot, stake × members, goes to the highest score among those who can
// win (players who left on purpose can't). A tie splits it; the coins that
// don't divide evenly go one each to the tied winners in seat order. If no
// member can win, the best score among all members takes it: still exactly
// what went in.
export function splitPot (stake, members, scores, canWin = members) {
  const out = Object.fromEntries(members.map((id) => [id, 0]))
  if (!members.length) return out
  const pot = stake * members.length
  const eligible = members.filter((id) => canWin.includes(id))
  const pool = eligible.length ? eligible : members
  const best = Math.max(...pool.map((id) => scores[id] || 0))
  const winners = pool.filter((id) => (scores[id] || 0) === best)
  const share = Math.floor(pot / winners.length)
  let rest = pot - share * winners.length
  for (const id of winners) { out[id] = share + (rest > 0 ? 1 : 0); if (rest > 0) rest-- }
  if (!balanced(stake, out)) throw new Error('A pot must pay out exactly what went in.')
  return out
}
