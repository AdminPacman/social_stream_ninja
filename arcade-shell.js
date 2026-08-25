/* ==========================================================================
   ARCADE SHELL — chrome-layer module for Pac's Arcade mode
   Phase 2 / Shell Alpha (pacsarcade design-briefs/ssn-ui-overhaul/shell-alpha-spec.md)

   Loaded on every boot (stock and arcade). INERT unless <body> carries the
   "arcade-shell" class (set by the tiny inline bootstrap right after <body>
   opens, gated on SSN_SHELL=arcade). Everything here is additive DOM built
   at runtime and reads from — never rewrites — the existing StateManager /
   nav / IPC surface already defined earlier in this same script context
   (index.html's single inline <script>, which this file loads after, so
   window.stateManager, window.showPage, window.SSAppStreamDeckBridge, and
   window.getSourceIconUrl are all already defined).

   Stock DOM/logic is untouched: this module only adds new fixed-position
   chrome, hides #main-navigation via CSS, and drives navigation by calling
   the SAME showPage()/StreamDeck-bridge functions the stock UI itself uses.
   ========================================================================== */
(function () {
    'use strict';

    if (!document.body || !document.body.classList.contains('arcade-shell')) {
        return; // stock mode — do nothing, ever.
    }

    var TABS = [
        { id: 'main', label: 'Main' },
        { id: 'games', label: 'Games' },
        { id: 'elements', label: 'Elements' },
        { id: 'style', label: 'Style' },
        { id: 'alerts', label: 'Alerts' },
        { id: 'vdo', label: 'VDO' },
        { id: 'eventflow', label: 'Event Flow' },
        { id: 'settings', label: 'Settings' }
    ];

    var MORE_ITEMS = [
        { page: 'dashboard', label: 'Status and Logs' },
        { page: 'streamdeck', label: 'Stream Deck Setup' },
        { page: 'sessions', label: 'Sessions' }
    ];

    // --------------------------------------------------------------------
    // AI area — rail berth for the DevChat console, gated to a single ruled
    // npub. Ruling: the Admiral, 0018.06.01 — "gate the devchat behind the
    // admin npub g2x3 ... the natural point for that admin devchat area is
    // inside of the ssn app ... it should go in the ai area." Design doc:
    // pacsarcade briefings/ssn-ai-area-design.md, Phase 1.
    //
    // ONLY this pubkey opens the berth. One named const, no env sprawl (v1).
    // Decoded from
    // npub1ugzge9n0qtw9xydcynpm80vytq5wfd207lt842jje2zwuz56t33scrg2x3 via
    // bech32 (cross-checked against two independent decoder implementations,
    // 0018.06.01 a₿) — this app has no nostr/bech32 library of its own
    // (none found anywhere in the repo), so the hex is baked in here rather
    // than decoded live in the renderer.
    // --------------------------------------------------------------------
    var AI_AREA_ALLOWED_PUBKEY_HEX = 'e2048c966f02dc5311b824c3b3bd845828e4b54ff7d67aaa52ca84ee0a9a5c63'; // g2x3, Admiral ruling 0018.06.01
    var AI_AREA_DEVCHAT_URL = 'http://localhost:5173';
    // DevChat's API server (separate from the frontend above) — the check-in
    // card's ONLY cheap-data source. Confirmed by reading chatdev's own
    // route table (server/routes/*.py) rather than guessing: /health,
    // /health/live, /health/ready, and /api/models are the only routes that
    // answer with no session id already in hand. There is no build-stamp
    // route — the stamp is baked into the frontend bundle with no API, so
    // the check-in card links to it instead of scraping HTML for it.
    var AI_AREA_DEVCHAT_API_URL = 'http://localhost:6400';
    var AI_AREA_PROBE_TIMEOUT_MS = 2500;

    // Cheap pre-check, run once at boot: is ANY NIP-07 signer present at
    // all? This Electron window has no browser-extension host wired up on
    // Linux — the ONLY extension-loading path in the app (main.js's
    // "Enable Chrome Extension" right-click item, session.loadExtension)
    // only scans the Chrome profile's Extensions directory on win32/darwin;
    // there is no Linux branch. So on this deployment window.nostr is never
    // populated and this always returns false, hiding the berth entirely —
    // an honest fail-closed default, not a workaround. See the build report
    // for the precise finding and what would need to change to light it up.
    // If a signer IS present we still can't know WHICH identity it holds
    // without prompting it (not cheap, and prompting every seat on every
    // boot is exactly the "a gate that advertises itself" trap the design
    // doc warns against) — so presence-only is the full extent of the
    // pre-check; identity is only resolved inside the real gate, on click.
    function aiGateOpen() {
        // Local-dev override (Admiral, 0018.06.02): no house signer ships yet
        // (the Arcade Sidecar is queued), so SSN_AI_GATE=open bypasses the
        // g2x3 signer gate ON THIS MACHINE ONLY — the env exists only where
        // the operator's own launcher sets it. The g2x3 door returns with the
        // Arcade Sidecar; this override is a berth key left under the mat on
        // the operator's own boat, not a hole in the hull (DevChat itself is
        // localhost-only either way).
        try {
            return typeof process !== 'undefined' && process.env && process.env.SSN_AI_GATE === 'open';
        } catch (e) { return false; }
    }

    function hasNostrSigner() {
        try {
            return !!(window.nostr &&
                typeof window.nostr.getPublicKey === 'function' &&
                typeof window.nostr.signEvent === 'function');
        } catch (e) {
            return false;
        }
    }

    // --------------------------------------------------------------------
    // Element registry — the ONE source of truth for selectable overlay
    // ELEMENTS (music / tip jar / hype / map). Adding an element is one entry
    // here (plus its overlay page, when built). See pacsarcade design-briefs/
    // ssn-ui-overhaul/element-registry-spec.md. status 'ready' = the overlay
    // page ships and the card is live (Copy overlay URL); 'planned' = an
    // honest SOON stub with no actions. Music, Tip Jar (two variants — stock
    // + house tipjar-mini), and Hype Train ship ready
    // (watchtime-loyalty-elements-spec.md items 1-3). Fren Map stays
    // planned — no geo data source exists.
    // --------------------------------------------------------------------
    var ELEMENTS = [
        {
            id: 'music', name: 'Now Playing', category: 'music', status: 'ready',
            overlayPage: 'music-widget.html',
            params: ['layout=horizontal'],
            blurb: 'Spotify now-playing overlay — transparent, Tuna-grade.'
        },
        {
            id: 'tipjar', name: 'Tip Jar', category: 'tips', status: 'ready',
            overlayPage: 'tipjar.html',
            // Stock SSN overlay (unmodified upstream) — themes/sound/confetti/
            // leaderboard/CSV export. theme accepts default|neon|gold (read from
            // its own source, resources/social_stream_fallback/main/tipjar.html
            // ~line 764: `const theme = urlParams.get('theme') || 'default';
            // // default, neon, gold`) — gold picked to match the house
            // money-gold palette lock; everything else left at its own sensible
            // stock default rather than guessed.
            params: ['theme=gold'],
            blurb: 'Full-featured stock tip jar — themes, sound, confetti, leaderboard. Display-only, no wallet.'
        },
        {
            id: 'tipjar-mini', name: 'Tip Jar Mini', category: 'tips', status: 'ready',
            overlayPage: 'tipjar-mini.html',
            params: ['goal=100', 'label=Tip Jar', 'layout=full'],
            blurb: 'Lean house variant — running total + goal bar, honest empty states, no wallet.'
        },
        {
            id: 'hype', name: 'Hype Train', category: 'hype', status: 'ready',
            overlayPage: 'hype.html',
            blurb: 'Live viewer/chatter counts by platform, straight from the session.'
        },
        {
            id: 'map', name: 'Fren Map', category: 'community', status: 'planned',
            blurb: 'Where the frens are — a live viewer map.'
        }
    ];

    // --------------------------------------------------------------------
    // Analytics IPC bridge state (pacsarcade design-briefs/ssn-ui-overhaul/
    // analytics-ipc-bridge-spec.md). See the big comment above
    // buildAnalyticsPaneMarkup() for what's real vs honest-dash and why.
    // --------------------------------------------------------------------
    var ANALYTICS_MESSAGE_LIMIT = 5000; // same order of magnitude points.js already pulls for its own leaderboards
    var ANALYTICS_POLL_MS = 20000;
    var analyticsPollTimer = null;
    var arcadeAnalytics = {
        period: 'today',
        messages: null,       // raw getLastMessagesDB() rows, newest-first, once the bridge answers
        messagesReady: false,
        viewerCounts: {},     // { twitch: 42, kick: 5, ... } from buildViewerCountsFromMetaStore()
        viewersReady: false,
        peakViewers: 0,       // running max of the summed viewerCounts, since THIS shell boot only
        watchViewerMs: 0,     // Σ (concurrent viewers × elapsed ms) since boot — the "hours watched" integral
        watchLastSampleAt: null, // ms timestamp of the previous viewer sample (left-Riemann step)
        watchLastTotal: 0,    // viewer total carried across the interval since watchLastSampleAt
        watchReady: false,    // true once the first viewer sample lands (honest dash until then)
        followerCounts: {},   // { twitch: 1234, kick: 88, ... } from buildFollowerCountsFromMetaStore()
        followerBaseline: {}, // first reading per platform this boot — delta is measured against this
        followersReady: false
    };

    function isBetaChannel() {
        try {
            return typeof process !== 'undefined' && process.env && process.env.SSN_CHANNEL === 'beta';
        } catch (e) {
            return false;
        }
    }

    // --------------------------------------------------------------------
    // CLOCK state (v2, Style panel control group) — persisted settings +
    // live hooks the CLOCK control writes into without re-running the whole
    // startBftClock() closure. See the big comment above startBftClock().
    // --------------------------------------------------------------------
    var CLOCK_MODE_KEY = 'arcadeClockMode';
    var CLOCK_SECONDS_KEY = 'arcadeClockSeconds';
    var bftClockMode = 'bft';               // 'bft' | 'local'
    var bftClockSeconds = false;
    var bftRenderDisplay = null;            // set inside startBftClock(); immediate redraw, no fetch
    var bftRescheduleTick = null;           // set inside startBftClock(); re-picks the 30s/60s height-poll cadence
    var bftRescheduleSecondsTimer = null;   // set inside startBftClock(); starts/stops the 1s display-only ticker
    var bftMaybeFetchTimestamp = null;      // set inside startBftClock(); cold-start timestamp-anchor fetch (0018.05.26 b)
    var bftBroadcastAnchor = null;          // set inside startBftClock(); pushes the real height to #chat-dock-frame (per-message BFT stamp follow-up, 0018.08.23)

    // --------------------------------------------------------------------
    // Topbar
    // --------------------------------------------------------------------
    function buildTopbar() {
        var header = document.createElement('header');
        header.className = 'arcade-topbar';

        var brand = document.createElement('button');
        brand.type = 'button';
        brand.className = 'arcade-brand';
        brand.setAttribute('aria-label', 'Pac’s Arcade — go to Main');
        brand.innerHTML =
            '<img src="assets/arcade/tricolor-pac-64.png" alt="">' +
            '<span class="wordmark">PAC’S ARCADE</span>';
        brand.addEventListener('click', function () { navigateArcadeTab('main'); });
        header.appendChild(brand);

        var nav = document.createElement('nav');
        nav.className = 'arcade-nav';
        nav.setAttribute('aria-label', 'Arcade screens');
        TABS.forEach(function (tab) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.arcadeTabBtn = tab.id;
            btn.textContent = tab.label;
            btn.addEventListener('click', function () { navigateArcadeTab(tab.id); });
            nav.appendChild(btn);
        });
        header.appendChild(nav);

        header.appendChild(buildMoreMenu());

        var spacer = document.createElement('span');
        spacer.className = 'arcade-spacer';
        header.appendChild(spacer);

        if (isBetaChannel()) {
            var betaChip = document.createElement('span');
            betaChip.className = 'arcade-pill arcade-pill--flair';
            betaChip.textContent = 'BETA CHANNEL';
            header.appendChild(betaChip);
        }

        var clockWrap = buildClockControl();
        header.appendChild(clockWrap);

        document.body.appendChild(header);
        startBftClock(clockWrap.querySelector('.arcade-bft'));
    }

    // --------------------------------------------------------------------
    // Clock button + settings popover (0018.05.26 b — out of the Style tab).
    // Same anchored-popover pattern as buildMoreMenu() above (wrap/is-open,
    // click-outside via a document click listener, aria-expanded on the
    // trigger) — the clock chip itself becomes the keyboard-accessible
    // trigger (button, aria-haspopup) instead of an inert span. Popover
    // holds exactly what the old Style-panel CLOCK group held — MODE
    // segmented [BFT|LOCAL] + SECONDS toggle, same settings keys/canonical
    // saveSetting path, applied live via the existing bft* hooks — no other
    // chrome. The popover stays open across mode/seconds clicks (stopped
    // propagation) so both can be toggled in one visit; it closes on
    // click-outside, Escape, or re-clicking the trigger.
    // --------------------------------------------------------------------
    function clockBridgeAvailable() {
        try {
            return !!(window.ninjafy && typeof window.ninjafy.sendMessage === 'function');
        } catch (e) { return false; }
    }

    function syncClockBridgeHint() {
        var hint = document.getElementById('arcade-clock-pop-hint');
        if (hint) hint.hidden = clockBridgeAvailable();
    }

    function buildClockControl() {
        var wrap = document.createElement('div');
        wrap.className = 'arcade-clockbtn';

        var bft = document.createElement('button');
        bft.type = 'button';
        bft.className = 'arcade-bft';
        bft.setAttribute('aria-haspopup', 'true');
        bft.setAttribute('aria-expanded', 'false');
        bft.setAttribute('aria-label', 'Clock settings');
        bft.innerHTML =
            '<span class="date">----.--.--</span><span class="ab">a₿</span>' +
            '<span class="time">--:--</span>' +
            '<span class="height"><span class="arcade-starbox">★</span><span class="h">---,---</span></span>';
        wrap.appendChild(bft);

        var pop = document.createElement('div');
        pop.className = 'arcade-clock-pop';
        pop.setAttribute('role', 'menu');
        pop.setAttribute('aria-label', 'Clock settings');
        pop.innerHTML =
            '<div class="arcade-clock">' +
            '<div class="arcade-seg" role="group" aria-label="Clock mode" id="arcade-clock-seg">' +
            '<button type="button" class="is-on" data-arcade-clock-mode="bft" aria-pressed="true">BFT</button>' +
            '<button type="button" data-arcade-clock-mode="local" aria-pressed="false">LOCAL</button>' +
            '</div>' +
            '<label class="arcade-clock-seconds"><input type="checkbox" id="arcade-clock-seconds"><span>seconds</span></label>' +
            '</div>' +
            '<span class="arcade-field__hint arcade-clock-pop-hint" id="arcade-clock-pop-hint" hidden>won’t persist — settings bridge unavailable</span>';
        wrap.appendChild(pop);

        function closePopover() {
            wrap.classList.remove('is-open');
            bft.setAttribute('aria-expanded', 'false');
        }
        function openPopover() {
            syncClockBridgeHint(); // bridge availability can't change mid-session, but cheap to recheck honestly
            wrap.classList.add('is-open');
            bft.setAttribute('aria-expanded', 'true');
        }

        bft.addEventListener('click', function (e) {
            e.stopPropagation();
            if (wrap.classList.contains('is-open')) closePopover(); else openPopover();
        });
        // Toggling MODE/SECONDS inside the popover must NOT bubble to the
        // document click-outside listener below (that would close the
        // popover on every toggle, defeating "toggle both in one visit").
        pop.addEventListener('click', function (e) { e.stopPropagation(); });
        document.addEventListener('click', closePopover);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && wrap.classList.contains('is-open')) {
                closePopover();
                bft.focus();
            }
        });

        initClockPopoverControls(pop);

        return wrap;
    }

    function buildMoreMenu() {
        var wrap = document.createElement('div');
        wrap.className = 'arcade-more';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = 'More ▾';
        wrap.appendChild(btn);

        var pop = document.createElement('div');
        pop.className = 'arcade-more-pop';
        pop.setAttribute('role', 'menu');
        MORE_ITEMS.forEach(function (item) {
            var mi = document.createElement('button');
            mi.type = 'button';
            mi.setAttribute('role', 'menuitem');
            mi.textContent = item.label;
            mi.addEventListener('click', function () {
                wrap.classList.remove('is-open');
                btn.setAttribute('aria-expanded', 'false');
                setArcadeTab(null); // none of the 5 mapped tabs are "on" for a More destination
                clickStockNav(item.page);
            });
            pop.appendChild(mi);
        });
        wrap.appendChild(pop);

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var open = wrap.classList.toggle('is-open');
            btn.setAttribute('aria-expanded', String(open));
        });
        document.addEventListener('click', function () {
            wrap.classList.remove('is-open');
            btn.setAttribute('aria-expanded', 'false');
        });

        return wrap;
    }

    // --------------------------------------------------------------------
    // BFT clock chip (v2, 0018.05.26 — Pac's stream-desk feedback) — honest
    // dash-faces until a REAL beacon answers. Two live sources tried in order
    // every tick: the arcade's own beacon (time.pacsarcade.org, a shim over
    // the fleet's bitcoind) first, mempool.space as fallback.
    //
    // Pac ruling 0018.05.26: no synthetic time ever — dashes over estimates.
    // There is no local-estimate rung anymore: if BOTH network sources fail
    // on a tick, the chip wipes back to honest dash-faces (a stale height is
    // wrong within minutes; dashes are the honest state until a REAL answer
    // returns) rather than ever showing a computed guess.
    //
    // CLOCK control (Style panel) adds a mode toggle — BFT (default) | LOCAL
    // — and a seconds toggle, persisted as arcadeClockMode/arcadeClockSeconds
    // (textparam1, canonical saveSetting; read at boot via loadClockSettings(),
    // applied live via the bft* hooks below — no re-render of this whole
    // function). LOCAL mode shows the user's real Gregorian date/time
    // (Intl default), visibly NOT wearing the "a₿" dress a BFT reading wears.
    // Star-box height is ALWAYS the real value (or dash) in both modes —
    // height is height, independent of which clock face is showing.
    //
    // Seconds mode does INTRA-BLOCK INTERPOLATION, not a bare looping :SS —
    // 1 block = 10 BFT minutes, so the raw (bid%6)*10 minute digit is frozen
    // for the whole block otherwise. blockObservedAt anchors wall-clock time
    // to the moment THIS shell first observed the height change; elapsed
    // wall-time since then becomes the sub-block minute-ones-digit + seconds,
    // HARD-CAPPED at :M9:59 so it never invents a block that hasn't landed.
    // Three real states: (1) no real height yet (or sources just failed) —
    // full dash-faces; (2) real height, but no CHANGE observed yet this boot
    // (phase unknown) — coarse HH:M0:-- , sub-block digits honestly dashed;
    // (3) a height change was observed — interpolating (or capped-waiting at
    // :M9:59) off that real anchor. Interpolation only ever runs on top of a
    // REAL height; the 1s display ticker is presentation-only (no fetching)
    // and the height-poll cadence itself tightens 60s → 30s while seconds
    // mode is on (phase error bound ≤ poll interval; the extra load is on
    // our own beacon first).
    // --------------------------------------------------------------------
    function pad(n, w) { return String(n).padStart(w, '0'); }

    function startBftClock(bftEl) {
        var BPD = 144, BPM = 4032, BPY = 52416;

        var lastRealHeight = null;   // ONLY ever a real network answer — never an estimate.
        var blockObservedAt = null;  // wall-clock ms when lastRealHeight last genuinely CHANGED
        // Cold-start phase anchor (0018.05.26 b — real block-timestamp phase):
        // the tip block's ACTUAL header timestamp (ms), fetched only when seconds
        // are on and no OBSERVED transition exists yet for lastRealHeight. This is
        // measured chain data, not synthesis — honest-time-ruling compliant. An
        // OBSERVED height change (blockObservedAt) is always the freshest anchor
        // and REPLACES this the instant one lands; see renderBft()'s precedence.
        var blockTimestampMs = null;
        var timestampFetchInFlight = false;

        function renderHeight() {
            var hEl = bftEl.querySelector('.h');
            if (!hEl) return;
            hEl.textContent = lastRealHeight == null ? '---,---' : lastRealHeight.toLocaleString('en-US');
        }

        function renderLocal() {
            var now = new Date();
            var dEl = bftEl.querySelector('.date'), tEl = bftEl.querySelector('.time'), abEl = bftEl.querySelector('.ab');
            if (dEl) dEl.textContent = now.getFullYear() + '.' + pad(now.getMonth() + 1, 2) + '.' + pad(now.getDate(), 2);
            var t = pad(now.getHours(), 2) + ':' + pad(now.getMinutes(), 2);
            if (bftClockSeconds) t += ':' + pad(now.getSeconds(), 2);
            if (tEl) tEl.textContent = t;
            if (abEl) abEl.textContent = ''; // LOCAL is honestly Gregorian — never wears the a₿ dress
            renderHeight(); // height/star-box always real, regardless of mode
        }

        function renderBft() {
            var abEl = bftEl.querySelector('.ab');
            if (abEl) abEl.textContent = 'a₿';
            renderHeight();
            var dEl = bftEl.querySelector('.date'), tEl = bftEl.querySelector('.time');
            if (lastRealHeight == null) {
                if (dEl) dEl.textContent = '----.--.--';
                if (tEl) tEl.textContent = '--:--';
                return;
            }
            var h = lastRealHeight;
            var rem = ((h % BPY) + BPY) % BPY;
            var y = Math.floor(h / BPY);
            var m = Math.floor(rem / BPM) + 1;
            var d = Math.floor((rem % BPM) / BPD) + 1;
            var bid = ((h % BPD) + BPD) % BPD;
            var hh = Math.floor(bid / 6);
            var decadeMin = (bid % 6) * 10; // 1 block = 10 BFT minutes — coarse, frozen for the whole block
            if (dEl) dEl.textContent = pad(y, 4) + '.' + pad(m, 2) + '.' + pad(d, 2);
            if (!tEl) return;
            if (!bftClockSeconds) {
                // Minute-ones fix (0018.06.03, Pac): without seconds the display
                // used to print the raw decade minute — a multiple of 10 — so the
                // ones column sat frozen for the whole block ("stuck in 10's").
                // Same interpolation as the seconds path, same anchor precedence,
                // same :M9 cap — just rendered without the :SS tail. No anchor →
                // phase inside the block is honestly unknown → coarse HH:M0 stands.
                var minAnchorMs = blockObservedAt != null ? blockObservedAt : blockTimestampMs;
                if (minAnchorMs == null) {
                    tEl.textContent = pad(hh, 2) + ':' + pad(decadeMin, 2);
                    return;
                }
                var minElapsed = Math.max(0, Math.min(Date.now() - minAnchorMs, 9 * 60000 + 59000));
                tEl.textContent = pad(hh, 2) + ':' + pad(decadeMin + Math.floor(minElapsed / 60000), 2);
                return;
            }
            // Precedence (0018.05.26 b): an OBSERVED height change is the freshest
            // anchor — real wall-clock moment WE saw the block land. The timestamp
            // anchor is the cold-start fallback so seconds don't sit dashed for up
            // to a full block after toggling on; it's replaced the instant an
            // OBSERVED change arrives (see observeHeight()/maybeFetchBlockTimestamp()).
            var anchorMs = blockObservedAt != null ? blockObservedAt : blockTimestampMs;
            if (anchorMs == null) {
                // Real height known, but no anchor yet (no observed transition AND
                // no timestamp fetched/available) — phase inside the block is
                // genuinely unknown; dash the sub-block digits rather than pretend
                // to know where in the block we are.
                tEl.textContent = pad(hh, 2) + ':' + pad(decadeMin, 2) + ':--';
                return;
            }
            // Header timestamps are miner-set and can skew minutes off wall-clock
            // (either direction) — clamp honestly into the single 10-BFT-minute
            // block window rather than ever showing negative or overflowing
            // sub-block digits. This is the same hard cap v2 already applied to
            // the OBSERVED-anchor path; here it also floors negative skew at 0
            // (a miner's clock reading "in the future" relative to us doesn't mean
            // less than zero seconds have elapsed in the block).
            var elapsed = Math.max(0, Math.min(Date.now() - anchorMs, 9 * 60000 + 59000)); // clamp to [0, :M9:59]
            var minOffset = Math.floor(elapsed / 60000);
            var ss = Math.floor(elapsed / 1000) % 60;
            tEl.textContent = pad(hh, 2) + ':' + pad(decadeMin + minOffset, 2) + ':' + pad(ss, 2);
        }

        function renderDisplay() {
            if (bftClockMode === 'local') renderLocal(); else renderBft();
        }
        bftRenderDisplay = renderDisplay;

        // Per-message BFT stamp follow-up (0018.08.23): the dock (a SEPARATE
        // #chat-dock-frame iframe, its own window) has no access to this
        // closure's lastRealHeight. Broadcast is the reuse mechanism the
        // house doc calls for — push the SAME real height this clock already
        // fetched, dock.html never fetches its own copy or estimates one.
        // Height only (not the seconds anchor): the dock stamp is coarse-only
        // by design, so it doesn't need blockObservedAt/blockTimestampMs.
        function broadcastBftAnchor() {
            try {
                var frame = document.getElementById('chat-dock-frame');
                if (frame && frame.contentWindow) {
                    frame.contentWindow.postMessage({ type: 'arcadeBftAnchor', height: lastRealHeight }, '*');
                }
            } catch (e) { /* dock frame not present/loaded yet — next observeHeight()/tick() retries */ }
        }
        bftBroadcastAnchor = broadcastBftAnchor;

        function observeHeight(h) {
            if (lastRealHeight === null || h !== lastRealHeight) {
                // null→number = first real height this boot (or since a wipe):
                // phase unknown, blockObservedAt stays null. number→different-
                // number = a genuine block change: anchor the interpolation clock.
                blockObservedAt = (lastRealHeight === null) ? null : Date.now();
                lastRealHeight = h;
                blockTimestampMs = null; // new height invalidates any prior timestamp anchor
            }
            renderDisplay();
            broadcastBftAnchor();
            maybeFetchBlockTimestamp(); // no-op unless seconds-on + no anchor yet — see below
        }

        function fetchArcadeBeacon() {
            return fetch('https://time.pacsarcade.org/height', { cache: 'no-store' })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var h = data && parseInt(data.height, 10);
                    if (isFinite(h) && h > 0) return h;
                    throw new Error('arcade beacon: bad height payload');
                });
        }

        function fetchMempoolFallback() {
            return fetch('https://mempool.space/api/blocks/tip/height', { cache: 'no-store' })
                .then(function (r) { return r.text(); })
                .then(function (s) {
                    var h = parseInt(s.trim(), 10);
                    if (isFinite(h) && h > 0) return h;
                    throw new Error('mempool fallback: bad height payload');
                });
        }

        // --------------------------------------------------------------
        // Real block-timestamp phase (0018.05.26 b) — cold-start anchor so
        // seconds mode starts ticking within one fetch of toggling on,
        // instead of waiting up to a full ~10min block for an OBSERVED
        // height change. Source order per the honest-time ruling: (a) the
        // arcade beacon IF it ever grows a timestamp field alongside
        // /height (verified 0018.08.18: it does NOT today — height-only
        // payload, `{"height":N}` — so this rung is feature-detected and
        // currently always falls through; noted as a fleet follow-up); (b)
        // mempool.space `/api/v1/blocks`, first entry, ONLY if its height
        // matches the height we already trust (targetHeight) — a mismatch
        // means the tip moved between our height-fetch and this call, and
        // we honestly reject rather than anchor to the wrong block.
        // --------------------------------------------------------------
        function fetchArcadeBeaconTimestamp(targetHeight) {
            return fetch('https://time.pacsarcade.org/height', { cache: 'no-store' })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var h = data && parseInt(data.height, 10);
                    var tsRaw = data && (data.timestamp || data.time || data.blockTime);
                    var ts = parseInt(tsRaw, 10);
                    if (!isFinite(h) || h !== targetHeight) throw new Error('arcade beacon: height mismatch for timestamp');
                    if (!isFinite(ts) || ts <= 0) throw new Error('arcade beacon: no timestamp field on /height (fleet follow-up — beacon is height-only today)');
                    return ts;
                });
        }

        function fetchMempoolBlockTimestamp(targetHeight) {
            return fetch('https://mempool.space/api/v1/blocks', { cache: 'no-store' })
                .then(function (r) { return r.json(); })
                .then(function (list) {
                    var entry = Array.isArray(list) && list[0];
                    var h = entry && parseInt(entry.height, 10);
                    var ts = entry && parseInt(entry.timestamp, 10);
                    // Honest-time law: verify the entry's height MATCHES our known
                    // tip height before trusting its timestamp — mismatch → ignore,
                    // stay dashed (never anchor to a block we didn't ask about).
                    if (!isFinite(h) || h !== targetHeight) throw new Error('mempool: tip height mismatch, refusing to anchor');
                    if (!isFinite(ts) || ts <= 0) throw new Error('mempool: bad timestamp payload');
                    return ts;
                });
        }

        function fetchTipBlockTimestamp(targetHeight) {
            return fetchArcadeBeaconTimestamp(targetHeight).catch(function () {
                return fetchMempoolBlockTimestamp(targetHeight);
            });
        }

        function maybeFetchBlockTimestamp() {
            // (0018.06.03) no seconds-mode gate anymore: the minute ones-digit
            // interpolates in BOTH display modes now, so the cold-start anchor
            // is needed whenever BFT time is showing at all.
            if (bftClockMode !== 'bft') return;    // LOCAL face needs no block anchor
            if (lastRealHeight == null) return;     // no real height to anchor against
            if (blockObservedAt != null) return;    // OBSERVED anchor already covers phase — freshest, no fetch needed
            if (blockTimestampMs != null) return;   // already timestamp-anchored for this height
            if (timestampFetchInFlight) return;
            var targetHeight = lastRealHeight;
            timestampFetchInFlight = true;
            fetchTipBlockTimestamp(targetHeight)
                .then(function (ts) {
                    timestampFetchInFlight = false;
                    if (lastRealHeight !== targetHeight) return; // height moved on mid-fetch — stale, drop
                    if (blockObservedAt != null) return;         // an OBSERVED change won the race — it wins, ignore
                    blockTimestampMs = ts * 1000;
                    renderDisplay();
                })
                .catch(function () {
                    timestampFetchInFlight = false;
                    // Failure/degradation: stays exactly v2's behavior — coarse
                    // HH:M0:-- until an OBSERVED change lands. Never synthesize.
                    // A later tick (still seconds-on, still no anchor) naturally
                    // retries via observeHeight() → maybeFetchBlockTimestamp().
                });
        }
        bftMaybeFetchTimestamp = maybeFetchBlockTimestamp;

        function tick() {
            fetchArcadeBeacon()
                .then(observeHeight)
                .catch(function () {
                    fetchMempoolFallback()
                        .then(observeHeight)
                        .catch(function () {
                            // Pac ruling 0018.05.26: no synthetic time ever — dashes
                            // over estimates. Both real sources failed this tick:
                            // wipe to honest dash-faces instead of leaving a
                            // possibly-stale height/time on screen.
                            lastRealHeight = null;
                            blockObservedAt = null;
                            blockTimestampMs = null;
                            renderDisplay();
                            broadcastBftAnchor(); // wipe the dock's copy too — dash-face, not a stale height
                        });
                });
        }

        var tickTimer = null;
        function scheduleTick() {
            clearInterval(tickTimer);
            tickTimer = setInterval(tick, bftClockSeconds ? 30000 : 60000);
        }
        bftRescheduleTick = scheduleTick;

        var secondsTimer = null;
        function scheduleSecondsTicker() {
            clearInterval(secondsTimer);
            // (0018.06.03) always on now, not just in seconds mode: the minute
            // ones-digit interpolates in both display modes, so the face needs a
            // display-only re-render cadence in no-seconds mode too (1s keeps the
            // minute flip on time; it never fetches, so the cost is one text write).
            secondsTimer = setInterval(renderDisplay, 1000); // display-only, never fetches
        }
        bftRescheduleSecondsTimer = scheduleSecondsTicker;

        // No synchronous render here — the chip keeps its markup dash-faces
        // (----.--.--  --:--  ---,---) until this first tick actually
        // resolves, honest-time law's "dash-face on first paint".
        tick();
        scheduleTick();
        scheduleSecondsTicker();
    }

    // Read at shell boot (before the Style tab has ever been visited — the
    // topbar clock is always on screen) and applied live via the bft* hooks;
    // same ninjafy getSettings/saveSetting plumbing as everything else here.
    function loadClockSettings() {
        return new Promise(function (resolve) {
            try {
                if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                    window.ninjafy.sendMessage(null, { getSettings: true }, function (response) {
                        try {
                            var settings = (response && response.settings) || {};
                            var modeEntry = settings[CLOCK_MODE_KEY];
                            var modeRaw = modeEntry && typeof modeEntry.textparam1 === 'string' ? modeEntry.textparam1 : '';
                            if (modeRaw === 'local' || modeRaw === 'bft') bftClockMode = modeRaw;
                            var secEntry = settings[CLOCK_SECONDS_KEY];
                            var secRaw = secEntry && typeof secEntry.textparam1 === 'string' ? secEntry.textparam1 : '';
                            bftClockSeconds = secRaw === 'true';
                        } catch (e) { console.error('[arcade-shell] clock settings parse failed:', e); }
                        resolve();
                    });
                    return;
                }
            } catch (e) { console.error('[arcade-shell] clock settings load failed:', e); }
            resolve(); // settings bridge unavailable — clock stays at its BFT/no-seconds defaults
        });
    }

    function saveClockSetting(key, value) {
        try {
            if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                window.ninjafy.sendMessage(null, { cmd: 'saveSetting', type: 'textparam1', setting: key, value: value }, function () { /* fire-and-forget, same as v1's non-critical settings */ });
            }
        } catch (e) { console.error('[arcade-shell] clock setting save failed:', e); }
    }

    function applyClockSettingChange() {
        // Re-render immediately (no fetch), then re-arm the two timers that
        // depend on seconds mode (poll cadence 30s/60s, 1s display ticker).
        if (typeof bftRenderDisplay === 'function') bftRenderDisplay();
        if (typeof bftRescheduleTick === 'function') bftRescheduleTick();
        if (typeof bftRescheduleSecondsTimer === 'function') bftRescheduleSecondsTimer();
        // Toggling seconds ON with a real height already known and no anchor
        // yet: kick the cold-start timestamp fetch immediately so seconds
        // start ticking within one fetch, per the popover's live-apply law.
        if (typeof bftMaybeFetchTimestamp === 'function') bftMaybeFetchTimestamp();
    }

    function syncClockControls() {
        var seg = document.getElementById('arcade-clock-seg');
        if (seg) {
            seg.querySelectorAll('button').forEach(function (btn) {
                var on = btn.dataset.arcadeClockMode === bftClockMode;
                btn.classList.toggle('is-on', on);
                btn.setAttribute('aria-pressed', String(on));
            });
        }
        var secondsToggle = document.getElementById('arcade-clock-seconds');
        if (secondsToggle) secondsToggle.checked = bftClockSeconds;
    }

    // --------------------------------------------------------------------
    // Navigation — delegates to the SAME functions the stock nav uses.
    // --------------------------------------------------------------------
    function setArcadeTab(tabId) {
        document.body.dataset.arcadeTab = tabId || '';
        document.querySelectorAll('[data-arcade-tab-btn]').forEach(function (btn) {
            btn.classList.toggle('is-on', btn.dataset.arcadeTabBtn === tabId);
        });
        try { localStorage.setItem('arcadeTab', tabId || 'main'); } catch (e) { /* noop */ }
    }

    // Games and Settings are two different tabs but the SAME underlying
    // page (#frame1's popup.html, "streams-page") — so by default they'd
    // share one scroll position: leave Settings scrolled halfway down and
    // Games opens halfway down too (Shell Alpha verification nit #3).
    // Each tab gets its own remembered scrollY in this map, saved right
    // before navigating away and restored right after navigating in;
    // first visit to a tab falls back to an honest per-tab default
    // (Games -> the #games section, Settings -> the top of the popup).
    var POPUP_SCROLL_TABS = { games: true, settings: true };
    var popupScrollMemory = {};

    function getReadyFrame1() {
        var frame1 = document.getElementById('frame1');
        if (!frame1) return null;
        try {
            if (frame1.contentWindow && frame1.contentDocument && frame1.contentDocument.readyState !== 'loading') {
                return frame1;
            }
        } catch (e) {
            // Cross-origin fallback frame (hosted socialstream.ninja) — scroll
            // read/write isn't reachable from here; not treated as an error.
        }
        return null;
    }

    function savePopupScroll(tabId) {
        if (!POPUP_SCROLL_TABS[tabId]) return;
        var frame1 = getReadyFrame1();
        if (!frame1) return;
        try {
            popupScrollMemory[tabId] = frame1.contentWindow.scrollY || 0;
        } catch (e) { /* noop */ }
    }

    function restorePopupScroll(tabId) {
        if (!POPUP_SCROLL_TABS[tabId]) return;
        var frame1 = document.getElementById('frame1');
        if (!frame1) return;
        var tries = 0;
        var timer = setInterval(function () {
            tries++;
            var ready = getReadyFrame1();
            if (ready === null && tries <= 20) return; // not loaded yet, keep waiting
            clearInterval(timer);
            if (!ready) return; // cross-origin — nothing we can safely touch
            try {
                var remembered = popupScrollMemory[tabId];
                if (typeof remembered === 'number') {
                    ready.contentWindow.scrollTo(0, remembered);
                } else if (tabId === 'games') {
                    ready.contentWindow.location.hash = 'games';
                } else {
                    ready.contentWindow.scrollTo(0, 0);
                }
            } catch (e) { /* noop */ }
        }, 250);
    }

    // index.html actually has two overlapping nav implementations left over
    // from its own history: a simple global showPage() (display toggling
    // only), and a fuller switchToPage() — which also drives frame2's
    // postMessage view switch for Event Flow, resolves the VDO frame src,
    // and persists the choice to StateManager's global state — but
    // switchToPage() is declared INSIDE index.html's own DOMContentLoaded
    // closure and is never exposed on window, so it isn't callable from
    // here. Both are wired as real 'click' listeners on the stock
    // #main-navigation <a data-page> elements, though, so a synthetic
    // click on the matching hidden anchor runs BOTH — byte-identical to
    // what a real user click does, without this module needing to know
    // (or duplicate) which internal function does what.
    var ARCADE_TAB_PAGE = {
        main: 'chat',
        games: 'streams',
        vdo: 'vdo-ninja',
        eventflow: 'event-flow-editor',
        settings: 'streams'
    };
    // Custom tabs render their OWN in-shell panel (no ARCADE_TAB_PAGE entry) —
    // navigateArcadeTab skips the stock-nav click for these, and CSS reveals
    // the panel + hides #content-pane while data-arcade-tab matches. The boot
    // guard is naturally a no-op for them (expected = ARCADE_TAB_PAGE[custom]
    // is undefined, so it never fights). See buildElementsPanel().
    // 'ai' is deliberately NOT a static member here — it's added (along with
    // the TABS entry and the panel DOM itself) only when hasNostrSigner()
    // passes at boot, in init(). No signer on this seat => 'ai' stays
    // unknown to both maps => navigateArcadeTab('ai') is a silent no-op,
    // same as any other unrecognized tab id.
    var CUSTOM_TABS = { elements: true, style: true, alerts: true };
    var bootGraceUntil = 0; // set on init(); see installBootGuard() below

    function clickStockNav(pageId) {
        var link = document.querySelector('#main-navigation a[data-page="' + pageId + '"]');
        if (link) link.click();
    }

    // Leaving the AI tab for ANY other tab (rail click, ×, stock nav) must
    // not leave a live DevChat iframe sitting hidden in the background
    // still polling — the design doc's "destroy or hide on collapse" rule
    // applies here too, not just to the explicit collapse button, since
    // plain CSS display:none (how every other custom-tab panel hides
    // itself) does not unload an iframe's document. aiConsoleExpanded is
    // left untouched so re-entering the tab this session still reopens
    // expanded — runAiAreaGate()'s re-run rebuilds the frame fresh either
    // way (setAiAreaState('checking') already clears the body).
    function teardownAiAreaFrameIfLeaving(nextTabId) {
        if (nextTabId === 'ai') return;
        if (document.body.dataset.arcadeTab !== 'ai') return;
        var frame = document.getElementById('arcade-ai-frame');
        if (frame) frame.remove();
    }

    function navigateArcadeTab(tabId) {
        teardownAiAreaFrameIfLeaving(tabId);
        if (CUSTOM_TABS[tabId]) {
            // Custom in-shell panel (e.g. Elements): no stock page to drive —
            // remember the tab we're leaving and flip the tab state; CSS
            // reveals the panel and covers #content-pane. No clickStockNav.
            savePopupScroll(document.body.dataset.arcadeTab);
            setArcadeTab(tabId);
            if (tabId === 'style') ensureStylePanelLive(); // lazy: load saved blob + first preview on first visit
            if (tabId === 'alerts') ensureAlertsPanelLive(); // lazy: load saved param25 settings + first preview on first visit
            if (tabId === 'ai') runAiAreaGate(); // NOT lazy-once — a fresh challenge every open, no stored grants (design doc, 0018.06.01)
            return;
        }
        var pageId = ARCADE_TAB_PAGE[tabId];
        if (!pageId) return;
        savePopupScroll(document.body.dataset.arcadeTab); // capture the tab we're LEAVING
        clickStockNav(pageId);
        restorePopupScroll(tabId); // no-op for tabs other than games/settings
        setArcadeTab(tabId);
    }
    window.arcadeNavigateTab = navigateArcadeTab; // exposed for debugging/CDP verification
    // Per-message BFT stamp follow-up (0018.08.23): index.html calls this once
    // the #chat-dock-frame iframe finishes (re)loading, so a fresh/reloaded
    // dock gets the shell's ALREADY-KNOWN real height immediately instead of
    // sitting dash-faced until the next 30s/60s clock tick. Still push-only —
    // the dock never fetches its own copy.
    window.arcadeBroadcastBftAnchor = function () {
        if (typeof bftBroadcastAnchor === 'function') bftBroadcastAnchor();
    };

    // index.html's own boot sequence ALSO restores the last-open page —
    // asynchronously, from inside its DOMContentLoaded handler, timing
    // bounded only by how long initializeApplication() takes — and would
    // otherwise stomp our tab choice sometime after we've already set it.
    // Rather than guess a delay, react to the actual write: switchToPage()
    // always ends with stateManager.updateGlobal({ currentPage }), so we
    // watch for that and re-assert our own tab if something else's write
    // disagrees with it, for a generous boot grace window only (never
    // fights a legitimate later navigation, e.g. a real StreamDeck jump).
    function installBootGuard(sm) {
        sm.on('globalUpdated', function (payload) {
            if (Date.now() > bootGraceUntil) return;
            var updates = payload && payload.updates;
            if (!updates || !('currentPage' in updates)) return;
            var current = document.body.dataset.arcadeTab;
            var expected = current && ARCADE_TAB_PAGE[current];
            if (expected && updates.currentPage !== expected) {
                navigateArcadeTab(current);
            }
        });
    }

    // --------------------------------------------------------------------
    // Main view: sources rail (left) + side placeholder (right).
    // The center dock is the EXISTING #chat-page / #chat-dock-frame (P1-A
    // Chat view) — reused as-is, only inset via CSS while data-arcade-tab
    // = "main". No iframe reparenting, no duplicate session/dock logic.
    // --------------------------------------------------------------------
    function buildRailAndSide() {
        var rail = document.createElement('section');
        rail.className = 'arcade-rail';
        rail.setAttribute('aria-label', 'Sources');
        rail.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title arcade-rail-hide">SOURCES</span>' +
            '<span class="arcade-spacer arcade-rail-hide"></span>' +
            '<span class="arcade-pill arcade-pill--live arcade-rail-hide" id="arcade-live-count" hidden>' +
            '<span class="arcade-dot arcade-dot--live"></span><span></span></span>' +
            '<button type="button" class="arcade-btn arcade-btn--sm arcade-btn--icon arcade-rail-toggle" id="arcade-rail-toggle" ' +
            'aria-expanded="true" aria-label="Collapse sources to icon rail" title="Collapse to icon rail">«</button>' +
            '</div>' +
            '<div class="arcade-add-source">' +
            '<button type="button" class="arcade-btn arcade-btn--primary" id="arcade-add-source">+<span class="arcade-rail-hide">&nbsp;Add source</span></button>' +
            '</div>' +
            '<ul class="arcade-src-list" id="arcade-src-list"></ul>' +
            '<div class="arcade-src-foot">' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-start-all">Start all</button>' +
            '<button type="button" class="arcade-btn arcade-btn--sm arcade-btn--danger" id="arcade-stop-all">Stop all</button>' +
            '</div>';
        document.body.appendChild(rail);

        rail.querySelector('#arcade-add-source').addEventListener('click', function () {
            navigateArcadeTab('settings');
        });
        rail.querySelector('#arcade-start-all').addEventListener('click', function () {
            callBridge({ action: 'startAllSources' });
        });
        rail.querySelector('#arcade-stop-all').addEventListener('click', function () {
            if (!window.confirm('Stop ALL active sources?')) return;
            callBridge({ action: 'stopAllSources', value: { confirm: true } });
        });
        initRailCollapseToggle(rail.querySelector('#arcade-rail-toggle'));

        var side = document.createElement('section');
        side.className = 'arcade-side';
        side.setAttribute('aria-label', 'Analytics');
        side.innerHTML = buildAnalyticsPaneMarkup();
        document.body.appendChild(side);
        initAnalyticsPeriodSelector(side);
    }

    // --------------------------------------------------------------------
    // Elements registry — the custom "Elements" tab. A full-width in-shell
    // panel over the content area, built once at boot and CSS-hidden until
    // its tab is on (body.arcade-shell[data-arcade-tab="elements"]). 'ready'
    // cards expose Copy overlay URL (built via the app's own resolver — see
    // buildElementOverlayUrl); 'planned' cards are honest, non-interactive
    // SOON stubs. Spec: pacsarcade design-briefs/ssn-ui-overhaul/
    // element-registry-spec.md.
    //
    // No "Send to OBS" button by design: the Electron StreamDeck bridge has
    // no add-browser-source action, and the fleet's real OBS paths live
    // elsewhere — TouchPortal's OBS link, the Event Flow editor's OBS
    // actions, and VDO's OBS camera-join scene. The house workflow is
    // Copy overlay URL -> paste as an OBS browser source.
    // --------------------------------------------------------------------
    function buildElementsPanel() {
        var panel = document.createElement('section');
        panel.className = 'arcade-elements';
        panel.setAttribute('aria-label', 'Overlay elements');
        panel.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title">ELEMENTS</span>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-el-hint">Overlay add-ons — copy a URL into OBS as a browser source</span>' +
            '</div>' +
            '<div class="arcade-el-body"><div class="arcade-el-grid" id="arcade-el-grid"></div></div>';
        document.body.appendChild(panel);

        var grid = panel.querySelector('#arcade-el-grid');
        ELEMENTS.forEach(function (el) {
            grid.appendChild(buildElementCard(el));
        });
    }

    function elementCategoryLabel(cat) {
        switch (cat) {
            case 'music': return 'MUSIC';
            case 'tips': return 'TIPS';
            case 'hype': return 'HYPE';
            case 'community': return 'COMMUNITY';
            default: return String(cat || '').toUpperCase();
        }
    }

    function buildElementCard(el) {
        var ready = el.status === 'ready';
        var card = document.createElement('article');
        card.className = 'arcade-el-card' + (ready ? '' : ' arcade-el-card--planned');
        card.dataset.arcadeElement = el.id;
        card.dataset.arcadeElementCategory = el.category || '';

        var head = document.createElement('div');
        head.className = 'arcade-el-card__head';
        var name = document.createElement('h3');
        name.className = 'arcade-el-card__name';
        name.textContent = el.name;
        head.appendChild(name);
        var cat = document.createElement('span');
        cat.className = 'arcade-pill arcade-el-cat arcade-el-cat--' + (el.category || 'default');
        cat.textContent = elementCategoryLabel(el.category);
        head.appendChild(cat);
        var status = document.createElement('span');
        status.className = 'arcade-pill arcade-el-status arcade-el-status--' + (ready ? 'ready' : 'planned');
        status.textContent = ready ? 'READY' : 'SOON';
        head.appendChild(status);
        card.appendChild(head);

        var blurb = document.createElement('p');
        blurb.className = 'arcade-el-card__blurb';
        blurb.textContent = el.blurb || '';
        card.appendChild(blurb);

        if (ready && el.params && el.params.length) {
            var params = document.createElement('p');
            params.className = 'arcade-el-card__params';
            params.textContent = el.params.join(' · ');
            card.appendChild(params);
        }

        if (ready) {
            var actions = document.createElement('div');
            actions.className = 'arcade-el-card__actions';
            var copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'arcade-btn arcade-btn--primary';
            copyBtn.textContent = 'Copy overlay URL';
            copyBtn.addEventListener('click', function () { copyElementOverlayUrl(el, copyBtn); });
            actions.appendChild(copyBtn);
            card.appendChild(actions);
        }

        return card;
    }

    // Build the copyable OBS overlay URL for an element via the app's OWN
    // resolver + session helpers. index.html's inline script is a classic
    // (non-module) script, so its top-level helpers are window globals — but
    // we feature-detect defensively so a future build change degrades to an
    // honest error rather than throwing. Returns a Promise<string url>.
    function buildElementOverlayUrl(el) {
        var resolver = window.resolveSocialStreamPage;
        if (typeof resolver !== 'function') {
            return Promise.reject(new Error('overlay resolver unavailable'));
        }
        var extra = (el.params || []).slice();
        var langParams = (typeof window.getLanguageExtraParams === 'function') ? window.getLanguageExtraParams() : [];

        function withSession(sessionId) {
            var params = [];
            if (sessionId) params.push('session=' + encodeURIComponent(sessionId));
            params = params.concat(extra).concat(langParams);
            return resolver(el.overlayPage, { extraParams: params }).then(function (resolved) {
                return resolved && resolved.url;
            });
        }

        if (typeof window.getChatDockSessionId === 'function') {
            try {
                // getChatDockSessionId may be sync-returning-a-promise; normalize.
                return Promise.resolve(window.getChatDockSessionId()).then(withSession, function () { return withSession(null); });
            } catch (e) {
                return withSession(null);
            }
        }
        return withSession(null);
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            try {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.top = '-1000px';
                document.body.appendChild(ta);
                ta.select();
                var ok = document.execCommand('copy');
                document.body.removeChild(ta);
                ok ? resolve() : reject(new Error('execCommand copy failed'));
            } catch (e) { reject(e); }
        });
    }

    function flashButton(btn, text, ms) {
        var original = btn.dataset.arcadeLabel || btn.textContent;
        btn.dataset.arcadeLabel = original;
        btn.textContent = text;
        clearTimeout(btn._arcadeFlash);
        btn._arcadeFlash = setTimeout(function () { btn.textContent = original; }, ms || 1600);
    }

    // The copied URL carries the session id — that's REQUIRED for a working
    // OBS browser source (same as the app's own dock/overlay copy), and it's
    // only ever placed on the clipboard by explicit click, never displayed in
    // the shell (masking law is about on-screen display, honored here).
    function copyElementOverlayUrl(el, btn) {
        buildElementOverlayUrl(el).then(function (url) {
            if (!url) throw new Error('empty overlay url');
            return copyToClipboard(url).then(function () { flashButton(btn, 'Copied ✓'); });
        }).catch(function (e) {
            console.error('[arcade-shell] copy overlay url failed:', e);
            flashButton(btn, 'Open from Settings', 2200);
        });
    }

    // --------------------------------------------------------------------
    // Alerts Builder — custom "Alerts" tab (Stage 2 shell surface). Spec:
    // pacsarcade design-briefs/ssn-ui-overhaul/alert-style-builder-spec.md.
    //
    // Canvas-first per Pac's design-tool ruling (same law the Style tab
    // follows): a live multi-alerts.html PREVIEW iframe is the hero, with a
    // compact rail of 7 event-meaning cards below it (follow/subscription/
    // donation/bits/raid/auction/hype). Each card edits accent, style
    // preset, headline template, font, fallback media, sound, and enabled —
    // the SAME per-event param25 settings the popup's multi-alert section
    // owns (multi-alerts.js CATEGORY_*_PARAMS, ~:221-280: followaccent,
    // followstyle, followtemplate [Stage 2 H3], followfont/followmedia
    // [Stage 2 H4], followsound, disablefollows — and the auction/hype
    // opt-in pair auctionwins/hypetrain). Reads/writes go through the SAME
    // canonical saveSetting IPC (window.ninjafy.sendMessage) the Style tab
    // already uses for ITS settings — settings are shared truth, so an edit
    // here shows up in the popup's multi-alert section and vice versa.
    //
    // PREVIEW ISOLATION GUARANTEE: the preview iframe is always loaded with
    // &preview=1, which flips multi-alerts.js's settings.previewOnly flag —
    // the ONE gate (multi-alerts.js ~:317-328) that skips ALL P2P bridge /
    // socket setup for that page load, entirely regardless of the &session
    // value riding along. "Fire test alert" posts
    // {multiAlertsPreview:{category, overrides}} — the exact descriptor
    // shape popup.js's buildMultiAlertPreviewDescriptor produces (popup.js
    // ~:7388) — directly into frame.contentWindow via postMessage(*, ...).
    // That message targets ONLY this iframe's own window object; nothing is
    // ever sent to window.parent, to the app's own P2P/session bridge, or to
    // any other frame, so a test alert can never reach the real live overlay
    // a viewer might be watching.
    // --------------------------------------------------------------------
    var ALERT_EVENTS = [
        { id: 'follow', label: 'Follow', emoji: '💖' },
        { id: 'subscription', label: 'Subscription', emoji: '💜' },
        { id: 'donation', label: 'Donation', emoji: '💚' },
        { id: 'bits', label: 'Bits / Cheer', emoji: '💙' },
        { id: 'raid', label: 'Raid', emoji: '🧡' },
        { id: 'auction', label: 'Auction Win', emoji: '💛' },
        { id: 'hype', label: 'Hype Train', emoji: '❤️' }
    ];

    // Mirrors multi-alerts.js's CATEGORY_*_PARAMS verbatim (source of truth:
    // resources/social_stream_fallback/main/multi-alerts.js ~:221-280) — the
    // param NAMEs below are the identical strings the popup's own
    // data-textparam25/data-optionparam25/data-param25 inputs already read
    // and write, so this tab and the popup stay consistent by construction.
    // enable.invert=true categories are disable-by-default (default enabled,
    // a "disableX" param turns them off); invert=false are the two opt-in
    // categories (default DISABLED, a present param turns them on) — see
    // CATEGORY_DISABLE_PARAMS vs CATEGORY_OPT_IN_PARAMS in multi-alerts.js.
    var ALERT_PARAM_MAP = {
        follow: { accent: 'followaccent', style: 'followstyle', template: 'followtemplate', font: 'followfont', media: 'followmedia', sound: 'followsound', enable: { param: 'disablefollows', invert: true } },
        subscription: { accent: 'subaccent', style: 'substyle', template: 'subtemplate', font: 'subfont', media: 'submedia', sound: 'subsound', enable: { param: 'disablesubs', invert: true } },
        donation: { accent: 'donoaccent', style: 'donostyle', template: 'donotemplate', font: 'donofont', media: 'donomedia', sound: 'donosound', enable: { param: 'disabledonos', invert: true } },
        bits: { accent: 'bitsaccent', style: 'bitsstyle', template: 'bitstemplate', font: 'bitsfont', media: 'bitsmedia', sound: 'bitssound', enable: { param: 'disablebits', invert: true } },
        raid: { accent: 'raidaccent', style: 'raidstyle', template: 'raidtemplate', font: 'raidfont', media: 'raidmedia', sound: 'raidsound', enable: { param: 'disableraids', invert: true } },
        auction: { accent: 'auctionaccent', style: 'auctionstyle', template: 'auctiontemplate', font: 'auctionfont', media: 'auctionmedia', sound: 'auctionsound', enable: { param: 'auctionwins', invert: false } },
        hype: { accent: 'hypeaccent', style: 'hypestyle', template: 'hypetemplate', font: 'hypefont', media: 'hypemedia', sound: 'hypesound', enable: { param: 'hypetrain', invert: false } }
    };

    var ALERT_STYLE_OPTIONS = ['twitch', 'classic', 'minimal', 'solid'];
    var ALERT_TEMPLATE_PLACEHOLDER = {
        follow: '{name} just followed!', subscription: '{name} just subscribed ({tier})',
        donation: '{name} sent {amount}!', bits: '{name} cheered {amount}!',
        raid: '{name} is raiding with {viewers} viewers!', auction: '{name} won {title} for {amount}!',
        hype: 'Hype Train reached Level {level}!'
    };

    var alertsPanelLive = false;
    var alertsState = {}; // category -> { accent, style, template, font, media, sound, enabled }
    var alertsPreviewToken = 0;
    var alertsReloadTimer = null;

    function defaultAlertCategoryState(category) {
        var map = ALERT_PARAM_MAP[category];
        var defaultEnabled = map && map.enable ? !!map.enable.invert : true;
        return { accent: '', style: 'twitch', template: '', font: '', media: '', sound: '', enabled: defaultEnabled };
    }

    function debounce(fn, ms) {
        var timer = null;
        return function () {
            var args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(null, args); }, ms);
        };
    }

    function setAlertsStatus(text, isError) {
        var el = document.getElementById('arcade-alerts-status');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-error', !!isError);
    }

    function setAlertsPreviewHint(text) {
        var el = document.getElementById('arcade-alerts-preview-hint');
        if (el) el.textContent = text || '';
    }

    // --------------------------------------------------------------------
    // AI area panel — the AI CONSOLE (V2, Admiral's refinement, briefings/
    // ssn-ai-area-design.md "V2 — the AI console"). Same custom-tab pattern
    // as .arcade-elements/.arcade-alerts (full-width in-shell panel,
    // CSS-shown only while data-arcade-tab="ai"). Only built at all when
    // hasNostrSigner() passed at boot (see init()) — no signer, no DOM, no
    // nav entry: the berth doesn't exist for that seat, full stop.
    //
    // The gate itself re-runs EVERY time the tab is opened (runAiAreaGate,
    // called from navigateArcadeTab) — no stored grants in v1, per the
    // design doc ("opening the AI area is rare and deliberate"). Gate
    // states: 'checking' (asking the signer) -> 'refused' (wrong key,
    // signer declined, or vanished). THE GATE ITSELF IS UNCHANGED FROM V1 —
    // only what renders once it passes is new (openAiAreaAfterGate down).
    //
    // Past the gate, the tab has two views chosen by aiConsoleExpanded (a
    // plain module var — SESSION-ONLY, never localStorage/saveSetting, so
    // every fresh app boot lands back on the console per the design doc):
    //   'console' (default) — DevChat check-in card (small) + the SSN
    //     AI-items section (Lane A inventory: moved settings + link cards).
    //   expanded — reuses 'checking'/'unreachable'/'live', now scoped to
    //     just the iframe path instead of the whole tab. 'live' renders the
    //     iframe, created fresh on expand and destroyed on collapse — it is
    //     never kept around hidden/polling. Collapsing returns to
    //     'console' without re-running the signer gate (already passed for
    //     this tab visit).
    // --------------------------------------------------------------------
    var aiConsoleExpanded = false; // session-only — see comment above

    function setAiAreaStatus(text) {
        var el = document.getElementById('arcade-ai-status');
        if (el) el.textContent = text || '';
    }

    function setAiCollapseVisible(visible) {
        var btn = document.getElementById('arcade-ai-collapse');
        if (btn) btn.hidden = !visible;
    }

    function setAiAreaState(state, message) {
        var body = document.getElementById('arcade-ai-body');
        if (!body) return;
        body.dataset.aiState = state; // 'checking' | 'refused' | 'unreachable' | 'live' | 'console'
        if (state === 'live' || state === 'console') return; // owned elsewhere (renderAiAreaFrame / renderAiConsole)
        body.innerHTML = '';
        var hint = document.createElement('div');
        hint.className = 'arcade-ai-hint' + (state === 'checking' ? '' : ' is-error');
        hint.textContent = message || '';
        body.appendChild(hint);
    }

    // HEAD probe with a short deadline — reuses index.html's own
    // fetchWithDeadline (top-level helper in its classic inline script, so
    // it's a window global; see buildElementOverlayUrl's comment on the
    // same convention) when present, with a local AbortController fallback
    // so this degrades honestly rather than throwing if that ever changes.
    // mode:'no-cors' matters here: index.html itself runs with webSecurity
    // disabled (it's a file:// window), but DevChat's dev server won't send
    // CORS headers for a cross-origin probe either way — no-cors still lets
    // the browser attempt the connection and resolve on success (opaque
    // response) vs reject on a real connection failure, which is exactly
    // the reachable/unreachable signal this needs, without caring about the
    // response body.
    function probeDevChatReachable() {
        var opts = { method: 'HEAD', mode: 'no-cors', cache: 'no-store', timeoutMs: AI_AREA_PROBE_TIMEOUT_MS };
        var runner = typeof window.fetchWithDeadline === 'function'
            ? window.fetchWithDeadline(AI_AREA_DEVCHAT_URL, opts)
            : (function () {
                var controller = new AbortController();
                var timer = setTimeout(function () { controller.abort(); }, AI_AREA_PROBE_TIMEOUT_MS);
                return fetch(AI_AREA_DEVCHAT_URL, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: controller.signal })
                    .then(function (r) { clearTimeout(timer); return r; })
                    .catch(function (e) { clearTimeout(timer); throw e; });
            })();
        return runner.then(function () { return true; }).catch(function () { return false; });
    }

    function renderAiAreaFrame() {
        var body = document.getElementById('arcade-ai-body');
        if (!body) return;
        body.dataset.aiState = 'live';
        body.innerHTML = '';
        var frame = document.createElement('iframe');
        frame.id = 'arcade-ai-frame';
        frame.title = 'DevChat';
        frame.setAttribute('allow', 'clipboard-write *');
        frame.src = AI_AREA_DEVCHAT_URL;
        body.appendChild(frame);
        setAiAreaStatus('DevChat · localhost:5173');
        setAiCollapseVisible(true);
    }

    // Expanded (full-view) path — the v1 whole-tab probe-then-iframe flow,
    // now scoped to just this path. Entered via the check-in card's "Open
    // full view" quick action, or automatically on re-open this session if
    // the seat left the tab expanded (aiConsoleExpanded persists per
    // session, per the design doc).
    function openAiAreaExpanded() {
        aiConsoleExpanded = true;
        setAiCollapseVisible(true);
        setAiAreaState('checking', 'Checking for DevChat at localhost:5173…');
        probeDevChatReachable().then(function (reachable) {
            // Re-check we're still ON the ai tab AND still expanded — a fast
            // tab-away or collapse-click shouldn't race a stale probe into
            // painting over whatever's showing now.
            if (document.body.dataset.arcadeTab !== 'ai' || !aiConsoleExpanded) return;
            if (!reachable) {
                setAiAreaState('unreachable', "DevChat isn't running — `make dev` in ~/dev/chatdev");
                setAiCollapseVisible(true);
                return;
            }
            renderAiAreaFrame();
        });
    }

    function collapseAiAreaToConsole() {
        aiConsoleExpanded = false;
        renderAiConsole();
    }

    // "Open in browser" — the OPERATOR'S SYSTEM BROWSER, not an in-app
    // Electron window. window.open()/target=_blank (the idiom index.html
    // itself uses elsewhere, e.g. the Euler Stream dashboard links) is the
    // wrong tool here: mainWindow's own setWindowOpenHandler (main.js
    // ~7934) intercepts window.open and allocates an IN-APP BrowserWindow
    // for it — it never hands off to the OS. This window runs with
    // nodeIntegration on for local/sourcemode loads (the same access
    // index.html's own SSN_SHELL boot switch already relies on, and the
    // same require('electron') the boot script's ipcRenderer pull already
    // uses), so require('electron').shell.openExternal — the exact call the
    // app's own menu items use from the main process (main.js ~17423 etc.)
    // — is directly reachable from here and is the one path that actually
    // reaches the system default browser. Falls back to window.open only if
    // require ever comes back unavailable, so this never dead-ends into
    // nothing happening.
    function openDevChatInBrowser() {
        try {
            var electron = require('electron');
            if (electron && electron.shell && typeof electron.shell.openExternal === 'function') {
                electron.shell.openExternal(AI_AREA_DEVCHAT_URL);
                return;
            }
        } catch (e) { /* nodeIntegration off somehow — fall through */ }
        try { window.open(AI_AREA_DEVCHAT_URL, '_blank'); } catch (e) { /* honest no-op, never throw */ }
    }

    // Deadline-guarded GET against DevChat's API, mirroring
    // probeDevChatReachable()'s fetchWithDeadline-with-fallback shape
    // exactly, but WITHOUT no-cors — this window runs with webSecurity
    // disabled for local/sourcemode loads (main.js ~7458/~7467, the same
    // fact probeDevChatReachable()'s own comment already notes), so a plain
    // fetch here can read the JSON body; no-cors would only ever hand back
    // an opaque, unreadable response.
    function fetchDevChatJson(path) {
        var url = AI_AREA_DEVCHAT_API_URL + path;
        var opts = { method: 'GET', cache: 'no-store', timeoutMs: AI_AREA_PROBE_TIMEOUT_MS };
        var runner = typeof window.fetchWithDeadline === 'function'
            ? window.fetchWithDeadline(url, opts)
            : (function () {
                var controller = new AbortController();
                var timer = setTimeout(function () { controller.abort(); }, AI_AREA_PROBE_TIMEOUT_MS);
                return fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal })
                    .then(function (r) { clearTimeout(timer); return r; })
                    .catch(function (e) { clearTimeout(timer); throw e; });
            })();
        return runner.then(function (r) {
            if (!r || !r.ok) throw new Error('devchat api http error');
            return r.json();
        });
    }

    function appendCheckinLine(body, text, isError) {
        var line = document.createElement('p');
        line.className = 'arcade-ai-checkin__line' + (isError ? ' is-error' : '');
        line.textContent = text;
        body.appendChild(line);
        return line;
    }

    // The DevChat check-in card — the console's default small pulse panel.
    // Runs its OWN probe, independent of the signer gate above: the same
    // honest frontend-reachable probe first, and only when reachable does
    // it also read the API (:6400/health via reachability, :6400/api/models
    // for the model name + Ollama-reachable flag) — exactly the "cheaply
    // readable" scope the design doc draws. "Current/last run status" was
    // in-scope per the design doc IF cheap — it is NOT: chatdev's only
    // status-bearing routes (sessions/artifacts/workflows) all require a
    // session id nobody has yet, there is no list-sessions route, so that
    // line is honestly omitted rather than faked.
    function refreshDevChatCheckin() {
        var pill = document.getElementById('arcade-ai-checkin-pill');
        var body = document.getElementById('arcade-ai-checkin-body');
        if (!pill || !body) return;
        pill.className = 'arcade-pill arcade-ai-checkin__pill';
        pill.textContent = 'Checking…';
        body.innerHTML = '';

        probeDevChatReachable().then(function (reachable) {
            // Bail if the tab moved on, or the console got collapsed-past/
            // re-expanded, mid-probe — never paint over a state that isn't
            // current.
            if (document.body.dataset.arcadeTab !== 'ai' || document.body.dataset.aiState !== 'console') return;
            var p = document.getElementById('arcade-ai-checkin-pill');
            var b = document.getElementById('arcade-ai-checkin-body');
            if (!p || !b) return;

            if (!reachable) {
                p.classList.add('arcade-ai-checkin__pill--down');
                p.textContent = 'Not running';
                appendCheckinLine(b, "DevChat isn't running — `make dev` in ~/dev/chatdev", true);
                return;
            }
            p.classList.add('arcade-ai-checkin__pill--up');
            p.textContent = 'Reachable';
            appendCheckinLine(b, 'localhost:5173');

            fetchDevChatJson('/api/models').then(function (data) {
                if (document.body.dataset.arcadeTab !== 'ai' || document.body.dataset.aiState !== 'console') return;
                var b2 = document.getElementById('arcade-ai-checkin-body');
                if (!b2) return;
                appendCheckinLine(b2, 'Model: ' + ((data && data.configured_model) || 'not configured'));
                if (data && data.is_ollama) {
                    appendCheckinLine(b2, 'Ollama: ' + (data.reachable ? 'reachable' : 'unreachable'), !data.reachable);
                }
            }).catch(function () {
                if (document.body.dataset.arcadeTab !== 'ai' || document.body.dataset.aiState !== 'console') return;
                var b2 = document.getElementById('arcade-ai-checkin-body');
                if (!b2) return;
                appendCheckinLine(b2, 'API not reachable — localhost:6400', true);
            });
        });
    }

    function buildDevChatCheckinCard() {
        var card = document.createElement('article');
        card.className = 'arcade-ai-checkin';

        var head = document.createElement('div');
        head.className = 'arcade-ai-checkin__head';
        var name = document.createElement('h3');
        name.className = 'arcade-ai-checkin__name';
        name.textContent = 'DevChat';
        head.appendChild(name);
        var pill = document.createElement('span');
        pill.className = 'arcade-pill arcade-ai-checkin__pill';
        pill.id = 'arcade-ai-checkin-pill';
        pill.textContent = 'Checking…';
        head.appendChild(pill);
        card.appendChild(head);

        var body = document.createElement('div');
        body.className = 'arcade-ai-checkin__body';
        body.id = 'arcade-ai-checkin-body';
        card.appendChild(body);

        var actions = document.createElement('div');
        actions.className = 'arcade-ai-checkin__actions';
        var expandBtn = document.createElement('button');
        expandBtn.type = 'button';
        expandBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        expandBtn.textContent = 'Open full view';
        expandBtn.addEventListener('click', openAiAreaExpanded);
        actions.appendChild(expandBtn);
        var browserBtn = document.createElement('button');
        browserBtn.type = 'button';
        browserBtn.className = 'arcade-btn arcade-btn--sm';
        browserBtn.textContent = 'Open in browser';
        browserBtn.addEventListener('click', openDevChatInBrowser);
        actions.appendChild(browserBtn);
        card.appendChild(actions);

        return card;
    }

    // SSN's own AI items, gathered home (Lane A inventory — grepped +
    // read against shared/config/settingsDefinitions.js, popup.html and
    // popup.js directly, keys and read/write shapes verified, not guessed).
    //
    // MOVE groups: small settings blocks, wired to the SAME keys the stock
    // Settings screen already reads/writes via the canonical saveSetting
    // IPC (settings-write law) — never a forked copy. Two storage shapes
    // exist in this app; these keys use the NEWER flat one (confirmed by
    // reading popup.js's handleSetting()/refreshPopupSettingsAfterLanguageSave()
    // paths, not the older param25 shape the Alerts tab uses):
    //   boolean -> {cmd:'saveSetting', type:'setting',       setting:key, value:true|false}, read response.settings[key].setting
    //   text    -> {cmd:'saveSetting', type:'textsetting',   setting:key, value:'…'},          read response.settings[key].textsetting
    //   select  -> {cmd:'saveSetting', type:'optionsetting', setting:key, value:'…'},           read response.settings[key].optionsetting
    // (target is always null here — none of these are per-source overrides.)
    //
    // Curated to the compact, decision-relevant fields only — mirrors the
    // Alerts tab's own curation (6 fields per card, not every param the
    // underlying system supports). Provider CREDENTIALS (10+ providers,
    // ~25 fields, each with popup.js's own conditional show/hide wiring
    // keyed to the aiProvider dropdown) are LINK, not MOVE — duplicating
    // that many provider-conditional fields here would fork the exact
    // surface popup.js already owns, which is the LINK criterion itself.
    // Ollama's own endpoint/model are the one exception: kept as MOVE since
    // Ollama is the default provider and the deployment's actual local
    // setup (pacBOT/gemma3:1b — see the SSN skill's "Local AI" section).
    var AI_MOVE_GROUPS = [
        {
            id: 'bot',
            title: 'LLM provider & chat bot',
            blurb: 'The LLM chat-response bot (ollama toggle + aiProvider — this is pacBOT\'s home). Other providers\' API keys/endpoints and rarer bot options live in Settings — see the cards below.',
            fields: [
                { key: 'ollama', label: 'Bot enabled', type: 'boolean' },
                {
                    key: 'aiProvider', label: 'Provider', type: 'select', options: [
                        { value: 'ollama', label: 'Ollama (local)' },
                        { value: 'chatgpt', label: 'ChatGPT API' },
                        { value: 'gemini', label: 'Gemini API' },
                        { value: 'groq', label: 'Groq API' },
                        { value: 'deepseek', label: 'DeepSeek API' },
                        { value: 'xai', label: 'xAI API (Grok)' },
                        { value: 'bedrock', label: 'AWS Bedrock API' },
                        { value: 'openrouter', label: 'OpenRouter API' },
                        { value: 'opencode', label: 'OpenCode Zen API' },
                        { value: 'hostedllm', label: 'SSN Hosted Trial LLM' },
                        { value: 'localgemma', label: 'Local Gemma 4 (browser)' },
                        { value: 'localqwen', label: 'Local Qwen 3.5 0.8B (browser)' },
                        { value: 'localqwen2b', label: 'Local Qwen 3.5 2B (browser)' },
                        { value: 'custom', label: 'Custom (OpenAI-compatible)' }
                    ]
                },
                { key: 'ollamaendpoint', label: 'Ollama endpoint', type: 'text', placeholder: 'http://localhost:11434' },
                { key: 'ollamamodel', label: 'Ollama model', type: 'text', placeholder: 'gemma3:1b' },
                { key: 'ollamabotname', label: 'Bot name', type: 'text', placeholder: 'e.g. pacBOT' },
                { key: 'bottriggerwords', label: 'Trigger words', type: 'text', placeholder: 'blank = always eligible' }
            ]
        },
        {
            id: 'moderation',
            title: 'AI moderation',
            blurb: 'The bot reviews chat and can delete (or block-until-approved) messages it judges unfit.',
            fields: [
                { key: 'ollamaCensorBot', label: 'Moderation enabled', type: 'boolean' },
                { key: 'ollamaCensorBotBlockMode', label: 'Block until approved', type: 'boolean' }
            ]
        },
        {
            id: 'translate',
            title: 'AI translation',
            blurb: 'Auto-translates chat through the configured AI provider — separate from the app\'s plain UI-language switcher (not an AI feature, excluded here).',
            fields: [
                { key: 'aiAutoTranslate', label: 'Translate incoming', type: 'boolean' },
                { key: 'aiAutoTranslateOutgoing', label: 'Translate outgoing', type: 'boolean' },
                { key: 'aiAutoTranslateTargetLanguage', label: 'Target language', type: 'text', placeholder: 'en-US' }
            ]
        },
        {
            id: 'summaries',
            title: 'AI summaries',
            blurb: 'Chat-summary context fed to the bot, and the user-triggered !summary command.',
            fields: [
                { key: 'llmsummary', label: 'Feed summaries to bot', type: 'boolean' },
                { key: 'allowLLMSummary', label: 'Allow !summary command', type: 'boolean' }
            ]
        }
    ];

    // LINK cards — real surfaces, deliberately not duplicated here (each
    // note says why). "Open Settings" is the same navigateArcadeTab
    // ('settings') the sources rail's own "+ Add source" button already
    // uses — the shell has no finer settings-category deep link, so the
    // card names the exact heading text to look for once there.
    var AI_LINK_ITEMS = [
        {
            id: 'llm-api',
            name: 'Configure LLM API — other providers',
            blurb: 'API keys, endpoints and models for ChatGPT, Gemini, Groq, DeepSeek, OpenRouter, xAI, AWS Bedrock, OpenCode Zen, the SSN Hosted Trial LLM, the in-browser Local Gemma/Qwen models, and custom OpenAI-compatible endpoints — each with its own show/hide wiring keyed to the Provider dropdown above.',
            where: 'Settings → Configure LLM API 🦙'
        },
        {
            id: 'chatbot-advanced',
            name: 'Chat bot — advanced',
            blurb: 'History length, timestamps, RAG knowledge base, rate limiting, keep-alive, mod-only replies, overlay-only replies, read-aloud via TTS, and the standalone one-on-one chat bot.',
            where: 'Settings → Chat bot 🤖💬 / Standalone one-on-one chat bot'
        },
        {
            id: 'ai-prompt-builder',
            name: 'AI Prompt / Overlay Builder',
            blurb: 'The standalone AI Prompt Page Builder (its own page, own localStorage-backed state — aiprompt.html) and the AI Overlay it publishes to. Moving it would fork a whole second page, not a settings block.',
            where: 'Settings → page picker → AI Prompt Page Builder'
        },
        {
            id: 'cohost',
            name: 'AI Cohost',
            blurb: 'The AI virtual-cohost overlay page — a large standalone surface (cohost.html), out of scope to relocate here.',
            where: 'Settings → page picker → Cohost'
        }
    ];

    function saveAiItemSetting(type, key, value) {
        try {
            if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                window.ninjafy.sendMessage(null, { cmd: 'saveSetting', type: type, target: null, setting: key, value: value }, function () {});
            }
        } catch (e) { console.error('[arcade-shell] AI item setting save failed:', e); }
    }

    function buildAiMoveRow(field, currentValue) {
        var row = document.createElement('div');
        row.className = 'arcade-alert-row';
        var lbl = document.createElement('label');
        lbl.textContent = field.label;
        row.appendChild(lbl);
        var input;
        if (field.type === 'boolean') {
            input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = !!currentValue;
            input.addEventListener('change', function () {
                saveAiItemSetting('setting', field.key, input.checked);
            });
        } else if (field.type === 'select') {
            input = document.createElement('select');
            (field.options || []).forEach(function (opt) {
                var o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.label;
                input.appendChild(o);
            });
            input.value = currentValue || (field.options && field.options[0] && field.options[0].value) || '';
            input.addEventListener('change', function () {
                saveAiItemSetting('optionsetting', field.key, input.value);
            });
        } else {
            input = document.createElement('input');
            input.type = 'text';
            input.autocomplete = 'off';
            input.placeholder = field.placeholder || '';
            input.value = currentValue || '';
            input.addEventListener('input', debounce(function () {
                saveAiItemSetting('textsetting', field.key, input.value);
            }, 300));
        }
        input.dataset.arcadeAiField = field.key;
        row.appendChild(input);
        return row;
    }

    function buildAiMoveCard(group, settings) {
        var card = document.createElement('article');
        card.className = 'arcade-alert-card arcade-ai-move-card';
        var head = document.createElement('div');
        head.className = 'arcade-alert-card__head';
        var name = document.createElement('h3');
        name.className = 'arcade-alert-card__name';
        name.textContent = group.title;
        head.appendChild(name);
        card.appendChild(head);
        if (group.blurb) {
            var blurb = document.createElement('p');
            blurb.className = 'arcade-el-card__blurb';
            blurb.textContent = group.blurb;
            card.appendChild(blurb);
        }
        var body = document.createElement('div');
        body.className = 'arcade-alert-card__body';
        group.fields.forEach(function (field) {
            var raw = settings[field.key];
            var current = field.type === 'boolean' ? (raw && raw.setting)
                : field.type === 'select' ? (raw && raw.optionsetting)
                    : (raw && raw.textsetting);
            body.appendChild(buildAiMoveRow(field, current));
        });
        card.appendChild(body);
        return card;
    }

    function buildAiLinkCard(item) {
        var card = document.createElement('article');
        card.className = 'arcade-el-card arcade-ai-link-card';
        var head = document.createElement('div');
        head.className = 'arcade-el-card__head';
        var name = document.createElement('h3');
        name.className = 'arcade-el-card__name';
        name.textContent = item.name;
        head.appendChild(name);
        card.appendChild(head);
        var blurb = document.createElement('p');
        blurb.className = 'arcade-el-card__blurb';
        blurb.textContent = item.blurb;
        card.appendChild(blurb);
        var where = document.createElement('p');
        where.className = 'arcade-el-card__params';
        where.textContent = item.where;
        card.appendChild(where);
        var actions = document.createElement('div');
        actions.className = 'arcade-el-card__actions';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'arcade-btn arcade-btn--sm';
        btn.textContent = 'Open Settings';
        btn.addEventListener('click', function () { navigateArcadeTab('settings'); });
        actions.appendChild(btn);
        card.appendChild(actions);
        return card;
    }

    // ONE getSettings read hydrates every MOVE card — same shape/IPC the
    // Alerts/Style tabs' own loaders already use. Guarded by document
    // .contains() rather than the dataset checks elsewhere: the console is
    // torn down and rebuilt wholesale on every open/collapse (unlike the
    // Alerts tab's persistent cards), so "is this exact grid node still
    // attached" is the more precise staleness check here.
    function loadAiItemsSettings(moveGrid) {
        try {
            if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                window.ninjafy.sendMessage(null, { getSettings: true }, function (response) {
                    if (!document.body.contains(moveGrid)) return; // console rebuilt/torn down mid-load
                    var settings = (response && response.settings) || {};
                    AI_MOVE_GROUPS.forEach(function (group) {
                        moveGrid.appendChild(buildAiMoveCard(group, settings));
                    });
                });
                return;
            }
        } catch (e) { console.error('[arcade-shell] AI items settings load failed:', e); }
    }

    function buildAiItemsSection() {
        var section = document.createElement('section');
        section.className = 'arcade-ai-items';

        var head = document.createElement('div');
        head.className = 'arcade-ai-items__head';
        var title = document.createElement('h3');
        title.className = 'arcade-ai-items__title';
        title.textContent = 'SSN AI ITEMS';
        head.appendChild(title);
        section.appendChild(head);

        var moveGrid = document.createElement('div');
        moveGrid.className = 'arcade-alerts-rail arcade-ai-move-grid';
        section.appendChild(moveGrid);

        var linkHead = document.createElement('div');
        linkHead.className = 'arcade-ai-items__head arcade-ai-items__head--sub';
        var linkTitle = document.createElement('h4');
        linkTitle.className = 'arcade-ai-items__title';
        linkTitle.textContent = 'ELSEWHERE IN SETTINGS';
        linkHead.appendChild(linkTitle);
        section.appendChild(linkHead);

        var linkGrid = document.createElement('div');
        linkGrid.className = 'arcade-el-grid arcade-ai-link-grid';
        AI_LINK_ITEMS.forEach(function (item) { linkGrid.appendChild(buildAiLinkCard(item)); });
        section.appendChild(linkGrid);

        loadAiItemsSettings(moveGrid);
        return section;
    }

    function renderAiConsole() {
        var body = document.getElementById('arcade-ai-body');
        if (!body) return;
        setAiCollapseVisible(false);
        setAiAreaStatus('');
        body.dataset.aiState = 'console';
        body.innerHTML = '';
        var wrap = document.createElement('div');
        wrap.className = 'arcade-ai-console';
        wrap.appendChild(buildDevChatCheckinCard());
        wrap.appendChild(buildAiItemsSection());
        body.appendChild(wrap);
        refreshDevChatCheckin();
    }

    function openAiAreaAfterGate() {
        if (aiConsoleExpanded) { openAiAreaExpanded(); }
        else { renderAiConsole(); }
    }

    // The gate — asks the signer for a FRESH challenge every open, admits
    // only AI_AREA_ALLOWED_PUBKEY_HEX. See the security note in the build
    // report: signEvent()'s returned signature is checked for shape (sig +
    // pubkey present, pubkey matches the ruled key) but not cryptographically
    // verified against secp256k1/schnorr — this app has no crypto library,
    // and vendoring one is out of scope for a static-file, localhost-only,
    // single-operator v1 door. The trust boundary is "the NIP-07 provider
    // bound to THIS browser context claims to control the g2x3 key," which
    // matches the design doc's own framing of this as the shell's door, not
    // a hardened auth story (that's Phase 3, if the AI area ever leaves
    // localhost).
    function runAiAreaGate() {
        setAiAreaStatus('');
        if (aiGateOpen()) {
            setAiAreaStatus('gate open — SSN_AI_GATE=open · the g2x3 door returns with the Arcade Sidecar');
            openAiAreaAfterGate();
            return;
        }
        setAiAreaState('checking', 'Asking the signer to confirm…');

        if (!hasNostrSigner()) {
            // Re-checked here (not just at boot) in case the signer vanished
            // mid-session — never trust a stale render for an admit/deny call.
            setAiAreaState('refused', 'No nostr signer available — the AI area stays closed.');
            return;
        }

        var challenge = 'ssn-ai-area:' + Date.now() + ':' + Math.random().toString(36).slice(2);
        // Ephemeral NIP-42-shaped auth draft (kind 22242) — never published
        // anywhere; its only job is to carry `challenge` through signEvent()
        // so the signature proves control of the key for THIS specific ask.
        var draft = {
            kind: 22242,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['challenge', challenge], ['relay', 'ssn-arcade-shell-ai-area']],
            content: 'Pac’s Arcade — AI area gate'
        };

        Promise.resolve()
            .then(function () { return window.nostr.getPublicKey(); })
            .then(function (pubkey) {
                if (!pubkey || String(pubkey).toLowerCase() !== AI_AREA_ALLOWED_PUBKEY_HEX) {
                    throw new Error('not-authorized');
                }
                draft.pubkey = pubkey;
                return window.nostr.signEvent(draft);
            })
            .then(function (signed) {
                if (document.body.dataset.arcadeTab !== 'ai') return; // tabbed away mid-sign
                var okShape = signed && signed.sig && signed.pubkey &&
                    String(signed.pubkey).toLowerCase() === AI_AREA_ALLOWED_PUBKEY_HEX;
                if (!okShape) throw new Error('not-authorized');
                openAiAreaAfterGate();
            })
            .catch(function () {
                if (document.body.dataset.arcadeTab !== 'ai') return;
                setAiAreaState('refused', 'This seat isn’t the ruled admin key — the AI area stays closed.');
            });
    }

    function buildAiPanel() {
        var panel = document.createElement('section');
        panel.className = 'arcade-ai';
        panel.setAttribute('aria-label', 'AI area');
        panel.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title">AI</span>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-ai-status" id="arcade-ai-status"></span>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-ai-collapse" hidden>&larr; Console</button>' +
            '<button type="button" class="arcade-btn arcade-btn--sm arcade-btn--icon" id="arcade-ai-close" aria-label="Close">×</button>' +
            '</div>' +
            '<div class="arcade-ai-body" id="arcade-ai-body"></div>';
        document.body.appendChild(panel);

        panel.querySelector('#arcade-ai-collapse').addEventListener('click', collapseAiAreaToConsole);
        panel.querySelector('#arcade-ai-close').addEventListener('click', function () {
            navigateArcadeTab('main');
        });
    }

    function buildAlertsPanel() {
        var panel = document.createElement('section');
        panel.className = 'arcade-alerts';
        panel.setAttribute('aria-label', 'Alert box builder');
        panel.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title">ALERTS</span>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-alerts-status" id="arcade-alerts-status"></span>' +
            '<button type="button" class="arcade-btn arcade-btn--sm arcade-btn--primary" id="arcade-alerts-copy">Copy overlay URL</button>' +
            '</div>' +
            '<div class="arcade-alerts-body">' +
            '<div class="arcade-alerts-preview">' +
            '<div class="arcade-alerts-preview-bar">' +
            '<span class="arcade-style-hint" id="arcade-alerts-preview-hint">Loading preview…</span>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-alerts-clear">Clear</button>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-alerts-reload">Reload preview</button>' +
            '</div>' +
            '<iframe id="arcade-alerts-preview-frame" title="Alert box preview"></iframe>' +
            '</div>' +
            '<div class="arcade-alerts-rail" id="arcade-alerts-rail"></div>' +
            '</div>';
        document.body.appendChild(panel);

        var rail = panel.querySelector('#arcade-alerts-rail');
        ALERT_EVENTS.forEach(function (evt) {
            alertsState[evt.id] = defaultAlertCategoryState(evt.id);
            rail.appendChild(buildAlertEventCard(evt));
        });

        panel.querySelector('#arcade-alerts-copy').addEventListener('click', function (e) {
            copyAlertsOverlayUrl(e.currentTarget);
        });
        panel.querySelector('#arcade-alerts-clear').addEventListener('click', clearAlertsPreview);
        panel.querySelector('#arcade-alerts-reload').addEventListener('click', reloadAlertsPreview);
    }

    function buildAlertFieldRow(category, field, label, placeholder) {
        var row = document.createElement('div');
        row.className = 'arcade-alert-row';
        var lbl = document.createElement('label');
        lbl.textContent = label;
        row.appendChild(lbl);
        var input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.placeholder = placeholder || '';
        input.dataset.arcadeAlertField = field;
        input.addEventListener('input', debounce(function () {
            setAlertField(category, field, input.value, row);
        }, 300));
        row.appendChild(input);
        return row;
    }

    function buildAlertStyleRow(category) {
        var row = document.createElement('div');
        row.className = 'arcade-alert-row';
        var lbl = document.createElement('label');
        lbl.textContent = 'Style preset';
        row.appendChild(lbl);
        var select = document.createElement('select');
        select.dataset.arcadeAlertField = 'style';
        ALERT_STYLE_OPTIONS.forEach(function (opt) {
            var o = document.createElement('option');
            o.value = opt;
            o.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
            select.appendChild(o);
        });
        select.addEventListener('change', function () {
            setAlertField(category, 'style', select.value, row);
        });
        row.appendChild(select);
        return row;
    }

    function buildAlertEventCard(evt) {
        var card = document.createElement('article');
        card.className = 'arcade-alert-card';
        card.dataset.arcadeAlertEvent = evt.id;

        var head = document.createElement('div');
        head.className = 'arcade-alert-card__head';
        var name = document.createElement('h3');
        name.className = 'arcade-alert-card__name';
        name.textContent = evt.emoji + ' ' + evt.label;
        head.appendChild(name);

        var enableLabel = document.createElement('label');
        enableLabel.className = 'arcade-alert-card__enable';
        var enableInput = document.createElement('input');
        enableInput.type = 'checkbox';
        enableInput.checked = alertsState[evt.id].enabled;
        enableInput.dataset.arcadeAlertField = 'enabled';
        enableInput.addEventListener('change', function () {
            setAlertField(evt.id, 'enabled', enableInput.checked, null);
        });
        enableLabel.appendChild(enableInput);
        enableLabel.appendChild(document.createTextNode('On'));
        head.appendChild(enableLabel);
        card.appendChild(head);

        var body = document.createElement('div');
        body.className = 'arcade-alert-card__body';
        body.appendChild(buildAlertFieldRow(evt.id, 'accent', 'Accent', CATEGORY_ACCENT_DEFAULTS[evt.id] || '#9146ff'));
        body.appendChild(buildAlertStyleRow(evt.id));
        body.appendChild(buildAlertFieldRow(evt.id, 'template', 'Headline', ALERT_TEMPLATE_PLACEHOLDER[evt.id] || ''));
        body.appendChild(buildAlertFieldRow(evt.id, 'font', 'Font', 'Georgia, serif'));
        body.appendChild(buildAlertFieldRow(evt.id, 'media', 'Fallback media', 'https://…'));
        body.appendChild(buildAlertFieldRow(evt.id, 'sound', 'Sound URL', 'https://…'));
        card.appendChild(body);

        var actions = document.createElement('div');
        actions.className = 'arcade-alert-card__actions';
        var testBtn = document.createElement('button');
        testBtn.type = 'button';
        testBtn.className = 'arcade-btn arcade-btn--sm';
        testBtn.textContent = 'Fire test alert';
        testBtn.addEventListener('click', function () { fireTestAlert(evt.id); });
        actions.appendChild(testBtn);
        card.appendChild(actions);

        return card;
    }

    // Same accent defaults multi-alerts.js's CATEGORY_ACCENTS ships (~:35-43)
    // — placeholder-only (never a real stored value), so an untouched field
    // honestly shows what the alert box will actually render.
    var CATEGORY_ACCENT_DEFAULTS = {
        follow: '#ff68b3', subscription: '#8b5cf6', donation: '#14f195', bits: '#38bdf8',
        raid: '#f59e0b', auction: '#fbbf24', hype: '#f43f5e'
    };

    function saveAlertSetting(paramType, paramName, value) {
        try {
            if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                window.ninjafy.sendMessage(null, { cmd: 'saveSetting', type: paramType, target: null, setting: paramName, value: value }, function () {});
            }
        } catch (e) { console.error('[arcade-shell] alert setting save failed:', e); }
    }

    function setAlertField(category, field, value, rowEl) {
        var st = alertsState[category];
        var map = ALERT_PARAM_MAP[category];
        if (!st || !map) return;
        st[field] = value;
        if (rowEl) rowEl.classList.toggle('is-set', field === 'style' ? value !== 'twitch' : !!value);

        if (field === 'enabled') {
            var enable = map.enable;
            saveAlertSetting('param25', enable.param, enable.invert ? !value : !!value);
        } else if (field === 'style') {
            saveAlertSetting('optionparam25', map.style, value);
        } else {
            saveAlertSetting('textparam25', map[field], value);
        }
        queueAlertsPreviewReload();
    }

    function syncAlertCardFromState(category) {
        var card = document.querySelector('.arcade-alert-card[data-arcade-alert-event="' + category + '"]');
        if (!card) return;
        var st = alertsState[category];
        ['accent', 'template', 'font', 'media', 'sound'].forEach(function (field) {
            var input = card.querySelector('[data-arcade-alert-field="' + field + '"]');
            if (!input) return;
            input.value = st[field] || '';
            input.closest('.arcade-alert-row').classList.toggle('is-set', !!st[field]);
        });
        var styleSelect = card.querySelector('[data-arcade-alert-field="style"]');
        if (styleSelect) {
            styleSelect.value = st.style || 'twitch';
            styleSelect.closest('.arcade-alert-row').classList.toggle('is-set', st.style !== 'twitch');
        }
        var enableInput = card.querySelector('[data-arcade-alert-field="enabled"]');
        if (enableInput) enableInput.checked = !!st.enabled;
    }

    function readTextParam25(settings, paramName) {
        var entry = settings[paramName];
        return (entry && typeof entry.textparam25 === 'string') ? entry.textparam25 : '';
    }
    function readOptionParam25(settings, paramName) {
        var entry = settings[paramName];
        return (entry && typeof entry.optionparam25 === 'string') ? entry.optionparam25 : '';
    }
    function readParam25(settings, paramName) {
        var entry = settings[paramName];
        return entry ? entry.param25 : undefined;
    }

    // ONE getSettings read for all 7 categories' saved param25 values —
    // same shape/IPC the Style tab's loadStyleSettings() already uses.
    function loadAlertsSettings() {
        return new Promise(function (resolve) {
            try {
                if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                    window.ninjafy.sendMessage(null, { getSettings: true }, function (response) {
                        try {
                            var settings = (response && response.settings) || {};
                            ALERT_EVENTS.forEach(function (evt) {
                                var map = ALERT_PARAM_MAP[evt.id];
                                var st = alertsState[evt.id];
                                st.accent = readTextParam25(settings, map.accent);
                                st.style = readOptionParam25(settings, map.style) || 'twitch';
                                st.template = readTextParam25(settings, map.template);
                                st.font = readTextParam25(settings, map.font);
                                st.media = readTextParam25(settings, map.media);
                                st.sound = readTextParam25(settings, map.sound);
                                var paramIsSet = !!readParam25(settings, map.enable.param);
                                st.enabled = map.enable.invert ? !paramIsSet : paramIsSet;
                                syncAlertCardFromState(evt.id);
                            });
                        } catch (e) { console.error('[arcade-shell] alerts settings parse failed:', e); }
                        resolve();
                    });
                    return;
                }
            } catch (e) { console.error('[arcade-shell] alerts settings load failed:', e); }
            setAlertsStatus('settings bridge unavailable — alert edits will not persist', true);
            resolve();
        });
    }

    // Per-event URL params from the CURRENT in-memory state — shared by the
    // preview builder (adds &preview/&embedded) and the real Copy-overlay-
    // URL builder (does not). Omits anything at its default/blank so an
    // untouched category rides the alert box's own built-in defaults.
    function buildAlertEventParams() {
        var params = [];
        ALERT_EVENTS.forEach(function (evt) {
            var map = ALERT_PARAM_MAP[evt.id];
            var st = alertsState[evt.id];
            if (st.accent) params.push(map.accent + '=' + encodeURIComponent(st.accent));
            if (st.style && st.style !== 'twitch') params.push(map.style + '=' + encodeURIComponent(st.style));
            if (st.template) params.push(map.template + '=' + encodeURIComponent(st.template));
            if (st.font) params.push(map.font + '=' + encodeURIComponent(st.font));
            if (st.media) params.push(map.media + '=' + encodeURIComponent(st.media));
            if (st.sound) params.push(map.sound + '=' + encodeURIComponent(st.sound));
            var enable = map.enable;
            var paramShouldBeSet = enable.invert ? !st.enabled : !!st.enabled;
            if (paramShouldBeSet) params.push(enable.param);
        });
        return params;
    }

    function buildAlertsPreviewParams(sessionId) {
        return ['session=' + encodeURIComponent(sessionId), 'preview=1', 'embedded=1'].concat(buildAlertEventParams());
    }

    // First paint + every debounced reload after an edit. Always a full src
    // reload (multi-alerts.js reads its settings ONCE from location.search
    // at boot — there is no live same-origin var to poke the way dock's CSS
    // custom properties allow, since several of these fields are JS logic
    // — headline templates, font, media fallback — not CSS).
    function initAlertsPreviewFrame() {
        var frame = document.getElementById('arcade-alerts-preview-frame');
        if (!frame) return;
        var resolver = window.resolveSocialStreamPage;
        var getSession = window.getChatDockSessionId;
        if (typeof resolver !== 'function' || typeof getSession !== 'function') {
            setAlertsPreviewHint('preview unavailable (app helpers not found)');
            return;
        }
        var myToken = ++alertsPreviewToken;
        frame.dataset.alertsPreviewReady = '';
        setAlertsPreviewHint('Loading preview…');
        Promise.resolve(getSession()).then(function (sessionId) {
            if (!sessionId) { setAlertsPreviewHint('waiting for session…'); return; }
            return resolver('multi-alerts.html', { extraParams: buildAlertsPreviewParams(sessionId) }).then(function (resolved) {
                if (myToken !== alertsPreviewToken) return; // superseded by a newer reload
                if (resolved && resolved.url) {
                    frame.onload = function () {
                        if (myToken !== alertsPreviewToken) return;
                        frame.dataset.alertsPreviewReady = '1';
                        setAlertsPreviewHint('Preview ready — use "Fire test alert" on any card below.');
                    };
                    frame.src = resolved.url;
                }
            });
        }).catch(function (e) {
            console.error('[arcade-shell] alerts preview init failed:', e);
            setAlertsPreviewHint('preview failed — see console');
        });
    }

    function reloadAlertsPreview() {
        initAlertsPreviewFrame();
    }

    function queueAlertsPreviewReload() {
        if (!alertsPanelLive) return;
        clearTimeout(alertsReloadTimer);
        alertsReloadTimer = setTimeout(reloadAlertsPreview, 400);
    }

    // Lazy boot on first Alerts-tab visit — same pattern as
    // ensureStylePanelLive(): one getSettings read, then first preview load.
    function ensureAlertsPanelLive() {
        if (alertsPanelLive) { return; }
        alertsPanelLive = true;
        loadAlertsSettings().then(function () { initAlertsPreviewFrame(); });
    }

    // "Fire test alert" — see the PREVIEW ISOLATION GUARANTEE comment at the
    // top of this section for exactly why this can never reach a live
    // session: the message goes to frame.contentWindow ONLY, and that frame
    // is always loaded with &preview=1, which is multi-alerts.js's own gate
    // for skipping all P2P/socket setup (~:317-328).
    function fireTestAlert(category) {
        var frame = document.getElementById('arcade-alerts-preview-frame');
        if (!frame || !frame.contentWindow || !frame.dataset.alertsPreviewReady) {
            setAlertsPreviewHint('preview still loading — try again in a moment');
            return;
        }
        frame.contentWindow.postMessage({ multiAlertsPreview: { category: category, overrides: {} } }, '*');
    }

    function clearAlertsPreview() {
        var frame = document.getElementById('arcade-alerts-preview-frame');
        if (!frame || !frame.contentWindow) return;
        frame.contentWindow.postMessage({ multiAlertsPreview: false }, '*');
    }

    // Real OBS overlay URL (no &preview/&embedded) — same resolver + session
    // pattern as buildElementOverlayUrl above.
    function buildAlertsOverlayUrl() {
        var resolver = window.resolveSocialStreamPage;
        if (typeof resolver !== 'function') {
            return Promise.reject(new Error('overlay resolver unavailable'));
        }
        var langParams = (typeof window.getLanguageExtraParams === 'function') ? window.getLanguageExtraParams() : [];

        function withSession(sessionId) {
            var params = [];
            if (sessionId) params.push('session=' + encodeURIComponent(sessionId));
            params = params.concat(buildAlertEventParams()).concat(langParams);
            return resolver('multi-alerts.html', { extraParams: params }).then(function (resolved) {
                return resolved && resolved.url;
            });
        }

        if (typeof window.getChatDockSessionId === 'function') {
            try {
                return Promise.resolve(window.getChatDockSessionId()).then(withSession, function () { return withSession(null); });
            } catch (e) {
                return withSession(null);
            }
        }
        return withSession(null);
    }

    function copyAlertsOverlayUrl(btn) {
        buildAlertsOverlayUrl().then(function (url) {
            if (!url) throw new Error('empty overlay url');
            return copyToClipboard(url).then(function () { flashButton(btn, 'Copied ✓'); });
        }).catch(function (e) {
            console.error('[arcade-shell] copy alerts overlay url failed:', e);
            flashButton(btn, 'Open from Settings', 2200);
        });
    }

    // --------------------------------------------------------------------
    // Style Builder v1 (custom "Style" tab) — visual chat-dock styling.
    // Emits a CSS-variable override blob through SSN's EXISTING cssb64
    // plumbing: the blob is saved as RAW css to the popup's own Custom CSS
    // (dock) setting (cssb64 / textparam1), so the OBS-copied dock URL
    // inherits the style with zero extra plumbing, and ensureChatDockLoaded's
    // dockParams pick it up for the embedded Chat view (see index.html).
    // Control targets are the REAL dock.html custom properties (its :root
    // block) — !important on every var because the dock runtime also sets
    // some vars inline (setProperty beats stylesheets). Presets follow the
    // sanctioned themes/sample.css shape (a plain :root var blob).
    // Spec: pacsarcade design-briefs/ssn-ui-overhaul/style-builder-v1-spec.md.
    //
    // v2 (0018.05.26, Pac's stream-desk feedback, style-builder-v2-spec.md):
    // - Preview overhaul: NO fakemsg into the live session anymore (that
    //   injected into the REAL session mid-stream — unacceptable). The
    //   preview seeds itself in priority order: (1) dock.html's OWN native
    //   loadlast=30 history request (its one-shot getRecentHistory latch,
    //   dock.html:8683/6799 — zero custom plumbing, works over the real P2P
    //   transport); (2) if nothing rendered after ~6s (transport handshake
    //   can race/fail offline), the same-origin fallback this module already
    //   uses for analytics — frame2.contentWindow.getLastMessagesDB(30) fed
    //   into the preview frame's own processInput({recentHistory}) (same
    //   shape the background sends, dock.html:7483/7809 branch, inherits
    //   dedupe/normalize/reloaded handling + its 1s deferral); (3) last
    //   resort, 6-8 OBVIOUSLY-fake canned sample messages via that same
    //   processInput shape, with an honest hint. All same-origin touches are
    //   feature-detected + try/catch (dock.html's own postMessage listener
    //   rejects parent-frame messages — dock.html:8645 — so a direct function
    //   call on contentWindow is the only parent path there is).
    // - Live restyle without reload: while the preview frame's
    //   dataset.ssappOrigin is the local family (sourcemode|local|cache —
    //   legal same-origin access because file:// mode runs with
    //   webSecurity:false, main.js:7405-7407), control changes update ONE
    //   <style id="arcade-style-live"> in the preview frame's contentDocument
    //   instead of reloading the iframe. Any other origin falls back to the
    //   original debounced full-reload-on-src-change behavior.
    // - Two independent profiles (STREAM WIDGET vs DOCK (APP), part B below)
    //   — same STYLE_CONTROLS/presets/My-Presets UI, but the save KEY and the
    //   preview's dockParams differ per profile.
    // --------------------------------------------------------------------
    var STYLE_MARKER = '/* pacs-arcade style-builder v1';
    var STYLE_USER_MARK = '/* user custom css below (preserved) */';
    var styleState = {};      // controlId -> value; only touched controls are present — ACTIVE PROFILE's working copy
    var styleUserCss = '';    // foreign/advanced CSS — preserved VERBATIM, never clobbered — ACTIVE PROFILE's working copy
    var stylePreviewTimer = null;
    var stylePanelLive = false;

    // --------------------------------------------------------------------
    // Two profiles (v2, part B) — STREAM WIDGET (today's cssb64/textparam1,
    // unchanged plumbing — the popup's OBS dock URL inherits it) vs
    // DOCK (APP) (new arcadeDockCss/textparam1 — index.html's
    // getSavedDockCustomCss() reads this FIRST, falling back to cssb64 so an
    // uncustomized app dock still matches the stream style). Switching always
    // reloads the TARGET profile's last-SAVED blob from disk (not an
    // in-memory scratch copy) — if the profile you're leaving has unsaved
    // edits, the segmented button arms a warning-amber confirm-on-second-
    // click (v1.1's exact pattern) before discarding them from view.
    // My Presets / stock PRESETS stay profile-agnostic — applying one always
    // fills whichever profile is currently active.
    // --------------------------------------------------------------------
    var STYLE_PROFILES = ['widget', 'dock'];
    var STYLE_PROFILE_SAVE_KEY = { widget: 'cssb64', dock: 'arcadeDockCss' };
    var STYLE_PROFILE_LABEL = { widget: 'STREAM WIDGET', dock: 'DOCK (APP)' };
    var activeStyleProfile = 'widget';
    var styleProfileSavedRaw = { widget: '', dock: '' }; // last-known-saved raw blob per profile (dirty-check baseline)
    var pendingProfileSwitchTo = null;
    var pendingProfileSwitchBtn = null;
    var pendingProfileSwitchTimer = null;

    // --------------------------------------------------------------------
    // Preview frame state (v2, part A) — see the big comment above.
    // --------------------------------------------------------------------
    var LOCAL_ORIGIN_FAMILY = { sourcemode: true, local: true, cache: true }; // resolveSocialStreamPage's origin values for same-origin-safe frames
    var stylePreviewSeedToken = 0; // bumped on every (re)load so a stale async seed callback can't land on a newer frame

    // --------------------------------------------------------------------
    // Theme preview + customization (v3, part A/B — style-builder-v3-theme-
    // preview-spec.md). The SAME preview iframe + live-<style> mechanism v2
    // built for the dock profiles is reused here for THEME_PAGES entries;
    // activePreviewMode picks which "profile" is currently riding the canvas
    // ('dock' = the existing STREAM WIDGET/DOCK(APP) profiles, unchanged;
    // 'theme' = one THEME_PAGES entry). activeThemeEntry is the entry object
    // itself (not just a slug) so its cssb64/seedable booleans are always at
    // hand without a lookup.
    // --------------------------------------------------------------------
    var activePreviewMode = 'dock'; // 'dock' | 'theme'
    var activeThemeEntry = null;    // THEME_PAGES entry currently in the canvas, or null
    // Per-theme override storage — spec §B.2: new setting
    // `arcadeThemeCss_<slug>`/textparam1 (canonical saveSetting; arbitrary
    // keys proven safe per the ssn skill's settings-sync lore correction).
    // ONE key per theme (not a nested JSON blob) so a theme's Copy URL can be
    // built the exact same encodeCssB64(raw) way the dock profiles are.
    var THEME_OVERRIDE_PREFIX = 'arcadeThemeCss_';
    var themeOverrides = {}; // slug -> raw saved css blob (populated by loadStyleSettings from the SAME getSettings response the dock profiles/My Presets already read — no extra IPC round trip)
    function themeSlug(entry) { return String(entry.file).replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase(); }
    // Resolves a My Library entry's stored baseTheme (a THEME_PAGES `file`
    // value) back to its full entry — needed to reuse the existing v3
    // preview/cssb64 machinery (previewLibraryEntry, Copy URL) rather than
    // inventing a parallel one.
    function findThemePageByFile(file) {
        for (var i = 0; i < THEME_PAGES.length; i++) {
            if (THEME_PAGES[i].file === file) return THEME_PAGES[i];
        }
        return null;
    }
    // Confirm-on-second-click arming for the shared clear-override button —
    // same shape as My Presets' delete/apply arms (armPresetDelete etc.).
    var pendingClearOverrideSlug = null;
    var pendingClearOverrideBtn = null;
    var pendingClearOverrideTimer = null;
    // House dock defaults mirrored from index.html's ensureChatDockLoaded
    // dockParams (~line 13198) MINUS session/cssb64 (added separately) — so
    // the DOCK (APP) preview is tuned against the SAME truth the embedded
    // app dock actually renders with. Kept in sync manually; if the house
    // defaults change there, update here too.
    var ARCADE_DOCK_APP_PREVIEW_PARAMS = [
        'groupuser', 'scale=1.45', 'opacity=0.65', 'darkmode', 'showtime=300000', 'alignbottom',
        'font=opendyslexic', 'color', 'notime', 'badkarma', 'hidecommands', 'quietcommands',
        'textglow', 'largeavatar', 'bubble', 'twolines', 'fadein', 'emoji',
        'animatein=fadeInLeft', 'animateout=fadeOutUp', 'fadeout', 'smooth'
    ];
    // STREAM WIDGET preview keeps v1's original preview params.
    var ARCADE_WIDGET_PREVIEW_PARAMS = ['groupuser', 'darkmode', 'bubble', 'twolines', 'largeavatar', 'emoji'];

    // My Presets (v1.1, part A) — named user presets, SAME ninjafy
    // saveSetting/getSettings plumbing v1 uses for cssb64, under its own
    // top-level settings key (the handler accepts arbitrary keys; never
    // nest under cssb64). Value = JSON array of {id, name, state, userCss}.
    var MY_PRESETS_KEY = 'arcadeStylePresets';
    var MY_PRESETS_CAP = 24;
    var myStylePresets = [];
    var pendingDeleteId = null;   // confirm-on-second-click armed preset id (no window.confirm)
    var pendingDeleteBtn = null;
    var pendingDeleteTimer = null;
    // Same confirm-on-second-click shape, for Apply's Custom-CSS conflict:
    // stock presets never touch userCss, but a My Preset carries its own —
    // silently clobbering an unsaved textarea would be a one-click data
    // loss, so the CSS half needs its own arm/confirm when it would replace
    // something non-empty and different (gate fix 0018.05.27).
    var pendingApplyId = null;
    var pendingApplyBtn = null;
    var pendingApplyTimer = null;

    // My Library (theme-library-spec.md §B) — named user variants forked
    // from a Steve's-template preview. SAME shape/plumbing as My Presets
    // (own top-level saveSetting key, cap, confirm-on-second-click delete),
    // but scoped to theme mode and carrying a baseTheme reference so a
    // library entry can rebuild its base theme's preview + compiled cssb64.
    // Independent of v3's per-theme default override (arcadeThemeCss_<slug>,
    // themeOverrides above) — that stays "the default override for that
    // theme", unchanged; library entries are separate named forks.
    var MY_LIBRARY_KEY = 'arcadeThemeLibrary';
    var MY_LIBRARY_CAP = 24;
    var myThemeLibrary = []; // [{id, name, baseTheme: '<file>', state, userCss}]
    var activeLibraryEntry = null; // the library entry currently loaded into the canvas, or null
    var pendingLibraryDeleteId = null;
    var pendingLibraryDeleteBtn = null;
    var pendingLibraryDeleteTimer = null;

    var STYLE_CONTROLS = [
        { group: 'COLORS' },
        { id: 'transparent', label: 'Transparent background', kind: 'toggle' },
        { id: 'bg', label: 'Dock background', kind: 'color', vars: ['--background-color'] },
        { id: 'text', label: 'Message text', kind: 'color', vars: ['--font-color'] },
        { id: 'name', label: 'Username', kind: 'color', vars: ['--font-color-name'] },
        { id: 'link', label: 'Links', kind: 'color', vars: ['--link-color'] },
        { id: 'bubble', label: 'Bubble', kind: 'color', vars: ['--bgcolor-bubble'] },
        { id: 'bubbleOdd', label: 'Bubble (alt rows)', kind: 'color', vars: ['--bgcolor-bubble-odd'] },
        { id: 'rowBg', label: 'Row background', kind: 'color', vars: ['--highlight-base', '--highlight-base2', '--highlight-compact', '--highlight-compact2'] },
        { id: 'dono', label: 'Donation rows', kind: 'color', vars: ['--donation-bgcolor', '--donation-bgcolor-odd', '--donation-bgcolor-bubble', '--donation-bgcolor-bubble-odd'] },
        { id: 'donoGlow', label: 'Donation amount glow', kind: 'color', vars: ['--donation-amount'] },
        { id: 'member', label: 'Member rows', kind: 'color', vars: ['--member-bgcolor', '--member-bgcolor-bubble'] },
        { group: 'TYPE' },
        { id: 'fontFamily', label: 'Font family', kind: 'text', vars: ['--font-family'], placeholder: 'e.g. "Sora", sans-serif' },
        { id: 'msgSize', label: 'Message size', kind: 'range', vars: ['--comment-font-size'], unit: 'px', min: 10, max: 40, step: 1 },
        { id: 'nameSize', label: 'Name size', kind: 'range', vars: ['--author-font-size'], unit: 'px', min: 10, max: 40, step: 1 },
        { id: 'msgWeight', label: 'Message weight', kind: 'range', vars: ['--message-font-weight'], min: 300, max: 800, step: 100 },
        { id: 'lineHeight', label: 'Line height', kind: 'range', vars: ['--message-line-height'], min: 1, max: 2, step: 0.05 },
        { group: 'LAYOUT' },
        { id: 'rowPad', label: 'Row padding', kind: 'range', vars: ['--padding-rows'], unit: 'px', min: 0, max: 30, step: 1 },
        { id: 'zoom', label: 'Zoom', kind: 'range', vars: ['--scale-output'], min: 0.5, max: 2, step: 0.05 },
        { id: 'avatar', label: 'Avatar size', kind: 'range', unit: 'px', min: 16, max: 64, step: 1 }, // no var exists — selector override on .hl-profile-pic
        { group: 'EFFECTS' },
        { id: 'strokeW', label: 'Text outline width', kind: 'range', vars: ['--text-stroke-width'], unit: 'px', min: 0, max: 4, step: 0.5 },
        { id: 'strokeC', label: 'Text outline color', kind: 'color', vars: ['--text-stroke-color'] },
        { id: 'glow', label: 'Text glow', kind: 'color' } // emits --text-glow: 0 0 8px <color>
    ];

    // Preset chat palettes are USER-BRAND territory (the shell's semantic
    // lock governs the shell chrome, not the user's chat-style output).
    var STYLE_PRESETS = [
        { id: 'stock', name: 'Stock', state: {} },
        {
            id: 'arcade-night', name: 'Arcade Night', state: {
                bg: '#0a0b0d', text: '#f2f0ea', name: '#35d0ff', bubble: '#14161b', bubbleOdd: '#191c22',
                dono: '#3a2a06', donoGlow: '#f7c948', member: '#1a2a3a', glow: '#35d0ff', rowPad: 8
            }
        },
        {
            id: 'clean-light', name: 'Clean Light', state: {
                bg: '#f5f5f2', text: '#22242a', name: '#4a5568', bubble: '#ffffff', bubbleOdd: '#eef0f4',
                dono: '#fff3d6', member: '#e8f0fe', lineHeight: 1.4
            }
        },
        {
            id: 'big-screen', name: 'Big Screen', state: {
                msgSize: 26, nameSize: 22, zoom: 1.4, rowPad: 12, avatar: 48, strokeW: 1, strokeC: '#000000'
            }
        }
    ];

    // Theme Pages (v1.1, part B) — the real bundle inventory under
    // resources/social_stream_fallback/main/themes/, verified against disk
    // 0018.05.26: the 19 top-level pages + notable subdirs (featured-styles/*
    // 13, Neutron chatOnly/stream, deuks 1/2, huan-kiara, LuckyLootTube,
    // rainbowpuke, t3nk3y, Windows3.1) = 41 entries. `file` is the path under
    // themes/ passed straight into resolveSocialStreamPage('themes/' + file).
    // These are STANDALONE overlay pages (dock.html has no theme param —
    // 0018.05.25 scout), NOT dock skins: browse+copy only, never applied by
    // the Style controls above.
    //
    // v4 CORRECTION (style-tab-v4-scout.md §3, 2026-08-18): the disk actually
    // has 42 theme .html files, not 41 — `find … -name "*.html" | wc -l` = 42,
    // re-verified directly. The 41-count above (and everywhere else in this
    // file's older comments) missed `events/index.html`, a moderator
    // dashboard (filtered feed of donation/sub/event notices, not a chat/
    // overlay look) folded into `target: 'special'` below. Every "41" left in
    // surrounding comments is now stale prose, not live count — read 42.
    //
    // v3 SUPPORT MAP (0018.05.26, style-builder-v3-theme-preview-spec.md
    // §A.3) — `cssb64`/`seedable` are SOURCE-VERIFIED booleans, not guesses.
    // Method: every one of the 41 files was grepped directly (case-
    // insensitive) for:
    //   cssb64  — b64css|cssb64|base64css|cssbase64 (any alias SSN uses),
    //             PLUS a broader sweep for urlParams.get/has("css"), atob(,
    //             customcss, usercss to catch a differently-named override.
    //   seedable — recentHistory|loadlast|getRecentHistory, PLUS a check for
    //             any exposed processInput (dock.html's exact recentHistory-
    //             batch ingest shape).
    // ORIGINAL RESULT (0018.05.26): cssb64:false and seedable:false on EVERY
    // entry — grep hit ZERO matches for both patterns across all 41 files,
    // with one single exception worth naming: pretty.html contained a
    // "b64css" literal, but on READING it (not just grepping) that line
    // BUILT an outbound b64css param for the dock.html iframe it embeds
    // internally — pretty.html did not read a cssb64/b64css param from ITS
    // OWN url, so it did not qualify (an external override into pretty.html
    // itself had nowhere to land). events/index.html (added v4) was grepped
    // the same way — zero hits on both patterns, cssb64:false/seedable:false.
    //
    // CURATED-8 CSS UNLOCK (0018.05.28, theme-library-spec.md §A) — 8 of the
    // 41 pages above now carry a hand-inserted port of featured.html's own
    // &css (~:1554) / &b64css|base64css|cssbase64|cssb64 (~:1573-1590)
    // blocks (verbatim-faithful, same pattern as multi-alerts.js's
    // applyCustomCss(), Alert Stage 1) — a source-citation comment sits at
    // each insertion point in the theme file itself. `cssb64:true` below is
    // grep-verified per the same method as the original sweep, not a guess:
    // compact-clean.html, compact-glass.html, horizontal.html,
    // overlay-bubbles.html, overlay-cards.html, overlay-neon-cyberpunk.html,
    // pretty.html, Neutron/chatOnly.html. pretty.html and Neutron/chatOnly.html
    // are the iframe-wrapper family (embed dock.html) — the ported block
    // applies to THEIR OWN <head>, independent of the outbound b64css they
    // already forward into the embedded dock.html iframe (unrelated
    // mechanism, still present, still not what this flag describes).
    // seedable remains false on all 8 (no recentHistory/loadlast ingest was
    // added — out of scope for the Curated-8 css unlock). Every other entry
    // below is unchanged from the original sweep.
    // Every page DOES join its OWN P2P session (urlParams "session"/"room"/
    // "roomid") the same way a real OBS browser source would — that's why
    // Part A still passes session+loadlast on the preview URL and lets real
    // chat show up live if any is flowing, honestly labelled as "connects
    // live" rather than falsely claimed as "seeded history" (dock.html's
    // native loadlast=30 request and the getLastMessagesDB->processInput
    // same-origin fallback are BOTH dock.html-specific machinery these pages
    // don't expose — 12 files (featured-styles/*, LuckyLootTube) define an
    // internal `processData(data)` used for their OWN live single-message P2P
    // events, a DIFFERENT shape than dock.html's batch recentHistory ingest,
    // so it does not count as seedable either). Booleans are read by the UI
    // to gate the "stylable" chip, the Preview-pane editor, and the honest
    // preview hint — never guessed, never claimed without this evidence.
    //
    // `target` (v4, style-tab-v4-scout.md §3) — 'chat' | 'overlay' | 'special',
    // source-classified by reading each page's own ingest signature
    // (addMessageToOverlay/processInput = chat-dock; processData+show/hide
    // cycle = single-message OBS overlay; neither, a filtered notice-only
    // feed = special). Powers the Browse Looks modal's category filter
    // (part A) — one data source, no Style-tab-only shape, so a future
    // elements+games unified grid (round-5 item #34) can reuse it unchanged.
    var THEME_PAGES = [
        { name: 'Compact Classic', file: 'compact-classic.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Compact Clean', file: 'compact-clean.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Compact Glass', file: 'compact-glass.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Horizontal', file: 'horizontal.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'No Timeout Messages', file: 'notimeoutmessages.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Bubbles', file: 'overlay-bubbles.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Cards', file: 'overlay-cards.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Comic Classic', file: 'overlay-comic-classic.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Comic Pop', file: 'overlay-comic-pop.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Credits', file: 'overlay-credits.html', cssb64: false, seedable: false, target: 'special' },
        { name: 'Danmaku', file: 'overlay-danmaku.html', cssb64: false, seedable: false, target: 'special' },
        { name: 'Neon Cyberpunk', file: 'overlay-neon-cyberpunk.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Particles', file: 'overlay-particles.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Ticker News', file: 'overlay-ticker-news.html', cssb64: false, seedable: false, target: 'special' },
        { name: 'Typewriter', file: 'overlay-typewriter.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'X-acception', file: 'overlay-xacception.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Pretty', file: 'pretty.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Sample Overlay (Reverse)', file: 'sampleoverlay_reverse.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Spirit Overlay', file: 'spiritoverlay.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Featured — 3D', file: 'featured-styles/featured-3d.html', cssb64: false, seedable: false, target: 'overlay' },
        { name: 'Featured — Animated', file: 'featured-styles/featured-animated.html', cssb64: false, seedable: false, target: 'overlay' },
        { name: 'Featured — Cyberpunk', file: 'featured-styles/featured-cyberpunk.html', cssb64: false, seedable: false, target: 'overlay' },
        { name: 'Featured — Dynamic', file: 'featured-styles/featured-dynamic.html', cssb64: false, seedable: false, target: 'overlay' },
        { name: 'Featured — Elegant', file: 'featured-styles/featured-elegant.html', cssb64: false, seedable: false, target: 'overlay' },
        { name: 'Featured — Gaming', file: 'featured-styles/featured-gaming.html', cssb64: false, seedable: false, target: 'overlay' },
        { name: 'Featured — Glass', file: 'featured-styles/featured-glass.html', cssb64: false, seedable: false, target: 'overlay' },
        { name: 'Featured — Gradient', file: 'featured-styles/featured-gradient.html', cssb64: false, seedable: false, target: 'overlay' },
        { name: 'Featured — Modern', file: 'featured-styles/featured-modern.html', cssb64: false, seedable: false, target: 'overlay' },
        { name: 'Featured — Neon', file: 'featured-styles/featured-neon.html', cssb64: false, seedable: false, target: 'overlay' },
        { name: 'Featured — Particles', file: 'featured-styles/featured-particles.html', cssb64: false, seedable: false, target: 'overlay' },
        { name: 'Featured — Retro', file: 'featured-styles/featured-retro.html', cssb64: false, seedable: false, target: 'overlay' },
        { name: 'Featured — Slide', file: 'featured-styles/featured-slide.html', cssb64: false, seedable: false, target: 'overlay' },
        { name: 'Neutron — Chat Only', file: 'Neutron/chatOnly.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Neutron — Stream', file: 'Neutron/stream.html', cssb64: true, seedable: false, target: 'chat' },
        { name: 'Deuks Overlay 1', file: 'deuks_overlay/overlay1.html', cssb64: false, seedable: false, target: 'chat' },
        { name: 'Deuks Overlay 2', file: 'deuks_overlay/overlay2.html', cssb64: false, seedable: false, target: 'chat' },
        { name: 'Huan-Kiara', file: 'huan-kiara/index.html', cssb64: false, seedable: false, target: 'chat' },
        { name: 'LuckyLootTube', file: 'LuckyLootTube/luckyloottube.html', cssb64: false, seedable: false, target: 'chat' },
        { name: 'Rainbow Puke', file: 'rainbowpuke/index.html', cssb64: false, seedable: false, target: 'chat' },
        { name: 't3nk3y', file: 't3nk3y/index.html', cssb64: false, seedable: false, target: 'chat' },
        { name: 'Windows 3.1', file: 'Windows3.1/index.html', cssb64: false, seedable: false, target: 'chat' },
        { name: 'Events Dashboard', file: 'events/index.html', cssb64: false, seedable: false, target: 'special' }
    ];

    var THEME_TARGET_LABEL = { chat: 'CHAT', overlay: 'OVERLAY', special: 'SPECIAL' };

    function styleControlById(id) {
        for (var i = 0; i < STYLE_CONTROLS.length; i++) {
            if (STYLE_CONTROLS[i].id === id) return STYLE_CONTROLS[i];
        }
        return null;
    }

    // A literal "*/" typed into a free-text value would close the marker
    // comment early, and CSS error-recovery could then eat the generated
    // :root block in the dock (gate fix #4). Stripped from emitted CSS
    // values; in the state JSON it's escaped as *\/ — JSON.parse reads \/
    // as /, so the state round-trips back to the exact original.
    function stripCommentClose(value) {
        return String(value).replace(/\*\//g, '');
    }

    // Managed blob: marker + control-state JSON (for round-trip restore) +
    // generated :root vars + selector overrides + the user's own CSS verbatim.
    // v4: accepts an optional (state, userCss) pair so the Browse Looks
    // modal's per-card Copy URL (buildBrowseLibraryCard) can compile a NON-
    // active My Library entry's SAVED data without touching the live
    // styleState/styleUserCss scratch — every existing call site calls this
    // with no args and keeps reading the globals, unchanged.
    function buildStyleCss(stateArg, userCssArg) {
        var state = stateArg || styleState;
        var userCss = userCssArg !== undefined ? userCssArg : styleUserCss;
        var lines = [];
        Object.keys(state).forEach(function (id) {
            var value = state[id];
            if (value === '' || value == null || value === false) return;
            if (id === 'transparent' || id === 'avatar') return; // handled below
            var ctl = styleControlById(id);
            if (!ctl) return;
            if (typeof value === 'string') value = stripCommentClose(value);
            if (id === 'glow') { lines.push('  --text-glow: 0 0 8px ' + value + ' !important;'); return; }
            if (!ctl.vars) return;
            var unit = ctl.unit || '';
            ctl.vars.forEach(function (v) { lines.push('  ' + v + ': ' + value + unit + ' !important;'); });
        });
        if (state.transparent) lines.push('  --background-color: #0000 !important;'); // last → wins over bg
        var css = '';
        if (lines.length) css += ':root {\n' + lines.join('\n') + '\n}\n';
        if (state.avatar) {
            css += '.hl-profile-pic { width: ' + state.avatar + 'px !important; height: ' + state.avatar + 'px !important; }\n';
        }
        var stateJson = JSON.stringify(state).replace(/\*\//g, '*\\/');
        var out = STYLE_MARKER + '\nstate:' + stateJson + '\n*/\n' + css;
        if (userCss) out += STYLE_USER_MARK + '\n' + userCss;
        return out;
    }

    function parseStyleBlob(raw) {
        var result = { state: {}, userCss: '' };
        if (!raw) return result;
        if (raw.indexOf(STYLE_MARKER) !== 0) { result.userCss = raw; return result; } // foreign CSS — preserve whole
        var m = raw.match(/^\/\* pacs-arcade style-builder v1\nstate:(.*)\n\*\//);
        if (m) { try { result.state = JSON.parse(m[1]) || {}; } catch (e) { /* corrupted state — keep css-only */ } }
        var idx = raw.indexOf(STYLE_USER_MARK);
        if (idx !== -1) result.userCss = raw.slice(idx + STYLE_USER_MARK.length).replace(/^\n/, '');
        return result;
    }

    // The popup's exact encode order (popup.js URL builder): inner
    // encodeURIComponent for UTF-8 safety, btoa, outer encodeURIComponent
    // for URL safety. dock.html decodes atob-then-decodeURIComponent.
    function encodeCssB64(cssText) {
        return encodeURIComponent(btoa(encodeURIComponent(cssText)));
    }

    // --------------------------------------------------------------------
    // Style v4 (style-builder-v4-spec.md) — Browse Looks consolidation +
    // panel density. IA Option A (style-tab-v4-scout.md §5.1): the stock
    // PRESETS row, MY PRESETS section, and the DOCK|THEMES rail + seg are
    // REMOVED from the always-visible panel — their FUNCTIONALITY moves,
    // nothing lost — into one modal opened by a single "Browse looks…"
    // button in the panel head. The PROFILE seg stays put (a mode, not a
    // preset — spec §B.2). Canvas gets every pixel that chrome used to cost.
    // --------------------------------------------------------------------
    function buildStylePanel() {
        var panel = document.createElement('section');
        panel.className = 'arcade-style';
        panel.setAttribute('aria-label', 'Style builder');
        panel.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title">STYLE — CHAT DOCK</span>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-style-status" id="arcade-style-status"></span>' +
            '<button type="button" class="arcade-btn" id="arcade-style-browse-btn">Browse looks…</button>' +
            '<button type="button" class="arcade-btn" id="arcade-style-export" title="Download the current look as a standalone theme HTML file">Save as theme…</button>' +
            '<button type="button" class="arcade-btn arcade-btn--primary" id="arcade-style-save">Save style</button>' +
            '</div>' +
            '<div class="arcade-style-body">' +
            '<div class="arcade-style-profile-row">' +
            '<span class="arcade-k">PROFILE</span>' +
            '<div class="arcade-seg" role="group" aria-label="Style profile" id="arcade-style-profile-seg">' +
            '<button type="button" class="is-on" data-arcade-style-profile="widget" aria-pressed="true">STREAM WIDGET</button>' +
            '<button type="button" data-arcade-style-profile="dock" aria-pressed="false">DOCK (APP)</button>' +
            '</div>' +
            '<span class="arcade-style-hint">STREAM WIDGET = the OBS-copied dock URL · DOCK (APP) = this app\'s own embedded chat view — independent saved styles</span>' +
            '</div>' +
            '<div class="arcade-style-cols">' +
            '<div class="arcade-style-controls-col">' +
            '<div class="arcade-style-controls" id="arcade-style-controls"></div>' +
            '<div class="arcade-style-no-editor-note" id="arcade-style-no-editor-note" hidden>This theme has its own fixed look — no editor here. Use Copy URL (above the preview) to grab it as-is.</div>' +
            '</div>' +
            '<div class="arcade-style-preview">' +
            '<div class="arcade-style-preview-bar">' +
            '<span class="arcade-style-hint" id="arcade-style-preview-hint">Loading preview…</span>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-style-theme-chip arcade-style-theme-chip--stylable" id="arcade-style-preview-stylable-chip" hidden>stylable</span>' +
            '<button type="button" class="arcade-btn arcade-btn--sm arcade-btn--icon" id="arcade-style-preview-clear-override" hidden title="Clear this theme\'s customization">×</button>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-style-preview-copy" hidden>Copy URL</button>' +
            '<span class="arcade-style-preview-profile" id="arcade-style-preview-profile"></span>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-style-back-dock" hidden>← Back to dock</button>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-style-reload">Reload preview</button>' +
            '</div>' +
            '<iframe id="arcade-style-preview-frame" title="Chat dock style preview"></iframe>' +
            '</div>' +
            '</div>' +
            '<div class="arcade-field" id="arcade-style-usercss-field"><label for="arcade-style-usercss">CUSTOM CSS (advanced)</label>' +
            '<span class="arcade-field__hint">appended verbatim after the generated style — yours is never overwritten</span></div>' +
            '<textarea id="arcade-style-usercss" spellcheck="false" rows="4"></textarea>' +
            '</div>';
        document.body.appendChild(panel);
        buildBrowseModal();
        renderStyleControls(panel);
        initThemePreviewBarActions(panel);
        initStyleProfileSeg(panel);
        initBackToDockButton(panel);
        syncCanvasModeUI();
        panel.querySelector('#arcade-style-browse-btn').addEventListener('click', openBrowseModal);
        panel.querySelector('#arcade-style-export').addEventListener('click', exportStyleAsTheme);
        panel.querySelector('#arcade-style-save').addEventListener('click', saveStyleBlob);
        panel.querySelector('#arcade-style-reload').addEventListener('click', function () {
            if (activePreviewMode === 'theme' && activeThemeEntry) loadThemePreviewFrame(activeThemeEntry);
            else initStylePreviewFrame();
        });
        panel.querySelector('#arcade-style-usercss').addEventListener('input', function (e) {
            styleUserCss = e.target.value;
            queueStylePreviewRefresh();
        });
    }

    function initBackToDockButton(panel) {
        var btn = panel.querySelector('#arcade-style-back-dock');
        if (!btn) return;
        btn.addEventListener('click', backToDockPreview);
    }

    function initStyleProfileSeg(panel) {
        var seg = panel.querySelector('#arcade-style-profile-seg');
        if (!seg) return;
        seg.addEventListener('click', function (e) {
            var btn = e.target.closest('button[data-arcade-style-profile]');
            if (!btn || !seg.contains(btn)) return;
            switchStyleProfile(btn.dataset.arcadeStyleProfile, btn);
        });
    }

    function initClockPopoverControls(pop) {
        var seg = pop.querySelector('#arcade-clock-seg');
        if (seg) {
            seg.addEventListener('click', function (e) {
                var btn = e.target.closest('button[data-arcade-clock-mode]');
                if (!btn || !seg.contains(btn)) return;
                bftClockMode = btn.dataset.arcadeClockMode === 'local' ? 'local' : 'bft';
                saveClockSetting(CLOCK_MODE_KEY, bftClockMode);
                syncClockControls();
                applyClockSettingChange();
            });
        }
        var secondsToggle = pop.querySelector('#arcade-clock-seconds');
        if (secondsToggle) {
            secondsToggle.addEventListener('change', function () {
                bftClockSeconds = !!secondsToggle.checked;
                saveClockSetting(CLOCK_SECONDS_KEY, bftClockSeconds ? 'true' : 'false');
                applyClockSettingChange();
            });
        }
    }

    // --------------------------------------------------------------------
    // Style v4 — Browse Looks modal (style-builder-v4-spec.md §A,
    // style-tab-v4-scout.md §5.1, IA Option A). ONE preset destination:
    // stock PRESETS + MY PRESETS + the old THEMES rail (which itself grouped
    // MY LIBRARY + Steve's templates) all collapse into this one modal, with
    // a Chat/Overlays/Special/Mine filter over a text/chip card grid — NO
    // thumbnails this pass (spec §A.3: a flagged follow-up, don't fake it).
    // Every v1.1/v3 behavior is relocated verbatim where possible: applying a
    // stock or My Preset still just fills styleState/styleUserCss and rides
    // the existing sync/preview path; clicking a theme/library card still
    // calls previewThemePage/previewLibraryEntry unchanged; Save-current-as
    // (both My Presets and My Library) still calls the same save functions
    // below with the same conflict/cap/fire-and-honestly-confirm behavior.
    // Same overlay-pattern discipline as the shell's other pops: Escape,
    // backdrop click, and the × button all close it; focus is trapped inside
    // the dialog while open and restored to the trigger button on close.
    // --------------------------------------------------------------------
    var browseModalOpen = false;
    var browseFilter = 'chat';
    var browseModalTriggerEl = null;

    function buildBrowseModal() {
        var modal = document.createElement('div');
        modal.className = 'arcade-browse-modal';
        modal.id = 'arcade-browse-modal';
        modal.hidden = true;
        modal.innerHTML =
            '<div class="arcade-browse-backdrop"></div>' +
            '<div class="arcade-browse-dialog" role="dialog" aria-modal="true" aria-labelledby="arcade-browse-title">' +
            '<div class="arcade-browse-head">' +
            '<span class="arcade-browse-title" id="arcade-browse-title">Browse looks</span>' +
            '<input type="text" id="arcade-browse-search" class="arcade-browse-search" placeholder="Filter by name…" maxlength="40">' +
            '<button type="button" class="arcade-btn arcade-btn--sm arcade-btn--icon" id="arcade-browse-close" aria-label="Close">×</button>' +
            '</div>' +
            '<div class="arcade-seg" role="group" aria-label="Look category" id="arcade-browse-filter-seg">' +
            '<button type="button" class="is-on" data-arcade-browse-filter="chat" aria-pressed="true">Chat</button>' +
            '<button type="button" data-arcade-browse-filter="overlay" aria-pressed="false">Overlays</button>' +
            '<button type="button" data-arcade-browse-filter="special" aria-pressed="false">Special</button>' +
            '<button type="button" data-arcade-browse-filter="mine" aria-pressed="false">Mine</button>' +
            '</div>' +
            '<div class="arcade-browse-grid" id="arcade-browse-grid"></div>' +
            '</div>';
        document.body.appendChild(modal);
        modal.querySelector('.arcade-browse-backdrop').addEventListener('click', closeBrowseModal);
        modal.querySelector('#arcade-browse-close').addEventListener('click', closeBrowseModal);
        modal.querySelector('#arcade-browse-search').addEventListener('input', renderBrowseGrid);
        var seg = modal.querySelector('#arcade-browse-filter-seg');
        seg.addEventListener('click', function (e) {
            var btn = e.target.closest('button[data-arcade-browse-filter]');
            if (!btn || !seg.contains(btn)) return;
            browseFilter = btn.dataset.arcadeBrowseFilter;
            seg.querySelectorAll('button').forEach(function (b) {
                var on = b === btn;
                b.classList.toggle('is-on', on);
                b.setAttribute('aria-pressed', String(on));
            });
            var search = document.getElementById('arcade-browse-search');
            if (search) search.value = '';
            renderBrowseGrid();
        });
        renderBrowseFilterCounts();
    }

    function renderBrowseFilterCounts() {
        var seg = document.getElementById('arcade-browse-filter-seg');
        if (!seg) return;
        var counts = { chat: 0, overlay: 0, special: 0 };
        THEME_PAGES.forEach(function (e) { if (counts.hasOwnProperty(e.target)) counts[e.target]++; });
        var mine = STYLE_PRESETS.length + myStylePresets.length + myThemeLibrary.length;
        var labels = { chat: 'Chat', overlay: 'Overlays', special: 'Special', mine: 'Mine' };
        seg.querySelectorAll('button[data-arcade-browse-filter]').forEach(function (b) {
            var key = b.dataset.arcadeBrowseFilter;
            var n = key === 'mine' ? mine : counts[key];
            b.textContent = labels[key] + ' (' + n + ')';
        });
    }

    function trapFocus(container, e) {
        var sel = 'button:not([hidden]):not([disabled]), [href], input:not([hidden]):not([disabled]), ' +
            'select:not([hidden]), textarea:not([hidden]), [tabindex]:not([tabindex="-1"])';
        var focusables = container.querySelectorAll(sel);
        if (!focusables.length) return;
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function onBrowseModalKeydown(e) {
        var modal = document.getElementById('arcade-browse-modal');
        if (!modal || modal.hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); closeBrowseModal(); return; }
        if (e.key === 'Tab') {
            var dialog = modal.querySelector('.arcade-browse-dialog');
            if (dialog) trapFocus(dialog, e);
        }
    }

    function openBrowseModal() {
        var modal = document.getElementById('arcade-browse-modal');
        if (!modal) return;
        browseModalTriggerEl = document.activeElement;
        modal.hidden = false;
        browseModalOpen = true;
        renderBrowseFilterCounts();
        renderBrowseGrid();
        document.addEventListener('keydown', onBrowseModalKeydown, true);
        var closeBtn = document.getElementById('arcade-browse-close');
        if (closeBtn) closeBtn.focus();
    }

    function closeBrowseModal() {
        var modal = document.getElementById('arcade-browse-modal');
        if (!modal || modal.hidden) return;
        modal.hidden = true;
        browseModalOpen = false;
        document.removeEventListener('keydown', onBrowseModalKeydown, true);
        if (browseModalTriggerEl && typeof browseModalTriggerEl.focus === 'function') browseModalTriggerEl.focus();
        browseModalTriggerEl = null;
    }

    function renderBrowseGrid() {
        var grid = document.getElementById('arcade-browse-grid');
        if (!grid) return;
        grid.innerHTML = '';
        var q = ((document.getElementById('arcade-browse-search') || {}).value || '').trim().toLowerCase();
        function matches(name) { return !q || String(name).toLowerCase().indexOf(q) !== -1; }

        if (browseFilter === 'mine') { renderBrowseMineTab(grid, matches, q); return; }

        var entries = THEME_PAGES.filter(function (e) { return e.target === browseFilter && matches(e.name); });
        if (!entries.length) {
            grid.appendChild(buildBrowseEmpty(q ? 'No looks match "' + q + '"' : 'No looks in this category'));
            return;
        }
        entries.forEach(function (entry) { grid.appendChild(buildBrowseThemeCard(entry)); });
    }

    function renderBrowseMineTab(grid, matches, q) {
        resetPendingDelete();
        resetPendingApply();
        resetPendingLibraryDelete();

        var stockMatches = STYLE_PRESETS.filter(function (p) { return matches(p.name); });
        if (stockMatches.length) {
            grid.appendChild(buildBrowseGroupLabel('STOCK PRESETS'));
            stockMatches.forEach(function (p) { grid.appendChild(buildBrowseStockPresetCard(p)); });
        }

        grid.appendChild(buildBrowseGroupLabel('MY PRESETS'));
        var mpMatches = myStylePresets.filter(function (p) { return matches(p.name); });
        if (mpMatches.length) mpMatches.forEach(function (p) { grid.appendChild(buildBrowseMyPresetCard(p)); });
        else if (!q) grid.appendChild(buildBrowseEmpty('No saved presets yet'));
        grid.appendChild(buildBrowseSaveRow('Save current as…', 'arcade-browse-mypreset-name', function (name) { saveCurrentAsMyPreset(name); }, ''));

        grid.appendChild(buildBrowseGroupLabel('MY LIBRARY'));
        var libMatches = myThemeLibrary.filter(function (e) { return matches(e.name); });
        if (libMatches.length) libMatches.forEach(function (e) { grid.appendChild(buildBrowseLibraryCard(e)); });
        else if (!q) grid.appendChild(buildBrowseEmpty('No library entries yet'));
        var themeStylable = activePreviewMode === 'theme' && !!(activeThemeEntry && activeThemeEntry.cssb64);
        if (themeStylable) {
            grid.appendChild(buildBrowseSaveRow('Save to My Library…', 'arcade-browse-mylibrary-name', function (name) { saveCurrentToMyLibrary(name); }, activeLibraryEntry ? activeLibraryEntry.name : ''));
        }
    }

    function buildBrowseGroupLabel(text) {
        var label = document.createElement('div');
        label.className = 'arcade-browse-group-label';
        label.textContent = text;
        return label;
    }

    function buildBrowseEmpty(text) {
        var empty = document.createElement('div');
        empty.className = 'arcade-style-mypresets-empty arcade-browse-empty arcade-fx-grid'; // S44 M5 — arcade-native empty state
        empty.textContent = text;
        return empty;
    }

    function buildBrowseSaveRow(placeholder, id, onSave, prefill) {
        var row = document.createElement('div');
        row.className = 'arcade-browse-saverow';
        var input = document.createElement('input');
        input.type = 'text';
        input.id = id;
        input.className = 'arcade-style-mypreset-name';
        input.placeholder = placeholder;
        input.maxLength = 40;
        if (prefill) input.value = prefill;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'arcade-btn arcade-btn--sm';
        btn.textContent = 'Save';
        function doSave() { onSave(input.value); }
        btn.addEventListener('click', doSave);
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
        row.appendChild(input);
        row.appendChild(btn);
        return row;
    }

    function switchToDockModeForModalApply() {
        if (activePreviewMode !== 'theme') return;
        backToDockPreview();
    }

    function buildBrowseStockPresetCard(preset) {
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'arcade-browse-card arcade-browse-card--preset';
        var name = document.createElement('span');
        name.className = 'arcade-browse-card__name';
        name.textContent = preset.name;
        card.appendChild(name);
        var chip = document.createElement('span');
        chip.className = 'arcade-style-theme-chip arcade-style-theme-chip--preset';
        chip.textContent = 'CSS PRESET';
        card.appendChild(chip);
        card.title = 'Apply "' + preset.name + '"';
        card.addEventListener('click', function () {
            switchToDockModeForModalApply();
            styleState = JSON.parse(JSON.stringify(preset.state)); // presets fill the CONTROLS, not opaque css
            syncStyleControlsFromState();
            queueStylePreviewRefresh();
            closeBrowseModal();
        });
        return card;
    }

    function buildBrowseMyPresetCard(preset) {
        var card = document.createElement('div');
        card.className = 'arcade-browse-card arcade-browse-card--preset';
        var hit = document.createElement('button');
        hit.type = 'button';
        // arcade-style-preset-apply is kept alongside the card-hit class
        // purely so applyMyPreset()'s is-confirm arm (the "click again to
        // also replace your Custom CSS" state) keeps its existing warning-
        // amber styling — same token, same selector, new host element.
        hit.className = 'arcade-browse-card__hit arcade-style-preset-apply';
        var name = document.createElement('span');
        name.className = 'arcade-browse-card__name';
        name.textContent = preset.name;
        hit.appendChild(name);
        var chip = document.createElement('span');
        chip.className = 'arcade-style-theme-chip arcade-style-theme-chip--preset';
        chip.textContent = 'CSS PRESET';
        hit.appendChild(chip);
        hit.title = 'Apply "' + preset.name + '"';
        hit.addEventListener('click', function () {
            switchToDockModeForModalApply();
            applyMyPreset(preset, hit);
            if (pendingApplyId !== preset.id) closeBrowseModal(); // stays open only while the Custom-CSS conflict arm is live
        });
        card.appendChild(hit);
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'arcade-btn arcade-btn--sm arcade-btn--icon arcade-style-preset-del';
        del.title = 'Delete "' + preset.name + '"';
        del.setAttribute('aria-label', 'Delete ' + preset.name);
        del.textContent = '×';
        del.addEventListener('click', function (e) { e.stopPropagation(); armPresetDelete(preset.id, preset.name, del); });
        card.appendChild(del);
        return card;
    }

    function buildBrowseThemeCard(entry) {
        var slug = themeSlug(entry);
        var card = document.createElement('div');
        card.className = 'arcade-browse-card arcade-browse-card--theme';
        card.dataset.themeSlug = slug;
        card.dataset.themeName = entry.name;
        var hit = document.createElement('button');
        hit.type = 'button';
        hit.className = 'arcade-browse-card__hit';
        var name = document.createElement('span');
        name.className = 'arcade-browse-card__name';
        name.textContent = entry.name;
        hit.appendChild(name);
        var chips = document.createElement('span');
        chips.className = 'arcade-browse-card__chips';
        if (entry.cssb64) {
            var stylableChip = document.createElement('span');
            stylableChip.className = 'arcade-style-theme-chip arcade-style-theme-chip--stylable';
            stylableChip.textContent = 'stylable';
            chips.appendChild(stylableChip);
        }
        var customChip = document.createElement('span');
        customChip.className = 'arcade-style-theme-chip arcade-style-theme-chip--custom';
        customChip.textContent = 'custom';
        customChip.hidden = !(entry.cssb64 && themeOverrides[slug]);
        chips.appendChild(customChip);
        var targetChip = document.createElement('span');
        targetChip.className = 'arcade-style-theme-chip arcade-style-theme-chip--target';
        targetChip.textContent = THEME_TARGET_LABEL[entry.target] || entry.target;
        chips.appendChild(targetChip);
        hit.appendChild(chips);
        hit.title = entry.cssb64 ? 'Preview "' + entry.name + '"' : 'Preview "' + entry.name + '" — this theme has its own fixed look';
        hit.addEventListener('click', function () { previewThemePage(entry); closeBrowseModal(); });
        card.appendChild(hit);
        if (entry.cssb64) {
            var actions = document.createElement('span');
            actions.className = 'arcade-browse-card__actions';
            var copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'arcade-btn arcade-btn--sm';
            copyBtn.textContent = 'Copy URL';
            copyBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                var params = themeOverrides[slug] ? ['cssb64=' + encodeCssB64(themeOverrides[slug])] : [];
                copyElementOverlayUrl({ overlayPage: 'themes/' + entry.file, params: params }, copyBtn);
            });
            actions.appendChild(copyBtn);
            card.appendChild(actions);
        }
        return card;
    }

    // Library cards carry their OWN saved state/userCss (not the live
    // scratch styleState/styleUserCss, which only reflects whatever entry is
    // currently loaded in the canvas) — so a card's Copy URL works correctly
    // for ANY library entry from the grid, not just the one being previewed.
    function buildBrowseLibraryCard(entry) {
        var card = document.createElement('div');
        card.className = 'arcade-browse-card arcade-browse-card--theme arcade-browse-card--library';
        card.dataset.libraryId = entry.id;
        card.dataset.themeName = entry.name;
        var hit = document.createElement('button');
        hit.type = 'button';
        hit.className = 'arcade-browse-card__hit';
        var name = document.createElement('span');
        name.className = 'arcade-browse-card__name';
        name.textContent = entry.name;
        hit.appendChild(name);
        var chips = document.createElement('span');
        chips.className = 'arcade-browse-card__chips';
        var yoursChip = document.createElement('span');
        yoursChip.className = 'arcade-style-theme-chip arcade-style-theme-chip--yours';
        yoursChip.textContent = 'yours';
        chips.appendChild(yoursChip);
        var forkChip = document.createElement('span');
        forkChip.className = 'arcade-style-theme-chip arcade-style-theme-chip--preset';
        forkChip.textContent = 'FORKED THEME';
        chips.appendChild(forkChip);
        var baseEntry = findThemePageByFile(entry.baseTheme);
        if (baseEntry) {
            var targetChip = document.createElement('span');
            targetChip.className = 'arcade-style-theme-chip arcade-style-theme-chip--target';
            targetChip.textContent = THEME_TARGET_LABEL[baseEntry.target] || baseEntry.target;
            chips.appendChild(targetChip);
        }
        hit.appendChild(chips);
        hit.title = 'Preview "' + entry.name + '"' + (baseEntry ? ' — yours, based on ' + baseEntry.name : ' — yours (base theme missing)');
        hit.addEventListener('click', function () { previewLibraryEntry(entry); closeBrowseModal(); });
        card.appendChild(hit);
        var actions = document.createElement('span');
        actions.className = 'arcade-browse-card__actions';
        if (baseEntry && baseEntry.cssb64) {
            var copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'arcade-btn arcade-btn--sm';
            copyBtn.textContent = 'Copy URL';
            copyBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                var params = ['cssb64=' + encodeCssB64(buildStyleCss(entry.state, entry.userCss))];
                copyElementOverlayUrl({ overlayPage: 'themes/' + baseEntry.file, params: params }, copyBtn);
            });
            actions.appendChild(copyBtn);
        }
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'arcade-btn arcade-btn--sm arcade-btn--icon arcade-style-preset-del';
        del.title = 'Delete "' + entry.name + '"';
        del.setAttribute('aria-label', 'Delete ' + entry.name);
        del.textContent = '×';
        del.addEventListener('click', function (e) { e.stopPropagation(); armLibraryDelete(entry.id, entry.name, del); });
        actions.appendChild(del);
        card.appendChild(actions);
        return card;
    }

    // --------------------------------------------------------------------
    // My Presets (v1.1, part A) — save/apply/delete named user styles.
    // Loaded lazily by ensureStylePanelLive() alongside the saved style
    // blob (one Style-tab boot, two independent ninjafy settings reads —
    // arcadeStylePresets is its OWN top-level key, never nested under
    // cssb64). Apply loads state+userCss into the SAME controls the stock
    // PRESETS row used to (v4: now a Mine-tab card in the Browse Looks
    // modal), so it rides the existing sync/preview path.
    //
    // renderMyPresetPills/renderThemeRailPills (below) are the SAME function
    // names v1.1/v3 called after every save/delete — v4 repoints their
    // bodies at the modal grid (a cheap re-render when the Mine tab happens
    // to be open, a no-op otherwise, since the data itself lives in
    // myStylePresets/myThemeLibrary and is re-read fresh next time the modal
    // opens) rather than hunting down every call site.
    // --------------------------------------------------------------------
    function renderMyPresetPills() {
        resetPendingDelete();
        resetPendingApply();
        if (browseModalOpen && browseFilter === 'mine') renderBrowseGrid();
    }

    // Stock presets never touch userCss (v1), but a My Preset carries its
    // own — applying one over an unsaved, DIFFERENT non-empty textarea would
    // be a silent one-click loss. Only the state/controls half applies on
    // the first click when that conflict exists; the CSS half needs the
    // SAME confirm-on-second-click arming armPresetDelete uses below. No
    // conflict (textarea empty, or already matches the preset) → apply
    // everything immediately, same as before.
    function applyMyPreset(preset, btn) {
        if (pendingApplyId === preset.id) {
            // second click within the window — confirm the Custom CSS half
            resetPendingApply();
            styleUserCss = preset.userCss || '';
            var ta2 = document.getElementById('arcade-style-usercss');
            if (ta2) ta2.value = styleUserCss;
            queueStylePreviewRefresh();
            setStyleStatus('Applied "' + preset.name + '" — Custom CSS replaced', false);
            return;
        }
        resetPendingDelete();
        resetPendingApply();
        var incomingCss = preset.userCss || '';
        var conflict = styleUserCss.trim() !== '' && styleUserCss !== incomingCss;
        styleState = JSON.parse(JSON.stringify(preset.state || {}));
        syncStyleControlsFromState();
        queueStylePreviewRefresh();
        if (!conflict) {
            styleUserCss = incomingCss;
            var ta = document.getElementById('arcade-style-usercss');
            if (ta) ta.value = styleUserCss;
            setStyleStatus('Applied "' + preset.name + '"', false);
            return;
        }
        pendingApplyId = preset.id;
        pendingApplyBtn = btn;
        btn.classList.add('is-confirm');
        btn.title = 'Click again to also apply this preset’s Custom CSS (replaces yours)';
        clearTimeout(pendingApplyTimer);
        pendingApplyTimer = setTimeout(resetPendingApply, 2800);
        setStyleStatus('Applied "' + preset.name + '" style — this preset also replaces your Custom CSS — click again within a moment to apply that too', true);
    }

    function saveCurrentAsMyPreset(rawName) {
        var name = String(rawName || '').trim();
        if (!name) { setStyleStatus('Name your preset before saving', true); return; }
        var existingIdx = -1;
        for (var i = 0; i < myStylePresets.length; i++) {
            if (myStylePresets[i].name === name) { existingIdx = i; break; }
        }
        if (existingIdx === -1 && myStylePresets.length >= MY_PRESETS_CAP) {
            setStyleStatus('Preset limit reached (' + MY_PRESETS_CAP + ') — delete one to save more', true);
            return;
        }
        var entry = {
            id: existingIdx !== -1 ? myStylePresets[existingIdx].id : ('p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
            name: name,
            state: JSON.parse(JSON.stringify(styleState)),
            userCss: styleUserCss
        };
        var overwrote = existingIdx !== -1;
        if (overwrote) myStylePresets[existingIdx] = entry; else myStylePresets.push(entry);
        setStyleStatus('Saving…', false);
        renderMyPresetPills();
        renderBrowseFilterCounts();
        saveMyPresets(function () {
            setStyleStatus((overwrote ? 'Saved ✓ — overwrote "' : 'Saved ✓ — "') + name + '"', false);
            setTimeout(function () { setStyleStatus('', false); }, 4000);
        });
    }

    // Confirm-on-second-click delete — NOT window.confirm. First click arms
    // (button flips to a danger "✓" and auto-disarms after ~2.8s); a second
    // click on the SAME button while armed deletes for real. Clicking a
    // different preset's delete (or any re-render) disarms the old one.
    function resetPendingDelete() {
        if (pendingDeleteBtn) {
            pendingDeleteBtn.textContent = '×';
            pendingDeleteBtn.classList.remove('is-confirm');
        }
        pendingDeleteId = null;
        pendingDeleteBtn = null;
        clearTimeout(pendingDeleteTimer);
    }

    // Same confirm-on-second-click shape as delete's — arms the Apply
    // button's Custom-CSS confirmation (see applyMyPreset's comment above).
    // Disarms on re-render, on arming a DIFFERENT preset's apply, and on
    // arming delete (they share a pill, so one action disarms the other).
    function resetPendingApply() {
        if (pendingApplyBtn) pendingApplyBtn.classList.remove('is-confirm');
        pendingApplyId = null;
        pendingApplyBtn = null;
        clearTimeout(pendingApplyTimer);
    }

    function armPresetDelete(id, name, btn) {
        if (pendingDeleteId === id) {
            resetPendingDelete();
            deleteMyPreset(id, name);
            return;
        }
        resetPendingDelete();
        resetPendingApply();
        pendingDeleteId = id;
        pendingDeleteBtn = btn;
        btn.textContent = '✓';
        btn.classList.add('is-confirm');
        btn.title = 'Click again to delete "' + name + '"';
        pendingDeleteTimer = setTimeout(resetPendingDelete, 2800);
    }

    function deleteMyPreset(id, name) {
        myStylePresets = myStylePresets.filter(function (p) { return p.id !== id; });
        renderMyPresetPills();
        renderBrowseFilterCounts();
        setStyleStatus('Saving…', false);
        saveMyPresets(function () {
            setStyleStatus('Deleted "' + name + '"', false);
            setTimeout(function () { setStyleStatus('', false); }, 4000);
        });
    }

    // My Presets are loaded as part of the single consolidated
    // loadStyleSettings() getSettings read (v2 — see ensureStylePanelLive()).
    // Same fire-and-honestly-confirm shape as v1's saveStyleBlob (gate fix
    // #2): onDone only fires once the bridge actually answers; an unanswered
    // save says so rather than claiming success.
    function saveMyPresets(onDone) {
        try {
            if (!(window.ninjafy && typeof window.ninjafy.sendMessage === 'function')) {
                setStyleStatus('settings bridge unavailable — could not save preset', true);
                return;
            }
            var value = JSON.stringify(myStylePresets);
            var confirmed = false;
            window.ninjafy.sendMessage(null, { cmd: 'saveSetting', type: 'textparam1', setting: MY_PRESETS_KEY, value: value }, function () {
                confirmed = true;
                if (onDone) onDone();
            });
            setTimeout(function () {
                if (!confirmed) setStyleStatus('Save sent — no confirmation received', false);
            }, 3000);
        } catch (e) {
            console.error('[arcade-shell] my-presets save failed:', e);
            setStyleStatus('Save failed — see console', true);
        }
    }

    // --------------------------------------------------------------------
    // My Library (theme-library-spec.md §B) — save-as from Steve's
    // templates. SAME shape as My Presets above (name-matched overwrite,
    // cap, fire-and-honestly-confirm save, confirm-on-second-click delete),
    // scoped to theme mode: an entry additionally carries `baseTheme` (a
    // THEME_PAGES `file`) so previewLibraryEntry can rebuild the canvas.
    // --------------------------------------------------------------------
    // v4: the save-to-library input+button used to be a static row in the
    // panel body (renderMyLibrarySaveRow, wired once at buildStylePanel()
    // time); it's now built fresh inside the Browse Looks modal's Mine tab
    // every render (buildBrowseSaveRow) — same saveCurrentToMyLibrary() call,
    // same "leave the name in place so Save-again updates it" behavior
    // (spec §B.4), just no longer a fixed DOM node to wire listeners onto
    // once.
    function saveCurrentToMyLibrary(rawName) {
        if (activePreviewMode !== 'theme' || !activeThemeEntry || !activeThemeEntry.cssb64) {
            setStyleStatus('Preview a stylable theme before saving to My Library', true);
            return;
        }
        var name = String(rawName || '').trim();
        if (!name) { setStyleStatus('Name your library entry before saving', true); return; }
        var existingIdx = -1;
        for (var i = 0; i < myThemeLibrary.length; i++) {
            if (myThemeLibrary[i].name === name) { existingIdx = i; break; }
        }
        if (existingIdx === -1 && myThemeLibrary.length >= MY_LIBRARY_CAP) {
            setStyleStatus('Library limit reached (' + MY_LIBRARY_CAP + ') — delete one to save more', true);
            return;
        }
        var entry = {
            id: existingIdx !== -1 ? myThemeLibrary[existingIdx].id : ('lib' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
            name: name,
            baseTheme: activeThemeEntry.file,
            state: JSON.parse(JSON.stringify(styleState)),
            userCss: styleUserCss
        };
        var overwrote = existingIdx !== -1;
        if (overwrote) myThemeLibrary[existingIdx] = entry; else myThemeLibrary.push(entry);
        activeLibraryEntry = entry;
        setStyleStatus('Saving…', false);
        renderThemeRailPills();
        renderBrowseFilterCounts();
        syncCanvasModeUI();
        saveMyLibrary(function () {
            setStyleStatus((overwrote ? 'Saved ✓ — overwrote "' : 'Saved ✓ — "') + name + '"', false);
            setTimeout(function () { setStyleStatus('', false); }, 4000);
        });
    }

    // Same fire-and-honestly-confirm shape as saveMyPresets.
    function saveMyLibrary(onDone) {
        try {
            if (!(window.ninjafy && typeof window.ninjafy.sendMessage === 'function')) {
                setStyleStatus('settings bridge unavailable — could not save library entry', true);
                return;
            }
            var value = JSON.stringify(myThemeLibrary);
            var confirmed = false;
            window.ninjafy.sendMessage(null, { cmd: 'saveSetting', type: 'textparam1', setting: MY_LIBRARY_KEY, value: value }, function () {
                confirmed = true;
                if (onDone) onDone();
            });
            setTimeout(function () {
                if (!confirmed) setStyleStatus('Save sent — no confirmation received', false);
            }, 3000);
        } catch (e) {
            console.error('[arcade-shell] my-library save failed:', e);
            setStyleStatus('Save failed — see console', true);
        }
    }

    // Confirm-on-second-click delete — SAME shape/danger-red token as
    // armPresetDelete (own state, since a library pill and a preset pill are
    // never the same element, but the behavior must match exactly).
    function resetPendingLibraryDelete() {
        if (pendingLibraryDeleteBtn) {
            pendingLibraryDeleteBtn.textContent = '×';
            pendingLibraryDeleteBtn.classList.remove('is-confirm');
        }
        pendingLibraryDeleteId = null;
        pendingLibraryDeleteBtn = null;
        clearTimeout(pendingLibraryDeleteTimer);
    }

    function armLibraryDelete(id, name, btn) {
        if (pendingLibraryDeleteId === id) {
            resetPendingLibraryDelete();
            deleteLibraryEntry(id, name);
            return;
        }
        resetPendingLibraryDelete();
        pendingLibraryDeleteId = id;
        pendingLibraryDeleteBtn = btn;
        btn.textContent = '✓';
        btn.classList.add('is-confirm');
        btn.title = 'Click again to delete "' + name + '"';
        pendingLibraryDeleteTimer = setTimeout(resetPendingLibraryDelete, 2800);
    }

    function deleteLibraryEntry(id, name) {
        myThemeLibrary = myThemeLibrary.filter(function (e) { return e.id !== id; });
        if (activeLibraryEntry && activeLibraryEntry.id === id) activeLibraryEntry = null;
        // v4: the save-to-library input is rebuilt fresh from activeLibraryEntry
        // every time the Mine tab renders (buildBrowseSaveRow) — no separate
        // DOM clear needed here now.
        renderThemeRailPills();
        renderBrowseFilterCounts();
        syncCanvasModeUI();
        setStyleStatus('Saving…', false);
        saveMyLibrary(function () {
            setStyleStatus('Deleted "' + name + '"', false);
            setTimeout(function () { setStyleStatus('', false); }, 4000);
        });
    }

    // --------------------------------------------------------------------
    // Theme browsing (v3 → v4). v3's slim horizontal THEMES rail (pills
    // directly above the iframe) is REPLACED by the Browse Looks modal's
    // Chat/Overlays/Special/Mine card grid (buildBrowseThemeCard/
    // buildBrowseLibraryCard above) — same click-to-preview behavior
    // (previewThemePage/previewLibraryEntry, unchanged below), same honest
    // capability chips, same Copy URL/clear-override plumbing on whichever
    // theme is currently in the canvas (initThemePreviewBarActions +
    // syncCanvasModeUI, unchanged). renderThemeRailPills is the SAME
    // function name v3 called after every library save/delete — v4 repoints
    // its body at the modal grid (see renderMyPresetPills above for the
    // identical pattern) rather than hunting down every call site.
    // --------------------------------------------------------------------
    function renderThemeRailPills() {
        resetPendingLibraryDelete();
        if (browseModalOpen && browseFilter === 'mine') renderBrowseGrid();
    }

    // Shared preview-bar actions for the theme currently in the canvas
    // (activeThemeEntry) — Copy URL (appends the saved override's cssb64 when
    // one exists) and the confirm-armed clear-override control. Both hidden
    // via syncCanvasModeUI() unless a theme is actually being previewed.
    function initThemePreviewBarActions(panel) {
        var copyBtn = panel.querySelector('#arcade-style-preview-copy');
        if (copyBtn) {
            copyBtn.addEventListener('click', function () {
                if (!activeThemeEntry) return;
                var slug = themeSlug(activeThemeEntry);
                var params = [];
                // Spec §B.3: "Copy URL → base theme URL + compiled cssb64" for
                // a library entry — uses the CURRENT scratch state (so
                // in-progress edits are included, not just the last save),
                // same buildStyleCss()/encodeCssB64() the dock profiles use.
                // Falls back to the theme's own default override otherwise
                // (v3, unchanged).
                if (activeThemeEntry.cssb64) {
                    if (activeLibraryEntry) params.push('cssb64=' + encodeCssB64(buildStyleCss()));
                    else if (themeOverrides[slug]) params.push('cssb64=' + encodeCssB64(themeOverrides[slug]));
                }
                copyElementOverlayUrl({ overlayPage: 'themes/' + activeThemeEntry.file, params: params }, copyBtn);
            });
        }
        var clearBtn = panel.querySelector('#arcade-style-preview-clear-override');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                if (!activeThemeEntry) return;
                armThemeOverrideClear(activeThemeEntry, clearBtn);
            });
        }
    }

    function renderStyleControls(panel) {
        var host = panel.querySelector('#arcade-style-controls');
        host.innerHTML = '';
        STYLE_CONTROLS.forEach(function (ctl) {
            if (ctl.group) {
                var h = document.createElement('div');
                h.className = 'arcade-style-group';
                h.textContent = ctl.group;
                host.appendChild(h);
                return;
            }
            host.appendChild(buildStyleControlRow(ctl));
        });
        syncStyleControlsFromState();
    }

    function buildStyleControlRow(ctl) {
        var row = document.createElement('div');
        row.className = 'arcade-style-row';
        row.dataset.styleControl = ctl.id;
        var label = document.createElement('label');
        label.textContent = ctl.label;
        label.title = ctl.label; // v4 density pass: label ellipsizes at 280px, full text on hover
        label.setAttribute('for', 'arcade-style-ctl-' + ctl.id);
        row.appendChild(label);
        var input;
        if (ctl.kind === 'toggle') {
            input = document.createElement('input');
            input.type = 'checkbox';
            input.addEventListener('change', function () { setStyleValue(ctl.id, input.checked ? true : ''); syncStyleControlsFromState(); });
        } else if (ctl.kind === 'color') {
            input = document.createElement('input');
            input.type = 'color';
            input.addEventListener('input', function () { setStyleValue(ctl.id, input.value); row.classList.add('is-set'); });
        } else if (ctl.kind === 'range') {
            input = document.createElement('input');
            input.type = 'range';
            input.min = ctl.min; input.max = ctl.max; input.step = ctl.step || 1;
            input.addEventListener('input', function () {
                setStyleValue(ctl.id, parseFloat(input.value));
                row.classList.add('is-set');
                var out = row.querySelector('.arcade-style-val');
                if (out) out.textContent = input.value + (ctl.unit || '');
            });
        } else {
            input = document.createElement('input');
            input.type = 'text';
            if (ctl.placeholder) input.placeholder = ctl.placeholder;
            input.addEventListener('input', function () { setStyleValue(ctl.id, input.value.trim()); row.classList.toggle('is-set', !!input.value.trim()); });
        }
        input.id = 'arcade-style-ctl-' + ctl.id;
        row.appendChild(input);
        if (ctl.kind === 'range') {
            var val = document.createElement('span');
            val.className = 'arcade-style-val';
            val.textContent = '—';
            row.appendChild(val);
        }
        var clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'arcade-btn arcade-btn--sm arcade-btn--icon arcade-style-clear';
        clear.title = 'Clear (use dock default)';
        clear.setAttribute('aria-label', 'Clear ' + ctl.label);
        clear.textContent = '×';
        clear.addEventListener('click', function () { setStyleValue(ctl.id, ''); syncStyleControlsFromState(); });
        row.appendChild(clear);
        return row;
    }

    function setStyleValue(id, value) {
        if (value === '' || value == null || value === false) delete styleState[id];
        else styleState[id] = value;
        queueStylePreviewRefresh();
    }

    function syncStyleControlsFromState() {
        STYLE_CONTROLS.forEach(function (ctl) {
            if (ctl.group) return;
            var input = document.getElementById('arcade-style-ctl-' + ctl.id);
            if (!input) return;
            var row = input.closest('.arcade-style-row');
            var has = Object.prototype.hasOwnProperty.call(styleState, ctl.id);
            if (row) row.classList.toggle('is-set', has);
            if (ctl.kind === 'toggle') input.checked = !!styleState[ctl.id];
            else if (ctl.kind === 'range') {
                input.value = has ? styleState[ctl.id] : (ctl.min + (ctl.max - ctl.min) / 2);
                var val = row && row.querySelector('.arcade-style-val');
                if (val) val.textContent = has ? styleState[ctl.id] + (ctl.unit || '') : '—';
            } else if (ctl.kind === 'color') input.value = has ? styleState[ctl.id] : '#888888';
            else input.value = has ? styleState[ctl.id] : '';
        });
    }

    function setStyleStatus(text, isError) {
        var el = document.getElementById('arcade-style-status');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-error', !!isError);
    }

    // Lazy boot on first Style-tab visit: ONE getSettings read for both
    // profiles' saved blobs + My Presets, load the ACTIVE profile
    // (STREAM WIDGET by default) into the controls, then first preview.
    function ensureStylePanelLive() {
        if (stylePanelLive) { queueStylePreviewRefresh(); return; }
        stylePanelLive = true;
        loadStyleSettings().then(function () { initStylePreviewFrame(); });
    }

    function loadStyleSettings() {
        return new Promise(function (resolve) {
            try {
                if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                    window.ninjafy.sendMessage(null, { getSettings: true }, function (response) {
                        try {
                            var settings = (response && response.settings) || {};
                            STYLE_PROFILES.forEach(function (profile) {
                                var entry = settings[STYLE_PROFILE_SAVE_KEY[profile]];
                                styleProfileSavedRaw[profile] = (entry && typeof entry.textparam1 === 'string') ? entry.textparam1 : '';
                            });
                            var presetsEntry = settings[MY_PRESETS_KEY];
                            var presetsRaw = (presetsEntry && typeof presetsEntry.textparam1 === 'string') ? presetsEntry.textparam1 : '';
                            var parsedPresets = presetsRaw ? JSON.parse(presetsRaw) : [];
                            myStylePresets = Array.isArray(parsedPresets) ? parsedPresets : [];
                            // My Library (theme-library-spec.md §B.1) — rides the
                            // SAME consolidated getSettings response, own top-level key.
                            var libraryEntry = settings[MY_LIBRARY_KEY];
                            var libraryRaw = (libraryEntry && typeof libraryEntry.textparam1 === 'string') ? libraryEntry.textparam1 : '';
                            var parsedLibrary = libraryRaw ? JSON.parse(libraryRaw) : [];
                            myThemeLibrary = Array.isArray(parsedLibrary) ? parsedLibrary : [];
                            // v3 — per-theme overrides ride the SAME getSettings response
                            // (one key per theme, arcadeThemeCss_<slug>/textparam1); no
                            // extra IPC round trip needed to know which of the 42 have one.
                            THEME_PAGES.forEach(function (entry) {
                                var slug = themeSlug(entry);
                                var overrideEntry = settings[THEME_OVERRIDE_PREFIX + slug];
                                var overrideRaw = (overrideEntry && typeof overrideEntry.textparam1 === 'string') ? overrideEntry.textparam1 : '';
                                if (overrideRaw) themeOverrides[slug] = overrideRaw;
                            });
                        } catch (e) { console.error('[arcade-shell] style settings load parse failed:', e); }
                        loadActiveProfileIntoControls();
                        renderMyPresetPills();
                        renderThemeRailPills(); // My Library was empty at panel construction — reflect the real loaded list now
                        refreshAllThemeCustomChips();
                        renderBrowseFilterCounts(); // Mine (n) was a guess at modal-build time — reflect the real loaded counts now
                        resolve();
                    });
                    return;
                }
            } catch (e) { console.error('[arcade-shell] style settings load failed:', e); }
            setStyleStatus('settings bridge unavailable — styles will not load or save', true);
            loadActiveProfileIntoControls();
            renderMyPresetPills();
            renderBrowseFilterCounts();
            resolve();
        });
    }

    // Loads the ACTIVE profile's last-saved blob (styleProfileSavedRaw,
    // populated by loadStyleSettings()/saveStyleBlob()) into styleState/
    // styleUserCss and the visible controls. Used at first boot AND on
    // every profile switch (switching always re-reads the SAVED blob, never
    // an in-memory scratch copy — see the profile-switch comment above).
    function loadActiveProfileIntoControls() {
        var raw = styleProfileSavedRaw[activeStyleProfile] || '';
        var parsed = parseStyleBlob(raw);
        styleState = parsed.state || {};
        styleUserCss = parsed.userCss || '';
        var ta = document.getElementById('arcade-style-usercss');
        if (ta) ta.value = styleUserCss;
        syncStyleControlsFromState();
    }

    // True when the CURRENT in-progress edit (styleState/styleUserCss) no
    // longer matches the active profile's last-saved blob — the dirty-check
    // that arms the profile-switch confirm.
    function isActiveProfileDirty() {
        var isEmpty = Object.keys(styleState).length === 0 && !styleUserCss;
        var current = isEmpty ? '' : buildStyleCss();
        return current !== (styleProfileSavedRaw[activeStyleProfile] || '');
    }

    function resetPendingProfileSwitch() {
        if (pendingProfileSwitchBtn) pendingProfileSwitchBtn.classList.remove('is-confirm');
        pendingProfileSwitchTo = null;
        pendingProfileSwitchBtn = null;
        clearTimeout(pendingProfileSwitchTimer);
    }

    function switchStyleProfile(profile, btn) {
        if (!STYLE_PROFILE_LABEL[profile] || profile === activeStyleProfile) return;
        if (pendingProfileSwitchTo === profile) {
            resetPendingProfileSwitch();
            doSwitchStyleProfile(profile);
            return;
        }
        resetPendingProfileSwitch();
        resetPendingDelete();
        resetPendingApply();
        if (!isActiveProfileDirty()) { doSwitchStyleProfile(profile); return; }
        // Same warning-amber confirm-on-second-click shape as v1.1's My
        // Presets Custom-CSS conflict — this arm isn't destructive to
        // anything saved on disk, only a heads-up that unsaved edits in the
        // profile you're leaving won't be shown until you switch back
        // WITHOUT having saved (switching always reloads from the saved
        // blob, never an in-memory copy).
        pendingProfileSwitchTo = profile;
        pendingProfileSwitchBtn = btn;
        btn.classList.add('is-confirm');
        btn.title = 'Click again to switch — unsaved ' + STYLE_PROFILE_LABEL[activeStyleProfile] + ' changes will not be kept';
        clearTimeout(pendingProfileSwitchTimer);
        pendingProfileSwitchTimer = setTimeout(resetPendingProfileSwitch, 2800);
        setStyleStatus('Unsaved ' + STYLE_PROFILE_LABEL[activeStyleProfile] + ' changes — click ' + STYLE_PROFILE_LABEL[profile] + ' again to switch anyway', true);
    }

    function doSwitchStyleProfile(profile) {
        activeStyleProfile = profile;
        activePreviewMode = 'dock'; // defensive — the PROFILE seg is hidden while in theme mode, but this keeps state consistent even so
        loadActiveProfileIntoControls();
        renderStyleProfileSeg();
        setStyleStatus('', false);
        initStylePreviewFrame(); // fresh frame — the two profiles' real dockParams differ
    }

    // Widget/dock PROFILE seg is-on state ONLY — the "Previewing: …" label is
    // owned exclusively by syncCanvasModeUI() now (v3), since that label also
    // has to speak for theme-preview mode.
    function renderStyleProfileSeg() {
        var seg = document.getElementById('arcade-style-profile-seg');
        if (!seg) return;
        seg.querySelectorAll('button').forEach(function (b) {
            var on = b.dataset.arcadeStyleProfile === activeStyleProfile;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-pressed', String(on));
        });
    }

    function setStylePreviewHint(text) {
        var el = document.getElementById('arcade-style-preview-hint');
        if (el) el.textContent = text || '';
    }

    // Debounced control-change handler. While the preview frame is same-
    // origin (local family), restyle it LIVE via the <style id="arcade-
    // style-live"> tag — no reload. Any other origin falls back to v1's
    // original behavior: rebuild frame.src with the new cssb64 (a full
    // reload, which also naturally re-seeds via the native loadlast param).
    // v3: no-ops entirely when the current canvas has nothing to edit (theme
    // mode on a cssb64:false entry — see isStyleEditorAvailable) so control
    // input listeners don't need their own per-mode guards; the reload
    // fallback also routes to the theme reloader while in theme mode.
    function queueStylePreviewRefresh() {
        if (!stylePanelLive) return;
        if (!isStyleEditorAvailable()) return;
        clearTimeout(stylePreviewTimer);
        stylePreviewTimer = setTimeout(function () {
            if (applyLiveStylePreview()) return;
            if (activePreviewMode === 'theme' && activeThemeEntry) loadThemePreviewFrame(activeThemeEntry);
            else refreshStylePreviewViaReload();
        }, 400);
    }

    function buildStylePreviewParams(sessionId) {
        var baseParams = activeStyleProfile === 'dock' ? ARCADE_DOCK_APP_PREVIEW_PARAMS : ARCADE_WIDGET_PREVIEW_PARAMS;
        return ['session=' + encodeURIComponent(sessionId), 'loadlast=30']
            .concat(baseParams)
            .concat(['cssb64=' + encodeCssB64(buildStyleCss())]);
    }

    // First paint (boot / profile switch / "Reload preview") — sets
    // frame.src ONCE with the current blob already riding as cssb64, so the
    // very first render is already styled; every control change AFTER this
    // goes through the live <style> tag instead (queueStylePreviewRefresh).
    function initStylePreviewFrame() {
        var frame = document.getElementById('arcade-style-preview-frame');
        if (!frame) return;
        var resolver = window.resolveSocialStreamPage;
        var getSession = window.getChatDockSessionId;
        if (typeof resolver !== 'function' || typeof getSession !== 'function') {
            setStyleStatus('preview unavailable (app helpers not found)', true);
            return;
        }
        renderStyleProfileSeg();
        syncCanvasModeUI();
        var myToken = ++stylePreviewSeedToken;
        setStylePreviewHint('Loading preview…');
        Promise.resolve(getSession()).then(function (sessionId) {
            if (!sessionId) { setStyleStatus('waiting for session…', false); return; }
            return resolver('dock.html', { extraParams: buildStylePreviewParams(sessionId) }).then(function (resolved) {
                if (myToken !== stylePreviewSeedToken) return; // superseded by a newer reload
                if (resolved && resolved.url) {
                    frame.dataset.ssappOrigin = resolved.origin || '';
                    frame.onload = function () {
                        if (myToken !== stylePreviewSeedToken) return;
                        ensureLiveStyleTag(frame);
                        seedStylePreview(frame, myToken);
                    };
                    frame.src = resolved.url;
                    setStyleStatus('', false);
                }
            });
        }).catch(function (e) {
            console.error('[arcade-shell] style preview init failed:', e);
            setStyleStatus('preview failed — see console', true);
        });
    }

    // Non-local-origin fallback (v1's original behavior): rebuild frame.src
    // with the current blob. A full reload also re-runs the native
    // loadlast=30 request for free; there's no same-origin seeding to retry
    // here (that path is gated on the local family — see seedStylePreview).
    function refreshStylePreviewViaReload() {
        var frame = document.getElementById('arcade-style-preview-frame');
        if (!frame) return;
        var resolver = window.resolveSocialStreamPage;
        var getSession = window.getChatDockSessionId;
        if (typeof resolver !== 'function' || typeof getSession !== 'function') return;
        var myToken = ++stylePreviewSeedToken;
        Promise.resolve(getSession()).then(function (sessionId) {
            if (!sessionId) return;
            return resolver('dock.html', { extraParams: buildStylePreviewParams(sessionId) }).then(function (resolved) {
                if (myToken !== stylePreviewSeedToken) return;
                if (resolved && resolved.url) {
                    frame.dataset.ssappOrigin = resolved.origin || '';
                    frame.onload = function () {
                        if (myToken !== stylePreviewSeedToken) return;
                        ensureLiveStyleTag(frame);
                        seedStylePreview(frame, myToken);
                    };
                    frame.src = resolved.url;
                }
            });
        }).catch(function (e) { console.error('[arcade-shell] style preview reload failed:', e); });
    }

    // Live restyle: get-or-create the ONE managed <style> tag in the preview
    // frame's contentDocument. Returns null (feature-detected, never throws)
    // on any cross-frame access failure.
    function ensureLiveStyleTag(frame) {
        try {
            var doc = frame.contentDocument;
            if (!doc || !doc.head) return null;
            var tag = doc.getElementById('arcade-style-live');
            if (!tag) {
                tag = doc.createElement('style');
                tag.id = 'arcade-style-live';
                doc.head.appendChild(tag);
            }
            return tag;
        } catch (e) { return null; }
    }

    // Returns true if it successfully live-restyled (local-family origin +
    // reachable contentDocument); false means the caller should fall back to
    // a full src reload instead.
    function applyLiveStylePreview() {
        var frame = document.getElementById('arcade-style-preview-frame');
        if (!frame) return false;
        var origin = frame.dataset.ssappOrigin || '';
        if (!LOCAL_ORIGIN_FAMILY[origin]) return false;
        var tag = ensureLiveStyleTag(frame);
        if (!tag) return false;
        // vars are already !important — beats the dock's own inline setProperty.
        tag.textContent = buildStyleCss();
        return true;
    }

    // Preview seeding — priority order (style-builder-v2-spec.md §A.2,
    // amended): (1) dock.html's own native loadlast=30 history request over
    // the real P2P transport (already riding on the preview URL, zero extra
    // plumbing here — just wait and see if it rendered anything); (2) same-
    // origin fallback via frame2's getLastMessagesDB(30) → this preview
    // frame's own processInput({recentHistory}); (3) last resort, obviously-
    // fake canned sample messages via the same processInput shape.
    function seedStylePreview(frame, token) {
        var origin = frame.dataset.ssappOrigin || '';
        if (!LOCAL_ORIGIN_FAMILY[origin]) {
            // loadlast=30 is already on the URL for every origin; there's no
            // same-origin fallback available for a non-local frame.
            setStylePreviewHint('Seeded via the dock\'s own history request (loadlast) — no same-origin fallback available for this frame.');
            return;
        }
        // Give the native loadlast request's P2P transport handshake a real
        // window to land before assuming it failed (it can race or fail
        // offline — this is a preview iframe, not the live session).
        setTimeout(function () {
            if (token !== stylePreviewSeedToken) return;
            var rendered = false;
            try {
                rendered = !!(frame.contentDocument && frame.contentDocument.querySelector('#output > div'));
            } catch (e) { /* leave false — fall through to the same-origin fallback */ }
            if (rendered) {
                setStylePreviewHint('Live chat history (via the dock\'s own loadlast request)');
                return;
            }
            seedStylePreviewFromBridge(frame, token);
        }, 6000);
    }

    function seedStylePreviewFromBridge(frame, token) {
        try {
            var bg = getBackgroundWindow();
            if (!bg || typeof bg.getLastMessagesDB !== 'function') {
                seedStylePreviewWithSamples(frame, token);
                return;
            }
            bg.getLastMessagesDB(30).then(function (rows) {
                if (token !== stylePreviewSeedToken) return;
                rows = Array.isArray(rows) ? rows : [];
                if (!rows.length) { seedStylePreviewWithSamples(frame, token); return; }
                try {
                    if (frame.contentWindow && typeof frame.contentWindow.processInput === 'function') {
                        frame.contentWindow.processInput({ recentHistory: rows });
                        setStylePreviewHint('Real chat history (' + rows.length + ' recent messages)');
                    } else {
                        seedStylePreviewWithSamples(frame, token);
                    }
                } catch (e) {
                    console.error('[arcade-shell] preview seed (real history) failed:', e);
                    seedStylePreviewWithSamples(frame, token);
                }
            }).catch(function (e) {
                console.error('[arcade-shell] getLastMessagesDB failed:', e);
                seedStylePreviewWithSamples(frame, token);
            });
        } catch (e) {
            console.error('[arcade-shell] preview seed bridge failed:', e);
            seedStylePreviewWithSamples(frame, token);
        }
    }

    // Obviously-fake personas (SampleFren etc.) — plain / donation / member /
    // firsttime / vip, so every style control has something real to show
    // against. Same "row" shape getLastMessagesDB() returns (a stored
    // chatmessage object + id/timestamp — see db.js addMessage), fed through
    // the SAME dock.html:7809 recentHistory branch as real history.
    function buildStyleSampleMessages() {
        var now = Date.now();
        return [
            { id: 'arcade-sample-1', chatname: 'SampleFren', type: 'twitch', chatmessage: 'hey chat, loving the new layout! 👋', timestamp: now - 70000 },
            { id: 'arcade-sample-2', chatname: 'SampleDono', type: 'youtube', hasDonation: '5.00', chatmessage: 'take my bits, keep it up!', timestamp: now - 60000 },
            { id: 'arcade-sample-3', chatname: 'SampleMember', type: 'twitch', membership: 'Tier 2', chatmessage: 'member gang 🔥', timestamp: now - 50000 },
            { id: 'arcade-sample-4', chatname: 'SampleFirstTimer', type: 'kick', firsttime: true, chatmessage: 'first time here, this is awesome!', timestamp: now - 40000 },
            { id: 'arcade-sample-5', chatname: 'SampleVIP', type: 'discord', vip: true, chatmessage: 'vip check-in ✅', timestamp: now - 30000 },
            { id: 'arcade-sample-6', chatname: 'SampleFren2', type: 'youtube', chatmessage: 'lol nice, gg', timestamp: now - 20000 },
            { id: 'arcade-sample-7', chatname: 'SampleDono2', type: 'twitch', hasDonation: '2500 bits', chatmessage: 'poggers 🎉', timestamp: now - 10000 }
        ];
    }

    function seedStylePreviewWithSamples(frame, token) {
        if (token !== stylePreviewSeedToken) return;
        try {
            if (frame.contentWindow && typeof frame.contentWindow.processInput === 'function') {
                frame.contentWindow.processInput({ recentHistory: buildStyleSampleMessages() });
            }
        } catch (e) { console.error('[arcade-shell] sample seed failed:', e); }
        setStylePreviewHint('no chat history yet — showing sample messages');
    }

    // --------------------------------------------------------------------
    // Theme preview + customization (v3, part A/B). previewThemePage/
    // backToDockPreview switch activePreviewMode; loadThemePreviewFrame is
    // the theme-mode twin of initStylePreviewFrame (dock.html swapped for
    // themes/<file>). seedThemePreview/isStyleEditorAvailable/
    // updateStyleEditorAvailability/syncCanvasModeUI are the honest-badge
    // gates — every branch below reads THEME_PAGES' source-verified cssb64/
    // seedable booleans, never assumes.
    // --------------------------------------------------------------------
    function isStyleEditorAvailable() {
        return activePreviewMode === 'dock' || (activePreviewMode === 'theme' && !!(activeThemeEntry && activeThemeEntry.cssb64));
    }

    // Hides/shows the STYLE_CONTROLS column + Custom CSS box + Save button
    // depending on whether there's anything to edit right now — spec §B.3:
    // "Themes with cssb64:false: no editor claims." True for 34 of the 42
    // THEME_PAGES entries (see the support-map comment above THEME_PAGES) —
    // the other 8 (the Curated-8 CSS unlock) DO get an editor; the branch is
    // written generically so a future theme gaining cssb64 support just
    // works without further changes here.
    function updateStyleEditorAvailability() {
        var available = isStyleEditorAvailable();
        var controls = document.getElementById('arcade-style-controls');
        var note = document.getElementById('arcade-style-no-editor-note');
        var usercssField = document.getElementById('arcade-style-usercss-field');
        var usercssBox = document.getElementById('arcade-style-usercss');
        var saveBtn = document.getElementById('arcade-style-save');
        if (controls) controls.hidden = !available;
        if (note) note.hidden = available;
        if (usercssField) usercssField.hidden = !available;
        if (usercssBox) usercssBox.hidden = !available;
        if (saveBtn) saveBtn.hidden = !available;
    }

    // Single sync point for every mode-dependent bit of chrome: the
    // "Previewing: …" label, the "← Back to dock" button's visibility
    // (v4 — replaces the old DOCK|THEMES seg's is-on state now that mode
    // switching happens via the Browse Looks modal instead), hiding the
    // PROFILE row while a theme is in the canvas (it describes dock-profile
    // state that has no meaning for a theme page — PRESETS/MY PRESETS rows
    // no longer live in the panel body at all, v4, so there's nothing left
    // to hide for them here), the shared stylable chip / Copy URL / clear-
    // override controls on the previewed theme, the Browse Looks modal's
    // active-card highlight (only visible while that tab happens to be
    // open), and the editor availability gate above. Called on every mode/
    // entry change so there's exactly one place that can drift.
    function syncCanvasModeUI() {
        var inTheme = activePreviewMode === 'theme';
        var label = document.getElementById('arcade-style-preview-profile');
        if (label) {
            label.textContent = inTheme
                ? ('PREVIEWING: ' + (activeThemeEntry ? activeThemeEntry.name : '—'))
                : ('Previewing: ' + STYLE_PROFILE_LABEL[activeStyleProfile]);
        }
        var backDockBtn = document.getElementById('arcade-style-back-dock');
        if (backDockBtn) backDockBtn.hidden = !inTheme;
        var profileSegEl = document.getElementById('arcade-style-profile-seg');
        var profileRow = profileSegEl && profileSegEl.closest('.arcade-style-profile-row');
        if (profileRow) profileRow.hidden = inTheme;
        var themeStylable = inTheme && !!(activeThemeEntry && activeThemeEntry.cssb64);
        var stylableChip = document.getElementById('arcade-style-preview-stylable-chip');
        if (stylableChip) stylableChip.hidden = !themeStylable;
        var copyBtn = document.getElementById('arcade-style-preview-copy');
        if (copyBtn) {
            copyBtn.hidden = !inTheme;
            if (inTheme) copyBtn.title = activeThemeEntry && activeThemeEntry.cssb64 ? '' : "this theme has its own fixed look";
        }
        var clearBtn = document.getElementById('arcade-style-preview-clear-override');
        if (clearBtn) clearBtn.hidden = !(inTheme && activeThemeEntry && activeThemeEntry.cssb64 && themeOverrides[themeSlug(activeThemeEntry)]);
        // S30 export is a DOCK-profile act (the file wraps dock.html — see
        // exportStyleAsTheme); in theme mode the controls edit a theme page's
        // own override, which a dock wrapper could not honor — so the button
        // honestly hides rather than exporting a file that can't reproduce
        // what's on the canvas.
        var exportBtn = document.getElementById('arcade-style-export');
        if (exportBtn) exportBtn.hidden = inTheme;
        document.querySelectorAll('.arcade-browse-card[data-theme-slug], .arcade-browse-card[data-library-id]').forEach(function (p) {
            var isLibraryCard = !!p.dataset.libraryId;
            var active = isLibraryCard
                ? (inTheme && !!activeLibraryEntry && p.dataset.libraryId === activeLibraryEntry.id)
                : (inTheme && !activeLibraryEntry && !!activeThemeEntry && p.dataset.themeSlug === themeSlug(activeThemeEntry));
            p.classList.toggle('is-active', active);
        });
        updateStyleEditorAvailability();
    }

    // Loads a theme's saved override (or a blank slate) into the SAME
    // styleState/styleUserCss scratch the dock profiles use — only called
    // when entry.cssb64 is true (theme has somewhere for an override to
    // land); parseStyleBlob is the same round-trip format buildStyleCss()
    // emits, unchanged from v1.
    function loadThemeOverrideIntoControls(entry) {
        var raw = themeOverrides[themeSlug(entry)] || '';
        var parsed = parseStyleBlob(raw);
        styleState = parsed.state || {};
        styleUserCss = parsed.userCss || '';
        var ta = document.getElementById('arcade-style-usercss');
        if (ta) ta.value = styleUserCss;
        syncStyleControlsFromState();
    }

    function previewThemePage(entry) {
        resetPendingThemeClear(); // a stale arm from the PREVIOUS theme must never carry over
        resetPendingLibraryDelete();
        activePreviewMode = 'theme';
        activeThemeEntry = entry;
        activeLibraryEntry = null; // Steve's template, unforked — the Pac ruling's "starting point"
        if (entry.cssb64) loadThemeOverrideIntoControls(entry);
        syncCanvasModeUI();
        loadThemePreviewFrame(entry);
    }

    // My Library (spec §B.3/§B.4) — previews the entry's BASE theme via the
    // exact same v3 machinery previewThemePage uses (loadThemePreviewFrame,
    // cssb64), but loads the library entry's OWN saved state/userCss into
    // the scratch controls instead of the base theme's default override.
    // Prefills the save-name input with this entry's name so hitting Save
    // again (unchanged name) updates it — typing a different name forks a
    // new entry, per the spec's "start from Steve, fork endlessly" workflow.
    function previewLibraryEntry(entry) {
        var baseEntry = findThemePageByFile(entry.baseTheme);
        if (!baseEntry) {
            setStyleStatus('Base theme for "' + entry.name + '" no longer exists in THEME_PAGES', true);
            return;
        }
        resetPendingThemeClear();
        resetPendingLibraryDelete();
        activePreviewMode = 'theme';
        activeThemeEntry = baseEntry;
        activeLibraryEntry = entry;
        styleState = JSON.parse(JSON.stringify(entry.state || {}));
        styleUserCss = entry.userCss || '';
        var ta = document.getElementById('arcade-style-usercss');
        if (ta) ta.value = styleUserCss;
        syncStyleControlsFromState();
        // v4: the save-to-library input prefills from activeLibraryEntry.name
        // itself (buildBrowseSaveRow), so no separate DOM write is needed here.
        syncCanvasModeUI();
        loadThemePreviewFrame(baseEntry);
    }

    function backToDockPreview() {
        resetPendingThemeClear();
        resetPendingLibraryDelete();
        activePreviewMode = 'dock';
        activeLibraryEntry = null;
        syncCanvasModeUI();
        loadActiveProfileIntoControls(); // undo any theme-mode scratch edits from view
        initStylePreviewFrame();
    }

    // session+loadlast=30 always ride along (spec §A.1) — loadlast is inert
    // on all 42 pages today (none read it, see the support-map comment) but
    // costs nothing and future-proofs a theme that adds it later; cssb64
    // only added when the entry's support-map boolean says the page actually
    // reads it.
    function buildThemePreviewParams(sessionId, entry) {
        var params = ['session=' + encodeURIComponent(sessionId), 'loadlast=30'];
        if (entry.cssb64) params.push('cssb64=' + encodeCssB64(buildStyleCss()));
        return params;
    }

    function loadThemePreviewFrame(entry) {
        var frame = document.getElementById('arcade-style-preview-frame');
        if (!frame) return;
        var resolver = window.resolveSocialStreamPage;
        var getSession = window.getChatDockSessionId;
        if (typeof resolver !== 'function' || typeof getSession !== 'function') {
            setStyleStatus('preview unavailable (app helpers not found)', true);
            return;
        }
        var myToken = ++stylePreviewSeedToken;
        setStylePreviewHint('Loading preview…');
        Promise.resolve(getSession()).then(function (sessionId) {
            if (!sessionId) { setStyleStatus('waiting for session…', false); return; }
            return resolver('themes/' + entry.file, { extraParams: buildThemePreviewParams(sessionId, entry) }).then(function (resolved) {
                if (myToken !== stylePreviewSeedToken) return; // superseded by a newer load
                if (resolved && resolved.url) {
                    frame.dataset.ssappOrigin = resolved.origin || '';
                    frame.onload = function () {
                        if (myToken !== stylePreviewSeedToken) return;
                        if (entry.cssb64) ensureLiveStyleTag(frame);
                        seedThemePreview(frame, entry, myToken);
                    };
                    frame.src = resolved.url;
                    setStyleStatus('', false);
                } else {
                    setStylePreviewHint('Could not load this theme page.');
                }
            });
        }).catch(function (e) {
            console.error('[arcade-shell] theme preview load failed:', e);
            setStyleStatus('preview failed — see console', true);
        });
    }

    // Empty-history fallback (spec §A.2): a theme page joins its OWN P2P
    // session the same way a real OBS browser source would (every one of the
    // 42 reads urlParams "session"/"room"/"roomid" — see the support-map
    // comment), so real chat shows up live with ZERO extra plumbing here —
    // that's honestly labelled as "connects live", not "seeded history".
    // Only when entry.seedable is true (source-verified: the page exposes a
    // dock.html-shaped processInput({recentHistory}) batch ingest — true for
    // NONE of the 42 today) do we attempt the SAME same-origin bridge
    // fallback (real history, then obviously-fake samples) v2 built for the
    // dock preview — reused verbatim via seedStylePreviewFromBridge, never a
    // per-theme reinvention (the law: "do NOT invent an ingest per theme").
    function seedThemePreview(frame, entry, token) {
        if (!entry.seedable) {
            setStylePreviewHint('This theme connects to your live session directly — connect chat to see it live (no history preview available here).');
            return;
        }
        var origin = frame.dataset.ssappOrigin || '';
        if (!LOCAL_ORIGIN_FAMILY[origin]) {
            setStylePreviewHint('Connect chat to see this theme live — no same-origin fallback available for this frame.');
            return;
        }
        setTimeout(function () {
            if (token !== stylePreviewSeedToken) return;
            seedStylePreviewFromBridge(frame, token);
        }, 1500);
    }

    function refreshThemeCustomChip(entry) {
        var slug = themeSlug(entry);
        var card = document.querySelector('.arcade-browse-card[data-theme-slug="' + slug + '"]');
        var chip = card && card.querySelector('.arcade-style-theme-chip--custom');
        if (chip) chip.hidden = !(entry.cssb64 && themeOverrides[slug]);
        syncCanvasModeUI(); // refreshes the shared clear-override button too
    }

    function refreshAllThemeCustomChips() {
        THEME_PAGES.forEach(function (entry) { refreshThemeCustomChip(entry); });
    }

    // Fire-and-honestly-confirm save for a per-theme override, shared by both
    // the Save button (theme mode, cssb64:true) and the clear-override
    // control (raw=''). onFail(true) means "sent but no confirmation";
    // onFail() with no arg means "bridge unavailable, nothing sent".
    function saveThemeOverrideRaw(entry, raw, onDone, onFail) {
        var slug = themeSlug(entry);
        if (!(window.ninjafy && typeof window.ninjafy.sendMessage === 'function')) {
            if (onFail) onFail();
            return;
        }
        var confirmed = false;
        window.ninjafy.sendMessage(null, { cmd: 'saveSetting', type: 'textparam1', setting: THEME_OVERRIDE_PREFIX + slug, value: raw }, function () {
            confirmed = true;
            if (raw) themeOverrides[slug] = raw; else delete themeOverrides[slug];
            if (onDone) onDone();
        });
        setTimeout(function () {
            if (!confirmed && onFail) onFail(true);
        }, 3000);
    }

    function saveActiveThemeOverride() {
        if (!activeThemeEntry || !activeThemeEntry.cssb64) return; // Save button is hidden in this state anyway — guard against a stale click
        var entry = activeThemeEntry;
        var isEmpty = Object.keys(styleState).length === 0 && !styleUserCss;
        var raw = isEmpty ? '' : buildStyleCss();
        setStyleStatus('Saving…', false);
        saveThemeOverrideRaw(entry, raw, function () {
            refreshThemeCustomChip(entry);
            setStyleStatus(raw ? "Saved ✓ — this theme’s Copy URL now includes your style" : 'Cleared ✓ — Copy URL is back to plain', false);
            setTimeout(function () { setStyleStatus('', false); }, 4000);
        }, function (sentNoConfirm) {
            setStyleStatus(sentNoConfirm ? 'Save sent — no confirmation received' : 'settings bridge unavailable — could not save', !sentNoConfirm);
        });
    }

    function resetPendingThemeClear() {
        if (pendingClearOverrideBtn) {
            pendingClearOverrideBtn.textContent = '×';
            pendingClearOverrideBtn.classList.remove('is-confirm');
        }
        pendingClearOverrideSlug = null;
        pendingClearOverrideBtn = null;
        clearTimeout(pendingClearOverrideTimer);
    }

    // Confirm-on-second-click, same shape as My Presets' delete arm.
    function armThemeOverrideClear(entry, btn) {
        var slug = themeSlug(entry);
        if (pendingClearOverrideSlug === slug) {
            resetPendingThemeClear();
            clearThemeOverride(entry);
            return;
        }
        resetPendingThemeClear();
        pendingClearOverrideSlug = slug;
        pendingClearOverrideBtn = btn;
        btn.textContent = '✓';
        btn.classList.add('is-confirm');
        btn.title = 'Click again to clear "' + entry.name + '" customization';
        pendingClearOverrideTimer = setTimeout(resetPendingThemeClear, 2800);
    }

    function clearThemeOverride(entry) {
        setStyleStatus('Clearing…', false);
        saveThemeOverrideRaw(entry, '', function () {
            refreshThemeCustomChip(entry);
            setStyleStatus('Cleared "' + entry.name + '" customization', false);
            if (activePreviewMode === 'theme' && activeThemeEntry === entry) {
                styleState = {};
                styleUserCss = '';
                var ta = document.getElementById('arcade-style-usercss');
                if (ta) ta.value = '';
                syncStyleControlsFromState();
                queueStylePreviewRefresh();
            }
            setTimeout(function () { setStyleStatus('', false); }, 4000);
        }, function (sentNoConfirm) {
            setStyleStatus(sentNoConfirm ? 'Clear sent — no confirmation received' : 'settings bridge unavailable — could not clear', !sentNoConfirm);
        });
    }

    // --------------------------------------------------------------------
    // S30 — "Save as theme…" (TASK-28, exportable themes follow-up). Turns
    // the CURRENT style-tab state into a standalone theme HTML file in the
    // house wrapper family (same shape as themes/pretty.html and
    // themes/Neutron/chatOnly.html: a thin page that embeds the stock
    // dock.html and feeds it the style as dock.html's own &b64css param).
    //
    // Truths honored:
    // - The payload is buildStyleCss()'s EXACT blob — the managed
    //   :root{…} overrides plus the operator's Custom CSS VERBATIM
    //   (STYLE_USER_MARK section) — so the file captures the current state,
    //   unsaved in-progress edits included, byte-identical to what Save
    //   style would persist.
    // - The baked display params are the SAME per-profile preview sets the
    //   canvas uses (ARCADE_WIDGET_PREVIEW_PARAMS /
    //   ARCADE_DOCK_APP_PREVIEW_PARAMS) — a bare dock.html would NOT
    //   reproduce the previewed look (bubble/twolines/darkmode etc. ride
    //   those params, not the css blob).
    // - NO session id is ever written into the file: the wrapper reads
    //   session from its own URL at runtime, exactly like every stock theme
    //   (masking law — a theme file is a shareable artifact).
    // - NO network anywhere in the export path: pure in-page string
    //   building; the only reference inside the file is the relative
    //   ../dock.html, the same link every wrapper theme makes.
    // - Delivery uses the app's OWN download idiom (Blob + temporary
    //   anchor click — index.html:13503's session export, chathistory.js:
    //   837): under Electron this lands in the native save dialog (main.js:
    //   8889's will-download only auto-paths autorecord/savefolder
    //   downloads). The file is NOT auto-installed into themes/ and the
    //   THEME_PAGES registry is NOT touched — installation is the
    //   operator's act; the how-to rides inside the file's header comment.
    // - Dock profiles only: hidden in theme mode (syncCanvasModeUI) — the
    //   wrapper embeds dock.html, so it could not honor a theme page's
    //   override, and a file that can't reproduce the canvas would be a lie.
    // --------------------------------------------------------------------
    var THEME_EXPORT_FILENAME = 'my-dock-theme.html';

    // Builds the standalone theme page around the baked css blob. ES5 inside
    // the generated file (the bundle's Chrome-80 law — see the fallback
    // bundle's AGENTS.md), URLSearchParams polyfill + getById + param
    // passthroughs verbatim in kind from pretty.html/chatOnly.html.
    function buildThemeFileHtml(cssBlob, baseParams) {
        // JSON.stringify is a safe JS string literal; the <\/ escape stops an
        // operator's Custom CSS containing "</script>" from closing the
        // generated file's own script element early.
        var bakedLiteral = JSON.stringify(cssBlob).replace(/<\//g, '<\\/');
        var paramString = baseParams.length ? '&' + baseParams.join('&') : '';
        var lines = [
            '<!DOCTYPE html>',
            '<!--',
            '  GENERATED THEME — exported from Pac\'s Arcade style tab ("Save as theme…").',
            '',
            '  Shape: the house wrapper family (same pattern as themes/pretty.html and',
            '  themes/Neutron/chatOnly.html) — a thin standalone page that embeds the',
            '  stock dock.html one directory up and feeds it your style as dock.html\'s',
            '  own &b64css parameter. The baked style below is the exact blob the style',
            '  tab held at export time (the managed :root{…} overrides + your Custom CSS,',
            '  verbatim), and the baked display params are the style tab\'s own preview',
            '  set for the exported profile — edit either freely, it\'s your file now.',
            '',
            '  INSTALL (the exporter deliberately does NOT do this for you):',
            '    1. Move/copy this file into the bundle\'s themes/ directory',
            '       (resources/social_stream_fallback/main/themes/).',
            '    2. Optional — to list it in the shell\'s Browse Looks modal, add ONE',
            '       entry to THEME_PAGES in arcade-shell.js:',
            '         { name: \'My Theme\', file: \'' + THEME_EXPORT_FILENAME + '\', cssb64: true, seedable: false, target: \'chat\' }',
            '       `target` convention: \'chat\' — this wrapper feeds dock.html, a',
            '       chat-dock page. cssb64: true because an incoming override',
            '       (b64css/cssb64/cssbase64/base64css, or raw css=) REPLACES the',
            '       baked style whole, so the style tab can keep re-styling it.',
            '',
            '  URL PARAMETERS:',
            '    session=ID          (required) your Social Stream session id — never',
            '                        baked into this file; supplied at runtime like any',
            '                        stock theme page',
            '    password=PASS       optional room password (aliases: pass, pw)',
            '    showtime=MS         auto-hide messages after MS ms',
            '    server / server2 / server3 / localserver   websocket transports',
            '    hidebots            hide bot-flagged messages',
            '    chroma=HEX          solid page background for chroma keying',
            '    b64css / cssb64 / base64css / cssbase64    style override (replaces baked)',
            '    css=CSS             raw style override (replaces baked)',
            '-->',
            '<html lang="en">',
            '<head>',
            '<meta charset="utf-8">',
            '<meta name="viewport" content="width=device-width,initial-scale=1" />',
            '<title>My dock theme — Pac\'s Arcade export</title>',
            '<style>',
            'html, body { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #0000; overflow: hidden; }',
            '#chatframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; background-color: #0000; }',
            '</style>',
            '</head>',
            '<body>',
            '<iframe id="chatframe" title="Chat dock"></iframe>',
            '<script>',
            'function getById(id){ return document.getElementById(id) || document.createElement("span"); }',
            '(function (w) {',
            '    w.URLSearchParams = w.URLSearchParams || function (searchString) {',
            '        var self = this;',
            '        self.searchString = searchString;',
            '        self.get = function (name) {',
            '            var results = new RegExp(\'[\\?&]\' + name + \'=([^&#]*)\').exec(self.searchString);',
            '            if (results == null) { return null; }',
            '            return decodeURI(results[1]) || 0;',
            '        };',
            '        self.has = function (name) { return self.get(name) !== null; };',
            '    };',
            '})(window);',
            'var urlParams = new URLSearchParams(window.location.search);',
            '',
            '// The exported style, verbatim (pacs-arcade style-builder blob).',
            'var BAKED_STYLE_CSS = ' + bakedLiteral + ';',
            '',
            '// The style tab\'s preview display params for the exported profile —',
            '// these are part of the look you saw on the canvas.',
            'var params = "' + paramString + '";',
            '',
            'if (urlParams.has("showtime")){ params += "&showtime=" + urlParams.get("showtime"); }',
            'var password = urlParams.get("password") || urlParams.get("pass") || urlParams.get("pw");',
            'if (password){ params += "&password=" + encodeURIComponent(password); }',
            '["server", "server2", "server3", "localserver"].forEach(function(key){',
            '    if (!urlParams.has(key)) return;',
            '    var value = urlParams.get(key);',
            '    params += value ? "&" + key + "=" + encodeURIComponent(value) : "&" + key;',
            '});',
            'if (urlParams.has("hidebots")){ params += "&hidebots"; }',
            'if (urlParams.has("chroma")){',
            '    var _c = urlParams.get("chroma") || "";',
            '    document.body.style.backgroundColor = _c.charAt(0) === "#" ? _c : "#" + _c;',
            '}',
            '',
            '// Style hand-off: an incoming override (any b64css alias, or raw css=)',
            '// REPLACES the baked style whole; otherwise the baked export wins.',
            '// Encode order matches the popup\'s URL builder (encodeURIComponent,',
            '// btoa, outer encodeURIComponent) — dock.html decodes atob-then-',
            '// decodeURIComponent.',
            'var _overrideB64 = urlParams.get("base64css") || urlParams.get("b64css") || urlParams.get("cssbase64") || urlParams.get("cssb64");',
            'var _overrideRaw = urlParams.get("css");',
            'if (_overrideRaw){',
            '    params += "&css=" + encodeURIComponent(_overrideRaw);',
            '} else if (_overrideB64){',
            '    params += "&b64css=" + encodeURIComponent(_overrideB64);',
            '} else {',
            '    params += "&b64css=" + encodeURIComponent(btoa(encodeURIComponent(BAKED_STYLE_CSS)));',
            '}',
            '',
            'if (urlParams.has("session")){',
            '    getById("chatframe").src = "../dock.html?session=" + encodeURIComponent(urlParams.get("session")) + params;',
            '}',
            '</scr' + 'ipt>',
            '</body>',
            '</html>',
            ''
        ];
        return lines.join('\n');
    }

    function exportStyleAsTheme() {
        if (activePreviewMode !== 'dock') return; // button is hidden in theme mode — guard a stale click
        var isEmpty = Object.keys(styleState).length === 0 && !styleUserCss;
        if (isEmpty) {
            setStyleStatus('Nothing styled yet — an exported theme of plain stock would be an empty file\'s worth of look', true);
            return;
        }
        try {
            var blob = buildStyleCss(); // current scratch state — unsaved edits included
            var baseParams = (activeStyleProfile === 'dock' ? ARCADE_DOCK_APP_PREVIEW_PARAMS : ARCADE_WIDGET_PREVIEW_PARAMS).slice();
            var html = buildThemeFileHtml(blob, baseParams);
            var file = new Blob([html], { type: 'text/html' });
            var url = URL.createObjectURL(file);
            var a = document.createElement('a');
            a.href = url;
            a.download = THEME_EXPORT_FILENAME;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setStyleStatus('Theme file downloaded (' + THEME_EXPORT_FILENAME + ') — drop it into the bundle\'s themes/ dir to install; how-to is inside the file', false);
            setTimeout(function () { setStyleStatus('', false); }, 6000);
        } catch (e) {
            console.error('[arcade-shell] theme export failed:', e);
            setStyleStatus('Theme export failed — see console', true);
        }
    }

    function saveStyleBlob() {
        if (activePreviewMode === 'theme') { saveActiveThemeOverride(); return; }
        // Nothing set + no user CSS ⇒ save a true '' so the setting fully
        // clears — "Stock → Save" genuinely returns to stock instead of
        // leaving a machine comment in the popup textarea and every dock
        // URL forever (gate fix #3).
        var isEmpty = Object.keys(styleState).length === 0 && !styleUserCss;
        var raw = isEmpty ? '' : buildStyleCss();
        var profile = activeStyleProfile;
        var saveKey = STYLE_PROFILE_SAVE_KEY[profile];
        try {
            if (!(window.ninjafy && typeof window.ninjafy.sendMessage === 'function')) {
                setStyleStatus('settings bridge unavailable — could not save', true);
                return;
            }
            setStyleStatus('Saving…', false);
            var confirmed = false;
            window.ninjafy.sendMessage(null, { cmd: 'saveSetting', type: 'textparam1', setting: saveKey, value: raw }, function () {
                confirmed = true;
                styleProfileSavedRaw[profile] = raw; // keep the dirty-check baseline accurate post-save
                // Honest, profile-specific claim: DOCK (APP) governs the
                // embedded app dock (getSavedDockCustomCss reads arcadeDockCss
                // FIRST), so saving it visibly updates that view; STREAM
                // WIDGET only ever reaches OBS once its dock URL is re-copied
                // — it doesn't live-sync into an already-pasted URL, and it
                // may not even be what the embedded app dock is showing if a
                // DOCK (APP) override already exists.
                var msg = profile === 'dock'
                    ? 'Saved ✓ — embedded app dock updated'
                    : 'Saved ✓ — the OBS-copied dock URL will use this once re-copied';
                setStyleStatus(msg, false);
                try {
                    if (typeof window.ensureChatDockLoaded === 'function') window.ensureChatDockLoaded(true);
                } catch (e) { /* noop */ }
                setTimeout(function () { setStyleStatus('', false); }, 4000);
            });
            // Honest fallback: if the save path never answers, say so rather
            // than claiming success.
            setTimeout(function () {
                if (!confirmed) setStyleStatus('Save sent — confirm under Global settings → Custom CSS', false);
            }, 3000);
        } catch (e) {
            console.error('[arcade-shell] style save failed:', e);
            setStyleStatus('Save failed — see console', true);
        }
    }

    // --------------------------------------------------------------------
    // Right rail: ANALYTICS dock (default tab — round-4 decision).
    //
    // The analytics IPC bridge (pacsarcade design-briefs/ssn-ui-overhaul/
    // analytics-ipc-bridge-spec.md): index.html already embeds background.js
    // same-origin in the #frame2 iframe and reads plain globals off its
    // contentWindow (frame2.contentWindow.streamID — see getChatDockSessionId
    // above in index.html). background.js/db.js load as classic <script>
    // tags, so their top-level `function` declarations are real window
    // globals on that frame too. Four of them carry genuinely real analytics
    // data with zero app-repo-only workaround available:
    //   - getLastMessagesDB(limit)  → db.js — the same IndexedDB chat-history
    //     store points.js already queries for its own leaderboards. Every
    //     stored row already carries real .timestamp / .event / .chatname /
    //     .firsttime fields set by background.js's existing pipeline —
    //     nothing new is computed, only read. firsttime chatters + raids
    //     (event === "raid", carries the real raider's chatname on every
    //     platform that sends raids) + the recent-notifications feed are
    //     all derived from this one call.
    //   - buildViewerCountsFromMetaStore() → background.js — already-real,
    //     already-live (feeds stock hypemode when it's on) per-platform
    //     viewer totals from metaDataStore. "Peak viewers" is genuinely
    //     derived (running max since THIS shell boot, never fabricated).
    //   - buildFollowerCountsFromMetaStore() → background.js, ONE new
    //     additive function this task adds (mirrors buildViewerCounts...'s
    //     shape/gating exactly) — metaDataStore already held real per-
    //     platform follower TOTALS (Twitch Helix poll, Kick follow-event
    //     summary) in a `const` that just wasn't reachable from outside the
    //     frame; this is the one line of "expose it" the spec asks for.
    //   - getSettingFlag(key) → background.js — used to tell "genuinely
    //     zero" apart from "tracking is off", so a 0 is never shown where
    //     the honest label is "not tracked".
    //
    // HOURS WATCHED (viewer-hours) is the honest watch-time metric: the
    // integral of concurrent viewers over airtime, accumulated from the same
    // real buildViewerCountsFromMetaStore() samples PEAK VIEWERS uses (~20s
    // step, left-Riemann — the previous sample's viewer total is credited for
    // the interval up to the next sample). Genuinely derived, never fabricated,
    // and — like peak viewers — SINCE BOOT only (no viewer history predates
    // this shell), so its sub says "since boot · est" and it does NOT honor the
    // period selector. Confirmed by a points.js trace (0018.05.25): SSN has NO
    // native per-user watch-time — the points system (enablePointsSystem) is
    // message-engagement-based (points per ~15min engagement window on chat
    // activity; no presence timer, no watchtime field, no importer). Documented
    // follow-ups, not faked here: (a) per-user watchtimeMinutes accrual in the
    // points store, seedable from the rescued Botrix loyalty export
    // (pacsarcade overlays-import/botrix/loyalty-export-2026-08-17.json,
    // top-100 Kick, watchtimeMinutes per user); (b) an external stream-data
    // source (streamscharts-style) for pre-boot aggregate history.
    // Stays an honest "—" until the first sample.
    //
    // FOLLOWER DELTA and PEAK VIEWERS are real numbers but NOT period-windowed
    // (metaDataStore only ever holds the latest snapshot, no history before
    // this shell booted) — their subs say "since boot"/"this session" rather
    // than pretending to honor Today/7d/30d. FIRST-TIME CHATTERS and RAIDS
    // RECEIVED genuinely DO honor the period selector (every stored message
    // carries a real timestamp; the DB itself only retains 30 days, so "30d"
    // is the natural ceiling).
    // --------------------------------------------------------------------
    function buildAnalyticsPaneMarkup() {
        return (
            '<div class="arcade-panel-head"><span class="arcade-panel-title">ANALYTICS</span></div>' +
            '<div class="arcade-panel-body">' +
            // S41 — the ON-AIR strip. Three honest states driven by REAL OBS
            // stream events only (background.js records the last one the flow
            // engine saw on window.__ssnObsStreamState): ON AIR / OFF AIR /
            // UNKNOWN — the dash-face until the first event arrives, which is
            // also what "the actions.html↔OBS link isn't up" looks like from
            // here. Never guessed; the dash law applies to stream state too.
            '<div class="arcade-onair" id="arcade-onair" data-onair="unknown" role="status" aria-live="polite">' +
            '<span class="arcade-onair__dot" aria-hidden="true"></span>' +
            '<span class="arcade-onair__label" id="arcade-onair-label">—</span>' +
            '<span class="arcade-onair__sub" id="arcade-onair-sub">OBS link not seen — arm actions.html (&obsws=)</span>' +
            '</div>' +
            '<div class="arcade-period-row">' +
            '<span class="arcade-k">PERIOD</span>' +
            '<div class="arcade-seg" role="group" aria-label="Analytics period" id="arcade-period-seg">' +
            '<button type="button" class="is-on" data-arcade-period="today" aria-pressed="true">Today</button>' +
            '<button type="button" data-arcade-period="7d" aria-pressed="false">7d</button>' +
            '<button type="button" data-arcade-period="30d" aria-pressed="false">30d</button>' +
            '</div></div>' +
            '<div class="arcade-statgrid">' +
            '<div class="arcade-stat"><span class="arcade-stat__label">HOURS WATCHED</span>' +
            '<span class="arcade-stat__value arcade-fx-ticker is-dash" id="arcade-stat-watch-value">—</span><span class="arcade-stat__sub" id="arcade-stat-watch-sub">connecting…</span></div>' +
            '<div class="arcade-stat"><span class="arcade-stat__label">PEAK VIEWERS</span>' +
            '<span class="arcade-stat__value arcade-fx-ticker is-dash" id="arcade-stat-peak-value">—</span><span class="arcade-stat__sub" id="arcade-stat-live-sub">now — · 0 live</span></div>' +
            '<div class="arcade-stat"><span class="arcade-stat__label">FIRST-TIME CHATTERS</span>' +
            '<span class="arcade-stat__value arcade-fx-ticker is-dash" id="arcade-stat-firsttime-value">—</span><span class="arcade-stat__sub" id="arcade-stat-firsttime-sub">connecting…</span></div>' +
            '<div class="arcade-stat"><span class="arcade-stat__label">RAIDS RECEIVED</span>' +
            '<span class="arcade-stat__value arcade-fx-ticker is-dash" id="arcade-stat-raids-value">—</span><span class="arcade-stat__sub" id="arcade-stat-raids-sub">last: —</span></div>' +
            '</div>' +
            '<div class="arcade-field"><label>FOLLOWER DELTA</label><span class="arcade-field__hint">Δ since this session started — no historical archive yet</span></div>' +
            '<ul class="arcade-frow-list" id="arcade-follower-rows"></ul>' +
            '<div class="arcade-field"><label>RECENT NOTIFICATIONS</label><span class="arcade-field__hint">latest from chat history, any period</span></div>' +
            '<div id="arcade-notifications"><div class="arcade-nrow-empty arcade-fx-grid" id="arcade-nrow-empty">Waiting on the background bridge — raids, follows, and ' +
            'donations live in the chat-history store (background.js/db.js); this reads it via frame2, not a fabricated feed.</div>' +
            '<ul class="arcade-nrow-list" id="arcade-nrow-list" hidden></ul></div>' +
            '</div>'
        );
    }

    function initAnalyticsPeriodSelector(side) {
        var seg = side.querySelector('#arcade-period-seg');
        if (!seg) return;
        seg.addEventListener('click', function (e) {
            var btn = e.target.closest('button[data-arcade-period]');
            if (!btn || !seg.contains(btn)) return;
            seg.querySelectorAll('button').forEach(function (b) {
                var on = b === btn;
                b.classList.toggle('is-on', on);
                b.setAttribute('aria-pressed', String(on));
            });
            arcadeAnalytics.period = btn.dataset.arcadePeriod || 'today';
            // Only FIRST-TIME CHATTERS / RAIDS RECEIVED / last-raider actually
            // re-derive from the period — see the big comment above
            // buildAnalyticsPaneMarkup() for which tiles honor this and why
            // the rest (peak viewers, follower delta) intentionally don't.
            renderArcadeAnalytics();
        });
    }

    function platformBadge(target) {
        var t = String(target || '').trim();
        return t ? t.slice(0, 2).toUpperCase() : '--';
    }

    function renderAnalyticsFollowerRows() {
        var list = document.getElementById('arcade-follower-rows');
        if (!list || !window.stateManager || typeof window.stateManager.getSources !== 'function') return;
        var sources = window.stateManager.getSources() || [];
        list.innerHTML = '';
        if (!sources.length) {
            var empty = document.createElement('li');
            empty.className = 'arcade-src-empty arcade-fx-grid'; // S44 M5 — arcade-native empty state
            empty.textContent = 'No sources configured yet.';
            list.appendChild(empty);
            return;
        }
        sources.forEach(function (source) {
            var li = document.createElement('li');
            li.className = 'arcade-frow';
            li.dataset.arcadeFollowerTarget = source.target || '';
            li.innerHTML =
                '<span class="arcade-pill arcade-pill--mono">' + platformBadge(source.target) + '</span>' +
                '<span class="arcade-frow__label"></span>' +
                '<span class="arcade-frow__total arcade-fx-ticker">—</span>' +
                '<span class="arcade-frow__delta arcade-fx-ticker">—</span>';
            li.querySelector('.arcade-frow__label').textContent = sourceDisplayName(source);
            list.appendChild(li);
        });
        renderFollowerTotals(); // fill in whatever the bridge already has (no-op if nothing yet)
    }

    // --------------------------------------------------------------------
    // Analytics bridge: read-only globals off background.js's own window
    // (via the #frame2 iframe already embedded by index.html), same-origin
    // access pattern index.html itself already uses for frame2.contentWindow
    // .streamID. Never posts/writes anything into that frame — pure reads.
    // --------------------------------------------------------------------
    function getBackgroundWindow() {
        try {
            var frame = document.getElementById('frame2');
            return (frame && frame.contentWindow) || null;
        } catch (e) {
            return null;
        }
    }

    function periodCutoffMs(period) {
        var now = Date.now();
        if (period === '7d') return now - 7 * 24 * 60 * 60 * 1000;
        if (period === '30d') return now - 30 * 24 * 60 * 60 * 1000;
        var startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        return startOfToday.getTime();
    }

    var NOTABLE_EVENTS = { raid: 'RAID', new_follower: 'FOLLOW', follow: 'FOLLOW', new_subscriber: 'SUB', resub: 'SUB', member: 'SUB', host: 'HOST', hosting: 'HOST' };

    function notificationKind(message) {
        if (message.hasDonation) return 'DONO';
        var ev = typeof message.event === 'string' ? message.event.toLowerCase() : '';
        return NOTABLE_EVENTS[ev] || null;
    }

    function relativeTime(ts) {
        var deltaSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
        if (deltaSec < 60) return deltaSec + 's ago';
        if (deltaSec < 3600) return Math.round(deltaSec / 60) + 'm ago';
        if (deltaSec < 86400) return Math.round(deltaSec / 3600) + 'h ago';
        return Math.round(deltaSec / 86400) + 'd ago';
    }

    function renderArcadeAnalytics() {
        renderAnalyticsMessagesDerived();
        renderAnalyticsPeakViewers();
        renderWatchTime();
        renderFollowerTotals();
    }

    // Hours watched — viewer-hours (∫ concurrent viewers dt), the honest
    // watch-time metric (see the big comment above buildAnalyticsPaneMarkup).
    // accumulateHoursWatched credits the PREVIOUS sample's viewer total for the
    // interval since it was taken (left-Riemann over the ~20s poll); it accrues
    // nothing while viewers are 0. renderWatchTime shows viewer-hours, honest
    // dash until the first sample. SINCE BOOT only — no period windowing.
    function accumulateHoursWatched(total) {
        var now = Date.now();
        if (arcadeAnalytics.watchLastSampleAt != null) {
            var dt = now - arcadeAnalytics.watchLastSampleAt;
            if (dt > 0) arcadeAnalytics.watchViewerMs += arcadeAnalytics.watchLastTotal * dt;
        }
        arcadeAnalytics.watchLastSampleAt = now;
        arcadeAnalytics.watchLastTotal = total;
        arcadeAnalytics.watchReady = true;
    }

    function formatViewerHours(h) {
        if (h <= 0) return '0';
        if (h < 10) return h.toFixed(1);           // 0.0–9.9 viewer-hours
        if (h < 1000) return String(Math.round(h));
        return (h / 1000).toFixed(1) + 'k';
    }

    // --------------------------------------------------------------------
    // S44 / M3 — number ticker (house port of MagicUI's "number-ticker",
    // MIT — magicui.design; ~15-line vanilla-JS core, no library). rAF
    // count-up, cubic ease-out, digits kept tabular by .arcade-fx-ticker.
    // The honest-data laws applied to motion:
    //   * animates TO a number the app actually has, and only FROM the
    //     previous REAL value — a dash stays a dash: the first real sample
    //     after a dash-face lands instantly (no invented from-0 run), and
    //     dropping back to unknown is an instant dash, never animated.
    //   * re-ticks only on value change — same target is a no-op; nothing
    //     here runs on an interval (the analytics poll drives it).
    //   * count-UP only: a decrease jumps straight to the new real number
    //     rather than running the motion backwards (the meteor lesson).
    //   * prefers-reduced-motion: reduce -> jump to the final number.
    // Portable: engages on any element carrying .arcade-fx-ticker, driven
    // purely by the values the renderers hand it — re-home = one className.
    // --------------------------------------------------------------------
    var arcadeFxTickerState = (typeof WeakMap === 'function') ? new WeakMap() : null;

    function arcadeFxReducedMotion() {
        try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
    }

    function arcadeFxFormatInt(v) { return String(Math.round(v)); }
    function arcadeFxFormatDelta(v) { var r = Math.round(v); return (r > 0 ? '+' : '') + String(r); }

    function arcadeFxSetNumber(el, target, format) {
        if (!el) return;
        var fmt = format || arcadeFxFormatInt;
        if (!arcadeFxTickerState || !el.classList || !el.classList.contains('arcade-fx-ticker') || typeof requestAnimationFrame !== 'function') {
            el.textContent = (target == null || !isFinite(target)) ? '—' : fmt(target);
            return;
        }
        var st = arcadeFxTickerState.get(el) || { value: null, raf: 0 };
        // Same committed target = pure no-op, BEFORE any cancel: the renderers
        // legitimately call this twice per poll for one element (the messages
        // branch's renderArcadeAnalytics + the viewer/follower branch's own
        // render), and the second call must not kill a count already running.
        if (target != null && isFinite(target) && st.value === target) return;
        if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
        if (target == null || !isFinite(target)) {
            st.value = null; // into-dash: instant, and the real anchor is forgotten
            el.textContent = '—';
        } else if (st.value === null || target <= st.value || arcadeFxReducedMotion()) {
            st.value = target; // first real sample / decrease / reduced motion: instant
            el.textContent = fmt(target);
        } else {
            var from = st.value, t0 = 0;
            st.value = target; // commit the real target now — re-ticks compare against it
            st.raf = requestAnimationFrame(function step(now) {
                if (!t0) t0 = now;
                var p = Math.min(1, (now - t0) / 700);
                el.textContent = fmt(from + (target - from) * (1 - Math.pow(1 - p, 3)));
                st.raf = p < 1 ? requestAnimationFrame(step) : 0;
            });
        }
        arcadeFxTickerState.set(el, st);
    }

    function renderWatchTime() {
        var valEl = document.getElementById('arcade-stat-watch-value');
        var subEl = document.getElementById('arcade-stat-watch-sub');
        if (!valEl) return;
        if (!arcadeAnalytics.watchReady) return; // honest dash / "connecting…" until first sample
        arcadeFxSetNumber(valEl, arcadeAnalytics.watchViewerMs / 3600000, formatViewerHours); // S44 M3 — tick TO the real accrued value
        valEl.classList.remove('is-dash');
        if (subEl) subEl.textContent = 'since boot · est';
    }

    // --------------------------------------------------------------------
    // S41 — ON-AIR strip render. Reads the last REAL OBS stream event the
    // flow engine processed (background.js's __ssnObsStreamState, written in
    // processEventFlowBridgeEvent) off the same frame2 analytics bridge the
    // tiles use — pure read, never a write into that frame. Three states:
    //   live    — an obs stream_started event was seen (obsStreamStarted)
    //   offline — an obs stream_stopped event was seen (obsStreamStopped)
    //   unknown — no OBS event since background boot: either the actions.html
    //             overlay isn't armed (&obsws=) or the OBS link is down.
    //             Dash-face, never a guess — the dash law applies to stream
    //             state too. Known honest limit: if the OBS link DIES
    //             mid-stream no stopped event can arrive, so the strip keeps
    //             showing the last observed state (documented in the S41
    //             report; stream state has no stale-wipe anchor like time).
    // --------------------------------------------------------------------
    function formatOnAirClock(ts) {
        var d = new Date(ts);
        if (isNaN(d.getTime())) return '--:--';
        var hh = String(d.getHours()).padStart(2, '0');
        var mm = String(d.getMinutes()).padStart(2, '0');
        return hh + ':' + mm;
    }

    function renderOnAirStrip() {
        var strip = document.getElementById('arcade-onair');
        var labelEl = document.getElementById('arcade-onair-label');
        var subEl = document.getElementById('arcade-onair-sub');
        if (!strip || !labelEl || !subEl) return;
        var bg = getBackgroundWindow();
        var obs = null;
        try { obs = bg && bg.__ssnObsStreamState; } catch (e) { obs = null; }
        var state = (obs && (obs.state === 'live' || obs.state === 'offline') && typeof obs.at === 'number')
            ? obs.state
            : 'unknown';
        strip.dataset.onair = state;
        // S44 M2 — border beam. The class IS the whole effect (portability
        // law); toggled here, off this same `state` reading — one driver,
        // never a second read of the OBS truth. Idle/unknown: no class, no
        // beam, nothing moves.
        strip.classList.toggle('arcade-fx-beam', state === 'live');
        if (state === 'live') {
            labelEl.textContent = 'ON AIR';
            subEl.textContent = 'since ' + formatOnAirClock(obs.at) + ' · obs-websocket';
        } else if (state === 'offline') {
            labelEl.textContent = 'OFF AIR';
            subEl.textContent = 'as of ' + formatOnAirClock(obs.at) + ' · obs-websocket';
        } else {
            labelEl.textContent = '—';
            subEl.textContent = 'OBS link not seen — arm actions.html (&obsws=)';
        }
    }

    function renderAnalyticsMessagesDerived() {
        var firstValueEl = document.getElementById('arcade-stat-firsttime-value');
        var firstSubEl = document.getElementById('arcade-stat-firsttime-sub');
        var raidsValueEl = document.getElementById('arcade-stat-raids-value');
        var raidsSubEl = document.getElementById('arcade-stat-raids-sub');
        var emptyEl = document.getElementById('arcade-nrow-empty');
        var listEl = document.getElementById('arcade-nrow-list');
        if (!firstValueEl || !raidsValueEl || !listEl || !emptyEl) return;

        if (!arcadeAnalytics.messagesReady) return; // leave the honest "connecting…" / dash state up

        var bg = getBackgroundWindow();
        var firsttimersOn = false, dbOn = true;
        try {
            if (bg && typeof bg.getSettingFlag === 'function') {
                firsttimersOn = !!bg.getSettingFlag('firsttimers');
                dbOn = !bg.getSettingFlag('disableDB');
            }
        } catch (e) { /* leave defaults */ }

        var periodLabel = arcadeAnalytics.period === '7d' ? '7d' : (arcadeAnalytics.period === '30d' ? '30d' : 'today');
        var cutoff = periodCutoffMs(arcadeAnalytics.period);
        var messages = arcadeAnalytics.messages || [];

        if (!dbOn) {
            arcadeFxSetNumber(firstValueEl, null); // S44 M3 — into-dash: instant, never animated
            firstValueEl.classList.add('is-dash');
            firstSubEl.textContent = 'chat-history store is off';
        } else if (!firsttimersOn) {
            arcadeFxSetNumber(firstValueEl, null);
            firstValueEl.classList.add('is-dash');
            firstSubEl.textContent = 'first-timers setting is off';
        } else {
            var firstCount = 0;
            for (var i = 0; i < messages.length; i++) {
                if (messages[i].firsttime === true && messages[i].timestamp >= cutoff) firstCount++;
            }
            arcadeFxSetNumber(firstValueEl, firstCount); // S44 M3 — real count from chat history
            firstValueEl.classList.remove('is-dash');
            firstSubEl.textContent = periodLabel + ' · from chat history';
        }

        var raids = [];
        if (dbOn) {
            for (var j = 0; j < messages.length; j++) {
                if (messages[j].event === 'raid' && messages[j].timestamp >= cutoff) raids.push(messages[j]);
            }
        }
        arcadeFxSetNumber(raidsValueEl, dbOn ? raids.length : null); // S44 M3 — real raid count, or an instant honest dash
        raidsValueEl.classList.toggle('is-dash', !dbOn);
        var lastRaider = raids.length ? (raids[0].chatname || raids[0].displayName || 'unknown') : null;
        raidsSubEl.textContent = dbOn ? ('last: ' + (lastRaider || '—')) : 'chat-history store is off';

        var notable = [];
        if (dbOn) {
            for (var k = 0; k < messages.length && notable.length < 8; k++) {
                var kind = notificationKind(messages[k]);
                if (kind) notable.push({ kind: kind, msg: messages[k] });
            }
        }
        if (!notable.length) {
            emptyEl.hidden = false;
            emptyEl.textContent = dbOn
                ? 'No raids, follows, subs, or donations in the stored chat history yet.'
                : 'Chat-history store is off (disableDB) — no notification feed to read from.';
            listEl.hidden = true;
            listEl.innerHTML = '';
        } else {
            emptyEl.hidden = true;
            listEl.hidden = false;
            listEl.innerHTML = '';
            notable.forEach(function (entry) {
                var li = document.createElement('li');
                li.className = 'arcade-nrow arcade-nrow--' + entry.kind.toLowerCase();
                var who = entry.msg.chatname || entry.msg.displayName || 'someone';
                var detail = entry.kind === 'DONO' ? (entry.msg.hasDonation || '') : '';
                li.innerHTML =
                    '<span class="arcade-pill arcade-nrow__kind">' + entry.kind + '</span>' +
                    '<span class="arcade-nrow__who"></span>' +
                    '<span class="arcade-nrow__detail"></span>' +
                    '<span class="arcade-nrow__time"></span>';
                li.querySelector('.arcade-nrow__who').textContent = who;
                li.querySelector('.arcade-nrow__detail').textContent = detail;
                li.querySelector('.arcade-nrow__time').textContent = relativeTime(entry.msg.timestamp || Date.now());
                listEl.appendChild(li);
            });
        }
    }

    function renderAnalyticsPeakViewers() {
        var peakEl = document.getElementById('arcade-stat-peak-value');
        var subEl = document.getElementById('arcade-stat-live-sub');
        if (!subEl) return;
        var liveCount = 0;
        try {
            var sources = window.stateManager && window.stateManager.getSources ? (window.stateManager.getSources() || []) : [];
            liveCount = sources.filter(function (s) { return s.status === 'active'; }).length;
        } catch (e) { /* leave 0 */ }

        if (!arcadeAnalytics.viewersReady) {
            subEl.textContent = 'now — · ' + liveCount + ' live';
            return;
        }
        var total = 0;
        Object.keys(arcadeAnalytics.viewerCounts).forEach(function (k) {
            total += parseInt(arcadeAnalytics.viewerCounts[k], 10) || 0;
        });
        if (peakEl) {
            arcadeFxSetNumber(peakEl, arcadeAnalytics.peakViewers); // S44 M3 — real peak only
            peakEl.classList.remove('is-dash');
        }
        subEl.textContent = 'now ' + total + ' · ' + liveCount + ' live · since boot';
    }

    function renderFollowerTotals() {
        var rows = document.querySelectorAll('#arcade-follower-rows .arcade-frow');
        if (!rows.length) return;
        rows.forEach(function (row) {
            var target = row.dataset.arcadeFollowerTarget || '';
            var totalEl = row.querySelector('.arcade-frow__total');
            var deltaEl = row.querySelector('.arcade-frow__delta');
            if (!totalEl || !deltaEl) return;
            if (!arcadeAnalytics.followersReady || !(target in arcadeAnalytics.followerCounts)) {
                arcadeFxSetNumber(totalEl, null); // S44 M3 — dash stays a dash
                arcadeFxSetNumber(deltaEl, null);
                return;
            }
            var total = arcadeAnalytics.followerCounts[target];
            var baseline = arcadeAnalytics.followerBaseline[target];
            var delta = (typeof baseline === 'number') ? (total - baseline) : 0;
            arcadeFxSetNumber(totalEl, total); // S44 M3 — real metaStore readings
            arcadeFxSetNumber(deltaEl, delta, arcadeFxFormatDelta);
            deltaEl.classList.toggle('arcade-frow__delta--up', delta > 0);
            deltaEl.classList.toggle('arcade-frow__delta--down', delta < 0);
        });
    }

    function pollArcadeAnalytics() {
        var bg = getBackgroundWindow();
        renderOnAirStrip(); // S41 — OBS stream state; renders UNKNOWN honestly even when frame2 isn't up yet
        if (!bg) return;

        try {
            if (typeof bg.getLastMessagesDB === 'function') {
                bg.getLastMessagesDB(ANALYTICS_MESSAGE_LIMIT).then(function (messages) {
                    arcadeAnalytics.messages = Array.isArray(messages) ? messages : [];
                    arcadeAnalytics.messagesReady = true;
                    renderArcadeAnalytics();
                }).catch(function (e) { console.error('[arcade-shell] getLastMessagesDB failed:', e); });
            }
        } catch (e) { console.error('[arcade-shell] analytics message bridge failed:', e); }

        try {
            if (typeof bg.buildViewerCountsFromMetaStore === 'function') {
                var vc = bg.buildViewerCountsFromMetaStore() || {};
                arcadeAnalytics.viewerCounts = vc;
                arcadeAnalytics.viewersReady = true;
                var total = 0;
                Object.keys(vc).forEach(function (k) { total += parseInt(vc[k], 10) || 0; });
                if (total > arcadeAnalytics.peakViewers) arcadeAnalytics.peakViewers = total;
                accumulateHoursWatched(total);
                renderAnalyticsPeakViewers();
                renderWatchTime();
            }
        } catch (e) { console.error('[arcade-shell] viewer-count bridge failed:', e); }

        try {
            if (typeof bg.buildFollowerCountsFromMetaStore === 'function') {
                var fc = bg.buildFollowerCountsFromMetaStore() || {};
                arcadeAnalytics.followersReady = true;
                Object.keys(fc).forEach(function (platformType) {
                    var val = parseInt(fc[platformType], 10) || 0;
                    if (!(platformType in arcadeAnalytics.followerBaseline)) {
                        arcadeAnalytics.followerBaseline[platformType] = val; // first reading this boot = the baseline
                    }
                    arcadeAnalytics.followerCounts[platformType] = val;
                });
                renderFollowerTotals();
            }
        } catch (e) { console.error('[arcade-shell] follower-count bridge failed:', e); }
    }

    function startArcadeAnalyticsBridge() {
        pollArcadeAnalytics(); // first attempt right away; frame2 may still be loading, harmless no-op if so
        clearInterval(analyticsPollTimer);
        analyticsPollTimer = setInterval(pollArcadeAnalytics, ANALYTICS_POLL_MS);

        // frame2 (background.html) loads asynchronously and can take a few
        // seconds; a short fast warm-up loop gets real numbers on screen
        // quickly instead of making the first boot wait out the full
        // ANALYTICS_POLL_MS before anything but "connecting…" shows.
        var warmupTries = 0;
        var warmupTimer = setInterval(function () {
            warmupTries++;
            var bg = getBackgroundWindow();
            var ready = bg && typeof bg.getLastMessagesDB === 'function';
            if (ready || warmupTries > 20) { // ~20s cap
                clearInterval(warmupTimer);
                if (ready) pollArcadeAnalytics();
                return;
            }
        }, 1000);
    }

    // --------------------------------------------------------------------
    // Sources rail collapse-to-icon-rail toggle. Collapsing overrides
    // --arc-rail-w on <body> (see arcade-shell.css), which both narrows
    // the rail itself and the #content-pane's padding-left that already
    // tracks that same variable — one class flip drives both.
    // --------------------------------------------------------------------
    function initRailCollapseToggle(btn) {
        if (!btn) return;
        var collapsed = false;
        try { collapsed = localStorage.getItem('arcadeRailCollapsed') === 'true'; } catch (e) { /* noop */ }
        applyRailCollapsed(collapsed, btn);
        btn.addEventListener('click', function () {
            var next = !document.body.classList.contains('arcade-rail-collapsed');
            applyRailCollapsed(next, btn);
            try { localStorage.setItem('arcadeRailCollapsed', next ? 'true' : 'false'); } catch (e) { /* noop */ }
        });
    }

    function applyRailCollapsed(collapsed, btn) {
        document.body.classList.toggle('arcade-rail-collapsed', collapsed);
        btn.textContent = collapsed ? '»' : '«';
        btn.setAttribute('aria-expanded', String(!collapsed));
        btn.setAttribute('aria-label', collapsed ? 'Expand sources' : 'Collapse sources to icon rail');
        btn.title = collapsed ? 'Expand sources' : 'Collapse to icon rail';
    }

    function callBridge(request) {
        try {
            if (window.SSAppStreamDeckBridge && typeof window.SSAppStreamDeckBridge.handleCommand === 'function') {
                return window.SSAppStreamDeckBridge.handleCommand(request);
            }
        } catch (e) {
            console.error('[arcade-shell] bridge call failed:', e);
        }
        return Promise.resolve({ ok: false });
    }

    function sourceStatusMeta(source) {
        switch (source.status) {
            case 'active':
                return { key: 'active', dotClass: 'arcade-dot--live', label: 'Live', stateClass: '' };
            case 'activating':
                return { key: 'activating', dotClass: 'arcade-dot--connecting', label: 'Connecting…', stateClass: '' };
            case 'error':
                return { key: 'error', dotClass: 'arcade-dot--danger', label: source.error || 'Error', stateClass: 'arcade-src__state--danger' };
            default:
                return { key: 'inactive', dotClass: 'arcade-dot--off', label: 'Stopped', stateClass: '' };
        }
    }

    function sourceDisplayName(source) {
        return source.username || source.videoId || source.target || 'source';
    }

    function renderSourcesRail() {
        var list = document.getElementById('arcade-src-list');
        var countPill = document.getElementById('arcade-live-count');
        if (!list || !window.stateManager || typeof window.stateManager.getSources !== 'function') return;

        var sources = window.stateManager.getSources() || [];
        list.innerHTML = '';

        if (!sources.length) {
            var empty = document.createElement('li');
            empty.className = 'arcade-src-empty arcade-fx-grid'; // S44 M5 — arcade-native empty state
            empty.textContent = 'No sources yet — use + Add source to bring in your first chat.';
            list.appendChild(empty);
        } else {
            sources.forEach(function (source) {
                list.appendChild(buildSourceRow(source));
            });
        }

        var liveCount = sources.filter(function (s) { return s.status === 'active'; }).length;
        if (countPill) {
            countPill.hidden = liveCount === 0;
            var span = countPill.querySelector('span:last-child');
            if (span) span.textContent = liveCount + ' LIVE';
        }

        // The analytics dock's "PEAK VIEWERS" sub-label folds in this same
        // real live-source count alongside the real viewer/peak numbers from
        // the analytics bridge (see renderAnalyticsPeakViewers()).
        renderAnalyticsPeakViewers();

        renderAnalyticsFollowerRows();
    }

    function buildSourceRow(source) {
        var meta = sourceStatusMeta(source);
        var li = document.createElement('li');
        li.className = 'arcade-src' + (source.status === 'error' ? ' arcade-src--error' : '');
        li.dataset.arcadeSourceId = source.id;
        li.dataset.arcadeSourceStatus = meta.key;

        var logo = document.createElement('span');
        logo.className = 'arcade-src__logo';
        var img = document.createElement('img');
        img.alt = '';
        try { img.src = window.getSourceIconUrl ? window.getSourceIconUrl(source.target) : ''; } catch (e) { /* noop */ }
        logo.appendChild(img);
        li.appendChild(logo);

        var nameWrap = document.createElement('span');
        nameWrap.className = 'arcade-src__name';
        var b = document.createElement('b');
        b.textContent = sourceDisplayName(source);
        var state = document.createElement('span');
        state.className = 'arcade-src__state ' + meta.stateClass;
        var dot = document.createElement('span');
        dot.className = 'arcade-dot ' + meta.dotClass;
        state.appendChild(dot);
        state.appendChild(document.createTextNode(meta.label));
        nameWrap.appendChild(b);
        nameWrap.appendChild(state);
        li.appendChild(nameWrap);

        var isRunning = source.status === 'active' || source.status === 'activating';
        var actionBtn = document.createElement('button');
        actionBtn.type = 'button';
        actionBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--icon' + (isRunning ? ' arcade-btn--danger' : '');
        actionBtn.title = isRunning ? 'Stop source' : 'Start source';
        actionBtn.setAttribute('aria-label', (isRunning ? 'Stop ' : 'Start ') + sourceDisplayName(source));
        actionBtn.textContent = isRunning ? '■' : '●';
        actionBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            callBridge({ action: isRunning ? 'stopSource' : 'startSource', value: source.id });
        });
        li.appendChild(actionBtn);

        return li;
    }

    function bindStateManager() {
        var sm = window.stateManager;
        if (!sm || typeof sm.on !== 'function') return false;
        renderSourcesRail();
        sm.on('sourceAdded', renderSourcesRail);
        sm.on('sourceUpdated', renderSourcesRail);
        sm.on('sourceRemoved', renderSourcesRail);
        sm.on('allSourcesCleared', renderSourcesRail);
        installBootGuard(sm);
        return true;
    }

    function waitForStateManagerThenBind() {
        if (bindStateManager()) return;
        var tries = 0;
        var timer = setInterval(function () {
            tries++;
            if (bindStateManager() || tries > 100) clearInterval(timer); // ~30s cap
        }, 300);
    }

    // --------------------------------------------------------------------
    // S32 — dashboard finalization (lanes 1+2): stock-frame dressing.
    //
    // The shell's nav still hosts STOCK pages whose interiors read as the old
    // dashboard: frame1 (popup.html — Settings/Games right pane), frame2
    // (background.html — the More▾ "Status and Logs" dashboard AND the Event
    // Flow editor view), frame3 (vdo.html — VDO tab), and the welcomeFrame
    // (docs/ssapp.html — the no-sources welcome hero inside #streams-page).
    // Those are fallback-bundle files; editing them would pull in the
    // ssn-custom mirror law and upstream contamination. Instead we do exactly
    // what the Style tab's live-restyle already does (see the comment above
    // STYLE_MARKER): inject ONE <style> into the frame's contentDocument,
    // gated on the same LOCAL_ORIGIN_FAMILY same-origin check. Zero bundle
    // bytes change; hosted/remote frames (no ssappOrigin, cross-origin) are
    // skipped untouched; stock mode never runs this file at all.
    //
    // Every color below is a literal copy of an arcade-shell.css:16-47 token
    // (frames can't see the parent's CSS vars across the document boundary).
    // Pure styling — no IDs, classes, scripts, or behavior in the frames are
    // added, removed, or rewired. One deliberate display treatment: the
    // Status-and-Logs dashboard prints the session ID in plaintext
    // (#session-id, background.html:642-644) — under the masking law that
    // value stays blurred until hovered, like the Admiral's MASK toggle.
    // --------------------------------------------------------------------
    var DRESS_POPUP_CSS = [
        '/* pacs-arcade S32 dress — popup.html. Token literals from arcade-shell.css:16-47. */',
        ':root {',
        '  --body-background-enabled: #0a0b0d;',
        '  --body-background-disabled: rgba(229, 104, 107, 0.10);',
        '  --default-text-color: #f2f0ea;',
        '  --section-title-color: #9ba1ad;',
        '  --color-accent: #35d0ff;',
        '  --color-accent-subtle: rgba(53, 208, 255, 0.10);',
        '  --collapsible-label-color: #14161b;',
        '  --collapsible-border-color: #2a2e37;',
        '  --color-wrapper-background: #0a0b0d;',
        '  --button-background: #191c22;',
        '  --text-button-text: #f2f0ea;',
        '  --h2-color: #f2f0ea;',
        '  --h3-color: #f2f0ea;',
        '  --link-color: #35d0ff;',
        '  --new-version-banner-background: rgba(53, 208, 255, 0.12);',
        '  --new-version-banner-text: #f2f0ea;',
        '  --new-version-banner-border: 1px solid rgba(53, 208, 255, 0.45);',
        '  --new-version-link-color: #35d0ff;',
        '  --new-version-installed-color: #9ba1ad;',
        '  --important-changes-background: rgba(245, 158, 11, 0.10);',
        '  --important-changes-text: #f2f0ea;',
        '  --important-changes-border: 1px solid rgba(245, 158, 11, 0.45);',
        '  --important-changes-link: #f59e0b;',
        '  --options-group-background-color: #14161b;',
        '  --options-group-text-color: #f2f0ea;',
        '  --extension-enabled-background-color: rgba(57, 255, 20, 0.14);',
        '  --extension-disabled-background-color: rgba(229, 104, 107, 0.16);',
        '  --extension-disabled-text-color: #f2f0ea;',
        '  --download-link: #35d0ff;',
        '}',
        /* the "Service Active" strip genuinely reports the capture service
           being live — the one place neon green is the honest token. */
        '.extension-enabled #disableButton { color: #39ff14; }',
        /* toggle tracks were hardcoded #ccc/#2196f3 (popup.html:1243-1273) */
        '.slider { background-color: #2a2e37; }',
        'input:checked + .slider { background-color: #35d0ff; }',
        'input:focus + .slider { box-shadow: 0 0 1px #35d0ff; }',
        /* glowingButton's neon gradient edges (#00ccff/#ff075b) → one quiet
           info-tint hover; button body gets the shared panel-2 ground. */
        '.glowingButton { background: #191c22; border: 1px solid #2a2e37; border-radius: 6px; color: #f2f0ea; }',
        '.glowingButton:before, .glowingButton:after { background: rgba(53, 208, 255, 0.16); border-radius: 6px; }',
        '#searchInput { background: #191c22; border: 1px solid #2a2e37; border-radius: 6px; color: #f2f0ea; }',
        '#searchInput::placeholder { color: #9ba1ad; }'
    ].join('\n');

    var DRESS_DASHBOARD_CSS = [
        '/* pacs-arcade S32 dress — background.html: the More▾ "Status and Logs"',
        '   dashboard (#dash) AND the Event Flow editor view (#editor, vars from',
        '   actions/styles.css:4-75). Token literals from arcade-shell.css:16-47. */',
        ':root {',
        '  --primary-color: #35d0ff;',
        '  --secondary-color: #1f232b;',
        '  --background-light: #0a0b0d;',
        '  --background-dark: #0a0b0d;',
        '  --text-light: #f2f0ea;',
        '  --text-dark: #f2f0ea;',
        '  --alert-color: #e5686b;',
        '  --success-color: #39ff14;',
        '  --card-bg-light: #14161b;',
        '  --card-bg-dark: #14161b;',
        '  --shadow-light: none;',
        '  --shadow-dark: none;',
        '  --primary-light: #35d0ff;',
        '  --primary-dark: #35d0ff;',
        '  --text-primary: #f2f0ea;',
        '  --text-secondary: #9ba1ad;',
        /* btn-primary is SOLID primary + --text-on-primary (styles.css:156-160) —
           white on info-cyan would measure ~1.9:1; dark void ink on cyan
           clears 9:1. secondary becomes a quiet panel-3 button with ink text. */
        '  --text-on-primary: #0a0b0d;',
        '  --secondary-light: #2a2e37;',
        '  --secondary-dark: #191c22;',
        '  --text-on-secondary: #f2f0ea;',
        '  --background-base: #0a0b0d;',
        '  --background-surface: #14161b;',
        '  --background-dialog: #1f232b;',
        '  --background-hover: #191c22;',
        '  --background-selected: #2a2e37;',
        '  --border-color: #2a2e37;',
        '  --border-interactive: #363b46;',
        '  --error-color: #e5686b;',
        '  --warning-color: #f59e0b;',
        '  --info-color: #35d0ff;',
        '  /* editor node categories are CATEGORICAL, not status — so: no live',
        '     neon (reserved: actually-live), no gold (reserved: money). */',
        '  --trigger-color: #35d0ff;',
        '  --trigger-bg: rgba(53, 208, 255, 0.15);',
        '  --action-color: #ff5ccb;',
        '  --action-bg: rgba(255, 92, 203, 0.15);',
        '  --logic-color: #f59e0b;',
        '  --logic-bg: rgba(245, 158, 11, 0.15);',
        '  --state-color: #f7931a;',
        '  --state-bg: rgba(247, 147, 26, 0.15);',
        '}',
        'body { background: #0a0b0d; color: #f2f0ea; }',
        '.card { border: 1px solid #2a2e37; border-radius: 10px; }',
        '.card h3 { color: #9ba1ad; letter-spacing: 0.08em; }',
        '.stat-value { color: #f2f0ea; }',
        '.stat-label { color: #9ba1ad; }',
        /* two .status-item notes carry inline color:#777/#555 (background.html
           :645-650) — inline styles only yield to !important. Muted, not faint:
           real text, 4.5:1 law. */
        '#connection-status .status-item[style] { color: #9ba1ad !important; }',
        '.status-warning { background-color: #f59e0b; box-shadow: 0 0 8px rgba(245, 158, 11, 0.6); }',
        '#session-id { filter: blur(6px); border-radius: 3px; }',
        '#session-id:hover { filter: none; }',
        '#debugOutput { background: #191c22; border: 1px solid #2a2e37; border-radius: 6px; }',
        '.log-message { color: #9ba1ad; }',
        '.error-message { background: rgba(229, 104, 107, 0.10); color: #e5686b; border-left-color: #e5686b; }',
        '.message { background: #191c22; border-left-color: #35d0ff; }',
        '.message-time { color: #9ba1ad; }',
        '.badge { background: #1f232b; color: #9ba1ad; }',
        '.view-btn { border-color: rgba(53, 208, 255, 0.45); color: #35d0ff; }',
        '.view-btn.active { background: rgba(53, 208, 255, 0.12); color: #35d0ff; }',
        '.view-btn:hover:not(.active) { background: rgba(53, 208, 255, 0.07); }',
        '.footer { color: #9ba1ad; border-top-color: #2a2e37; }',
        '.footer a { color: #35d0ff; }',
        '.footer a:hover { color: #35d0ff; text-decoration: underline; }',
        /* the editor's "New to Event Flow?" banner is hardcoded violet
           (rgba(99,102,241,…), styles.css:636-648) — info-cyan tints instead. */
        '.flow-help-banner { border-color: rgba(53, 208, 255, 0.35); background: rgba(53, 208, 255, 0.08); }',
        /* .node-item/.node-header text is hardcoded #FFFFFF (background.html
           :94,:164-178) — white on the tokened category grounds (info-cyan
           above all) would read ~1.9:1; void ink clears 7:1 on all three. */
        '#editor .node-item, #editor .node-header { color: #0a0b0d; }'
    ].join('\n');

    var DRESS_VDO_CSS = [
        '/* pacs-arcade S32 dress — vdo.html (VDO tab). Token literals from',
        '   arcade-shell.css:16-47. Stock\'s #e9c46a heading gold is OFF the',
        '   semantic lock (gold = money only; these are labels, not sats) —',
        '   remapped to muted/ink. The white QR ground stays white: scannability',
        '   is functional, not styling. */',
        'body { background-color: #0a0b0d; color: #f2f0ea; }',
        '.app-header { background-color: #14161b; border-bottom-color: #2a2e37; }',
        '.app-header h1 { color: #f2f0ea; }',
        '.links-section, .instructions-panel, .qr-code-panel, .instructions-pane {',
        '  background-color: #14161b; border: 1px solid #2a2e37; border-radius: 10px; box-shadow: none;',
        '}',
        '.instructions-pane { padding: 20px; }',
        '.links-header h2 { color: #f2f0ea; }',
        '.instructions-panel h3, .qr-code-panel h3 { color: #9ba1ad; }',
        '.link-box label { color: #9ba1ad; }',
        '.link-box input { background-color: #191c22; border-color: #2a2e37; color: #f2f0ea; border-radius: 6px; }',
        '.copy-btn { background: rgba(53, 208, 255, 0.12); border: 1px solid rgba(53, 208, 255, 0.45); color: #35d0ff; border-radius: 6px; }',
        '.copy-btn:hover { background: rgba(53, 208, 255, 0.2); }',
        '.reset-btn { background: rgba(229, 104, 107, 0.10); border: 1px solid rgba(229, 104, 107, 0.45); color: #e5686b; border-radius: 6px; }',
        '.reset-btn:hover { background: rgba(229, 104, 107, 0.18); }',
        '.instructions-panel .note { background-color: #191c22; border-left-color: #f59e0b; color: #9ba1ad; }',
        '.instructions-panel .note strong { color: #f59e0b; }',
        '.links-section .note { color: #9ba1ad; }',
        /* the stock hero art (media/vdo.png) ships with an invalid inline style
           (`style="calc(50vw - 40px)"`, ignored) and renders at natural size —
           cap it to its panel. */
        '.qr-code-panel img { max-width: 100%; height: auto; border-radius: 6px; }'
    ].join('\n');

    var DRESS_WELCOME_CSS = [
        '/* pacs-arcade S32 dress — docs/ssapp.html (no-sources welcome hero inside',
        '   #streams-page). Token literals from arcade-shell.css:16-47. The .warning',
        '   treatment matches the shell\'s own #chat-empty-hint (arcade-shell.css',
        '   :598-603): amber warning token, never the money gold. */',
        'body { background: #0a0b0d; color: #f2f0ea; }',
        '.container { background-color: #14161b; border: 1px solid #2a2e37; box-shadow: none; }',
        'h1 { color: #f2f0ea; text-shadow: none; }',
        'h2 { color: #9ba1ad; border-bottom-color: #2a2e37; }',
        'p, li { color: #9ba1ad; }',
        'strong { color: #f2f0ea; }',
        'a, .lightblue { color: #35d0ff; }',
        'code { background-color: #1f232b; color: #f2f0ea; }',
        '.note { background-color: #191c22; border-left-color: #35d0ff; color: #9ba1ad; }',
        '.warning { background-color: rgba(245, 158, 11, 0.08); border-left-color: #f59e0b; color: #f0b45c; }',
        '.footer { border-top-color: #2a2e37; color: #9ba1ad; }'
    ].join('\n');

    // Injects (or refreshes) one <style> in a frame's document. Returns true
    // when the style is in place. All same-origin touches feature-detected;
    // any failure is a silent skip — a missed dress is cosmetic, never fatal.
    function injectDressIntoFrame(frame, styleId, css) {
        if (!frame) return false;
        try {
            var origin = frame.dataset ? (frame.dataset.ssappOrigin || '') : '';
            // welcomeFrame has no ssappOrigin (libs.js builds it) — its dress
            // caller passes styleId 'arcade-dress-welcome' and we gate it on
            // plain same-origin reachability instead (hosted remote frames
            // throw on contentDocument and skip here).
            if (styleId !== 'arcade-dress-welcome' && !LOCAL_ORIGIN_FAMILY[origin]) return false;
            var doc = frame.contentDocument;
            if (!doc || !doc.head) return false;
            var el = doc.getElementById(styleId);
            if (!el) {
                el = doc.createElement('style');
                el.id = styleId;
                doc.head.appendChild(el);
            }
            if (el.textContent !== css) el.textContent = css;
            return true;
        } catch (e) {
            return false; // cross-origin / mid-navigation — skip
        }
    }

    function dressStockFrame(frameId, styleId, css) {
        var frame = document.getElementById(frameId);
        if (!frame) return;
        injectDressIntoFrame(frame, styleId, css); // already-loaded case
        frame.addEventListener('load', function () {
            injectDressIntoFrame(frame, styleId, css);
        });
    }

    function installStockFrameDressing() {
        dressStockFrame('frame1', 'arcade-dress-popup', DRESS_POPUP_CSS);
        dressStockFrame('frame2', 'arcade-dress-dashboard', DRESS_DASHBOARD_CSS);
        dressStockFrame('frame3', 'arcade-dress-vdo', DRESS_VDO_CSS);

        // welcomeFrame is created/destroyed on demand by libs.js's
        // manageWelcomePage() (only while zero sources are configured) — watch
        // #sources for it arriving, then dress its document once it loads.
        var sourcesEl = document.getElementById('sources');
        if (!sourcesEl || typeof MutationObserver !== 'function') return;
        var welcomeHooked = null;
        var hookWelcome = function () {
            var wf = document.getElementById('welcomeFrame');
            if (!wf || wf === welcomeHooked) return;
            welcomeHooked = wf;
            injectDressIntoFrame(wf, 'arcade-dress-welcome', DRESS_WELCOME_CSS);
            wf.addEventListener('load', function () {
                injectDressIntoFrame(wf, 'arcade-dress-welcome', DRESS_WELCOME_CSS);
            });
        };
        hookWelcome();
        new MutationObserver(hookWelcome).observe(sourcesEl, { childList: true, subtree: true });
    }

    // --------------------------------------------------------------------
    // Boot
    // --------------------------------------------------------------------
    function init() {
        // AI area gate pre-check, before buildTopbar() renders the nav: no
        // signer on this seat -> the berth never enters TABS/CUSTOM_TABS and
        // its panel DOM never gets built at all. Hidden entirely, not
        // disabled — see hasNostrSigner()'s comment for exactly why this is
        // the only cheap pre-check available.
        if (aiGateOpen() || hasNostrSigner()) {
            TABS.push({ id: 'ai', label: 'AI' });
            CUSTOM_TABS.ai = true;
        }

        buildTopbar();
        buildRailAndSide();
        buildElementsPanel();
        buildStylePanel();
        buildAlertsPanel();
        if (CUSTOM_TABS.ai) buildAiPanel();
        installStockFrameDressing(); // S32 — dress the stock pages the nav still hosts

        var restored = 'main';
        try { restored = localStorage.getItem('arcadeTab') || 'main'; } catch (e) { /* noop */ }
        if (!TABS.some(function (t) { return t.id === restored; })) restored = 'main';

        // index.html has its own independent boot-restore for "last open page"
        // that resolves asynchronously (see installBootGuard() above for why a
        // fixed delay can't safely out-wait it). Give it a generous window
        // during which our own tab choice re-asserts itself the instant that
        // other restore writes something different.
        bootGraceUntil = Date.now() + 20000;
        waitForStateManagerThenBind();
        startArcadeAnalyticsBridge();
        navigateArcadeTab(restored);

        // CLOCK settings — read at boot, applied live (buildTopbar() above has
        // already started the clock at its BFT/no-seconds defaults; this only
        // adjusts the two hooks if the user previously chose otherwise).
        loadClockSettings().then(function () {
            syncClockControls();
            applyClockSettingChange();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
