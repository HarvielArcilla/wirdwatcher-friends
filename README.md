# wirdwatcher

You get a random word, and you rate it out of 5.0.

Version 2 runs on your own computer, with no server and no account. Friends swap ratings directly between their computers, and up to 8 people can sit at a lobby table, rate the same words, and reveal together.

## Playing

The game is built for the keyboard:

| Key | What it does |
| --- | --- |
| `0`–`5` | Type a rating. `4` gives 4.0 and `4` `7` gives 4.7 |
| `Enter` | Rate the word. Press it again for the next one |
| `↑` `↓` | Nudge the rating by 0.1 (hold Shift for 0.5) |
| `←` `→` | Go back and forward through the words you’ve seen this sitting, without dealing new ones |
| `→` on the newest word | Skip it. A note says “Skipped …” with Undo, and the word is marked if you go back |
| `/` or `Ctrl/⌘+K` | Search for a word by spelling or by meaning (“fear of spiders” finds *arachnophobia*) |
| `Space` | Say the word out loud |
| `F` / `C` / `A` | Favorite, comment, add to a playlist |
| `M` | Choose what to rate |

**Things to play:**

- Shuffle, Everyday words, Short & sweet, Mouthfuls
- Word of the day: the same word for everyone
- Synonym chains: rate a word and then every synonym of it
- Friends’ picks
- Your own playlists, and your friends’ playlists
- 14 topic playlists (animals, food, feelings, and so on), each with a progress bar

**After you rate:** you see where your rating landed on a line from 0 to 5, next to each friend’s rating of the same word, your friends’ average and your own average. A one-line verdict sums it up (“Hot take: 1.9 above your friends”, “Exactly what Pip said”, “Toughest of your friends on this one”), and each friend’s taste match is shown. For a word no friend has rated, you see how it ranks among your own ratings (“One of your highest ratings ever”). The Friends page shows your taste match with each friend.

**Progression:** you earn XP for new words, the first word each day, streaks, the word of the day, finished chains and playlists, and lobby rounds. XP raises your level, with a new title every five levels (5, 10, 15…), and there are 97 badges. Every level up pays a coin bonus that grows with your wirdhouse, and every fifth level (and 75 and 100) unlocks a cosmetic you can't buy. Your Profile shows a histogram of how you rate, along with your favorites, playlists and every word you’ve rated.

## Sound and effects

Every rating makes a sound, and better ratings get more notes: a 1.0 is one low blip, and a 4.7 is a little run up. Choose from Arcade (the default), Coin, Gem, Harp, Kalimba, Chime, Marimba, Pop, Bubble, Typewriter, Original (wirdwatcher 1’s two sounds, only at the extremes) or Off, or use **your own file** (MP3, WAV, OGG, M4A, AAC, FLAC or WebM, up to 3 MB). Your file is copied into the app’s data folder and stays on this computer.

The presets are synthesized, so they don’t need sound files. Their pitch climbs a pentatonic scale with the rating, so a 5.0 rings and a 0.0 thuds, and a run of ratings sounds like a tune. A custom file speeds up slightly for higher ratings.

Original plays exactly what v1 did: one sound above 4.0 and another at 1.0 or below, and silence in between.

Every rating also moves the word on the Play screen:

- **4.5 and up:** a fanfare and confetti (a full burst for a 5.0).
- **3.5 and up:** the word bounces, with a sparkle.
- **2.5 and up:** a small nod.
- **1.5 and up:** a shrug.
- **Under 1.5:** the word wilts.
- **0.5 and under:** a sad trombone, and the word crumbles letter by letter (all the way down for a 0.0).

**Settings → Sound & effects → Animations** chooses every rating, only the ends, or off. You can also turn the fanfare and trombone off, turn pitch-following off and set the volume. Reduced motion turns all the animations off. A row of buttons plays each rating with your current settings.

## Appearance

**Settings → Appearance** sets light and dark mode separately. Choose “Match computer” to follow your system: for example, Parchment by day and Inkwell at night.

- **Themes:**
  - Dark: Inkwell (the default), Slate (the original v1 colors), Espresso, Forest, Velvet and Blackout (high contrast).
  - Light: Paper (the default), Parchment, Newsprint, Sage, Blush and Daylight (high contrast).
  - Every theme is checked for readable contrast in `test/appearance.test.js`.
