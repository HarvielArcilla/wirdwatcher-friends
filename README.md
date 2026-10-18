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

**Progression:** you earn XP for new words, the first word each day, streaks, the word of the day, finished chains and playlists, and lobby rounds. XP raises your level and title, and there are 65 badges. Your Collection shows a histogram of how you rate, along with your favorites, playlists and every word you’ve rated.

## Sound and effects

Every rating makes a sound, and better ratings get more notes: a 1.0 is one low blip, and a 4.7 is a little run up. Choose from Arcade (the default), Coin, Gem, Harp, Kalimba, Chime, Marimba, Pop, Bubble, Typewriter, Original (wirdwatcher 1’s two sounds, only at the extremes) or Off, or use **your own file** (MP3, WAV, OGG, M4A, AAC, FLAC or WebM, up to 3 MB). Your file is copied into the app’s data folder and stays on this computer.

The presets are synthesized, so they don’t need sound files. Their pitch climbs a pentatonic scale with the rating, so a 5.0 rings and a 0.0 thuds, and a run of ratings sounds like a tune. A custom file speeds up slightly for higher ratings.

The extremes get their own moment:

- **5.0:** a fanfare and confetti.
- **4.5 and up:** a sparkle.
- **0.0:** a sad trombone, and the word falls apart letter by letter.
- **Under 1.0:** the word wilts.

Reduced motion turns off the animations. You can turn the celebrations off, turn pitch-following off, set the volume, or keep v1’s sounds for ratings above 4.0 and at 1.0 or below. Settings → Sound has a row of buttons that play each rating with your current settings.

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

## Friends

1. Open **Friends → Make a friend code** and send the code (`WW-XXXXX-XXXXX-XXXXX-XXXXX`) to a friend.
2. Your friend types it under **Got a code?**. The code works once and lasts 15 minutes.

From then on, whenever you’re both online, your ratings, comments, favorites and playlists sync both ways. Your friends’ ratings stay hidden on each word until you’ve rated it, so they don’t sway you. Removing a friend removes their data from both computers.

## Lobbies

The host opens **Lobby → Host a lobby**, then picks which words to use, how many rounds (5 to 30) and a timer (none, 15s, 30s or 60s). Everyone else types the code under **Join a table**.

Each player locks in a rating with `Enter`. Their card goes face down on the table, and when the last player locks in, every card flips at once. Up to 8 people fit around the table. There are two styles:

- **Chill** (the default) is a conversation piece. The middle of the table shows the average, and the highest and lowest cards are outlined and named (“5.0 highest, Pip” and “0.5 lowest, Quinn”). There are no points. The game ends with the table’s favorite and least favorite words.
- **In tune** scores up to 100 points a word for rating close to everyone else, and ends with a podium.

Both call out a hive mind, when everyone is within 0.5 of each other, and a hot take, when one player is 2.0 or more away from all the others. A 5.0 card throws confetti and a 0.0 card shakes. At the end there are awards: most divisive word, toughest critic, most generous and more. Players can send emoji reactions (Alt+1–8) and chat. Ratings you make at a table also count as your own.

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

Everything is stored in your app data folder: `identity.json`, `me.json`, `progress.json`, `friends/`, `settings.json`, `appearance.json` and `sounds/` (your custom rating sound).

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

The `.dmg` isn’t notarized, so the first time, right-click wirdwatcher in Applications and choose **Open**.

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
