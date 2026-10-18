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
| `←` | Go back to the previous word |
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

**Progression:** you earn XP for new words, the first word each day, streaks, the word of the day, finished chains and playlists, and lobby rounds. XP raises your level and title, and there are 31 badges. Your Collection shows a histogram of how you rate, along with your favorites, playlists and every word you’ve rated.

## Friends

1. Open **Friends → Make a friend code** and send the code (`WW-XXXXX-XXXXX-XXXXX-XXXXX`) to a friend.
2. Your friend types it under **Got a code?**. The code works once and lasts 15 minutes.

From then on, whenever you’re both online, your ratings, comments, favorites and playlists sync both ways. Your friends’ ratings stay hidden on each word until you’ve rated it, so they don’t sway you. Removing a friend removes their data from both computers.

## Lobbies

The host opens **Lobby → Host a lobby**, then picks which words to use, how many rounds (5 to 30) and a timer (none, 15s, 30s or 60s). Everyone else types the code under **Join a table**.

Each player locks in a rating with `Enter`. Their card goes face down on the table, and when the last player locks in, every card flips at once. You score up to 100 points for how close you were to everyone else. The game also calls out a hive mind, when everyone is within 0.5 of each other, and a hot take, when one player is 2.0 or more away from all the others. At the end there’s a podium and awards: table favorite, most divisive word, toughest critic and more. Players can send emoji reactions (Alt+1–8) and chat. Ratings you make at a table also count as your own.

## How the network works

The design follows [commonplace](https://github.com/HarvielArcilla/commonplace):

- **Identity.** On first launch the app makes an Ed25519 keypair. The public key is your ID. It is also your key on the peer-to-peer network, so the encrypted handshake proves who is connecting.
- **Transports.**
  - [Hyperswarm](https://github.com/holepunchto/hyperswarm) works over the internet. Peers find each other on a DHT made of users’ own machines, hole-punch through NATs and talk over Noise-encrypted streams.
  - A multicast LAN transport works on the same Wi-Fi with no internet at all. Its announcements carry HMAC tags instead of topics, so other devices on the network learn nothing.
- **Codes.** Friend codes and lobby codes are secrets. Both the meeting place on the network and an AES-GCM key are derived from the code, so only people who have the code can talk there.
- **Adding a friend.** Each side signs both connection keys with its identity key. Both sides then derive a shared secret, and that secret gives the friendship its own topic. Your computer accepts connections from friends’ keys only.
- **Sync.** Your records (ratings, comments, favorites, playlists and a short profile) have a single writer, you, plus a sequence number. Catching a friend up means sending everything after the last number they have, so records never conflict.
- **Lobbies.** A lobby is a star around the host, and players get fresh keys for each lobby. Ratings go only to the host, which reveals them only when everyone has locked in.
- **Limits.** Every limit is a setting you can change: the most friends, how many records to keep from each friend, comment length, lobby size, and how many messages a player can send per minute.

Everything is stored in your app data folder: `identity.json`, `me.json`, `progress.json`, `friends/` and `settings.json`.

## Running it

You need Node.js 20 or newer.

```sh
npm install
npm start
```

To try friends and lobbies on one computer, run a second copy with its own identity:

```sh
WIRDWATCHER_PROFILE=bob npm start
```

Other commands:

- `npm test` runs the tests, including friends and lobbies on a local DHT and on the same network.
- `npm run dist:mac` or `npm run dist:win` builds an installer.

## The word list

The 64,000 words come from [Open English WordNet 2025](https://en-word.net) (CC BY 4.0), with their definitions, examples, synonyms and IPA pronunciations. Pronunciations are available for about 25,000 words; the app can also say any word out loud.

`scripts/build-words.mjs` rebuilds `data/words.json.gz` and filters out:

- slurs, removed entirely
- obscene, vulgar and disparaging senses (a word stays if it has clean senses, so “screw” keeps its fastener sense)
- the [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) list (CC BY 4.0)

## Version 1

The original was an Expo/React Native web app on Firebase and Google App Engine. It was retired because the hosting cost too much. Version 2 keeps its slate-and-gold look, the Fredoka font, the rating sounds and the type-then-Enter flow.

## License

MIT