- **Accent:** use the theme’s own, or pick any color. The app warns you if the color is hard to see on that theme.
- **Texture:** none, paper or film grain, set for each mode.
- **Fonts:**
  - Presets:
    - Playful (Fredoka)
    - Classic serif (Newsreader)
    - Literary (EB Garamond)
    - Editorial (Fraunces over Inter)
    - Modern (Inter)
    - Grotesk (Bricolage Grotesque)
    - Typewriter (IBM Plex Mono)
    - Hyperlegible (Atkinson Hyperlegible)
    - OpenDyslexic
  - You can also pick the word font, the font for buttons and labels, and the definition font separately.
  - All the fonts are bundled under the SIL Open Font License, so they work offline.
- **Also:** word size, square, soft or round corners, and reduced motion.

A preview in Settings shows a sample word in either mode as you change things. Appearance is saved on this computer only and is never sent to friends.

## Coins, the wirdhouse and the shop

Every word you rate for the first time pays coins, the same whatever you give it, so there's never a reason to fudge a rating. Changing a rating pays nothing. Rating new words within a minute of each other builds a **pace streak** that multiplies what each one pays. Ratings closer than 1.5 seconds apart don't count, and giving the **same score five times running ends the streak** (the meter warns you from the third), so mashing one number never pays. Lobby rounds pay too, win or lose.

**The wirdhouse** turns coins into more coins:

