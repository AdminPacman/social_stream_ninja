# Social Stream Ninja — Pac's Arcade fork

This is **AdminPacman/social_stream_ninja**, a fork of Steve Seguin's
[ssn_app](https://github.com/steveseguin/ssn_app) (the Electron shell around
[Social Stream Ninja](https://github.com/steveseguin/social_stream)). Same
Electron app, same chat-capture engine, same overlay bundle underneath —
this fork adds a custom front-end ("Pac's Arcade") on top, **on by default**.

Licensed **GPL-3.0**, same as upstream — see `LICENSE`.

## Quick start

```bash
git clone git@github.com:AdminPacman/social_stream_ninja.git
cd social_stream_ninja
npm install
npm run start:arcade
```

That's it — the app opens in the Arcade interface. `npm run start:arcade` is
a tiny tracked launcher (`scripts/start-local.mjs`, no dependencies) that
points Electron at the bundled content; the older upstream `start*` scripts
don't, and without `--filesource` a source run can boot to blank pages.

To run Steve's original interface instead:

```bash
npm run start:stock        # same launcher, sets SSN_SHELL=stock
```

Linux/Wayland+NVIDIA note: if popup windows render blank, launch with
`ELECTRON_OZONE_PLATFORM_HINT=x11` in the environment.

## The two switches

Two things ship in the same codebase and can be switched independently:

- **The bundle** (`SSN_CHANNEL`) — the content behind the app: overlays,
  dock, themes, EventFlow. `main` (default) carries this fork's patches;
  `beta` is the untouched upstream bundle, useful for A/B-ing a bug against
  stock.
- **The shell** (`SSN_SHELL`) — the app's own chrome: the navigation and
  pages you see around that content. **Arcade is the default.** `stock` is
  Steve's original UI, byte-for-byte unchanged.

You can also switch shells from inside the app: **Deck Settings →
Diagnostics → Interface** — "Arcade (default) / Stock (Steve's original)".
The choice persists and the window reloads into the other interface. An
explicit `SSN_SHELL` environment variable wins over the in-app switch.

**Verified mechanism:** `index.html`'s boot switch is

```js
// first match wins: SSN_SHELL env (stock|arcade) → the persisted in-app
// choice (localStorage mirror) → default
if (picked !== 'stock') document.body.classList.add('arcade-shell');
```

Every rule in `arcade-shell.css` is scoped under `body.arcade-shell`, and
`arcade-shell.js` itself returns immediately if that class isn't present.
So stock mode — however you reach it (env var or the in-app switch) — is
the app Steve ships, byte-for-byte. That identity is gate-proven by
comparing full DOM dumps from a fresh stock instance against upstream
(`cmp` byte-identical).

## What a first-time launch actually shows

Verified live (fresh profile, no prior settings):

- **No welcome screen, no tour.** The app boots straight to the Main tab's
  real (empty) dashboard.
- The dashboard is **honestly empty**, not faked: "No sources are capturing
  right now", "No sources configured yet", "OBS link not seen — arm
  actions.html (&obsws=)", "points system off — Games → Points & unlocks".
  No placeholder numbers, no fake chat — every tile is a dash or a real
  zero until real data exists.
- Stock's own navigation is still in the DOM underneath — arcade mode hides
  it with CSS, it isn't removed. Stock pages (Sources and Settings, Status
  and Logs, Event Flow Editor, Remote Camera Feed, Stream Deck Setup,
  Sessions) stay reachable; the arcade shell drives the same `showPage()`
  the stock UI uses, it doesn't replace the underlying app.

## The topbar tour

The topbar reads **"PAC'S ARCADE"** with five tabs:

| Tab | What's there |
|---|---|
| **Main** | The dashboard: sources rail (add/start/stop chat sources), the embedded combined chat dock, and an honest analytics panel (hours watched, peak viewers, first-time chatters, raids, top earner, follower delta — all dash-faced until real) |
| **Add-ons** | The gallery — every overlay/feature as a card, filterable by category (Chat & Text, Frames & Cameras, Alerts, Money, Games, Flows, Widgets, Commands), each card showing a READY/SOON badge and either an **Open** door into an in-shell panel or a **Copy overlay URL** button for OBS |
| **Style** | Custom CSS / theme controls for the dock and stream overlays, live preview, "My Presets," a theme-page library browser |
| **AI 🔒** | Only appears if the AI gate passes (admin nostr signer, or `SSN_AI_GATE=open` on the operator's own machine) — the DevChat console + this fork's AI-related settings. No gate pass, no tab, no DOM |
| **Deck Settings** | Consolidated settings home (Session & rooms, Control surfaces, Connections, Speech, Points system, Backups & storage, Diagnostics) — this absorbed the old "More▾" hatch, which is retired |

## Add-ons gallery, in one paragraph

Every feature that used to be its own top-level rail tab (Games, Elements,
Alerts, VDO, Event Flow) is now a card in **Add-ons**. A card is either a
**panel** you open in place (Commands, Frames & Cameras, Alerts, Games hub,
Event Flows, Goal Bars) or a **standing overlay** you copy a URL for and
drop into an OBS browser source (Tip Jar, Tip Jar Mini, Now Playing, Hype
Train).

## Your session ID, kept quiet

The session ID is the password to your stream's data plumbing, so in this
fork it is **obscured by default on every surface** — blurred until you
hover or keyboard-focus it, and click-to-copy copies the real ID. That
includes the stock pages hosted inside the app (settings, status
dashboard, camera links and QR codes). Deck Settings → Session & rooms
also has a real **Rotate** action (behind a required warning: rotating
changes your overlay URLs, so every OBS source using the old session must
be updated) with a one-click re-copy of the fresh dock URL afterwards.

## The quiet cabinet

The Games hub's demo cabinet (and the game previews) are **silent by
default** — demo iframes are muted at the cabinet level. A small
"unmute this cabinet" control exists when you want to hear a demo; the
choice is never saved.

## Which VDO.Ninja instance

Camera/guest links (Frames & Cameras) ride a VDO.Ninja instance of your
choice — **Deck Settings → Connections → VDO instance**: Pac's Arcade
(default), vdo.ninja (Steve's hosted), or your own clone's https URL. The
composed links and the embedded camera page all read the one setting.
Self-hosting VDO is its own project — see docs.vdo.ninja/servers.

## Copy-URL / OBS basics

The house pattern (matches the go-live runbook at
`docs/go-live-runbook.md`): there is **no "send to OBS" button** anywhere
in this fork by design. Every overlay-type add-on gives you a **Copy
overlay URL** button; you paste that URL into an OBS Browser Source
yourself. For things that need to act *inside* OBS (scene changes,
start/stop streaming via `!golive`), a hidden OBS browser source loads
`actions.html` with `&obsws=`/`&obspw=` pointed at your local obs-websocket
(OBS 28+, default `ws://127.0.0.1:4455`) — that's the one thing armed
outside the Copy-URL pattern, and it never carries a stream key.

## The honest-data doctrine

Ruled house-wide and visibly enforced on first boot: **no synthetic or
estimated numbers, ever.** A tile shows a real observed value or a dash —
never a guess, never a "~estimate." Stale data gets wiped back to dashes
rather than left stale. This is why a brand-new install looks sparse
rather than impressive — that sparseness is the feature working correctly,
not a bug or missing polish.

## Credit and license

This fork sits on top of, and would not exist without:

- [**Social Stream Ninja**](https://github.com/steveseguin/social_stream)
  (Steve Seguin) — the chat-capture engine, overlay bundle, and EventFlow
  system this fork's content bundle mirrors.
- [**ssn_app**](https://github.com/steveseguin/ssn_app) — the Electron
  chassis this fork is built from.
- [**VDO.Ninja**](https://vdo.ninja) — the P2P transport every overlay in
  this app rides on.

Licensed **GPL-3.0**, same as upstream — see `LICENSE`. Nothing in the
arcade shell changes that; it's an additive UI layer over the same GPL'd
app and content, not a relicense.

## Where stock behavior lives

`SSN_SHELL=stock` (or `npm run start:stock`, or the in-app Interface
switch) is the real, working, supported stock mode — verified
byte-identical to upstream, not aspirational. Everything Steve documents
at [socialstream.ninja/manual](https://socialstream.ninja/manual) applies
unchanged in that mode. Use it if you want plain upstream SSN, want to
compare a bug against stock, or don't want the arcade chrome.
