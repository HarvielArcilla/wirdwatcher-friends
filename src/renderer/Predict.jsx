import { useShownCoins, Coins } from './ui.jsx'
import { useLiveCoins } from './Wirdhouse.jsx'
import Sportsbook from './Sportsbook.jsx'

// The prediction market, in its own tab: the Wird leagues, races and events,
// priced by the chance of each outcome.
export default function Predict ({ econ }) {
  const live = useLiveCoins(econ)
  const coins = useShownCoins(live)
  return (
    <div className='page casino predict'>
      <div className='mk-head'>
        <div>
          <h1>Prediction market</h1>
          <p className='lede'>Every game in the Wird leagues, live and the same on every computer. A contract pays 100 coins if it comes true, and its price is the chance.</p>
        </div>
        <div className='mk-summary'>
          <div><small>Coins</small><b><Coins n={coins} /></b></div>
        </div>
      </div>
      {econ?.bankrupt
        ? <div className='casino-closed'><h2>The market’s closed to you for now</h2><p className='lede'>It doesn’t take bets from bankrupt players. Build some steady income and it opens again.</p></div>
        : <Sportsbook coins={coins} />}
    </div>
  )
}