- **Buildings**, twelve of them from Pencil to The first word, make coins every second, and each one costs more than the last.
- **Upgrades** come in kinds, so there's more than one way to play:
  - *words* (more per new word, bonuses for long words and your first word of the day, a share of the wirdhouse's output with every word);
  - *streak* (bigger, longer, more forgiving, and eventually boosting the wirdhouse too);
  - *muse* (a stronger muse that fades slower; see below);
  - *offline* (how fast, and for how long, it earns while the app is closed);
  - *social* (lobby rounds, hosting, friends online);
  - *buildings*, *synergy* (buildings that help each other) and *global*.
- **The muse** is the wirdhouse's inspiration, and what keeps rating words worth it however big the house gets. Each new word you rate fills it a quarter, and it fades to nothing over three minutes. A full muse runs the wirdhouse at full speed (up to 3× with muse upgrades); an empty one runs it at 40%. The meter is under your coins. Earnings while the app is closed are separate.
- **Publishing your dictionary** (prestige) starts the wirdhouse over, coins, buildings and upgrades, for **ink**. Every ink you've ever earned makes everything earn 2% more, forever, and ink buys **perks** that last through every edition (head start, seed money, a higher streak, better time away, and more). Your first, third and fifth editions each bring a cosmetic you can't buy.
- **Your Leximon team** adds a little to everything the wirdhouse makes (see below).

**The shop** sells looks, never advantages:

- **Rooms** (the space around the table) and **tables** (the felt): everyone at your table sees yours when you host.
- **Frames, card backs, titles, name styles and reaction packs**: others see them in lobbies and on your profile. Some titles can't be bought; they come with badges.
- **Confetti and coins**: just for you.

The shop lists each kind cheapest first, with the items that come from badges, levels and publishing at the end.

Frames never hide gameplay: the rings for your guesses, the hot seat and pickable seats are drawn outside any frame, and the frame fades back while they show. Everything you buy is kept through every edition. There are badges for coins, building, publishing, flipping and shopping too.

Coins and the wirdhouse are kept in `economy.json` on your computer only; friends see what you're wearing, your edition, your Leximon team and (unless you turn it off) your market and casino record.

## Today

One tab for the daily things, all the same for everyone and all reset at midnight UTC:

- **Daily Clues:** one word for the whole world. It starts with what kind of word it is, its first letter and a first meaning; ask for more clues (each costs 12 points), guess as often as you like (each miss costs 10), and get coins for solving it. Copy a result to share that doesn't give the word away, and see how friends did.
- **Three quests**, like "rate 20 new words", "catch a wild word" or "make a trade". Each pays coins, and doing all three pays a bonus and adds a day to your quest streak. No quest ever asks for a particular score.
- **A weekly challenge** (rate 150 new words) and **a free spin** of Wird Slots each day.

## The Leximon

Every 6 to 12 new words, one of the words you've rated turns up as a **wild word** in the corner of Play. Press `L` to catch it (or let it go; it leaves after your next new word). Turn wild words off under Settings → Playing.

- **Rarity is how you feel about it.** It comes from where the word sits among *your* ratings, by rank, so generous and harsh raters get the same spread and rating everything the same makes nothing rare. Your most-loved words are Fond, Adored, Cherished and finally **Beloved**; your most-hated are Disliked, Loathed, Despised and finally **Nemesis**, just as rare. It's fixed when you catch the word.
- **The word itself never matters.** "the" can become as mighty as "serendipity".
- **Your team of three learns from every new word you rate**, whatever you give it, and from lobby rounds. That's how words grow, fastest and first.
- **Coins help, a little.** *Training* teaches a word for coins while you do other things, but only up to 6 hours a word a day (a full day is worth about 20 ratings, however many coins you have). *Focus* speeds up what your team learns from ratings for an hour, never past ×1.5.
- **Tiers.** Every 25 levels a word has to *ascend* (for coins) to keep levelling, and each tier doubles its power and changes how its card looks: plain, framed, foil, holo, and ever more extravagant. Levels never stop, and power scales into the quadrillions.
- **Stances** you choose for each word: 💗 Charm beats 🗡️ Spite, 🗡️ Spite beats 🛡️ Guard, 🛡️ Guard beats 💗 Charm.
- **Duels** with friends' teams, five a day, from the Leximon's Duels tab: three bouts, word against word, decided by power, stance and a little luck. The result is worked out from both teams and the day, so it comes out the same on either computer, and then played out like a classic monster battle: your word at the bottom, theirs at the top, HP bars, a text box ("Pip's PICKLE used Sweet Talk! It's super effective!"), and an animation for each stance's attacks (hearts for Charm, slashes for Spite, a shockwave for Guard). Click or press Space to hurry it, Escape to skip. Win or lose, your team learns from it.
- Your equipped team also adds a small bonus to the wirdhouse.

## The Word Exchange

A stock market of words under **Market**. Every word has a price, and the price is a pure function of the word and the time (UTC), so every copy of wirdwatcher shows the same price in the same minute without talking to anyone.

- **Prices move** on waves from hours to months, with **sectors** (the topic groups from WordNet: food, animals, feelings…) that rally and slump together, and **news**: some days a word jumps or crashes and then drifts back. Obscure words with one meaning and few synonyms swing wildly; everyday words with many meanings are blue chips. No price ever reaches 0, and over the long run the market rises.
- **You can trade any word you've rated.** What you gave a word never moves its price. Buying costs 0.5% over the price and selling gets 0.5% under it.
- Charts by day, week, month and year, a scrolling ticker, sector indexes, the day's movers and headlines, and your portfolio with your all-time return, which friends see on your profile.
- Shares are sold before you publish an edition, so nothing carries over. A clock that goes back in time can't trade.

## The Casino

- **Wird Slots:** five reels of letters, weighted like English. The longest real word anywhere in them pays: a 3-letter word ×1.5, a 4-letter word ×6, and a full 5-letter word is the jackpot, ×155 (about 1 spin in 435). Over every possible spin it pays back 94.7%, so the house wins slowly, like a real one. Space spins.
- **The coinflip**: bet any amount, call heads or tails, double it or lose it.
- Nothing in the casino counts toward ink.

The **prediction market** (every game in the Wird leagues, plus races and events) has its own **Predict** tab. A contract pays 100 coins if it comes true, and its price is the chance.

## Wirdlike

A roguelike down through the dictionary: room by room, floor by floor, from The Margins through The Index, The Stacks, The Archive and The Printing Press, and (once you've beaten The Red Pen) The Unwritten. WASD moves, the arrow keys shoot ink, E sets off a bang, Space uses a verb, Tab shows the map, Esc pauses. Gamepads work too.

- **Every item is a word you've rated.** Nouns are things you carry, verbs are actives you charge by clearing rooms, adjectives change your shots, adverbs raise a stat. What a word does comes from what it means (fire burns, ice slows, "double" splits your shots), how strong it is from its letters. Three words from one topic transform you (Bestiary, Cookbook, Atlas…).
- **Your rating sets a word's flavour, never its power:** words you love are blessed, words you can't stand are cursed (stronger, with a catch), so nothing rewards rating any way but honestly. After a boss you may find a door to a room of words you love, or one of words you hate that costs hearts.
- **Every boss is word trouble:** The Run-On Sentence, Typo, The Ellipsis, Lorem Ipsum, Palindrome, The Homophones, Anagram, Widow & Orphan, Thesaurus Rex, The Silent Letter, Oxymoron, Spoonerism, The Passive Voice, The Longest Word, The Department of Redundancy Department, Malaprop, The Red Pen and Autocorrect, plus the seven grammar sins.
- **Progress:** six characters to unlock, badges, and looks you can only get down there, including **faces**: each character's head can replace your initial wherever friends see you, frame and all. Bosses pay some coins. Runs save at every door.

## Catchword

Coin a word and get the whole world saying it. Each new word is a blend of two you've rated (or one you make up); pick where someone first says it, then evolve it until all eight billion people have absorbed it.

- **Everyone is unaware, saying it, or has absorbed it.** Speakers pass it on; the absorbed don't notice it's new any more, so it's in their language for good but they've stopped spreading it. You win when the whole world has absorbed it, and lose if nobody is left saying it while someone still hasn't heard it.
- **Three trees to evolve** with buzz (pop the bubbles on the map): **Spread** (schoolyards, group chats, flights, ships, translation apps), **The word** (catchier and louder, or more ordinary: "Becomes a verb", "Grandma says it"), and **Staying power** (formal places, other languages, slowing the Purists).
- **The trade-off:** notoriety brings more buzz but brings the Purists sooner, and their style ruling makes speakers drop the word; absorbing people quickly beats the ruling but burns the word out if it hasn't reached everyone yet.
- Regions differ in how online, young and formal they are, which language family they speak, and whether they have an airport or port. Casual, Normal and Brutal. Wins pay coins; there are badges and looks to earn, and every word you've spread is remembered.
- The map is Natural Earth's (public domain), via world-atlas; `node scripts/build-map.mjs` rebuilds it.

## Wird Tycoon

Run a dictionary publisher from a garage in 1985 to 2030.

- **Make a book:** pick a subject (slang, cooking, pirates, law…), a format (pocket dictionary, thesaurus, phrasebook, encyclopedia…), a medium (paperback and hardcover at first, then CD-ROMs, websites, e-readers, apps, smart speakers and AI assistants as the years arrive) and a size. Some pairs suit each other and some don't; you only find out by publishing.
- **Three stages of work** (gathering, writing, finishing), each split between three parts with sliders. Each format cares about different parts and wants its own balance of scholarship and charm. Typos creep in while writing and get caught while finishing.
- **Four critics review it**, quoting words you've rated, and tell you what went right and wrong. Readers expect more as the years pass and as your own books get better, so you'll need more and better staff.
- **Grow:** research new subjects, formats and features, hire scholars, writers, illustrators and editors, take freelance jobs when money's tight, and move from the garage to an office, a publishing house and Wird Tower. Stay in the red for twelve weeks and you go bust.
- Each book pays you some coins (more for better reviews and bigger books), making it to 2030 pays a pension, and there are badges and looks to earn.

## Socials

A **Socials** tab with three apps, all fiction and all about words. Every generated post, account and number comes from the clock and the shared word data, so everyone sees the same feed at the same moment, with no server.

- **W (formerly Writter):** owned by @Grandiloquent, who runs a weekly poll on changing it back (when it passes, Wednesday is Writter day and the bird returns for 24 hours). There are trends, Context Footnotes, a Main Character of the day, and a large **Get W Blue** button with five tiers. The top tier, The Check With a Check On It, adds a check to your check and nothing else.
- **readit:** dozens of subs, among them r/WirdStreetBets, r/Wodleheads (buy the whole dictionary, stay the course, your question has been asked before), r/AmITheAsterisk, r/BoneAppleTea, r/ShowerWords, r/Palindromes and r/WirdConspiracy (the silent K is a cover-up). Posts carry votes, flair and comment threads, and an AutoLexerator sticky.
- **WirdIn:** the professional network. People post their 4am routines, Thought Leadership and "Agree?".
- **Everyone is named after words:** a regular cast plus endless throwaway accounts.
- **Post yourself:** pick a handle (a word you've rated), then post takes, calls on Word Exchange words, brags or plain posts. Engagement is mostly bots and it's worked out from the post itself, so your friends see the same numbers you do. Your posts and your friends' posts show up alongside the generated ones.
- **Grow, or don't:** followers come from your posts, from Lurker up to Lexicon Legend, with a legacy check at 100k. You also get a capped creator payout, sponsors who ask you to post #ad, and looks and badges. You can be downvoted, ratio'd or cancelled. That has its own looks, and the Notes-app apology is right there.

## Your profile

**Profile** (and every friend's profile) is laid out like Letterboxd: who you are and your numbers across the top (words, this year, average, friends, best streak, badges, words caught), your **top 4** favorite words as big cards (pick yours on your profile), your most recent ratings, how you rate, and tabs for every rated word, favorites, playlists, badges, your **Leximon** and your **Casino & Market** record. Friends see all of it; Settings → Friends & lobbies can hide the casino and market part.

## Friends

There are two ways to add a friend:

- **At a lobby table:** hover over someone's seat and press **+ Friend**. They get a request in the side panel. This uses the lobby's connection, so it works whenever the lobby does.
- **With a code:** open **Friends → Make a friend code** and send the code (`WW-XXXXX-XXXXX-XXXXX-XXXXX`) to a friend, who types it under **Got a code?**. The code works once and lasts 15 minutes. Both computers wait for each other *and* look for each other, so it's enough for either one to be reachable.

From then on, whenever you’re both online, your ratings, comments, favorites and playlists sync both ways. Your friends’ ratings stay hidden on each word until you’ve rated it, so they don’t sway you. Removing a friend removes their data from both computers.

When a friend comes online you each send your latest summary straight away, and their profile refreshes both sides of every comparison while you look. An offline friend shows what they had when you last saw them.

Click a friend to open their profile, laid out like yours: their top 4, recent ratings, numbers, Leximon and casino record, how they rate (with yours drawn behind), where the two of you agree and don’t, and their rated words, favorites, comments, playlists and badges. **Rate their words** plays through everything they’ve rated that you haven’t.

## Lobbies

The host opens **Lobby → Host a lobby**, then picks a mode, which words to use, how many rounds (3 to 20) and a timer (none, 15s, 30s or 60s). Everyone else types the code under **Join a table**. Up to 8 people fit around the table. Cards go face down as people lock in, and flip together.

- **Classic** is wirdwatcher together, with no points. Everyone rates, the cards flip, and the middle of the table shows the average with the highest and lowest cards outlined and named. Nobody moves on until everyone presses `Enter`, so there’s time to argue about it.
- **High/Low:** everyone rates, then guesses who went highest and who went lowest (click a seat or press its number). 100 points for each right guess.
- **Hot seat:** each word, one player takes the seat and the next player picks the word for them from three. Everyone else predicts the seat’s rating. Predictors score up to 100 for getting close. The picker gets 50 if the seat goes 4.5 or higher or 0.5 or lower. The seat gets 25 for every prediction that was off by more than 1.0.
- **Hive mind:** everyone secretly gets a target score and a rater. You search for a word (by spelling or meaning) that you think your rater will give that score. Then each rater rates the word they were given without knowing who chose it or why. Up to 100 points for landing close, plus 50 for being within 0.1.
- **Grand Jury** (3 or more players): one of you is secretly the defendant. Their own app offers a few of their strongest real ratings, and the host picks the one the rest of the table disagrees with most. The table sees the charge ("someone here once gave *moist* a 4.8") and votes on who did it. Right votes score 100. If the defendant isn't the clear top of the vote, they walk free with 100 plus 25 for every vote that went elsewhere. The reveal shows who voted for whom and what everyone really gave the word before, so you can argue about it.
- **Clues:** a hidden word shown as blanks, with what everyone at the table rated it face up on the cards (words most of you have rated come first, so your own past rating is a clue). A new clue every 10 seconds: what kind of word, the first letter, the definition, a synonym, more letters. Type a guess any time. A right guess is worth 100, minus 12 for each clue shown and 10 for each wrong guess (never under 10), plus 20 for getting it first. Wrong guesses show in the chat, and chat won't send the word.

Only the first four modes save ratings to your collection.

**Perfect plays** score 50 more and get celebrated at the table: both High/Low guesses right, a Hot seat prediction dead on, a Hive mind word that lands exactly on target, a Grand Jury that catches the defendant unanimously (or a defendant who draws no votes at all), and a Clues word solved within one clue with no misses. When a game ends, the podium rises, the winner gets a crown and confetti, and the sidebar shows a recap: the pot, the awards, and every round with what it meant for you.

**Stakes.** In any mode with points, the host can set a stake (100 coins up to 1 million). Everyone who wants in presses **Buy in**; the highest score at the end takes the pot, and ties split it. Coins never change how anyone plays or scores, and nobody's coins move unless they bought in for that exact amount. There's no bank, so each app keeps its own stake in escrow and the pot follows one rule that every computer checks: **a pot pays out exactly what went in**. The host pays out only after every player's app has confirmed it saw the result, and a stake comes back whenever the game didn't finish: the host ended it early or closed the lobby, your connection dropped, or your app closed mid-game. Leaving on purpose mid-game leaves your stake in the pot (the Leave button asks first). The one case that can't be closed without a bank, a connection that dies in the second between confirming and being paid, loses that stake rather than ever paying it twice. The details are in `src/shared/stakes.js`. Pot winnings don't count toward ink.

Typing a number always rates, wherever you clicked last; only the chat box keeps your keys (the table says so, and `Esc` hands them back). `Space` says the word, in the voice chosen under Settings → Sound (the best English voice on your computer unless you pick one; the enhanced and natural voices you can add to macOS and Windows pronounce far better). The sidebar has two tabs: **Game** (mode, scores, the word's details) and **Chat** (chat and reactions, with a count of unread messages); `T` opens the chat.

If a player’s connection drops, their seat, score and answers are held for 45 seconds while their computer reconnects, and a connection that goes silent is noticed within about 15 seconds instead of hanging. The host can always move on without anyone who isn’t ready.

The word’s definitions, pronunciation and synonyms are one press away: **Word details** at the top of the table, or `D`. There are emoji reactions (Alt+1–8) and chat, awards at the end, and ratings you make at a table count as your own.

## How the network works

The design follows [commonplace](https://github.com/HarvielArcilla/commonplace):

- **Identity.** On first launch the app makes an Ed25519 keypair. The public key is your ID. It is also your key on the peer-to-peer network, so the encrypted handshake proves who is connecting.
- **Transports.**
  - [Hyperswarm](https://github.com/holepunchto/hyperswarm) works over the internet. Peers find each other on a DHT made of users’ own machines, hole-punch through NATs and talk over Noise-encrypted streams.
  - A multicast LAN transport works on the same Wi-Fi with no internet at all. Its announcements carry HMAC tags instead of topics, so other devices on the network learn nothing.
- **Codes.** Friend codes and lobby codes are secrets. Both the meeting place on the network and an AES-GCM key are derived from the code, so only people who have the code can talk there.
- **Adding a friend.** The handshake is one message each way: your identity, a random nonce, and a signature by your identity key over both connection keys (with a code) or both lobby seats (at a table). Both sides then derive a shared secret from the two nonces, and that secret gives the friendship its own topic. Your computer accepts friend connections from friends’ keys only. Nothing else is exchanged during pairing; everything follows through sync.
- **Sync.** Your records (ratings, comments, favorites, playlists and a short profile) have a single writer, you, plus a sequence number. On connecting, each side says "I have your records up to #N, this many of them" and the other sends everything after N, so records never conflict. The same note is compared every 10 minutes while connected. If the counts disagree, the stretch up to N is sent again, and if a friend has a number you've never reached (your data was restored from a backup), they start over from what you have.
- **Lobbies.** A lobby is a star around the host, and players get fresh keys for each lobby. Ratings go only to the host, which reveals them only when everyone has locked in.
- **Limits.** Every limit is a setting you can change: the most friends, how many records to keep from each friend, comment length, lobby size, and how many messages a player can send per minute.

If two computers can’t reach each other, **Settings → About → Network log** shows what the network tried (`network.log` in the data folder). It contains no codes, keys or addresses, so it’s safe to share.

Everything is stored in your app data folder: `identity.json`, `me.json`, `progress.json`, `economy.json`, `friends/`, `settings.json`, `appearance.json` and `sounds/` (your custom rating sound).

## Install

### Windows 10 or 11

**Option 1: the installer.**

1. Download `wirdwatcher-setup-<version>.exe` from the [Releases page](https://github.com/HarvielArcilla/wirdwatcher-friends/releases). Each push to `main` also builds one, under the latest run on the [Actions page](https://github.com/HarvielArcilla/wirdwatcher-friends/actions) → *wirdwatcher-Windows*.
2. Run it. The installer isn’t code-signed (that needs a paid certificate), so Windows SmartScreen may say “Windows protected your PC”. Choose **More info → Run anyway**.
3. The first time wirdwatcher starts, Windows Firewall asks about it. Click **Allow** and tick **Private networks**, or friends’ computers can’t reach yours.

**Option 2: one command (installs from source and updates the same way).** Open PowerShell and paste:

```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/HarvielArcilla/wirdwatcher-friends/main/scripts/install.ps1 | iex"
```

This installs Git and Node.js with winget if they’re missing, downloads wirdwatcher to `%USERPROFILE%\wirdwatcher` and adds a **wirdwatcher** shortcut to your Desktop. To update, run the same command again. [Read the script](scripts/install.ps1) first if you like.

### macOS

Download the `.dmg` from Releases (Apple silicon or Intel), or run:

```sh
curl -fsSL https://raw.githubusercontent.com/HarvielArcilla/wirdwatcher-friends/main/scripts/install.sh | bash
```

The app isn't notarized by Apple (that needs a paid developer account), so the first time you open it macOS says it can't check it. Open **System Settings → Privacy & Security**, scroll down and choose **Open Anyway** next to wirdwatcher. You only do this once. If a copy from before 2.1 says it's "damaged", that build wasn't signed; install a newer one, or run `xattr -dr com.apple.quarantine /Applications/wirdwatcher.app` once in Terminal.

### Your data through updates

Your ratings, friends and settings are kept in your user data folder, not inside the app:

| System | Folder |
| --- | --- |
| Windows | `%APPDATA%\wirdwatcher` |
| macOS | `~/Library/Application Support/wirdwatcher` |
| Linux | `~/.config/wirdwatcher` |

So updating, reinstalling or uninstalling the app doesn’t touch them. The folder also has a few safety measures:

- Only the settings you changed are saved, so better defaults in a new version still reach you.
- When an update changes how data is stored, it first copies the folder to `backups/`.
- A file that can’t be read is kept aside, never silently replaced.
- Data written by a newer version is left untouched.

**Settings → About → Open folder** shows the folder. **Settings → Profile → Delete profile** erases it.

## Running from source

You need Node.js 20 or newer.

```sh
npm install
npm start
```

To try friends and lobbies on one computer, run a second copy with its own identity (on Windows: `set WIRDWATCHER_PROFILE=bob && npm start`):

```sh
WIRDWATCHER_PROFILE=bob npm start
```

To play with every cosmetic unlocked, use the **dev account**, a separate profile with its own data folder and buttons in the Wirdhouse for coins and time:

```sh
npm run dev:account
```

An installed copy does the same with `--dev` (on Windows, `"%LOCALAPPDATA%\Programs\wirdwatcher\wirdwatcher.exe" --dev`; on macOS, `open -a wirdwatcher --args --dev`).

Other commands:

- `npm test` runs the tests, including friends and lobbies on a local DHT and on the same network.
- `npm run smoke` launches the app with a throwaway profile, checks it works, and quits.
- `npm run dist:win` or `npm run dist:mac` builds an installer.

GitHub Actions runs the tests and the launch check on Windows, macOS and Linux for every push, builds both installers, and tries the one-command installers on clean machines. Tagging a version (`git tag v2.1.0 && git push --tags`) publishes the installers on the Releases page.

## The word list

The 64,000 words come from [Open English WordNet 2025](https://en-word.net) (CC BY 4.0), with their definitions, examples, synonyms and IPA pronunciations. Pronunciations are available for about 25,000 words; the app can also say any word out loud.

`scripts/build-words.mjs` rebuilds `data/words.json.gz` and filters out:

- slurs, removed entirely
- obscene, vulgar and disparaging senses (a word stays if it has clean senses, so “screw” keeps its fastener sense)
- the [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) list (CC BY 4.0)

## Version 1

The original ([HarvielArcilla/wirdwatcher](https://github.com/HarvielArcilla/wirdwatcher)) was an Expo/React Native web app on Firebase and Google App Engine. It was retired because the hosting cost too much. Version 2 keeps its Fredoka font, the rating sounds and the type-then-Enter flow, and its slate-and-gold colors live on as the Slate theme.

## License

MIT
