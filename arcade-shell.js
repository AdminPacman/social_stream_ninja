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

    // S46 shell frame (TASK-43, Add-On Arcade round 3 — boards APPROVED
    // 0018.06.03): menu bar on TOP reads Main · Add-ons · Style · AI ·
    // Deck Settings (TASK-64 delocked the AI seat — it reads AI, styled
    // like every sibling, always visible). The old rail tabs Games /
    // Elements / Alerts / VDO / Event Flow leave the nav — their surfaces
    // stay reachable through the Add-ons gallery doors (ADDON_DOORS below).
    // Interior redesigns: S47+.
    //
    // S51 (TASK-48 — Deck Settings + control surfaces): the More▾ hatch is
    // RETIRED. Its stock trio is absorbed into Deck Settings sections
    // (Status and Logs + Sessions → Diagnostics; Stream Deck Setup →
    // Control surfaces) and the S46 "Moved to Add-ons" transition entries
    // go with it — every one of those four surfaces has had its own Add-ons
    // gallery door since S46–S50. The retirement touches BOTH the topbar
    // (no More menu is built at all) and the S46B burger sheet (no stock
    // trio / hatch rows), per the brief.
    var TABS = [
        { id: 'main', label: 'Main' },
        { id: 'addons', label: 'Add-ons' },
        { id: 'style', label: 'Style' },
        { id: 'settings', label: 'Deck Settings' }
    ];

    // S48 (TASK-45 — the Games hub + the points loop): 'games' leaves
    // ARCADE_TAB_PAGE and becomes a CUSTOM_TAB with its own in-shell panel
    // (the hub). Two consequences fall out of that one move: the stock
    // streams page is never driven for games (so the stock Welcome
    // interstitial zero-source profiles get on that page is not inherited —
    // the trap the S46 report flagged), and the popup scroll memory no
    // longer has a games entry to restore. Door card and DOOR_PARENT keep
    // working — they drive the same tab id.

    // --------------------------------------------------------------------
    // AI console (TASK-64 — the delock + the zone interior). The v1/v2 berth
    // was GATED: the tab only existed when a NIP-07 signer holding the ruled
    // admin npub (g2x3) was present, or when SSN_AI_GATE=open was set in the
    // operator's own launcher — and it wore a 🔒 in the nav. The 0018.06.04
    // audit found that gate PRESENTATIONAL (npub-or-SSN_AI_GATE, open on this
    // rig) and the Admiral ruled: nothing is "locked" in a free program.
    // TASK-64 retires the presentation AND the gate machinery wholesale —
    // the tab reads AI, styled like every sibling, always visible, and every
    // feature row inside reports its own honest "not set up" state instead.
    // The nostr signer door, if a future lane ever wants one back, is a
    // design-doc decision (briefings/ssn-ai-area-design.md), not a leftover.
    //
    // DevChat endpoints (Rider 2's Z5 setup zone) — confirmed by reading
    // chatdev's own LOCAL_SETUP.md / Makefile / compose.yml: frontend dev
    // server on :5173, API server on :6400 (`make dev` in ~/dev/chatdev runs
    // `uv run python server_main.py --port 6400` + the Vite frontend with
    // VITE_API_BASE_URL=http://localhost:6400). /api/models is the cheap
    // no-session status route (configured_model + is_ollama + reachable).
    // --------------------------------------------------------------------
    var AI_AREA_DEVCHAT_URL = 'http://localhost:5173';
    var AI_AREA_DEVCHAT_API_URL = 'http://localhost:6400';
    var AI_AREA_PROBE_TIMEOUT_MS = 2500;

    // --------------------------------------------------------------------
    // Element registry — the ONE source of truth for selectable overlay
    // ELEMENTS (music / tip jar / hype / map / featured). Adding an element
    // is one entry here (plus its overlay page, when built). See pacsarcade
    // design-briefs/ssn-ui-overhaul/element-registry-spec.md. status 'ready'
    // = the overlay page ships and the card is live (Copy overlay URL);
    // 'planned' = an honest SOON stub with no actions.
    //
    // TASK-70 (WALK 2C) — every ready element now carries `setup` + `tab`:
    // its own Add-ons interior (preview top, config below). Lane 2 merged
    // the two jar cards into ONE Tip Jar card (the interior carries both
    // jars); Lane 1 added Featured Chat (the three-chat model); Lane 3
    // un-stubbed Fren Map (stock map.html is a real overlay).
    //
    // S46: the standalone Elements tab is gone from the nav; these cards are
    // re-homed inside the Add-ons gallery, filed under the gallery TYPE each
    // entry declares in addonType ('money' | 'widgets' | 'chat') — Add-On
    // Arcade round 3: "Elements' 5 cards re-homed here under Money/Widgets".
    // --------------------------------------------------------------------
    var ELEMENTS = [
        {
            id: 'music', name: 'Now Playing', category: 'music', status: 'ready', addonType: 'widgets',
            overlayPage: 'music-widget.html',
            // TASK-71 — no default params here: the interior's musicUrlParams()
            // owns the look params (a card default doubled &layout on the copy).
            setup: true, tab: 'music', // TASK-70 (Lane 3) — Set up opens the Now Playing interior (Spotify groups berth there)
            blurb: 'Spotify now-playing overlay — transparent, Tuna-grade. Token-free: reads your Spotify connection over the session feed.'
        },
        {
            id: 'tipjar', name: 'Tip Jar', category: 'tips', status: 'ready', addonType: 'money',
            overlayPage: 'tipjar.html',
            // TASK-70 (Lane 2) — ONE Tip Jar card (the Admiral: "tips and tips
            // mini jar are the same menu"). The interior carries both jars:
            // Goal jar (stock tipjar.html — themes/sound/confetti/leaderboard)
            // and Visual jar (house tipjar-mini — receive rails). The look
            // (5 jar styles + your own jar image) is picked inside; this
            // card's Copy takes the Goal jar wearing the chosen look.
            setup: true, tab: 'tipjar',
            blurb: 'One jar, two faces — Goal jar (stock: themes, sound, leaderboard) and Visual jar (lean, lightning/zap rails). Pick the look inside.'
        },
        {
            id: 'hype', name: 'Hype Train', category: 'hype', status: 'ready', addonType: 'widgets',
            overlayPage: 'hype.html',
            setup: true, tab: 'hype', // TASK-70 (Lane 3) — Set up opens the Hype Train interior (preview + real stock hype params)
            blurb: 'Live viewer/chatter counts by platform, straight from the session.'
        },
        {
            id: 'map', name: 'Fren Map', category: 'community', status: 'ready', addonType: 'widgets',
            overlayPage: 'map.html',
            setup: true, tab: 'map', // TASK-70 (Lane 3) — un-stubbed: stock's map overlay as a real card (preview + config + copy URL)
            blurb: 'Where the frens are — a live viewer map (stock map.html; viewers pin themselves by command).'
        },
        {
            // TASK-70 (Lane 1) — the three-chat model (ruled 0018.06.05): home
            // chat (dock), featured chat (THIS), normal chat. Featured = FOCUS
            // MODE: its own Add-ons card + interior on stock's featured.html.
            id: 'featured', name: 'Featured Chat', category: 'chat', status: 'ready', addonType: 'chat',
            overlayPage: 'featured.html',
            setup: true, tab: 'featured',
            blurb: 'Focus mode — the messages that matter, alone on their own overlay: VIPs, privileged users, or hand-picked from the dock.'
        }
    ];

    // --------------------------------------------------------------------
    // Add-ons gallery (S46, TASK-43 — Add-On Arcade round 3, "everything on
    // stream is an ADD-ON"). The gallery skeleton: TYPE list down the left
    // (the sources-rail pattern), card grid on the right. v1 cards open what
    // exists TODAY — interior redesigns are S47–S51.
    //
    // ADDON_TYPES is the ruled left-column order. ADDON_DOORS are the
    // door cards: each opens an EXISTING surface whose rail tab left the
    // nav (tab ids match ARCADE_TAB_PAGE / CUSTOM_TABS, so the existing tab
    // machinery — scroll memory, lazy panels, the boot guard — keeps working
    // unchanged). Element cards (ELEMENTS above) file under 'money' and
    // 'widgets' (and 'chat' since TASK-70 — Featured Chat + the Overlay
    // templates door landed the type's first cards).
    // --------------------------------------------------------------------
    var ADDON_TYPES = [
        { id: 'all', label: 'All' },
        { id: 'chat', label: 'Chat & Text' },
        { id: 'frames', label: 'Frames & Cameras' },
        { id: 'alerts', label: 'Alerts' },
        { id: 'money', label: 'Money' },
        { id: 'games', label: 'Games' },
        { id: 'flows', label: 'Flows' },
        { id: 'widgets', label: 'Widgets' }
    ];

    var ADDON_DOORS = [
        {
            id: 'commands', name: 'Commands', addonType: 'chat', tab: 'commands',
            cta: 'Open Commands',
            blurb: 'Chat commands and timers — !command replies, repeating shoutouts, all backed by real event flows.'
        },
        {
            id: 'frames', name: 'Frames & Cameras', addonType: 'frames', tab: 'frames',
            cta: 'Open Frames & Cameras',
            blurb: 'Remote cameras and guests — VDO room links bring phones and remote guests onto the stream.'
        },
        {
            id: 'alerts', name: 'Alerts', addonType: 'alerts', tab: 'alerts',
            cta: 'Open Alerts',
            blurb: 'Event alerts — follow, sub, donation, bits, raid, auction, hype. Styles, templates, sounds, test-fire.'
        },
        {
            id: 'games', name: 'Games hub', addonType: 'games', tab: 'games',
            cta: 'Open Games hub',
            blurb: 'Chat-played games — pick one, copy its overlay URL into OBS.'
        },
        {
            id: 'flows', name: 'Event Flows', addonType: 'flows', tab: 'eventflow',
            cta: 'Open Flows',
            blurb: 'Triggers and actions — automate what happens on stream when chat events land.'
        },
        {
            id: 'goals', name: 'Goal Bars', addonType: 'widgets', tab: 'goals',
            cta: 'Open Goal Bars',
            blurb: 'Progress bars for followers, viewers, subs, sats — real counts only, dashes when unknown. Preset sets for platform programs.'
        },
        {
            // TASK-70 (Lane 4) — Steve's templated FULL-SCREEN overlays,
            // surface-only (no builder this round — ruled).
            id: 'overlays', name: 'Overlay templates', addonType: 'chat', tab: 'overlays',
            cta: 'Open Overlay templates',
            blurb: 'Steve’s ready-made full-screen overlays — chat themes, featured-message styles, credits, danmaku, news ticker. Preview one, copy its URL into OBS.'
        }
    ];

    // Door tabs keep no nav berth of their own — while one is open, the
    // Add-ons nav button carries the is-on mark (the door lives INSIDE the
    // add-ons world). Also whitelists door tabs for boot-restore.
    var DOOR_PARENT = { alerts: 'addons', games: 'addons', vdo: 'addons', eventflow: 'addons', commands: 'addons', goals: 'addons', frames: 'addons', tipjar: 'addons', featured: 'addons', music: 'addons', hype: 'addons', map: 'addons', overlays: 'addons' };

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

        // S46B hamburger fold (TASK-49) — the burger + nav sheet exist at
        // EVERY width but only take seats while the header carries the
        // is-folded class, which measureTopbarFold() sets from MEASURED
        // widths (see the fold section below buildMoreMenu()). Logo and
        // clock keep their seats at every width; only nav + More fold.
        var burger = document.createElement('button');
        burger.type = 'button';
        burger.className = 'arcade-burger';
        burger.setAttribute('aria-label', 'Open navigation menu');
        burger.setAttribute('aria-haspopup', 'true');
        burger.setAttribute('aria-expanded', 'false');
        burger.setAttribute('aria-controls', 'arcade-nav-sheet');
        burger.textContent = '☰';
        header.appendChild(burger);

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

        header.appendChild(buildNavSheet(burger));

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
            '<label class="arcade-toggle arcade-clock-seconds"><input type="checkbox" class="arcade-toggle__input" id="arcade-clock-seconds"><span class="arcade-toggle__track" aria-hidden="true"><span class="arcade-toggle__thumb"></span></span><span class="arcade-toggle__label">seconds</span></label>' +
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

    // --------------------------------------------------------------------
    // S46B — THE HAMBURGER FOLD (TASK-49, charter round 5). Below the width
    // where EVERY top-bar tab keeps its full hit target, the bar folds into
    // a burger (☰) that opens a sheet of FULL-SIZE rows — hit targets never
    // shrink, nothing clips, no horizontal scroll. The fold threshold is
    // MEASURED, never a magic px: measureTopbarFold() sums the real rendered
    // widths of every full-bar seat (brand + natural nav + More + beta chip
    // + clock) plus the bar's own gaps/padding and folds the instant the
    // window can't pay that bill. Logo and clock keep their seats at every
    // width — only the nav cluster folds. The Add-ons left type column
    // follows the same discipline (measureAddonsTypesFold): below its own
    // measured floor it becomes a TYPES ▾ drawer of full-size rows.
    // --------------------------------------------------------------------
    var FOLD_HYSTERESIS_PX = 16; // anti-flicker band around the MEASURED threshold only
    var navSheetApi = null;    // { close, isOpen } — set by buildNavSheet()

    function buildNavSheet(burger) {
        var sheet = document.createElement('div');
        sheet.className = 'arcade-nav-sheet';
        sheet.id = 'arcade-nav-sheet';
        sheet.setAttribute('role', 'menu');
        sheet.setAttribute('aria-label', 'Arcade screens');

        function addRow(label, onActivate, tabBtnId, destTab, destPage) {
            var row = document.createElement('button');
            row.type = 'button';
            row.setAttribute('role', 'menuitem');
            if (tabBtnId) row.dataset.arcadeTabBtn = tabBtnId; // is-on rides setArcadeTab's existing [data-arcade-tab-btn] sweep
            row.textContent = label;
            row.addEventListener('click', function () {
                // H17-B — a pick closes WITHOUT returning focus to the burger;
                // focus lands in the destination panel instead. Only close-
                // without-pick (Escape/click-outside) returns to the trigger.
                closeSheet(false);
                onActivate();
                focusArcadeDestination(destTab, destPage);
            });
            sheet.appendChild(row);
        }

        TABS.forEach(function (tab) {
            addRow(tab.label, function () { navigateArcadeTab(tab.id); }, tab.id, tab.id, null);
        });

        // S51 — the sheet carries the ruled tabs and nothing else: the
        // More▾ stock trio was absorbed into Deck Settings sections and
        // the S46 "Moved to Add-ons" hatch retired with it.

        function isOpen() { return sheet.classList.contains('is-open'); }
        function openSheet() {
            sheet.classList.add('is-open');
            burger.setAttribute('aria-expanded', 'true');
            burger.setAttribute('aria-label', 'Close navigation menu');
            // Focus lands IN the sheet on open — the current tab's row when
            // there is one, else the first row.
            var current = sheet.querySelector('button.is-on') || sheet.querySelector('button');
            if (current) current.focus();
        }
        function closeSheet(returnFocus) {
            if (!isOpen()) return;
            sheet.classList.remove('is-open');
            burger.setAttribute('aria-expanded', 'false');
            burger.setAttribute('aria-label', 'Open navigation menu');
            if (returnFocus) burger.focus(); // focus returns to the trigger on close
        }
        navSheetApi = { close: closeSheet, isOpen: isOpen };

        burger.addEventListener('click', function (e) {
            e.stopPropagation();
            if (isOpen()) closeSheet(true); else openSheet();
        });
        sheet.addEventListener('click', function (e) { e.stopPropagation(); });
        document.addEventListener('click', function () { closeSheet(false); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isOpen()) closeSheet(true);
        });

        return sheet;
    }

    var topbarFolded = false;
    var topbarNavNatural = null;  // px — nav's full-content width, cached while unfolded (tab set is fixed at boot)
    var topbarMoreNatural = null; // px — More trigger's rendered width, same cache discipline

    function measureTopbarFold() {
        var header = document.querySelector('.arcade-topbar');
        if (!header) return;
        var brand = header.querySelector('.arcade-brand');
        var nav = header.querySelector('.arcade-nav');
        var more = header.querySelector('.arcade-more');
        var clockWrap = header.querySelector('.arcade-clockbtn');
        if (!brand || !nav || !clockWrap) return;

        if (!topbarFolded) {
            // The nav cluster is in the layout — refresh the natural-width
            // cache off the live boxes. The nav is overflow:hidden and
            // flex-shrinkable, so scrollWidth is the honest FULL-content
            // width even when the bar is already squeezing it.
            topbarNavNatural = nav.scrollWidth;
            topbarMoreNatural = more ? more.offsetWidth : 0;
        }
        if (topbarNavNatural === null) return; // never seen unfolded — nothing honest to compare yet

        var cs = getComputedStyle(header);
        var gap = parseFloat(cs.columnGap) || 0;
        var required = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        var seats = 0; // visible flex children other than the spacer
        required += brand.offsetWidth; seats++;
        required += topbarNavNatural; seats++;
        if (more) { required += topbarMoreNatural; seats++; }
        var beta = header.querySelector('.arcade-pill'); // beta chip only exists on the beta channel
        if (beta) { required += beta.offsetWidth; seats++; }
        required += clockWrap.offsetWidth; seats++; // live — the face width changes with seconds/mode
        required += gap * (seats + 1 - 1); // +1 for the spacer, −1: N children have N−1 gaps

        var available = header.clientWidth;
        var shouldFold = topbarFolded
            ? available < required + FOLD_HYSTERESIS_PX
            : available < required;
        if (shouldFold !== topbarFolded) {
            topbarFolded = shouldFold;
            header.classList.toggle('is-folded', shouldFold);
            if (!shouldFold && navSheetApi) navSheetApi.close(false);
        }
    }

    var addonsTypesFolded = false;
    var addonsTypesNatural = null; // px — the type column's rendered width, cached while unfolded
    var addonsCardMin = null;      // px — widest card's min-content + stage padding, measured once
    var addonsTypesPopApi = null;  // { close, isOpen } — set by buildAddonsPanel()

    function measureAddonsTypesFold() {
        var panel = document.querySelector('.arcade-addons');
        if (!panel) return;
        if (getComputedStyle(panel).display === 'none') return; // hidden panel has no honest geometry — keep last state
        var body = panel.querySelector('.arcade-addons-body');
        var typesNav = panel.querySelector('.arcade-addons-types');
        var stage = panel.querySelector('.arcade-addons-stage');
        if (!body || !typesNav || !stage) return;

        if (addonsCardMin === null) {
            // The floor is measured, not guessed: the widest card's
            // MIN-CONTENT width (below it the cards would start crushing
            // their own buttons — the "hit targets never shrink" line)
            // plus the stage's real padding.
            var maxMin = 0;
            panel.querySelectorAll('#arcade-addons-grid .arcade-el-card').forEach(function (card) {
                var prevPosition = card.style.position;
                var prevVisibility = card.style.visibility;
                var prevWidth = card.style.width;
                card.style.position = 'absolute';
                card.style.visibility = 'hidden';
                card.style.width = 'min-content';
                maxMin = Math.max(maxMin, card.offsetWidth);
                card.style.position = prevPosition;
                card.style.visibility = prevVisibility;
                card.style.width = prevWidth;
            });
            var scs = getComputedStyle(stage);
            addonsCardMin = maxMin + (parseFloat(scs.paddingLeft) || 0) + (parseFloat(scs.paddingRight) || 0);
        }
        if (!addonsTypesFolded) addonsTypesNatural = typesNav.offsetWidth;
        if (addonsTypesNatural === null) return;

        var required = addonsTypesNatural + addonsCardMin;
        var available = body.clientWidth;
        var shouldFold = addonsTypesFolded
            ? available < required + FOLD_HYSTERESIS_PX
            : available < required;
        if (shouldFold !== addonsTypesFolded) {
            addonsTypesFolded = shouldFold;
            panel.classList.toggle('is-types-folded', shouldFold);
            if (!shouldFold && addonsTypesPopApi) addonsTypesPopApi.close(false);
        }
    }

    // --------------------------------------------------------------------
    // TASK-68 (WALK 2A item 10) — the BFT clock TRUNCATES HONESTLY at
    // narrow widths: drop the block height first, then the date; the TIME
    // always keeps its seat (the ruled order). Measured thresholds, the
    // S46B fold idiom: natural sub-widths measured once off the full face
    // (fonts settled), free space computed off the same seat bill the
    // hamburger fold pays, hysteresis band against flicker. Below the
    // RULED 390px floor the layout clamps instead (arcade-shell.css
    // min-width + horizontal scroll) — this trim is what keeps 390px
    // itself honest: time + burger + brand fit inside it.
    // --------------------------------------------------------------------
    var clockTrimLevel = 0;   // 0 = full face · 1 = block height dropped · 2 = time only
    var clockNatural = null;  // measured full-face sub-widths { pad, gap, date, ab, time, height }

    function clockApplyTrim(level) {
        var header = document.querySelector('.arcade-topbar');
        if (!header) return;
        clockTrimLevel = level;
        header.classList.toggle('is-clock-noh', level >= 1);
        header.classList.toggle('is-clock-not', level >= 2);
    }

    function measureClockTrim() {
        var header = document.querySelector('.arcade-topbar');
        if (!header) return;
        var bft = header.querySelector('.arcade-bft');
        if (!bft) return;
        if (!clockNatural) {
            // Measure off the FULL face — drop the trim classes for the
            // measurement (same synchronous frame, nothing paints between).
            if (clockTrimLevel !== 0) clockApplyTrim(0);
            var bcs = getComputedStyle(bft);
            var w = function (sel) { var el = bft.querySelector(sel); return el ? el.offsetWidth : 0; };
            var measured = {
                pad: (parseFloat(bcs.paddingLeft) || 0) + (parseFloat(bcs.paddingRight) || 0),
                gap: parseFloat(bcs.columnGap) || 0,
                date: w('.date'), ab: w('.ab'), time: w('.time'), height: w('.height')
            };
            if (!measured.time) return; // fonts not settled — the fonts.ready pass re-runs us
            clockNatural = measured;
        }
        var n = clockNatural;
        var faceW = [ // the honest bill per trim level
            n.pad + n.date + n.ab + n.time + n.height + n.gap * 3, // 0 full
            n.pad + n.date + n.ab + n.time + n.gap * 2,            // 1 no height
            n.pad + n.time                                          // 2 time only
        ];
        // Free space = the header minus every OTHER seat (brand, the nav
        // cluster or its burger, the beta chip, gaps) — the same accounting
        // measureTopbarFold does, reading its CURRENT fold state.
        var cs = getComputedStyle(header);
        var gap = parseFloat(cs.columnGap) || 0;
        var others = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        var seats = 1; // the clock itself, for the gap count
        var brand = header.querySelector('.arcade-brand');
        if (brand) { others += brand.offsetWidth; seats++; }
        if (topbarFolded) {
            var burger = header.querySelector('.arcade-burger');
            if (burger) { others += burger.offsetWidth; seats++; }
        } else {
            var nav = header.querySelector('.arcade-nav');
            var more = header.querySelector('.arcade-more');
            if (nav) { others += (topbarNavNatural !== null ? topbarNavNatural : nav.scrollWidth); seats++; }
            if (more) { others += (topbarMoreNatural !== null ? topbarMoreNatural : more.offsetWidth); seats++; }
        }
        var beta = header.querySelector('.arcade-pill');
        if (beta) { others += beta.offsetWidth; seats++; }
        others += gap * (seats + 1 - 1); // +1 for the spacer, −1: N children have N−1 gaps
        var free = header.clientWidth - others;

        // Narrow at the exact bill; widen only past the hysteresis band.
        var level = clockTrimLevel;
        while (level < 2 && faceW[level] > free) level++;
        while (level > 0 && faceW[level - 1] <= free - FOLD_HYSTERESIS_PX) level--;
        if (level !== clockTrimLevel) clockApplyTrim(level);
    }

    var foldMeasureRaf = 0;
    function requestFoldMeasures() {
        if (foldMeasureRaf) return;
        foldMeasureRaf = requestAnimationFrame(function () {
            foldMeasureRaf = 0;
            measureClockTrim();   // TASK-68 — trim first: the fold math reads the clock's live width
            measureTopbarFold();
            measureAddonsTypesFold();
        });
    }

    function installFoldObservers() {
        window.addEventListener('resize', requestFoldMeasures);
        // Webfont arrival changes real tab/wordmark widths — re-measure once
        // the faces settle so the threshold stays honest.
        try {
            if (document.fonts && document.fonts.ready) document.fonts.ready.then(requestFoldMeasures);
        } catch (e) { /* noop */ }
        requestFoldMeasures();
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
        clockNatural = null; // TASK-68 — the trim's measured face widths must follow the face change (before the fold pass runs)
        requestFoldMeasures(); // S46B — seconds/mode changes the clock face's real width
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
        // Door tabs (alerts/games/vdo/eventflow) have no nav berth of their
        // own since S46 — while one is open, its PARENT gallery berth
        // carries the is-on mark instead (DOOR_PARENT above).
        var navId = DOOR_PARENT[tabId] || tabId;
        document.querySelectorAll('[data-arcade-tab-btn]').forEach(function (btn) {
            btn.classList.toggle('is-on', btn.dataset.arcadeTabBtn === navId);
        });
        try { localStorage.setItem('arcadeTab', tabId || 'main'); } catch (e) { /* noop */ }
    }

    // Games and Settings USED to be two different tabs sharing the SAME
    // underlying page (#frame1's popup.html, "streams-page") — so by default
    // they'd share one scroll position. Each popup-backed tab got its own
    // remembered scrollY in this map, saved right before navigating away and
    // restored right after navigating in. S48 took games to a custom panel;
    // S51 takes settings (Deck Settings is now its own in-shell panel with
    // section-scoped popup embeds of its own) — no tab maps to the shared
    // popup page any more, so the map is empty and both helpers are no-ops.
    // The machinery stays in place, same as S48 left it.
    var POPUP_SCROLL_TABS = {}; // S51: settings left the popup page (custom Deck Settings panel)
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
        vdo: 'vdo-ninja',
        eventflow: 'event-flow-editor'
        // S51: settings left this map — Deck Settings is a CUSTOM_TAB (its
        // own sectioned panel). The 'streams' stock page is now driven only
        // from inside Deck Settings (Diagnostics/Full-stock-library stock-
        // stage doors), never as a tab underlay.
    };
    // Custom tabs render their OWN in-shell panel (no ARCADE_TAB_PAGE entry) —
    // navigateArcadeTab skips the stock-nav click for these, and CSS reveals
    // the panel + hides #content-pane while data-arcade-tab matches. The boot
    // guard is naturally a no-op for them (expected = ARCADE_TAB_PAGE[custom]
    // is undefined, so it never fights). See buildAddonsPanel().
    // S46: 'addons' (the gallery) is a nav berth; 'alerts' keeps its panel
    // but no berth — it opens through its gallery door (DOOR_PARENT). The
    // old 'elements' panel is retired, its cards re-homed in the gallery.
    // S48: 'games' joins the custom set — the hub is its own in-shell panel.
    // S49: 'commands' (chat commands + timers) and 'goals' (goal bars) too.
    // S50: 'frames' (Frames & Cameras) and 'tipjar' (the Tip Jar interior).
    // S51: 'settings' (Deck Settings) — the sectioned settings home.
    // TASK-64: 'ai' is a static member like every sibling since the delock
    // (the v1/v2 conditional-berth machinery is retired — see the TASK-64
    // note at the top of the file).
    // S50: 'frames' (Frames & Cameras) and 'tipjar' (the Tip Jar interior).
    // TASK-70: 'featured' (Lane 1), 'music'/'hype'/'map' (Lane 3 widget
    // interiors), 'overlays' (Lane 4 template gallery).
    var CUSTOM_TABS = { addons: true, style: true, alerts: true, games: true, commands: true, goals: true, frames: true, tipjar: true, settings: true, featured: true, music: true, hype: true, map: true, overlays: true };
    var bootGraceUntil = 0; // set on init(); see installBootGuard() below

    function clickStockNav(pageId) {
        var link = document.querySelector('#main-navigation a[data-page="' + pageId + '"]');
        if (link) link.click();
    }

    function navigateArcadeTab(tabId) {
        navPushCurrent(); // TASK-68 — the nav stack remembers where you came from
        requestFoldMeasures(); // S46B — a panel becoming visible changes what the fold math sees
        if (CUSTOM_TABS[tabId]) {
            // Custom in-shell panel (e.g. Elements): no stock page to drive —
            // remember the tab we're leaving and flip the tab state; CSS
            // reveals the panel and covers #content-pane. No clickStockNav.
            savePopupScroll(document.body.dataset.arcadeTab);
            setArcadeTab(tabId);
            if (tabId === 'style') ensureStylePanelLive(); // lazy: load saved blob + first preview on first visit
            if (tabId === 'alerts') ensureAlertsPanelLive(); // lazy: load saved param25 settings + first preview on first visit
            if (tabId === 'games') ensureGamesPanelLive(); // lazy (S48): load shelf/style/unlocks settings + first preview on first visit
            if (tabId === 'commands') ensureCommandsPanelLive(); // lazy (S49): load surface flows on first visit
            if (tabId === 'goals') ensureGoalsPanelLive(); // lazy (S49): load goals + first demo preview on first visit
            if (tabId === 'frames') ensureFramesPanelLive(); // lazy (S50): load guests/frame style, then the device frame (sendSync-before-churn order)
            if (tabId === 'tipjar') ensureTipjarPanelLive(); // lazy (S50): load payment rails + first demo preview on first visit
            if (tabId === 'settings') ensureDeckSettingsLive(); // lazy (S51): load deck settings + first section on first visit
            if (tabId === 'featured') ensureFeaturedPanelLive(); // lazy (TASK-70): load featured options + first demo preview on first visit
            if (tabId === 'music') ensureMusicPanelLive(); // lazy (TASK-70)
            if (tabId === 'hype') ensureHypePanelLive(); // lazy (TASK-70)
            if (tabId === 'map') ensureMapPanelLive(); // lazy (TASK-70)
            if (tabId === 'overlays') ensureOverlaysPanelLive(); // lazy (TASK-70)
            if (tabId === 'ai') ensureAiPanelLive(); // lazy (TASK-64): load AI settings + first zone on first visit
            return;
        }
        var pageId = ARCADE_TAB_PAGE[tabId];
        if (!pageId) return;
        savePopupScroll(document.body.dataset.arcadeTab); // capture the tab we're LEAVING
        clickStockNav(pageId);
        restorePopupScroll(tabId); // no-op for tabs other than settings (games is a custom panel since S48)
        setArcadeTab(tabId);
    }
    window.arcadeNavigateTab = navigateArcadeTab; // exposed for debugging/CDP verification

    // --------------------------------------------------------------------
    // TASK-68 (WALK 2A — the navigation doctrine) — the shell NAV-HISTORY
    // STACK. Every surface change (tab, interior selection, deck section)
    // pushes the location you LEFT; mouse back/forward buttons (and
    // Alt+←/→) walk it: back returns to the previous surface, forward
    // re-enters. A location = { tab, sub } where sub is the panel's own
    // selection (game / command / goal / section / zone), so back lands
    // you exactly where you were, not just on the right tab.
    //
    // Mouse-button research (this build, Linux/X11): Electron's
    // main-process 'app-command' (browser-backward/-forward) is the
    // Windows WM_APPCOMMAND lane and does NOT fire for X11 mouse buttons,
    // and wiring it would mean a main.js change (banned by the brief). On
    // X11 the physical back/forward buttons arrive in the renderer as
    // mousedown button 3 / button 4 — that is the wired lane, here and
    // (via wireArcadeNavFrame) inside every same-origin embedded frame,
    // whose events never bubble to the shell document.
    // --------------------------------------------------------------------
    var NAV_STACK_MAX = 60;
    var shellNavStack = [];
    var shellNavIndex = -1;
    var shellNavApplying = false;

    // Per-panel sub-state: the selection that makes a surface "where you
    // were". Getters read the live module vars; setters ride the panels'
    // own select functions (they re-render + keep aria in sync). All are
    // called defensively — a panel that isn't live yet simply isn't set.
    var NAV_SUBSTATE = {
        addons:   { get: function () { return { type: addonsActiveType }; },
                    set: function (s) { if (s && s.type) applyAddonsFilter(s.type); } },
        games:    { get: function () { return { key: gamesSelectedKey }; },
                    set: function (s) { if (s && s.key && gamesPanelLive) selectGamesKey(s.key); } },
        commands: { get: function () { return { id: cmdSelectedId }; },
                    set: function (s) { if (s && s.id && commandsPanelLive) selectCmdRow(s.id); } },
        goals:    { get: function () { return { id: goalsSelectedId }; },
                    set: function (s) { if (s && s.id && goalsPanelLive) selectGoalRow(s.id); } },
        alerts:   { get: function () { return { key: alertsSelectedKey }; },
                    set: function (s) { if (s && s.key && alertsPanelLive) selectAlertsKey(s.key); } },
        frames:   { get: function () { return { key: framesSelectedKey }; },
                    set: function (s) { if (s && s.key && framesPanelLive) selectFramesKey(s.key); } },
        tipjar:   { get: function () { return { key: tipjarSelectedKey }; },
                    set: function (s) { if (s && s.key && tipjarPanelLive) selectTipjarKey(s.key); } },
        overlays: { get: function () { return { file: overlaysSelectedFile }; },
                    set: function (s) { if (s && s.file && overlaysPanelLive) selectOverlayTemplate(s.file); } },
        settings: { get: function () { return { section: deckSelectedSection, view: deckDiagnosticsView }; },
                    set: function (s) {
                        if (!s || !s.section || !deckSettingsLive) return;
                        if (s.view) deckDiagnosticsView = s.view;
                        selectDeckSection(s.section, false);
                    } },
        ai:       { get: function () { return { zone: aiSelectedZone }; },
                    set: function (s) { if (s && s.zone && aiPanelLive) selectAiZone(s.zone); } }
    };

    function navCapture() {
        var tab = document.body.dataset.arcadeTab || 'main';
        var sub = null;
        try { if (NAV_SUBSTATE[tab]) sub = NAV_SUBSTATE[tab].get(); } catch (e) { sub = null; }
        return { tab: tab, sub: sub };
    }

    function navSameLoc(a, b) {
        if (!a || !b) return false;
        if (a.tab !== b.tab) return false;
        return JSON.stringify(a.sub || null) === JSON.stringify(b.sub || null);
    }

    // Push WHERE WE ARE before a change leaves it. Dedupes against the
    // current position so no-op selects and re-renders never stack junk;
    // a fresh push truncates the forward lane (classic history doctrine).
    function navPushCurrent() {
        if (shellNavApplying) return;
        var here = navCapture();
        if (shellNavIndex >= 0 && navSameLoc(shellNavStack[shellNavIndex], here)) return;
        shellNavStack = shellNavStack.slice(0, shellNavIndex + 1);
        shellNavStack.push(here);
        if (shellNavStack.length > NAV_STACK_MAX) shellNavStack.shift();
        shellNavIndex = shellNavStack.length - 1;
    }

    function navApplyLocation(loc) {
        if (!loc || !loc.tab) return;
        shellNavApplying = true;
        try {
            if ((document.body.dataset.arcadeTab || 'main') !== loc.tab) navigateArcadeTab(loc.tab);
        } catch (e) { /* noop */ }
        // Sub-state: panels are lazy (ensure*PanelLive resolves async), so
        // the set is attempted now and retried twice — but only while the
        // user is still on that tab (never yank a later navigation back).
        var attempts = [0, 450, 1300];
        attempts.forEach(function (delay, i) {
            setTimeout(function () {
                try {
                    // never yank a later navigation back — only set while
                    // the user is still on that tab
                    if ((document.body.dataset.arcadeTab || 'main') === loc.tab && NAV_SUBSTATE[loc.tab] && loc.sub) {
                        NAV_SUBSTATE[loc.tab].set(loc.sub);
                    }
                } catch (e) { /* noop */ }
                // the flag clears UNCONDITIONALLY on the last attempt — an
                // early return above must never freeze the stack (it did:
                // a quick navigate-away left shellNavApplying stuck true and
                // every later push was silently swallowed).
                if (i === attempts.length - 1) shellNavApplying = false;
            }, delay);
        });
    }

    function arcadeNavBack() {
        navPushCurrent(); // the surface we're leaving becomes the forward lane
        if (shellNavIndex <= 0) return false;
        shellNavIndex--;
        navApplyLocation(shellNavStack[shellNavIndex]);
        return true;
    }

    function arcadeNavForward() {
        if (shellNavIndex >= shellNavStack.length - 1) return false;
        shellNavIndex++;
        navApplyLocation(shellNavStack[shellNavIndex]);
        return true;
    }
    window.arcadeNavBack = arcadeNavBack;     // exposed for CDP verification + the Event Flow ← Back door
    window.arcadeNavForward = arcadeNavForward;
    window.arcadeNavState = function () { return { depth: shellNavIndex, length: shellNavStack.length, tabs: shellNavStack.map(function (l) { return l.tab; }) }; };

    // Mouse back/forward: mousedown button 3 (back) / 4 (forward) — the X11
    // lane (see the research note above). preventDefault so no embedded
    // stock page interprets the gesture on its own.
    document.addEventListener('mousedown', function (e) {
        if (e.button === 3) { e.preventDefault(); arcadeNavBack(); }
        else if (e.button === 4) { e.preventDefault(); arcadeNavForward(); }
    });
    // Keyboard lane (H18-A): Alt+← / Alt+→ walk the same stack.
    document.addEventListener('keydown', function (e) {
        if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); arcadeNavBack(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); arcadeNavForward(); }
    });

    // Frame wiring: iframe content swallows mouse events before the shell
    // document ever sees them, so the same back/forward listener is wired
    // INSIDE every same-origin frame (the stock frames, the chat dock, the
    // deck embeds, the device page). Cross-origin frames skip silently.
    function wireArcadeNavFrame(frame) {
        if (!frame) return;
        var hook = function () {
            try {
                var doc = frame.contentDocument;
                if (!doc || doc.__arcadeNavWired) return;
                doc.__arcadeNavWired = true;
                doc.addEventListener('mousedown', function (e) {
                    if (e.button === 3) { e.preventDefault(); arcadeNavBack(); }
                    else if (e.button === 4) { e.preventDefault(); arcadeNavForward(); }
                });
            } catch (e) { /* cross-origin — skip */ }
        };
        hook();
        frame.addEventListener('load', hook);
    }

    // Interior selection changes are surfaces too: wrap every panel's
    // select function so a pick pushes where you were. Function
    // declarations hoist, so the originals are already live at this point;
    // navPushCurrent's dedupe makes the early-return no-op picks free.
    function navWrapSelect(fn) {
        if (typeof fn !== 'function') return fn;
        return function () { navPushCurrent(); return fn.apply(null, arguments); };
    }
    selectGamesKey = navWrapSelect(selectGamesKey);
    selectCmdRow = navWrapSelect(selectCmdRow);
    selectGoalRow = navWrapSelect(selectGoalRow);
    selectAlertsKey = navWrapSelect(selectAlertsKey);
    selectFramesKey = navWrapSelect(selectFramesKey);
    selectTipjarKey = navWrapSelect(selectTipjarKey);
    selectAiZone = navWrapSelect(selectAiZone);
    applyAddonsFilter = navWrapSelect(applyAddonsFilter);
    selectDeckSection = navWrapSelect(selectDeckSection);


    // --------------------------------------------------------------------
    // H17-B (TASK-46/S49 ruled rider) — after a hamburger-sheet pick,
    // keyboard focus lands IN the destination panel (its first focusable
    // control; the panel itself as the heading fallback), never back on the
    // burger. Close-WITHOUT-pick (Escape, click-outside, re-clicking the
    // trigger) still returns focus to the trigger. The Add-ons types drawer
    // follows the same rule after a type pick (focus lands in the filtered
    // card grid, not back on TYPE ▾).
    // --------------------------------------------------------------------
    var CUSTOM_TAB_PANEL = {
        addons: '.arcade-addons', style: '.arcade-style', alerts: '.arcade-alerts',
        games: '.arcade-games', commands: '.arcade-commands', goals: '.arcade-goals', ai: '.arcade-ai',
        frames: '.arcade-frames', tipjar: '.arcade-tipjar', settings: '.arcade-settings',
        featured: '.arcade-featured', music: '.arcade-music', hype: '.arcade-hype',
        map: '.arcade-map', overlays: '.arcade-overlays'
    };

    function focusFirstInteractiveIn(root, fallbackEl) {
        if (!root) return false;
        var candidates = root.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        for (var i = 0; i < candidates.length; i++) {
            // offsetParent null = display:none/hidden ancestor (e.g. a filtered-out card) — skip
            if (candidates[i].offsetParent === null) continue;
            candidates[i].focus();
            return true;
        }
        if (fallbackEl) {
            if (!fallbackEl.hasAttribute('tabindex')) fallbackEl.setAttribute('tabindex', '-1');
            fallbackEl.focus({ preventScroll: true });
            return true;
        }
        return false;
    }

    // H18-A listbox contract, one shared helper (TASK-47/S50 — written for
    // the S47 alerts-list backfill the dispatch rider ruled, used by the new
    // S50 lists too; S49's three inline implementations are the reference
    // and stay as they are). A role="listbox" is a promise: ArrowUp/
    // ArrowDown/Home/End move the selection (aria-selected follows the row
    // render) and focus re-lands on the fresh row element for the same id.
    // Rows are real buttons, so Tab already reaches them — arrows are the
    // listbox contract on top.
    function attachArcadeListboxNav(list, rowSelector, getSelectedId, selectFn, idFromRow) {
        if (!list) return;
        list.addEventListener('keydown', function (e) {
            if (['ArrowUp', 'ArrowDown', 'Home', 'End'].indexOf(e.key) === -1) return;
            var rows = Array.prototype.slice.call(list.querySelectorAll(rowSelector));
            if (!rows.length) return;
            e.preventDefault();
            var idx = rows.findIndex(function (r) { return idFromRow(r) === getSelectedId(); });
            if (e.key === 'Home') idx = 0;
            else if (e.key === 'End') idx = rows.length - 1;
            else idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
            var id = idFromRow(rows[idx]);
            selectFn(id);
            var fresh = null;
            Array.prototype.slice.call(list.querySelectorAll(rowSelector)).forEach(function (r) {
                if (idFromRow(r) === id) fresh = r;
            });
            if (fresh) fresh.focus();
        });
    }

    function focusArcadeDestination(tabId, pageId) {

        // One frame out, so the tab flip's CSS visibility applies before we
        // measure what's focusable.
        requestAnimationFrame(function () {
            if (tabId && CUSTOM_TAB_PANEL[tabId]) {
                var panel = document.querySelector(CUSTOM_TAB_PANEL[tabId]);
                focusFirstInteractiveIn(panel, panel);
                return;
            }
            // Stock destinations: the chat dock for Main, frame2 for the
            // dashboard/event-flow views (index.html:11622), frame1 else.
            var frame = null;
            if (tabId === 'main' || pageId === 'chat') frame = document.getElementById('chat-dock-frame');
            else if (pageId === 'dashboard' || pageId === 'event-flow-editor') frame = document.getElementById('frame2');
            else frame = document.getElementById('frame1');
            if (frame) frame.focus();
        });
    }

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
            '<button type="button" class="arcade-btn arcade-btn--primary" id="arcade-add-source" aria-haspopup="dialog" aria-expanded="false" aria-controls="arcade-addsrc-picker">+<span class="arcade-rail-hide">&nbsp;Add source</span></button>' +
            '</div>' +
            '<ul class="arcade-src-list" id="arcade-src-list"></ul>' +
            '<div class="arcade-src-foot">' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-start-all">Start all</button>' +
            '<button type="button" class="arcade-btn arcade-btn--sm arcade-btn--danger" id="arcade-stop-all">Stop all</button>' +
            '</div>';
        document.body.appendChild(rail);

        rail.querySelector('#arcade-add-source').addEventListener('click', function () {
            // TASK-67 — the full provider picker returns (was: a bare jump to
            // Deck Settings → Connections, which lost the provider list).
            openAddSourcePicker();
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
        initSideCollapseToggle(side.querySelector('#arcade-side-toggle'));
    }

    // --------------------------------------------------------------------
    // Add-ons gallery — the custom "Add-ons" tab (S46, TASK-43). A
    // full-width in-shell panel over the content area, built once at boot
    // and CSS-hidden until its tab is on
    // (body.arcade-shell[data-arcade-tab="addons"]). The ruled shell shape
    // (Add-On Arcade round 3): TYPE list down the LEFT (the sources-rail
    // pattern — topbar + left item column + stage), card grid on the right.
    // Cards = ADDON_DOORS (open today's surfaces) + ELEMENTS (re-homed from
    // the retired Elements tab; 'ready' cards expose Copy overlay URL built
    // via the app's own resolver — see buildElementOverlayUrl; 'planned'
    // cards are honest, non-interactive SOON stubs). Grid order follows the
    // ruled type order; filtering is hide/show via [hidden], cards are built
    // once. Spec lineage: design-briefs/ssn-ui-overhaul/
    // element-registry-spec.md (registry) + the Add-On Arcade board round 3
    // (gallery).
    //
    // No "Send to OBS" button by design: the Electron StreamDeck bridge has
    // no add-browser-source action, and the fleet's real OBS paths live
    // elsewhere — TouchPortal's OBS link, the Event Flow editor's OBS
    // actions, and VDO's OBS camera-join scene. The house workflow is
    // Copy overlay URL -> paste as an OBS browser source.
    // --------------------------------------------------------------------
    var addonsActiveType = 'all';

    function addonTypeLabel(typeId) {
        var t = ADDON_TYPES.find(function (x) { return x.id === typeId; });
        return t ? t.label : String(typeId || '').toUpperCase();
    }

    function addonTypeCount(typeId) {
        var n = 0;
        ADDON_DOORS.forEach(function (d) { if (typeId === 'all' || d.addonType === typeId) n++; });
        ELEMENTS.forEach(function (el) { if (typeId === 'all' || el.addonType === typeId) n++; });
        return n;
    }

    function buildAddonsPanel() {
        var panel = document.createElement('section');
        panel.className = 'arcade-addons';
        panel.setAttribute('aria-label', 'Add-ons gallery');
        panel.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title">ADD-ONS</span>' +
            '<button type="button" class="arcade-addons-typesbtn" aria-haspopup="true" aria-expanded="false" aria-controls="arcade-addons-types-pop">' +
            'TYPE: <span id="arcade-addons-typesbtn-label">ALL</span> ▾</button>' +
            '<div class="arcade-addons-types-pop" id="arcade-addons-types-pop" role="menu" aria-label="Add-on types"></div>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-el-hint">Everything on stream is an add-on — open one to work with it in place</span>' +
            '</div>' +
            '<div class="arcade-addons-body">' +
            '<nav class="arcade-addons-types" aria-label="Add-on types"></nav>' +
            '<div class="arcade-addons-stage">' +
            '<div class="arcade-el-grid" id="arcade-addons-grid"></div>' +
            '<p class="arcade-addons-empty" id="arcade-addons-empty" hidden></p>' +
            '</div>' +
            '</div>';
        document.body.appendChild(panel);

        var typesNav = panel.querySelector('.arcade-addons-types');
        ADDON_TYPES.forEach(function (t) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.arcadeAddonType = t.id;
            btn.setAttribute('aria-pressed', String(t.id === addonsActiveType));
            var label = document.createElement('span');
            label.textContent = t.label;
            btn.appendChild(label);
            var count = document.createElement('span');
            count.className = 'arcade-addons-type__count';
            count.textContent = String(addonTypeCount(t.id));
            btn.appendChild(count);
            btn.addEventListener('click', function () { applyAddonsFilter(t.id); });
            typesNav.appendChild(btn);
        });

        // S46B — the same type rows again as FULL-SIZE drawer rows for the
        // folded state (is-types-folded hides the column, shows the TYPES ▾
        // trigger). They carry the same data-arcade-addon-type attribute, so
        // applyAddonsFilter's existing sweep keeps is-on/aria-pressed in
        // sync across both presentations for free.
        var typesBtn = panel.querySelector('.arcade-addons-typesbtn');
        var typesPop = panel.querySelector('.arcade-addons-types-pop');
        ADDON_TYPES.forEach(function (t) {
            var row = document.createElement('button');
            row.type = 'button';
            row.dataset.arcadeAddonType = t.id;
            row.setAttribute('role', 'menuitem');
            row.setAttribute('aria-pressed', String(t.id === addonsActiveType));
            var rowLabel = document.createElement('span');
            rowLabel.textContent = t.label;
            row.appendChild(rowLabel);
            var rowCount = document.createElement('span');
            rowCount.className = 'arcade-addons-type__count';
            rowCount.textContent = String(addonTypeCount(t.id));
            row.appendChild(rowCount);
            row.addEventListener('click', function () {
                // H17-B — after a type pick, focus lands IN the filtered card
                // grid (first visible card control; the stage as fallback),
                // not back on the TYPE ▾ trigger. Close-without-pick still
                // returns to the trigger.
                closeTypesPop(false);
                applyAddonsFilter(t.id);
                focusFirstInteractiveIn(
                    panel.querySelector('#arcade-addons-grid'),
                    panel.querySelector('.arcade-addons-stage')
                );
            });
            typesPop.appendChild(row);
        });

        function typesPopIsOpen() { return typesPop.classList.contains('is-open'); }
        function openTypesPop() {
            typesPop.classList.add('is-open');
            typesBtn.setAttribute('aria-expanded', 'true');
            var current = typesPop.querySelector('button.is-on') || typesPop.querySelector('button');
            if (current) current.focus(); // focus lands in the drawer on open
        }
        function closeTypesPop(returnFocus) {
            if (!typesPopIsOpen()) return;
            typesPop.classList.remove('is-open');
            typesBtn.setAttribute('aria-expanded', 'false');
            if (returnFocus) typesBtn.focus(); // and returns to the trigger on close
        }
        addonsTypesPopApi = { close: closeTypesPop, isOpen: typesPopIsOpen };

        typesBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (typesPopIsOpen()) closeTypesPop(true); else openTypesPop();
        });
        typesPop.addEventListener('click', function (e) { e.stopPropagation(); });
        document.addEventListener('click', function () { closeTypesPop(false); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && typesPopIsOpen()) closeTypesPop(true);
        });

        // Cards in ruled type order: door cards first within a type, then
        // the re-homed element cards. Built once; filtering only toggles
        // [hidden] (applyAddonsFilter).
        var grid = panel.querySelector('#arcade-addons-grid');
        ADDON_TYPES.forEach(function (t) {
            if (t.id === 'all') return;
            ADDON_DOORS.forEach(function (d) {
                if (d.addonType === t.id) grid.appendChild(buildAddonDoorCard(d));
            });
            ELEMENTS.forEach(function (el) {
                if (el.addonType === t.id) grid.appendChild(buildElementCard(el));
            });
        });

        applyAddonsFilter(addonsActiveType);
    }

    function applyAddonsFilter(typeId) {
        addonsActiveType = typeId;
        var panel = document.querySelector('.arcade-addons');
        if (!panel) return;
        var btnLabel = panel.querySelector('#arcade-addons-typesbtn-label');
        if (btnLabel) btnLabel.textContent = addonTypeLabel(typeId).toUpperCase(); // S46B folded trigger names the live filter
        panel.querySelectorAll('[data-arcade-addon-type]').forEach(function (btn) {
            var on = btn.dataset.arcadeAddonType === typeId;
            btn.classList.toggle('is-on', on);
            btn.setAttribute('aria-pressed', String(on));
        });
        var visible = 0;
        panel.querySelectorAll('#arcade-addons-grid [data-arcade-addon-card-type]').forEach(function (card) {
            var show = (typeId === 'all' || card.dataset.arcadeAddonCardType === typeId);
            card.hidden = !show;
            if (show) visible++;
        });
        // Honest empty state (charter: no fake content, ever) — 'chat' has
        // no v1 cards; the wave that lands them is named, nothing is faked.
        var empty = panel.querySelector('#arcade-addons-empty');
        if (empty) {
            empty.hidden = visible !== 0;
            if (visible === 0) {
                empty.textContent = 'No ' + addonTypeLabel(typeId) + ' add-ons yet — they land in this gallery in a later update.';
            }
        }
    }

    // Door card — TASK-68 (WALK 2A item 4): the card AUTO-OPENS its
    // interior — no separate "Open" step. The accessible control is the
    // card's NAME (a real button, focusable, Enter/Space activates); a
    // click anywhere else on the card delegates to it. The card's other
    // doors (none on door cards) stay small secondary controls.
    function buildAddonDoorCard(door) {
        var card = document.createElement('article');
        card.className = 'arcade-el-card arcade-el-card--opens';
        card.dataset.arcadeAddon = door.id;
        card.dataset.arcadeAddonCardType = door.addonType || '';

        var head = document.createElement('div');
        head.className = 'arcade-el-card__head';
        var nameBtn = document.createElement('button');
        nameBtn.type = 'button';
        nameBtn.className = 'arcade-el-card__namebtn';
        nameBtn.textContent = door.name;
        nameBtn.setAttribute('aria-label', 'Open ' + door.name);
        nameBtn.title = door.cta || ('Open ' + door.name);
        nameBtn.addEventListener('click', function () { navigateArcadeTab(door.tab); });
        head.appendChild(nameBtn);
        var cat = document.createElement('span');
        cat.className = 'arcade-pill arcade-el-cat';
        cat.textContent = addonTypeLabel(door.addonType).toUpperCase();
        head.appendChild(cat);
        var status = document.createElement('span');
        status.className = 'arcade-pill arcade-el-status arcade-el-status--ready';
        status.textContent = 'READY';
        head.appendChild(status);
        card.appendChild(head);

        var blurb = document.createElement('p');
        blurb.className = 'arcade-el-card__blurb';
        blurb.textContent = door.blurb || '';
        card.appendChild(blurb);

        var actions = document.createElement('div');
        actions.className = 'arcade-el-card__actions';
        var openHint = document.createElement('span');
        openHint.className = 'arcade-el-card__openhint';
        openHint.textContent = 'Click the card to open ›';
        actions.appendChild(openHint);
        card.appendChild(actions);

        // Card-body click delegates to the name button (nested controls
        // keep their own behavior).
        card.addEventListener('click', function (e) {
            if (e.target.closest('button, a, input, select, textarea')) return;
            nameBtn.click();
        });

        return card;
    }

    function elementCategoryLabel(cat) {
        switch (cat) {
            case 'music': return 'MUSIC';
            case 'tips': return 'TIPS';
            case 'hype': return 'HYPE';
            case 'community': return 'COMMUNITY';
            case 'chat': return 'CHAT';
            default: return String(cat || '').toUpperCase();
        }
    }

    function buildElementCard(el) {
        var ready = el.status === 'ready';
        // TASK-68 (item 4) — auto-open: a card with an interior (the jars'
        // Set up → the Tip Jar interior) opens it from the card itself;
        // overlay-only cards (no interior exists yet) keep Copy as their
        // primary door and say so honestly.
        var opensInterior = ready && !!el.setup;
        var card = document.createElement('article');
        card.className = 'arcade-el-card' + (ready ? '' : ' arcade-el-card--planned') + (opensInterior ? ' arcade-el-card--opens' : '');
        card.dataset.arcadeElement = el.id;
        card.dataset.arcadeElementCategory = el.category || '';
        card.dataset.arcadeAddonCardType = el.addonType || '';

        var head = document.createElement('div');
        head.className = 'arcade-el-card__head';
        var nameEl;
        if (opensInterior) {
            nameEl = document.createElement('button');
            nameEl.type = 'button';
            nameEl.className = 'arcade-el-card__namebtn';
            nameEl.textContent = el.name;
            nameEl.setAttribute('aria-label', 'Open ' + el.name + ' setup');
            nameEl.title = 'Open the ' + el.name + ' interior';
            // TASK-70 — the interior tab rides the entry (every widget card
            // has its own interior now), no longer hardcoded to tipjar.
            nameEl.addEventListener('click', function () { navigateArcadeTab(el.tab || 'tipjar'); });
        } else {
            nameEl = document.createElement('h3');
            nameEl.className = 'arcade-el-card__name';
            nameEl.textContent = el.name;
        }
        head.appendChild(nameEl);
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
            if (el.id === 'tipjar') {
                // TASK-71 (item 6, H27 ruled) — the Tip Jar card carries BOTH
                // labeled doors: Goal jar AND Visual jar, each naming its
                // target, each echoing what rode. No either/or picker.
                actions.appendChild(buildTipjarCopyDoor('goal', !opensInterior));
                actions.appendChild(buildTipjarCopyDoor('visual', false));
            } else {
                var copyBtn = document.createElement('button');
                copyBtn.type = 'button';
                // TASK-68 — the auto-open doctrine demotes Copy to the small
                // secondary door on cards that open; overlay-only cards keep it
                // primary (copying IS their interior-less workflow).
                copyBtn.className = opensInterior ? 'arcade-btn arcade-btn--sm' : 'arcade-btn arcade-btn--primary';
                copyBtn.textContent = 'Copy overlay URL';
                copyBtn.addEventListener('click', function () { copyElementOverlayUrl(el, copyBtn); });
                actions.appendChild(copyBtn);
            }
            // S50 — MONEY placement law: the Tip Jar's Set up opens from the
            // Money card, NEVER inside Frames & Cameras or any other surface.
            // TASK-68 — on an auto-open card the whole card IS the Set up
            // door; the small secondary button stays for discoverability.
            if (el.setup) {
                var setupBtn = document.createElement('button');
                setupBtn.type = 'button';
                setupBtn.className = 'arcade-btn arcade-btn--sm';
                setupBtn.textContent = 'Set up';
                setupBtn.addEventListener('click', function () { navigateArcadeTab(el.tab || 'tipjar'); });
                actions.appendChild(setupBtn);
            }
            card.appendChild(actions);
        }

        if (opensInterior) {
            card.addEventListener('click', function (e) {
                if (e.target.closest('button, a, input, select, textarea')) return;
                nameEl.click();
            });
        }

        return card;
    }

    // TASK-68 (WALK 2A item 4) — the breadcrumb trail every Add-ons door
    // interior carries at the TOP of its left list: where you came from
    // (‹ Add-ons — climbs back one level, the nav stack's forward lane
    // re-enters here) and where you are. Keyboard: it's a real button in
    // the column's tab order, first stop in the interior.
    function buildAddonsCrumb(currentLabel) {
        var nav = document.createElement('nav');
        nav.className = 'arcade-crumb';
        nav.setAttribute('aria-label', 'Breadcrumb');
        var back = document.createElement('button');
        back.type = 'button';
        back.className = 'arcade-crumb__back';
        back.textContent = '‹ Add-ons';
        back.title = 'Back to the Add-ons gallery';
        back.setAttribute('aria-label', 'Back to the Add-ons gallery');
        back.addEventListener('click', function () { navigateArcadeTab('addons'); });
        nav.appendChild(back);
        var sep = document.createElement('span');
        sep.className = 'arcade-crumb__sep';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = '/';
        nav.appendChild(sep);
        var here = document.createElement('span');
        here.className = 'arcade-crumb__here';
        here.setAttribute('aria-current', 'location');
        here.textContent = currentLabel;
        nav.appendChild(here);
        return nav;
    }

    // One crumb per door interior, prepended to its left list column at
    // boot. Event Flow + VDO are stock-underlay tabs (no shell left list) —
    // Event Flow's trail is its ← Back door (item 6); VDO keeps none.
    // TASK-70: the single-widget interiors (Lanes 1/3) have no left list —
    // their crumb rides the STAGE top instead.
    function installAddonsCrumbs() {
        [
            ['.arcade-alerts', 'Alerts'],
            ['.arcade-games', 'Games'],
            ['.arcade-commands', 'Commands'],
            ['.arcade-goals', 'Goal Bars'],
            ['.arcade-frames', 'Frames & Cameras'],
            ['.arcade-tipjar', 'Tip Jar'],
            ['.arcade-overlays', 'Overlay templates']
        ].forEach(function (entry) {
            var panel = document.querySelector(entry[0]);
            if (!panel) return;
            var col = panel.querySelector('.arcade-evt-list-col');
            if (!col || col.querySelector('.arcade-crumb')) return;
            col.insertBefore(buildAddonsCrumb(entry[1]), col.firstChild);
        });
        [
            ['.arcade-featured', 'Featured Chat'],
            ['.arcade-music', 'Now Playing'],
            ['.arcade-hype', 'Hype Train'],
            ['.arcade-map', 'Fren Map']
        ].forEach(function (entry) {
            var panel = document.querySelector(entry[0]);
            if (!panel) return;
            var stage = panel.querySelector('.arcade-widget-stage');
            if (!stage || stage.querySelector('.arcade-crumb')) return;
            stage.insertBefore(buildAddonsCrumb(entry[1]), stage.firstChild);
        });
    }

    // Build the copyable OBS overlay URL for an element via the app's OWN
    // resolver + session helpers. index.html's inline script is a classic
    // (non-module) script, so its top-level helpers are window globals — but
    // we feature-detect defensively so a future build change degrades to an
    // honest error rather than throwing. Returns a Promise<string url>.
    function buildElementOverlayUrl(el, extraUrlParams) {
        var resolver = window.resolveSocialStreamPage;
        if (typeof resolver !== 'function') {
            return Promise.reject(new Error('overlay resolver unavailable'));
        }
        var extra = (el.params || []).slice().concat(extraUrlParams || []);
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
        // TASK-70 — the card copy composes the operator's configured extras:
        // the Tip Jar card copies the GOAL jar wearing the interior's chosen
        // look (Lane 2); Featured Chat carries the whitelist filter (Lane 1);
        // Hype/Fren Map carry their option toggles (Lane 3). Everything else
        // composes exactly as before.
        var urlPromise;
        if (el.id === 'tipjar') {
            urlPromise = loadTipjarStyleSettings().then(function () { return buildElementOverlayUrl(el, tipjarStyleUrlParams()); });
        } else if (el.id === 'featured') {
            urlPromise = loadFeaturedOptions().then(function () { return buildElementOverlayUrl(el, featuredUrlParams()); });
        } else if (el.id === 'hype') {
            urlPromise = loadHypeOptions().then(function () { return buildElementOverlayUrl(el, hypeUrlParams()); });
        } else if (el.id === 'map') {
            urlPromise = loadMapOptions().then(function () { return buildElementOverlayUrl(el, mapUrlParams()); });
        } else {
            urlPromise = buildElementOverlayUrl(el);
        }
        urlPromise.then(function (url) {
            if (!url) throw new Error('empty overlay url');
            return copyToClipboard(url).then(function () { flashButton(btn, 'Copied ✓'); });
        }).catch(function (e) {
            console.error('[arcade-shell] copy overlay url failed:', e);
            flashButton(btn, 'Open from Settings', 2200);
        });
    }

    // --------------------------------------------------------------------
    // Alerts — EVENTS AS EASY FLOWS (S47 interior redesign, ruled layout
    // rounds 6/7; supersedes the Stage-2 card grid, which lives on only as
    // the param25 plumbing below). Spec: TASK-44/S47 brief + pacsarcade
    // design-briefs/ssn-ui-overhaul/alert-style-builder-spec.md.
    //
    // LAYOUT: LEFT = the alert EVENTS as a selectable list, grouped by the
    // stock builder's own sectioning (ALERT_GROUPS — see the citation there),
    // every row honestly showing its tier chip and its real active/inactive
    // state (driven by the same param25 enable settings the popup owns).
    // RIGHT = a BIG multi-alerts.html preview pane on TOP (test-fire lives
    // here, never on a live session) with the selected event's edit/config
    // BELOW: variant dropdown, tier select, [Style] and [Event flow] doors.
    //
    // MODEL (one card per event type — no card multiplication): the stock 7
    // (follow/subscription/donation/bits/raid/auction/hype) each edit the
    // SAME per-event param25 settings the popup's multi-alert section owns
    // (multi-alerts.js CATEGORY_*_PARAMS, ~:221-280). VARIANTS live in a
    // dropdown per event: "Template" (the stock param25 look, snapshotted at
    // first fork) plus every custom the streamer saved. Editing a template
    // FORKS — saves-as a new option, template untouched; the selected option
    // is written through to param25, so it is what fires live (and what the
    // popup's own copy-link composes). Variant/flow/tier metadata rides ONE
    // arcade-owned settings key (arcadeAlertVariants, textparam1, canonical
    // saveSetting — same rail arcadeStylePresets uses); the tier NAMES ride
    // a second key (arcadeAlertTiers) seeded once here and taken over by
    // S51's Points-page admin. Under the hood alerts stay
    // multi-alerts.html + EventFlow — NO parallel alert engine.
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
    //
    // S47B — THE TWO RULED RIDERS (TASK-50, ruled off the S47 report's
    // decision board; everything else on that board stays "as built"):
    //  D1-B — a one-click "Turn on first-timers" switch beside the first-time
    //    chatter checkbox (buildAlertConditionBox), rendered ONLY while the
    //    stock `firsttimers` setting is off. One click writes the setting
    //    through the SAME canonical saveSetting payload the popup's own
    //    toggle uses (popup.js:6259-6267), plus the popup's companion
    //    local-DB re-enable (popup.js:5538-5546 — background.js:16595 sets
    //    `firsttime` only when firsttimers is on AND disableDB is off). The
    //    button's title states the honest side effect (the dock starts
    //    highlighting first-time chatters — stock behavior). No auto-enable
    //    anywhere; state is re-read on every surface render, no polling.
    //  D2-C — overlay-only test-fire for flow-backed custom events: "Fire
    //    test alert" is allowed ONLY when EVERY action node in the event's
    //    flow is on the ALERT_OVERLAY_ONLY_ACTIONS allow-list (default-deny,
    //    unknown ids included); otherwise the UI says WHY, naming the first
    //    disqualifying action. The fire runs the flow's REAL action chain
    //    through stock's own engine on a THROWAWAY EventFlowSystem whose
    //    only transport is aimed at the preview frame — loaded with
    //    actions.html WITHOUT a session, inert by construction (no bridge
    //    iframe, no socket — actions.html:1211-1220, :2028-2040; stock's
    //    unconditional OBS probe at :1145-1146 is pinned to a dead localhost
    //    port via &obsws=) — via the
    //    page's OWN exposed test hook (window.testAction,
    //    actions.html:2020-2024). Parent window and live session receive
    //    NOTHING; qualification re-evaluates on every surface render and
    //    reads action nodes only (the condition-sync machinery is untouched).
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

    // S47 — the LEFT LIST's grouping. The literal strings "priority/general/
    // other alerts" do NOT exist in stock (grep-verified across the bundle);
    // this mapping derives from what the stock builder REALLY sections, cited:
    //  - PRIORITY (money events): donation/bits are the ONLY alert categories
    //    stock gives a per-event gate ("Minimum cash value for donation/bits
    //    alerts", popup.html:6112-6115, mindonation param), and stock's dock
    //    ships a donation-priority concept (donationpriority, popup.html:12830).
    //  - GENERAL (social events): follow/subscription/raid — the remaining
    //    default-enabled categories (CATEGORY_DISABLE_PARAMS,
    //    multi-alerts.js:231-238; the "Skip X alerts" toggles,
    //    popup.html:6064-6097).
    //  - OTHER (opt-in): auction/hype — stock's opt-in pair
    //    (CATEGORY_OPT_IN_PARAMS, multi-alerts.js:240-243; both toggles
    //    titled "Opt-in: …", popup.html:6098-6111).
    var ALERT_GROUPS = [
        { id: 'priority', label: 'Priority alerts', events: ['donation', 'bits'] },
        { id: 'general', label: 'General alerts', events: ['follow', 'subscription', 'raid'] },
        { id: 'other', label: 'Other (opt-in)', events: ['auction', 'hype'] }
    ];

    // EventFlow trigger backing each stock event — for the [Event flow] door
    // seed. Dedicated stock triggers where they exist (EventFlowEditor.js
    // :247-253); auction/hype have none, so they ride eventCustom with the
    // REAL event names multi-alerts.js keys on (multi-alerts.js:100-101).
    var ALERT_EVENT_TRIGGERS = {
        follow: { triggerType: 'eventNewFollower' },
        subscription: { triggerType: 'eventNewSubscriber' },
        donation: { triggerType: 'eventDonation' },
        bits: { triggerType: 'eventCheer' },
        raid: { triggerType: 'eventRaid' },
        auction: { triggerType: 'eventCustom', eventType: 'auction_update' },
        hype: { triggerType: 'eventCustom', eventType: 'hype_train' }
    };

    // "+ Add event" picker defaults: the stock DEDICATED event triggers that
    // are NOT already one of the 7 shelf events (EventFlowEditor.js:249-250).
    var ALERT_ADD_EVENT_DEFAULTS = [
        { triggerType: 'eventResub', eventType: '', label: 'Resub / Renewal', desc: 'Fires when a subscription or membership renews.' },
        { triggerType: 'eventGiftSub', eventType: '', label: 'Gift Sub', desc: 'Fires when someone gifts subscriptions.' }
    ];

    // Priority conditions wire ONLY through what EventFlow already evaluates
    // (no new evaluators invented): platform rides the dedicated triggers'
    // own config.sources filter (EventFlowSystem.js:2240-2305), first-time
    // rides messageProperties' requiredProperties on the real `firsttime`
    // message property (EventFlowSystem.js:2841-2880; set by background.js
    // :16595-16604 when the stock `firsttimers` setting is on).
    var ALERT_CONDITION_PLATFORMS = ['twitch', 'kick', 'youtube', 'tiktok'];

    // S47B (ruled D2-C) — overlay-type action allow-list for the flow-backed
    // test-fire: the editor's own "🎨 Media & Effects" catalog group
    // (EventFlowEditor.js:380-392), every id cited to where it renders —
    // each posts {overlayNinja:…} to the `actions` label consumed by
    // actions.html (or, for delay, never leaves the engine):
    //   playTenorGiphy → play_media  (EventFlowSystem.js:3777-3808 → actions.html:1385-1408)
    //   playAudioClip  → play_audio  (EventFlowSystem.js:3936-3958 → actions.html:1426+)
    //   showText       → show_text   (EventFlowSystem.js:3842-3898 → actions.html:1819)
    //   showAvatar     → show_avatar (EventFlowSystem.js:3810-3840 → actions.html:1815)
    //   clearLayer     → clear_layer (EventFlowSystem.js:3900-3914 → actions.html:1823; overlay-local)
    //   delay          → engine-local setTimeout, zero I/O (EventFlowSystem.js:3960-3965)
    // Anything else leaves the overlay (webhook posts HTTP, OBS rides to the
    // obs-websocket client, TTS-out, custom JS, points writes, relays,
    // spotify/MIDI/user-memory/state…) and disqualifies the flow.
    // DEFAULT-DENY: an id not listed here disqualifies, known or not.
    var ALERT_OVERLAY_ONLY_ACTIONS = ['playTenorGiphy', 'playAudioClip', 'showText', 'showAvatar', 'clearLayer', 'delay'];

    // Arcade-owned settings keys (canonical saveSetting, textparam1 — the
    // same rail arcadeStylePresets rides). NAMES only ever appear in reports.
    var ALERT_VARIANTS_KEY = 'arcadeAlertVariants';
    var ALERT_TIERS_KEY = 'arcadeAlertTiers';
    var ALERT_TIERS_DEFAULT = ['HIGH', 'NORMAL', 'LOW']; // minimal names-only list; S51's Points-page admin takes this key over
    var ALERT_DEFAULT_KEY = 'default'; // the "All types — default" left-list entry

    var alertsPanelLive = false;
    var alertsState = {}; // category -> { accent, style, template, font, media, sound, enabled } — live param25 truth
    var alertsDoc = null; // parsed arcadeAlertVariants doc (normalized)
    var alertTiers = ALERT_TIERS_DEFAULT.slice();
    var alertsSelectedKey = 'follow'; // ALERT_DEFAULT_KEY | stock event id | custom event id
    var alertsStyleOpen = true;
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
    // AI console (TASK-64 — delocked; the AI-1 board interior + Rider 2's
    // six zones + AI-2-A's cohost stage). Same custom-tab pattern as every
    // sibling panel, and the S47/S50 interior idiom inside: left zone list
    // (role=listbox, the shared attachArcadeListboxNav contract), right
    // stage-on-TOP + config-BELOW. Stock settings groups berth through the
    // S51 popup-EMBED driver (buildDeckPopupEmbed — same stock page, same
    // handlers, same canonical keys, zero stock JS touched); native rows
    // ride saveDeckSetting (the S48 async idiom). Nothing here is gated,
    // locked, or signer-checked any more — every row reports its own
    // honest "not set up" state instead.
    //
    // Zone map (the 0018.06.04 audit, verified live; Rider 2's left-list
    // order — DevChat fifth, Models sixth):
    //   🛡️ Chat Moderation  — native re-berth of chatbot-Censor's two real
    //      toggles + the test box (below). Stock actions cited per row.
    //   🎙️ AI Cohost        — chatbot-cohost + chatbot-ai-overlay groups
    //      (embed) + the house cohost-stage.html overlay (Lane 2).
    //   💬 Chat Bot & Prompts — chatbot-public + chatbot-ai-prompt +
    //      chatbot-private groups (embed) + the private host↔bot chat
    //      panel (chatbot.html, stock plumbing — the Z3 rider).
    //   🌐 Auto-translate   — ai-auto-translate group (embed).
    //   🚀 DevChat          — setup zone (Rider 2): endpoint, honest
    //      connection test, plain description. NO deep integration.
    //   🧠 Models           — bots-options-ext group (embed) + native
    //      local-first head + the real round-trip test.
    // chatbot-message-tts stays berthed in Deck Settings → Speech (audit).
    // --------------------------------------------------------------------
    var AI_ZONES = [
        { id: 'moderation', icon: '🛡️', label: 'Chat Moderation' },
        { id: 'cohost', icon: '🎙️', label: 'AI Cohost' },
        { id: 'bot', icon: '💬', label: 'Chat Bot & Prompts' },
        { id: 'translate', icon: '🌐', label: 'Auto-translate' },
        { id: 'devchat', icon: '🚀', label: 'DevChat' },
        { id: 'models', icon: '🧠', label: 'Models' }
    ];

    // House keys minted by this console (names only in reports; all written
    // textparam1 via saveDeckSetting — the canonical async idiom).
    var AI_COHOST_BODY_KEY = 'arcadeCohostBody';       // JSON {head, body, color} — the pixel body config
    var AI_COHOST_VOICE_KEY = 'arcadeCohostVoice';     // speechSynthesis voice name (substring match in-page)
    var AI_COHOST_VOLUME_KEY = 'arcadeCohostVolume';   // '0'..'1'
    var AI_COHOST_POSITION_KEY = 'arcadeCohostPosition'; // bottom-right family, same six as stock's aiOverlayPosition
    var AI_DEVCHAT_ENDPOINT_KEY = 'arcadeDevchatEndpoint'; // frontend URL; blank = not set up
    var AI_COHOST_STAGE_LABEL = 'cohost-stage';        // the house overlay's P2P label (its &label default)

    var aiPanelLive = false;
    var aiSelectedZone = 'moderation';
    var aiSettings = {};       // one getSettings snapshot, read before any iframe churn (S50 discipline)
    var aiCohostBody = { head: 'pac', body: 'bot', color: 'cyan' }; // BASIC DEFAULT — the board's simple orb/invader pick-and-go
    var aiDevchatProbe = { state: 'unknown', detail: '' }; // 'unknown'|'checking'|'connected'|'unreachable'|'not-setup'

    // The stock provider list, mirrored from the source of truth (popup.html
    // wrapper-bots-options-ext #aiProvider) so the native head offers exactly
    // what stock offers — local-first ordering is stock's own.
    var AI_PROVIDER_OPTIONS = [
        { value: 'ollama', label: 'Ollama (Native Local API)' },
        { value: 'localgemma', label: 'Local Gemma 4 (Browser, self-hosted)' },
        { value: 'localqwen', label: 'Local Qwen 3.5 0.8B (Browser, fast)' },
        { value: 'localqwen2b', label: 'Local Qwen 3.5 2B (Browser, quality)' },
        { value: 'chatgpt', label: 'ChatGPT API' },
        { value: 'gemini', label: 'Gemini API' },
        { value: 'deepseek', label: 'DeepSeek API' },
        { value: 'xai', label: 'xAI API (Grok)' },
        { value: 'bedrock', label: 'AWS Bedrock API' },
        { value: 'openrouter', label: 'OpenRouter API' },
        { value: 'groq', label: 'Groq API' },
        { value: 'opencode', label: 'OpenCode Zen API' },
        { value: 'hostedllm', label: 'SSN Hosted Trial LLM (experimental)' },
        { value: 'custom', label: 'Custom API (OpenAI-compatible / llama.cpp)' }
    ];

    function setAiAreaStatus(text) {
        var el = document.getElementById('arcade-ai-status');
        if (el) el.textContent = text || '';
    }

    function aiSettingFlag(key) {
        var raw = aiSettings[key];
        return !!(raw && raw.setting);
    }
    function aiSettingText(key) {
        var raw = aiSettings[key];
        return (raw && raw.textsetting) || '';
    }
    function aiSettingOption(key) {
        var raw = aiSettings[key];
        return (raw && raw.optionsetting) || '';
    }
    // House keys ride the textparam1 shape (same as arcadeVdoBase & co.) —
    // read them with this, NOT aiSettingText (which is the stock text shape).
    function aiHouseText(key) {
        var raw = aiSettings[key];
        return (raw && (raw.textparam1 || raw.textsetting)) || '';
    }

    // WHICH BRAIN a row uses — every AI row shows this honestly (the brief:
    // "every other row shows WHICH brain it uses + honest offline state").
    function aiBrainLine() {
        var provider = aiSettingOption('aiProvider') || 'ollama';
        var label = provider;
        AI_PROVIDER_OPTIONS.forEach(function (o) { if (o.value === provider) label = o.label; });
        if (provider === 'ollama') {
            return label + ' · ' + (aiSettingText('ollamamodel') || 'default model') + ' @ ' + (aiSettingText('ollamaendpoint') || 'http://localhost:11434');
        }
        return label;
    }

    function buildAiZoneHead(title, blurb) {
        var card = document.createElement('article');
        card.className = 'arcade-alert-card';
        var head = document.createElement('div');
        head.className = 'arcade-alert-card__head';
        var name = document.createElement('h3');
        name.className = 'arcade-alert-card__name';
        name.textContent = title;
        head.appendChild(name);
        card.appendChild(head);
        if (blurb) {
            var p = document.createElement('p');
            p.className = 'arcade-el-card__blurb';
            p.textContent = blurb;
            card.appendChild(p);
        }
        return card;
    }

    function buildAiToggleRow(label, title, key, onAfter) {
        // TASK-68 — the shared .arcade-toggle component (item 8 sweep).
        return buildArcadeToggle({
            label: label,
            hint: title,
            ariaLabel: label,
            checked: aiSettingFlag(key),
            onChange: function (checked) {
                aiSettings[key] = { setting: checked }; // keep the snapshot honest for dependent rows
                saveDeckSetting('setting', key, checked);
                if (onAfter) onAfter(checked);
            }
        });
    }

    function buildAiTextRow(label, key, placeholder, onAfter) {
        var row = document.createElement('div');
        row.className = 'arcade-alert-row';
        var lbl = document.createElement('label');
        lbl.textContent = label;
        row.appendChild(lbl);
        var input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.placeholder = placeholder || '';
        input.value = aiSettingText(key);
        input.setAttribute('aria-label', label);
        input.addEventListener('input', debounce(function () {
            aiSettings[key] = { textsetting: input.value };
            saveDeckSetting('textsetting', key, input.value);
            if (onAfter) onAfter(input.value);
        }, 300));
        row.appendChild(input);
        return row;
    }

    function buildAiSelectRow(label, key, options, onAfter) {
        var row = document.createElement('div');
        row.className = 'arcade-alert-row';
        var lbl = document.createElement('label');
        lbl.textContent = label;
        row.appendChild(lbl);
        var input = document.createElement('select');
        input.setAttribute('aria-label', label);
        options.forEach(function (opt) {
            var o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            input.appendChild(o);
        });
        input.value = aiSettingOption(key) || options[0].value;
        input.addEventListener('change', function () {
            aiSettings[key] = { optionsetting: input.value };
            saveDeckSetting('optionsetting', key, input.value);
            if (onAfter) onAfter(input.value);
        });
        row.appendChild(input);
        return row;
    }

    function buildAiHouseTextRow(label, houseKey, placeholder, current, onAfter) {
        var row = document.createElement('div');
        row.className = 'arcade-alert-row';
        var lbl = document.createElement('label');
        lbl.textContent = label;
        row.appendChild(lbl);
        var input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.placeholder = placeholder || '';
        input.value = current || '';
        input.setAttribute('aria-label', label);
        input.addEventListener('input', debounce(function () {
            aiSettings[houseKey] = { textparam1: input.value }; // keep the snapshot honest for dependent rows
            saveDeckSetting('textparam1', houseKey, input.value);
            if (onAfter) onAfter(input.value);
        }, 300));
        row.appendChild(input);
        return row;
    }

    function appendAiBrainRow(body, usesLabel) {
        var row = document.createElement('div');
        row.className = 'arcade-alert-row arcade-ai-brain';
        var lbl = document.createElement('label');
        lbl.textContent = 'Brain';
        row.appendChild(lbl);
        var val = document.createElement('span');
        val.className = 'arcade-ai-brain__value';
        val.textContent = (usesLabel ? usesLabel + ' — ' : '') + aiBrainLine();
        row.appendChild(val);
        body.appendChild(row);
    }

    // --------------------------------------------------------------------
    // Zone: 🛡️ CHAT MODERATION. Native re-berth of stock's censor bot — the
    // ONLY two actions stock's bot really performs, cited:
    //   · non-blocking mode (ollamaCensorBot on, block off): a judged-bad
    //     message is DELETED after the fact — ai.js:2518 & :2524
    //     (`sendToDestinations({ delete: data })`, extension-connected only).
    //   · block mode (ollamaCensorBotBlockMode on): the message is HELD and
    //     never delivered until the bot approves it — background.js:17505
    //     (`return false` in applyFilterXSSpipeline; some messages are
    //     honestly skipped when the bot can't keep up — stock's own title).
    // There is NO timeout/ban/flag-to-dock action anywhere in stock — the
    // picker below wires exactly these two and says so.
    // --------------------------------------------------------------------
    function renderAiZoneModeration(stage, config) {
        // STAGE — the test box: run a sample message through the REAL
        // configured model with stock's REAL moderation prompt, show the
        // verdict, send nothing. Stock has no dry-evaluate path
        // (censorMessageWithLLM always acts — delete or block — on a bad
        // verdict), so this calls the model directly with the same prompt
        // builder + parser the live path uses (ai.js:2375 buildCensorPrompt,
        // :2416/:2432 the decision parsers), reached on the background page
        // (the S51 direct-frame2 pattern — no IPC, no sendSync). Advisory.
        var testCard = buildAiZoneHead('Test a message', 'Runs the sample through the REAL configured model with stock’s own moderation prompt. Advisory only — nothing is sent to chat, deleted, blocked, or stored.');
        var testBody = document.createElement('div');
        testBody.className = 'arcade-alert-card__body';
        var inputRow = document.createElement('div');
        inputRow.className = 'arcade-alert-row arcade-ai-testbox';
        var textarea = document.createElement('textarea');
        textarea.id = 'arcade-ai-mod-test-input';
        textarea.rows = 2;
        textarea.placeholder = 'Type a sample chat message…';
        textarea.setAttribute('aria-label', 'Sample chat message to test');
        inputRow.appendChild(textarea);
        var testBtn = document.createElement('button');
        testBtn.type = 'button';
        testBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        testBtn.id = 'arcade-ai-mod-test-btn';
        testBtn.textContent = 'Test with the model';
        inputRow.appendChild(testBtn);
        testBody.appendChild(inputRow);
        var verdict = document.createElement('p');
        verdict.className = 'arcade-style-hint arcade-ai-verdict';
        verdict.id = 'arcade-ai-mod-verdict';
        verdict.setAttribute('role', 'status');
        verdict.setAttribute('aria-live', 'polite');
        testBody.appendChild(verdict);
        testCard.appendChild(testBody);
        stage.appendChild(testCard);

        testBtn.addEventListener('click', function () {
            var text = textarea.value.trim();
            if (!text) { verdict.textContent = 'Type a sample message first.'; return; }
            var bg = getBackgroundWindow();
            if (!bg || typeof bg.callLLMAPI !== 'function' || typeof bg.buildCensorPrompt !== 'function') {
                verdict.textContent = 'The background AI plumbing is not reachable yet — try again in a moment.';
                return;
            }
            testBtn.disabled = true;
            verdict.textContent = 'Asking ' + aiBrainLine() + '…';
            var providerKey = (typeof bg.getActiveCensorProviderKey === 'function') ? bg.getActiveCensorProviderKey() : '';
            var prompt;
            try {
                prompt = bg.buildCensorPrompt({ chatname: 'TestUser', chatmessage: text, type: 'test' }, text, [], [], providerKey);
            } catch (e) {
                testBtn.disabled = false;
                verdict.textContent = 'Could not build the moderation prompt: ' + (e && e.message || e);
                return;
            }
            var opts = { localBrowserStateless: (typeof bg.isLocalBrowserProvider === 'function') ? bg.isLocalBrowserProvider(providerKey) : false };
            var binary = (typeof bg.shouldUseBinaryCensorPrompt === 'function') ? bg.shouldUseBinaryCensorPrompt(providerKey) : false;
            if (binary) opts.localBrowserGeneration = { maxNewTokens: 8, temperature: 0.15, topP: 0.9 };
            bg.callLLMAPI(prompt, null, null, null, null, null, opts).then(function (out) {
                testBtn.disabled = false;
                if (!document.body.contains(verdict)) return;
                var decision = binary ? bg.parseBinaryCensorDecision(out) : bg.parseNumericCensorDecision(out);
                var word = decision.blocked ? 'WOULD BLOCK' : 'WOULD ALLOW';
                verdict.textContent = word + ' — model said: “' + String(out || '').trim().slice(0, 120) + '”' +
                    (decision.parseOk ? '' : ' (unparseable answer — the live path treats that as block)') +
                    ' · advisory test: nothing was sent, deleted, or blocked.';
                verdict.classList.toggle('is-error', !!decision.blocked);
            }).catch(function (e) {
                testBtn.disabled = false;
                if (!document.body.contains(verdict)) return;
                verdict.textContent = 'The model did not answer — ' + (e && e.message || e) + '. Is the provider reachable? Check 🧠 Models.';
                verdict.classList.add('is-error');
            });
        });

        // CONFIG — the native head (canonical keys, S48 async idiom).
        var card = buildAiZoneHead('Moderation', 'The censor bot reads chat and judges each message with the configured brain. It never answers in chat.');
        var body = document.createElement('div');
        body.className = 'arcade-alert-card__body';
        body.appendChild(buildAiToggleRow('Enable the censor bot', 'Stock key: ollamaCensorBot', 'ollamaCensorBot', function () { renderAiZoneList(); }));
        var modeRow = document.createElement('div');
        modeRow.className = 'arcade-alert-row arcade-alert-row--wide'; // TASK-69 sweep 3 — the 68px base track crushed this label to 3 lines
        var modeLbl = document.createElement('label');
        modeLbl.textContent = 'When a message is judged bad';
        modeRow.appendChild(modeLbl);
        var modeSel = document.createElement('select');
        modeSel.setAttribute('aria-label', 'When a message is judged bad');
        [{ value: 'delete', label: 'Delete it after the fact (default)' }, { value: 'block', label: 'Hold it until the bot approves' }].forEach(function (opt) {
            var o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            modeSel.appendChild(o);
        });
        modeSel.value = aiSettingFlag('ollamaCensorBotBlockMode') ? 'block' : 'delete';
        modeSel.addEventListener('change', function () {
            aiSettings.ollamaCensorBotBlockMode = { setting: modeSel.value === 'block' };
            saveDeckSetting('setting', 'ollamaCensorBotBlockMode', modeSel.value === 'block');
        });
        modeRow.appendChild(modeSel);
        body.appendChild(modeRow);
        var rules = document.createElement('p');
        rules.className = 'arcade-style-hint';
        rules.textContent = 'Rules: stock’s fixed prompt judges hate, profanity, threats, and spam-split-across-messages (0–5 score, or OK/BLOCK on local browser models). These are the only two actions stock’s bot can take — there is no timeout, ban, or flag-to-dock action in stock. Honest limit: in hold-mode some messages are skipped when the bot can’t keep up (stock’s own note).';
        body.appendChild(rules);
        appendAiBrainRow(body, 'judges with');
        card.appendChild(body);
        config.appendChild(card);
    }

    // --------------------------------------------------------------------
    // Zone: 🎙️ AI COHOST (Lane 2 / AI-2-A). The house cohost-stage.html
    // overlay (pixel body + speech bubbles + the existing stage-TTS rail),
    // preview demo-isolated (&preview), Copy-URL real-session. Wiring is
    // ONLY stock-real doors, each cited in the wiring card.
    // --------------------------------------------------------------------
    function aiCohostStageParams(forCopy) {
        var params = [];
        var pos = aiHouseText(AI_COHOST_POSITION_KEY) || 'bottom-right';
        params.push('position=' + encodeURIComponent(pos));
        var voice = aiHouseText(AI_COHOST_VOICE_KEY);
        if (voice) params.push('voice=' + encodeURIComponent(voice));
        var vol = aiHouseText(AI_COHOST_VOLUME_KEY);
        if (vol) params.push('volume=' + encodeURIComponent(vol));
        if (aiCohostBody.head) params.push('head=' + encodeURIComponent(aiCohostBody.head));
        if (aiCohostBody.body) params.push('body=' + encodeURIComponent(aiCohostBody.body));
        if (aiCohostBody.color) params.push('color=' + encodeURIComponent(aiCohostBody.color));
        if (forCopy && aiSettingFlag('aiOverlayTts')) params.push('tts');
        return params;
    }

    function buildAiCohostPreviewFrame(stage) {
        var wrap = document.createElement('div');
        wrap.className = 'arcade-alerts-preview';
        var bar = document.createElement('div');
        bar.className = 'arcade-alerts-preview-bar';
        var hint = document.createElement('span');
        hint.className = 'arcade-style-hint';
        hint.textContent = 'Isolated preview — no session, no bridge, nothing live. The overlay only speaks when a real sender reaches its label.';
        bar.appendChild(hint);
        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        copyBtn.textContent = 'Copy overlay URL';
        copyBtn.addEventListener('click', function () {
            var resolver = window.resolveSocialStreamPage;
            if (typeof resolver !== 'function') { flashButton(copyBtn, 'Unavailable', 2200); return; }
            var params = aiCohostStageParams(true);
            if (deckSessionId) params.push('session=' + encodeURIComponent(deckSessionId));
            resolver('cohost-stage.html', { extraParams: params }).then(function (resolved) {
                if (!resolved || !resolved.url) throw new Error('no url');
                return copyToClipboard(resolved.url).then(function () { flashButton(copyBtn, 'Copied ✓'); });
            }).catch(function () { flashButton(copyBtn, 'Copy failed', 2200); });
        });
        bar.appendChild(copyBtn);
        wrap.appendChild(bar);
        var frame = document.createElement('iframe');
        frame.id = 'arcade-ai-cohost-preview';
        frame.title = 'Cohost stage preview (isolated demo)';
        wrap.appendChild(frame);
        stage.appendChild(wrap);

        var resolver = window.resolveSocialStreamPage;
        if (typeof resolver !== 'function') return;
        var params = aiCohostStageParams(false);
        // preview carries &tts so the stage's real TTS rail is exercisable
        // in the isolated demo (speak() still only fires on a sender's
        // meta.tts — the rail, never a live transport).
        params.push('preview=1', 'demo=1', 'tts');
        resolver('cohost-stage.html', { extraParams: params }).then(function (resolved) {
            if (resolved && resolved.url) frame.src = resolved.url;
        }).catch(function (e) { console.error('[arcade-shell] cohost preview resolve failed:', e); });
    }

    function renderAiZoneCohost(stage, config) {
        buildAiCohostPreviewFrame(stage);

        // Body card — the pixel body config door. Scopes to exactly what the
        // house PixelAvatar config models (head variant, body part, palette —
        // adapted from arcade-ui/react/PixelAvatar.tsx; no new avatar format).
        var bodyCard = buildAiZoneHead('The body', 'Pick-and-go pixel body — the BASIC DEFAULT is the simple orb/bot look. The renderer is house code adapted from arcade-ui’s PixelAvatar (16×16 SVG, zero assets).');
        var bodyBody = document.createElement('div');
        bodyBody.className = 'arcade-alert-card__body';
        [['Head', 'head', [{ value: 'pac', label: 'Pac orb (default)' }, { value: 'ghost', label: 'Ghost' }]],
         ['Body', 'body', [{ value: 'bot', label: 'Bot chassis (default)' }, { value: 'classic', label: 'Classic' }, { value: 'caped', label: 'Caped' }, { value: 'round', label: 'Round' }]],
         ['Color', 'color', [{ value: 'cyan', label: 'Cyan (default)' }, { value: 'pink', label: 'Pink' }, { value: 'neon', label: 'Neon' }, { value: 'coin', label: 'Coin gold' }, { value: 'ghost', label: 'Ghost white' }]]
        ].forEach(function (spec) {
            var row = document.createElement('div');
            row.className = 'arcade-alert-row';
            var lbl = document.createElement('label');
            lbl.textContent = spec[0];
            row.appendChild(lbl);
            var sel = document.createElement('select');
            sel.setAttribute('aria-label', 'Cohost ' + spec[0].toLowerCase());
            spec[2].forEach(function (opt) {
                var o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.label;
                sel.appendChild(o);
            });
            sel.value = aiCohostBody[spec[1]] || spec[2][0].value;
            sel.addEventListener('change', function () {
                aiCohostBody[spec[1]] = sel.value;
                saveDeckSetting('textparam1', AI_COHOST_BODY_KEY, JSON.stringify(aiCohostBody));
                // re-compose the preview with the new pick (still isolated)
                var frame = document.getElementById('arcade-ai-cohost-preview');
                var resolver = window.resolveSocialStreamPage;
                if (frame && typeof resolver === 'function') {
                    var params = aiCohostStageParams(false);
                    params.push('preview=1', 'demo=1', 'tts');
                    resolver('cohost-stage.html', { extraParams: params }).then(function (resolved) {
                        if (resolved && resolved.url && document.body.contains(frame)) frame.src = resolved.url;
                    });
                }
            });
            row.appendChild(sel);
            bodyBody.appendChild(row);
        });
        bodyCard.appendChild(bodyBody);
        config.appendChild(bodyCard);

        // Personality + voice card. The personality is the BOT BRAIN's stock
        // instructions key (ollamaprompt — popup.html:9312, the same text the
        // chat bot reads; the stage itself only displays what senders tell
        // it). Voice/volume/position are house keys compiled into the URL.
        var voiceCard = buildAiZoneHead('Personality, voice & position', 'The personality is shared with the chat bot’s brain (stock “Additional Bot Instructions”) — the stage speaks what the brain says.');
        var voiceBody = document.createElement('div');
        voiceBody.className = 'arcade-alert-card__body';
        var personaRow = document.createElement('div');
        personaRow.className = 'arcade-alert-row arcade-ai-persona';
        var personaLbl = document.createElement('label');
        personaLbl.textContent = 'Personality instructions';
        personaRow.appendChild(personaLbl);
        var persona = document.createElement('textarea');
        persona.rows = 3;
        persona.placeholder = 'e.g. You are pacBOT, a warm arcade-regular cohost…';
        persona.value = aiSettingText('ollamaprompt');
        persona.setAttribute('aria-label', 'Personality instructions (shared bot brain)');
        persona.addEventListener('input', debounce(function () {
            aiSettings.ollamaprompt = { textsetting: persona.value };
            saveDeckSetting('textsetting', 'ollamaprompt', persona.value);
        }, 300));
        personaRow.appendChild(persona);
        voiceBody.appendChild(personaRow);
        voiceBody.appendChild(buildAiHouseTextRow('Voice (browser TTS voice name)', AI_COHOST_VOICE_KEY, 'blank = system default', aiHouseText(AI_COHOST_VOICE_KEY)));
        voiceBody.appendChild(buildAiHouseTextRow('Volume (0–1)', AI_COHOST_VOLUME_KEY, 'e.g. 0.9 — blank = full', aiHouseText(AI_COHOST_VOLUME_KEY)));
        var posRow = document.createElement('div');
        posRow.className = 'arcade-alert-row';
        var posLbl = document.createElement('label');
        posLbl.textContent = 'Position';
        posRow.appendChild(posLbl);
        var posSel = document.createElement('select');
        posSel.setAttribute('aria-label', 'Cohost position');
        ['bottom-right', 'bottom-left', 'bottom-center', 'top-right', 'top-left', 'top-center'].forEach(function (p) {
            var o = document.createElement('option');
            o.value = p;
            o.textContent = p.replace('-', ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
            posSel.appendChild(o);
        });
        posSel.value = aiHouseText(AI_COHOST_POSITION_KEY) || 'bottom-right';
        posSel.addEventListener('change', function () {
            saveDeckSetting('textparam1', AI_COHOST_POSITION_KEY, posSel.value);
        });
        posRow.appendChild(posSel);
        voiceBody.appendChild(posRow);
        voiceCard.appendChild(voiceBody);
        config.appendChild(voiceCard);

        // WIRING card — ONLY real existing triggers, each cited.
        var wireCard = buildAiZoneHead('When it speaks — the real wiring', 'The stage listens on its P2P label. Pointing stock’s AI-overlay label at it routes every existing sender to the house body.');
        var wireBody = document.createElement('div');
        wireBody.className = 'arcade-alert-card__body';

        // 1. The label door (stock chatbot/cohost response path): stock
        // routes every AI-stage payload through sendAiOverlayCommand() to the
        // aiOverlayLabel setting (background.js:11787 + :11773 default), and
        // the house stage speaks that exact protocol. Senders that then reach
        // it for real: dock right-click co-host actions + cohost.html
        // (action "cohostOverlay", background.js:13560) and primary chat-bot
        // replies when aiOverlayFromChatBot is on (ai.js:3413-3420).
        var labelRow = document.createElement('div');
        labelRow.className = 'arcade-alert-row';
        var labelLbl = document.createElement('label');
        labelLbl.textContent = 'Stage label';
        labelRow.appendChild(labelLbl);
        var labelState = document.createElement('span');
        labelState.className = 'arcade-ai-brain__value';
        var currentLabel = aiSettingText('aiOverlayLabel') || 'cohost-overlay';
        labelState.textContent = currentLabel === AI_COHOST_STAGE_LABEL
            ? 'cohost-stage — stock senders reach this body'
            : currentLabel + ' — NOT this stage yet';
        labelRow.appendChild(labelState);
        wireBody.appendChild(labelRow);
        if (currentLabel !== AI_COHOST_STAGE_LABEL) {
            var pointRow = document.createElement('div');
            pointRow.className = 'arcade-evt-doors';
            var pointBtn = document.createElement('button');
            pointBtn.type = 'button';
            pointBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
            pointBtn.textContent = 'Point stock’s AI overlay label at this stage';
            pointBtn.title = 'Canonical stock setting aiOverlayLabel = "cohost-stage" — the same key the stock AI Stage Overlay group edits.';
            pointBtn.addEventListener('click', function () {
                aiSettings.aiOverlayLabel = { textsetting: AI_COHOST_STAGE_LABEL };
                saveDeckSetting('textsetting', 'aiOverlayLabel', AI_COHOST_STAGE_LABEL);
                labelState.textContent = AI_COHOST_STAGE_LABEL + ' — stock senders reach this body';
                pointBtn.disabled = true;
                pointBtn.textContent = 'Pointed ✓';
                renderAiZoneList();
            });
            pointRow.appendChild(pointBtn);
            wireBody.appendChild(pointRow);
        }
        wireBody.appendChild(buildAiToggleRow('Also send chat bot replies to the stage', 'Stock key: aiOverlayFromChatBot — primary bot replies ride the same rail (ai.js:3413)', 'aiOverlayFromChatBot'));
        wireBody.appendChild(buildAiToggleRow('Overlay TTS (stage speaks replies aloud)', 'Stock key: aiOverlayTts — the stage’s &tts rail (browser speech)', 'aiOverlayTts'));

        // 2. First-timer greeting — the S47B one-click affordance (same
        // canonical write the popup's own toggle emits + the disableDB
        // companion, background.js:16595 sets firsttime only under
        // firsttimers && !disableDB).
        var ftBg = getBackgroundWindow();
        var firsttimersOn = !!(ftBg && typeof ftBg.getSettingFlag === 'function' && ftBg.getSettingFlag('firsttimers'));
        var ftLine = document.createElement('p');
        ftLine.className = 'arcade-style-hint';
        ftLine.textContent = firsttimersOn
            ? 'First-timer detection: ON — the real `firsttime` message property fires. Deliver the greeting with a flow: messageProperties(firsttime) → customJs with the snippet below.'
            : 'First-timer detection: OFF — the `firsttime` property never fires until the stock firsttimers setting is on.';
        wireBody.appendChild(ftLine);
        if (!firsttimersOn) {
            var ftRow = document.createElement('div');
            ftRow.className = 'arcade-evt-doors';
            var ftBtn = document.createElement('button');
            ftBtn.type = 'button';
            ftBtn.className = 'arcade-btn arcade-btn--sm';
            ftBtn.textContent = 'Turn on first-timers';
            ftBtn.title = 'Turns on stock first-time chatter detection — the dock will start highlighting first-time chatters (that is the stock behavior this flag controls).';
            ftBtn.addEventListener('click', function () {
                saveDeckSetting('setting', 'firsttimers', true);
                var bg2 = getBackgroundWindow();
                if (bg2 && typeof bg2.getSettingFlag === 'function' && bg2.getSettingFlag('disableDB')) {
                    saveDeckSetting('setting', 'disableDB', false); // the popup's own companion write (popup.js:5538-5546)
                }
                ftBtn.disabled = true;
                ftBtn.textContent = 'First-timers on ✓';
                ftLine.textContent = 'First-timer detection: ON — the real `firsttime` message property fires. Deliver the greeting with a flow: messageProperties(firsttime) → customJs with the snippet below.';
            });
            ftRow.appendChild(ftBtn);
            wireBody.appendChild(ftRow);
        }

        // 3. The EventFlow cohostSay door — there is NO dedicated stage
        // action in the catalog (EventFlowEditor.js:380-392 is the whole
        // Media group, none reach the AI rail). The REAL existing door is
        // the customJs action: it executes in the background page's scope
        // (EventFlowSystem.js:2546 `new Function('message', config.code)`)
        // where sendAiOverlayCommand is a global (background.js:11787).
        var snippetLine = document.createElement('p');
        snippetLine.className = 'arcade-style-hint';
        snippetLine.textContent = 'EventFlow door (no dedicated action exists — the real one is a customJs action):';
        wireBody.appendChild(snippetLine);
        var snippetRow = document.createElement('div');
        snippetRow.className = 'arcade-evt-doors';
        var snippetBtn = document.createElement('button');
        snippetBtn.type = 'button';
        snippetBtn.className = 'arcade-btn arcade-btn--sm';
        snippetBtn.textContent = 'Copy cohostSay snippet';
        snippetBtn.addEventListener('click', function () {
            var code = 'sendAiOverlayCommand({ meta: { command: "say", text: "Welcome " + (message.chatname || "friend") + "!", name: "Cohost", tts: true } });';
            copyToClipboard(code).then(function () { flashButton(snippetBtn, 'Copied ✓'); });
        });
        snippetRow.appendChild(snippetBtn);
        wireBody.appendChild(snippetRow);

        // 4. Chat-quiet timer — FLAGGED, not faked: stock has a timeInterval
        // trigger but NO "chat silent for N minutes" condition anywhere in
        // the flow engine's state. Not wired.
        var quietLine = document.createElement('p');
        quietLine.className = 'arcade-style-hint';
        quietLine.textContent = '“Chat goes quiet” timer: NOT wired — stock has a timeInterval trigger but no quiet-check in its flow state, so there is no honest condition to hang it on. Flagged, not faked.';
        wireBody.appendChild(quietLine);
        wireCard.appendChild(wireBody);
        config.appendChild(wireCard);

        // Stock groups berth below (chatbot-cohost: the multimodal co-host
        // page + tool permissions; chatbot-ai-overlay: the STOCK stage
        // overlay's own config — it configures cohost-overlay.html, NOT the
        // house stage; the embed says so in its own copy).
        buildDeckPopupEmbed(config, 'ai-cohost', 'Stock’s own co-host surfaces — the multimodal co-host page (cohost.html) and the STOCK stage overlay (cohost-overlay.html). Same stock settings, same keys.');
    }

    // --------------------------------------------------------------------
    // Zone: 💬 CHAT BOT & PROMPTS (Z3 + the private-chat rider). The stage
    // is stock's own private 1-on-1 bot page (chatbot.html) embedded with
    // the REAL session — host types, bot answers over the private request/
    // response rail (background.js:13827: answers go back to THIS page's
    // UUID only). NOTHING reaches public chat or any overlay — said on the
    // surface. It doubles as the honest personality-test surface before
    // arming public replies.
    // --------------------------------------------------------------------
    function renderAiZoneBot(stage, config) {
        var allow = aiSettingFlag('allowChatBot');
        var panelWrap = document.createElement('div');
        panelWrap.className = 'arcade-alerts-preview';
        var bar = document.createElement('div');
        bar.className = 'arcade-alerts-preview-bar';
        var hint = document.createElement('span');
        hint.className = 'arcade-style-hint';
        hint.textContent = 'Private chat — host ↔ bot only. Nothing typed or answered here ever reaches public chat or any overlay. Stock’s own page and plumbing.';
        bar.appendChild(hint);
        panelWrap.appendChild(bar);
        stage.appendChild(panelWrap);

        if (!allow) {
            var offCard = document.createElement('div');
            offCard.className = 'arcade-ai-offstate';
            var offLine = document.createElement('p');
            offLine.className = 'arcade-style-hint';
            offLine.textContent = 'The private chat bot is not set up — stock’s “Enable private chat bot option” (allowChatBot) is off.';
            offCard.appendChild(offLine);
            var onBtn = document.createElement('button');
            onBtn.type = 'button';
            onBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
            onBtn.textContent = 'Enable the private chat bot';
            onBtn.addEventListener('click', function () {
                aiSettings.allowChatBot = { setting: true };
                saveDeckSetting('setting', 'allowChatBot', true);
                renderAiZone(); // rebuild — the panel embeds now
            });
            offCard.appendChild(onBtn);
            panelWrap.appendChild(offCard);
        } else {
            var frame = document.createElement('iframe');
            frame.id = 'arcade-ai-private-chat';
            frame.title = 'Private chat with the bot (host only)';
            panelWrap.appendChild(frame);
            var resolver = window.resolveSocialStreamPage;
            if (typeof resolver === 'function') {
                var params = [];
                if (deckSessionId) params.push('session=' + encodeURIComponent(deckSessionId));
                resolver('chatbot.html', { extraParams: params }).then(function (resolved) {
                    if (resolved && resolved.url) frame.src = resolved.url;
                }).catch(function (e) { console.error('[arcade-shell] private chat resolve failed:', e); });
            }
        }

        // The aioverlay ORPHAN door (0018.06.04 audit): aioverlay.html is
        // the AI Prompt Builder's publish target and has NO settings group
        // and no zone fit. Builder's pick (flagged for the Admiral's gate
        // ruling): a minimal "your published overlay" door here in Z3 —
        // copy-URL + the builder door, no config invented.
        var orphanCard = buildAiZoneHead('Your published AI overlay', 'The AI Prompt Builder (aiprompt.html) publishes the pages it builds to aioverlay.html. Stock gives that overlay no settings group of its own — this is its door.');
        var orphanBody = document.createElement('div');
        orphanBody.className = 'arcade-alert-card__body';
        var orphanDoors = document.createElement('div');
        orphanDoors.className = 'arcade-evt-doors';
        var copyOverlayBtn = document.createElement('button');
        copyOverlayBtn.type = 'button';
        copyOverlayBtn.className = 'arcade-btn arcade-btn--sm';
        copyOverlayBtn.textContent = 'Copy published overlay URL';
        copyOverlayBtn.addEventListener('click', function () {
            var resolver = window.resolveSocialStreamPage;
            if (typeof resolver !== 'function') { flashButton(copyOverlayBtn, 'Unavailable', 2200); return; }
            var params = [];
            if (deckSessionId) params.push('session=' + encodeURIComponent(deckSessionId));
            resolver('aioverlay.html', { extraParams: params }).then(function (resolved) {
                if (!resolved || !resolved.url) throw new Error('no url');
                return copyToClipboard(resolved.url).then(function () { flashButton(copyOverlayBtn, 'Copied ✓'); });
            }).catch(function () { flashButton(copyOverlayBtn, 'Copy failed', 2200); });
        });
        orphanDoors.appendChild(copyOverlayBtn);
        orphanBody.appendChild(orphanDoors);
        orphanCard.appendChild(orphanBody);
        config.appendChild(orphanCard);

        buildDeckPopupEmbed(config, 'ai-bot', 'Stock’s chat-bot groups — public replies, the AI prompt page builder, and the private-interface toggle. Same stock settings, same keys.');
    }

    // --------------------------------------------------------------------
    // Zone: 🌐 AUTO-TRANSLATE (Z4) — the stock group berthed, honest status.
    // --------------------------------------------------------------------
    function renderAiZoneTranslate(stage, config) {
        var on = aiSettingFlag('aiAutoTranslate');
        var out = aiSettingFlag('aiAutoTranslateOutgoing');
        var card = buildAiZoneHead('Auto-translate', on
            ? 'Incoming translation is ON' + (out ? ' (+ outgoing)' : '') + ' → ' + (aiSettingText('aiAutoTranslateTargetLanguage') || 'default target') + '.'
            : 'Auto-translate is not set up — it turns on inside the stock group below.');
        var body = document.createElement('div');
        body.className = 'arcade-alert-card__body';
        appendAiBrainRow(body, 'translates with');
        card.appendChild(body);
        stage.appendChild(card);
        buildDeckPopupEmbed(config, 'ai-translate', 'Stock’s AI auto-translate group — same stock settings, same keys.');
    }

    // --------------------------------------------------------------------
    // Zone: 🚀 DEVCHAT (Rider 2 — the setup zone, NO deep integration).
    // Endpoint field + honest connection test + a plain description. The
    // probe reuses the v2 console's real machinery (HEAD no-cors reachability
    // + /api/models on the API port — chatdev's own LOCAL_SETUP.md ports:
    // frontend :5173, API :6400 via `make dev` in ~/dev/chatdev).
    // --------------------------------------------------------------------
    function probeDevChatEndpoint(url) {
        var opts = { method: 'HEAD', mode: 'no-cors', cache: 'no-store', timeoutMs: AI_AREA_PROBE_TIMEOUT_MS };
        var runner = typeof window.fetchWithDeadline === 'function'
            ? window.fetchWithDeadline(url, opts)
            : (function () {
                var controller = new AbortController();
                var timer = setTimeout(function () { controller.abort(); }, AI_AREA_PROBE_TIMEOUT_MS);
                return fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: controller.signal })
                    .then(function (r) { clearTimeout(timer); return r; })
                    .catch(function (e) { clearTimeout(timer); throw e; });
            })();
        return runner.then(function () { return true; }).catch(function () { return false; });
    }

    function fetchDevChatModels(endpoint) {
        // The API port is chatdev's own fixed one (compose.yml: "6400:6400")
        // on the same host as the frontend endpoint.
        var api;
        try {
            var u = new URL(endpoint);
            api = u.protocol + '//' + u.hostname + ':6400';
        } catch (e) {
            api = AI_AREA_DEVCHAT_API_URL;
        }
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, AI_AREA_PROBE_TIMEOUT_MS);
        return fetch(api + '/api/models', { method: 'GET', cache: 'no-store', signal: controller.signal })
            .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error('http'); return r.json(); })
            .catch(function (e) { clearTimeout(timer); throw e; });
    }

    function openDevChatInBrowser(url) {
        try {
            var electron = require('electron');
            if (electron && electron.shell && typeof electron.shell.openExternal === 'function') {
                electron.shell.openExternal(url);
                return;
            }
        } catch (e) { /* nodeIntegration off somehow — fall through */ }
        try { window.open(url, '_blank'); } catch (e) { /* honest no-op, never throw */ }
    }

    function aiDevchatEndpoint() {
        return aiHouseText(AI_DEVCHAT_ENDPOINT_KEY) || '';
    }

    function renderAiZoneDevchat(stage, config) {
        var endpoint = aiDevchatEndpoint();
        var card = buildAiZoneHead('DevChat — connect your AI team', 'DevChat is the house’s local AI build swarm (a ChatDev fork, ~/dev/chatdev): a team of AI agents — CEO, CTO, programmer, tester — that takes a written task spec and grinds out a prototype on your local Ollama models, fully on-box, no cloud. Runs with `make dev` in ~/dev/chatdev (web console on :5173, API on :6400).');
        var body = document.createElement('div');
        body.className = 'arcade-alert-card__body';
        var statusRow = document.createElement('div');
        statusRow.className = 'arcade-alert-row';
        var statusLbl = document.createElement('label');
        statusLbl.textContent = 'Status';
        statusRow.appendChild(statusLbl);
        var statusVal = document.createElement('span');
        statusVal.className = 'arcade-ai-brain__value';
        statusVal.id = 'arcade-ai-devchat-status';
        statusVal.setAttribute('role', 'status');
        statusVal.textContent = !endpoint ? 'not set up — enter your DevChat address below'
            : aiDevchatProbe.state === 'connected' ? 'connected — ' + aiDevchatProbe.detail
            : aiDevchatProbe.state === 'checking' ? 'checking…'
            : aiDevchatProbe.state === 'unreachable' ? 'unreachable — is DevChat running? (`make dev` in ~/dev/chatdev)'
            : 'not tested yet';
        statusRow.appendChild(statusVal);
        body.appendChild(statusRow);
        var doors = document.createElement('div');
        doors.className = 'arcade-evt-doors';
        var testBtn = document.createElement('button');
        testBtn.type = 'button';
        testBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        testBtn.textContent = 'Test connection';
        testBtn.addEventListener('click', function () {
            var ep = aiDevchatEndpoint();
            if (!ep) { statusVal.textContent = 'not set up — enter your DevChat address below'; return; }
            aiDevchatProbe = { state: 'checking', detail: '' };
            statusVal.textContent = 'checking…';
            probeDevChatEndpoint(ep).then(function (reachable) {
                if (!document.body.contains(statusVal)) return;
                if (!reachable) {
                    aiDevchatProbe = { state: 'unreachable', detail: '' };
                    statusVal.textContent = 'unreachable — is DevChat running? (`make dev` in ~/dev/chatdev)';
                    return;
                }
                fetchDevChatModels(ep).then(function (data) {
                    if (!document.body.contains(statusVal)) return;
                    var detail = 'model: ' + ((data && data.configured_model) || 'not configured');
                    if (data && data.is_ollama) detail += ' · Ollama ' + (data.reachable ? 'reachable' : 'unreachable');
                    aiDevchatProbe = { state: 'connected', detail: detail };
                    statusVal.textContent = 'connected — ' + detail;
                }).catch(function () {
                    if (!document.body.contains(statusVal)) return;
                    aiDevchatProbe = { state: 'connected', detail: 'console reachable · API (:6400) not answering' };
                    statusVal.textContent = 'connected — console reachable · API (:6400) not answering';
                });
            });
        });
        doors.appendChild(testBtn);
        var browserBtn = document.createElement('button');
        browserBtn.type = 'button';
        browserBtn.className = 'arcade-btn arcade-btn--sm';
        browserBtn.textContent = 'Open in browser';
        browserBtn.addEventListener('click', function () {
            var ep = aiDevchatEndpoint() || AI_AREA_DEVCHAT_URL;
            openDevChatInBrowser(ep);
        });
        doors.appendChild(browserBtn);
        body.appendChild(doors);
        card.appendChild(body);
        stage.appendChild(card);

        var setupCard = buildAiZoneHead('Setup', 'Point the console at your local DevChat instance. Default when blank: ' + AI_AREA_DEVCHAT_URL + ' (chatdev’s own dev-server port). V1 is this front door only — no deep integration yet.');
        var setupBody = document.createElement('div');
        setupBody.className = 'arcade-alert-card__body';
        setupBody.appendChild(buildAiHouseTextRow('DevChat endpoint', AI_DEVCHAT_ENDPOINT_KEY, AI_AREA_DEVCHAT_URL, endpoint, function () {
            aiDevchatProbe = { state: 'unknown', detail: '' };
        }));
        setupCard.appendChild(setupBody);
        config.appendChild(setupCard);
    }

    // --------------------------------------------------------------------
    // Zone: 🧠 MODELS (built first — every other zone reads it). Local-first
    // native head (Ollama endpoint + model lead, provider select) + the real
    // round-trip test + the stock 32-field provider group berthed below
    // (API keys stay stock password-type inputs inside the embed — never
    // echoed, never captured).
    // --------------------------------------------------------------------
    function renderAiZoneModels(stage, config) {
        var card = buildAiZoneHead('The brain', 'Local-first: Ollama on your own machine leads. Cloud providers stay available in the stock group below — their API keys live only in those stock password fields.');
        var body = document.createElement('div');
        body.className = 'arcade-alert-card__body';
        body.appendChild(buildAiSelectRow('Provider', 'aiProvider', AI_PROVIDER_OPTIONS, function () { renderAiZone(); }));
        body.appendChild(buildAiTextRow('Ollama endpoint', 'ollamaendpoint', 'http://localhost:11434'));
        body.appendChild(buildAiTextRow('Ollama model', 'ollamamodel', 'gemma3:1b'));
        var statusLine = document.createElement('p');
        statusLine.className = 'arcade-style-hint arcade-ai-verdict';
        statusLine.id = 'arcade-ai-models-status';
        statusLine.setAttribute('role', 'status');
        statusLine.setAttribute('aria-live', 'polite');
        statusLine.textContent = 'Not tested yet.';
        body.appendChild(statusLine);
        var doors = document.createElement('div');
        doors.className = 'arcade-evt-doors';
        var testBtn = document.createElement('button');
        testBtn.type = 'button';
        testBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        testBtn.textContent = 'Test the brain';
        testBtn.addEventListener('click', function () {
            var bg = getBackgroundWindow();
            if (!bg || typeof bg.callLLMAPI !== 'function') {
                statusLine.textContent = 'The background AI plumbing is not reachable yet — try again in a moment.';
                return;
            }
            testBtn.disabled = true;
            statusLine.classList.remove('is-error');
            statusLine.textContent = 'Asking ' + aiBrainLine() + '…';
            // Stock's own provider-test prompt (background.js:4743,
            // cmd 'testLLMProvider') — run DIRECTLY on the background page
            // (the S51 direct-frame2 pattern: no IPC, no sendSync, no 60s
            // renderer block).
            bg.callLLMAPI('Reply with one short sentence confirming this chatbot connection works.', null, null, null, null, null, {})
                .then(function (out) {
                    testBtn.disabled = false;
                    if (!document.body.contains(statusLine)) return;
                    statusLine.textContent = 'Connected — the brain answered: “' + String(out || '').trim().slice(0, 140) + '”';
                })
                .catch(function (e) {
                    testBtn.disabled = false;
                    if (!document.body.contains(statusLine)) return;
                    statusLine.textContent = 'Unreachable or misconfigured — ' + (e && e.message || e) + '. Check the endpoint/model above and the provider group below.';
                    statusLine.classList.add('is-error');
                });
        });
        doors.appendChild(testBtn);
        var probeBtn = document.createElement('button');
        probeBtn.type = 'button';
        probeBtn.className = 'arcade-btn arcade-btn--sm';
        probeBtn.textContent = 'Probe Ollama';
        probeBtn.title = 'Reads the Ollama endpoint’s /api/tags — reports installed models, never downloads anything.';
        probeBtn.addEventListener('click', function () {
            var endpoint = aiSettingText('ollamaendpoint') || 'http://localhost:11434';
            statusLine.classList.remove('is-error');
            statusLine.textContent = 'Probing ' + endpoint + '…';
            var controller = new AbortController();
            var timer = setTimeout(function () { controller.abort(); }, AI_AREA_PROBE_TIMEOUT_MS);
            fetch(endpoint.replace(/\/$/, '') + '/api/tags', { cache: 'no-store', signal: controller.signal })
                .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
                .then(function (data) {
                    if (!document.body.contains(statusLine)) return;
                    var names = (data && data.models || []).map(function (m) { return m.name; });
                    statusLine.textContent = names.length
                        ? 'Ollama reachable — ' + names.length + ' model' + (names.length === 1 ? '' : 's') + ' installed: ' + names.slice(0, 6).join(', ') + (names.length > 6 ? '…' : '')
                        : 'Ollama reachable but no models installed — `ollama pull gemma3:1b`.';
                })
                .catch(function (e) {
                    clearTimeout(timer);
                    if (!document.body.contains(statusLine)) return;
                    statusLine.textContent = 'Ollama unreachable at ' + endpoint + ' — is it running? (offline state, honest: ' + (e && e.message || e) + ')';
                    statusLine.classList.add('is-error');
                });
        });
        doors.appendChild(probeBtn);
        body.appendChild(doors);
        card.appendChild(body);
        stage.appendChild(card);

        buildDeckPopupEmbed(config, 'ai-models', 'Stock’s full provider group — every provider’s endpoint, model, and API-key fields. Keys stay inside these stock password inputs: never echoed, never captured.');
    }

    // --------------------------------------------------------------------
    // The panel shell: list + stage/config, listbox contract, lazy ensure.
    // --------------------------------------------------------------------
    function renderAiZoneList() {
        var list = document.getElementById('arcade-ai-zone-list');
        if (!list) return;
        list.innerHTML = '';
        AI_ZONES.forEach(function (zone) {
            var row = document.createElement('button');
            row.type = 'button';
            row.className = 'arcade-evt-item';
            row.dataset.arcadeAiZone = zone.id;
            row.setAttribute('role', 'option');
            var selected = aiSelectedZone === zone.id;
            row.classList.toggle('is-on', selected);
            row.setAttribute('aria-selected', String(selected));
            var label = document.createElement('span');
            label.className = 'arcade-evt-item__label';
            label.textContent = zone.icon + ' ' + zone.label;
            row.appendChild(label);
            var stateText = null;
            var stateOn = false;
            if (zone.id === 'moderation') { stateText = aiSettingFlag('ollamaCensorBot') ? 'on' : 'off'; stateOn = aiSettingFlag('ollamaCensorBot'); }
            else if (zone.id === 'cohost') { stateText = (aiSettingText('aiOverlayLabel') === AI_COHOST_STAGE_LABEL) ? 'wired' : 'not wired'; stateOn = aiSettingText('aiOverlayLabel') === AI_COHOST_STAGE_LABEL; }
            else if (zone.id === 'bot') { stateText = aiSettingFlag('ollama') ? 'on' : 'off'; stateOn = aiSettingFlag('ollama'); }
            else if (zone.id === 'translate') { stateText = aiSettingFlag('aiAutoTranslate') ? 'on' : 'off'; stateOn = aiSettingFlag('aiAutoTranslate'); }
            else if (zone.id === 'devchat') { stateText = aiDevchatProbe.state === 'connected' ? 'connected' : (aiDevchatEndpoint() ? '—' : 'not set up'); stateOn = aiDevchatProbe.state === 'connected'; }
            else if (zone.id === 'models') { stateText = aiSettingOption('aiProvider') || 'ollama'; stateOn = true; }
            if (stateText) {
                var state = document.createElement('span');
                state.className = 'arcade-evt-state ' + (stateOn ? 'arcade-evt-state--on' : 'arcade-evt-state--off');
                state.textContent = stateText;
                row.appendChild(state);
            }
            row.addEventListener('click', function () { selectAiZone(zone.id); });
            list.appendChild(row);
        });
    }

    function renderAiZone() {
        var stage = document.getElementById('arcade-ai-stage');
        var config = document.getElementById('arcade-ai-config');
        if (!stage || !config) return;
        stage.innerHTML = '';
        config.innerHTML = '';
        if (aiSelectedZone === 'moderation') renderAiZoneModeration(stage, config);
        else if (aiSelectedZone === 'cohost') renderAiZoneCohost(stage, config);
        else if (aiSelectedZone === 'bot') renderAiZoneBot(stage, config);
        else if (aiSelectedZone === 'translate') renderAiZoneTranslate(stage, config);
        else if (aiSelectedZone === 'devchat') renderAiZoneDevchat(stage, config);
        else if (aiSelectedZone === 'models') renderAiZoneModels(stage, config);
    }

    function selectAiZone(zoneId) {
        if (aiSelectedZone === zoneId) return;
        aiSelectedZone = zoneId;
        renderAiZoneList();
        renderAiZone();
    }

    function ensureAiPanelLive() {
        if (aiPanelLive) {
            renderAiZoneList(); // state chips re-read the snapshot on re-entry
            return;
        }
        aiPanelLive = true;
        // ONE getSettings read hydrates every zone — sequenced BEFORE any
        // iframe src is set (the S50 sendSync-before-churn discipline; the
        // read rides deckCmd's callback form, only unsafe DURING churn).
        deckCmd({ getSettings: true }, function (response) {
            aiSettings = (response && response.settings) || {};
            try {
                var rawBody = aiHouseText(AI_COHOST_BODY_KEY);
                if (rawBody) {
                    var parsed = JSON.parse(rawBody);
                    if (parsed && typeof parsed === 'object') aiCohostBody = { head: parsed.head || 'pac', body: parsed.body || 'bot', color: parsed.color || 'cyan' };
                }
            } catch (e) { /* keep the BASIC DEFAULT */ }
            // The session id comes off the app's own helper (shared with the
            // deck loader) — resolved BEFORE any zone iframe src is set.
            var finish = function () { renderAiZoneList(); renderAiZone(); };
            if (!deckSessionId && typeof window.getChatDockSessionId === 'function') {
                Promise.resolve(window.getChatDockSessionId()).then(function (id) {
                    deckSessionId = id || '';
                    finish();
                }, finish);
                return;
            }
            finish();
        });
    }

    function buildAiPanel() {
        var panel = document.createElement('section');
        panel.className = 'arcade-ai';
        panel.setAttribute('aria-label', 'AI console');
        panel.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title">AI</span>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-ai-status" id="arcade-ai-status"></span>' +
            '<button type="button" class="arcade-btn arcade-btn--sm arcade-btn--icon" id="arcade-ai-close" aria-label="Close">×</button>' +
            '</div>' +
            '<div class="arcade-ai-body">' +
            '<div class="arcade-alerts-body">' +
            '<div class="arcade-evt-list-col">' +
            '<div class="arcade-evt-list" id="arcade-ai-zone-list" role="listbox" aria-label="AI zones"></div>' +
            '</div>' +
            '<div class="arcade-alerts-stage">' +
            '<div class="arcade-ai-stage" id="arcade-ai-stage"></div>' +
            '<div class="arcade-evt-config" id="arcade-ai-config"></div>' +
            '</div>' +
            '</div>' +
            '</div>';
        document.body.appendChild(panel);

        attachArcadeListboxNav(panel.querySelector('#arcade-ai-zone-list'), '[data-arcade-ai-zone]',
            function () { return aiSelectedZone; }, selectAiZone,
            function (row) { return row.dataset.arcadeAiZone; });

        panel.querySelector('#arcade-ai-close').addEventListener('click', function () {
            navigateArcadeTab('main');
        });
    }

    function buildAlertsPanel() {
        var panel = document.createElement('section');
        panel.className = 'arcade-alerts';
        panel.setAttribute('aria-label', 'Alerts — events as easy flows');
        panel.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title">ALERTS</span>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-alerts-status" id="arcade-alerts-status"></span>' +
            '<button type="button" class="arcade-btn arcade-btn--sm arcade-btn--primary" id="arcade-alerts-copy">Copy overlay URL</button>' +
            '</div>' +
            '<div class="arcade-alerts-body">' +
            '<div class="arcade-evt-list-col">' +
            '<div class="arcade-evt-list" id="arcade-alerts-list" role="listbox" aria-label="Alert events"></div>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-alerts-add" ' +
            'aria-haspopup="dialog" aria-expanded="false" aria-controls="arcade-evt-add-modal">+ Add event</button>' +
            '</div>' +
            '<div class="arcade-alerts-stage">' +
            '<div class="arcade-alerts-preview">' +
            '<div class="arcade-alerts-preview-bar">' +
            '<span class="arcade-style-hint" id="arcade-alerts-preview-hint">Loading preview…</span>' +
            '<button type="button" class="arcade-btn arcade-btn--sm arcade-btn--primary" id="arcade-alerts-test">Fire test alert</button>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-alerts-clear">Clear</button>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-alerts-reload">Reload preview</button>' +
            '</div>' +
            '<iframe id="arcade-alerts-preview-frame" title="Alert box preview"></iframe>' +
            '</div>' +
            '<div class="arcade-evt-config" id="arcade-alerts-config"></div>' +
            '</div>' +
            '</div>';
        document.body.appendChild(panel);

        ALERT_EVENTS.forEach(function (evt) {
            alertsState[evt.id] = defaultAlertCategoryState(evt.id);
        });

        // H18-A backfill (TASK-47/S50 dispatch rider 2) — the S47 list's
        // role="listbox" gains the real arrow-key nav the role promises, via
        // the shared helper (S49's inline implementations are the reference).
        attachArcadeListboxNav(panel.querySelector('#arcade-alerts-list'), '[data-arcade-alert-key]',
            function () { return alertsSelectedKey; }, selectAlertsKey,
            function (row) { return row.dataset.arcadeAlertKey; });

        panel.querySelector('#arcade-alerts-copy').addEventListener('click', function (e) {
            copyAlertsOverlayUrl(e.currentTarget);
        });
        panel.querySelector('#arcade-alerts-clear').addEventListener('click', clearAlertsPreview);
        panel.querySelector('#arcade-alerts-reload').addEventListener('click', reloadAlertsPreview);
        panel.querySelector('#arcade-alerts-test').addEventListener('click', fireSelectedTestAlert);
        panel.querySelector('#arcade-alerts-add').addEventListener('click', openAddEventPicker);
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

    // --------------------------------------------------------------------
    // S47 variants doc — helpers. Look shape everywhere:
    // { accent, style, template, font, media, sound } ('twitch'/'' = unset).
    // --------------------------------------------------------------------
    function blankAlertLook() {
        return { accent: '', style: 'twitch', template: '', font: '', media: '', sound: '' };
    }

    function normalizeAlertLook(state) {
        var look = blankAlertLook();
        if (state && typeof state === 'object') {
            ['accent', 'template', 'font', 'media', 'sound'].forEach(function (field) {
                if (typeof state[field] === 'string') look[field] = state[field];
            });
            if (typeof state.style === 'string' && ALERT_STYLE_OPTIONS.indexOf(state.style) !== -1) look.style = state.style;
        }
        return look;
    }

    function defaultAlertTier() {
        return alertTiers.indexOf('NORMAL') !== -1 ? 'NORMAL' : alertTiers[alertTiers.length - 1];
    }

    function normalizeAlertsDoc(raw) {
        var doc = null;
        if (raw) { try { doc = JSON.parse(raw); } catch (e) { doc = null; } }
        if (!doc || typeof doc !== 'object') doc = {};
        if (!doc.defaults || typeof doc.defaults !== 'object') doc.defaults = {};
        doc.defaults.state = normalizeAlertLook(doc.defaults.state);
        if (!doc.events || typeof doc.events !== 'object') doc.events = {};
        ALERT_EVENTS.forEach(function (evt) {
            var rec = doc.events[evt.id];
            if (!rec || typeof rec !== 'object') rec = {};
            if (typeof rec.selected !== 'string' || !rec.selected) rec.selected = 'template';
            if (typeof rec.tier !== 'string' || !rec.tier) rec.tier = defaultAlertTier();
            if (!Array.isArray(rec.variants)) rec.variants = [];
            rec.variants.forEach(function (v) {
                v.state = normalizeAlertLook(v.state);
                if (!v.condition || typeof v.condition !== 'object') v.condition = { firsttime: false, platform: '' };
                if (typeof v.flowId !== 'string') v.flowId = null;
            });
            if (rec.templateState) rec.templateState = normalizeAlertLook(rec.templateState);
            if (rec.selected !== 'template' && !rec.variants.some(function (v) { return v.id === rec.selected; })) rec.selected = 'template';
            doc.events[evt.id] = rec;
        });
        if (!Array.isArray(doc.custom)) doc.custom = [];
        doc.custom.forEach(function (c) {
            if (typeof c.tier !== 'string' || !c.tier) c.tier = defaultAlertTier();
            if (typeof c.flowId !== 'string') c.flowId = null;
        });
        doc.version = 1;
        return doc;
    }

    function saveAlertsDoc() {
        if (!alertsDoc) return;
        saveAlertSetting('textparam1', ALERT_VARIANTS_KEY, JSON.stringify(alertsDoc));
    }

    function isBlankAlertField(field, value) {
        return field === 'style' ? (!value || value === 'twitch') : !value;
    }

    function alertEventMeta(category) {
        for (var i = 0; i < ALERT_EVENTS.length; i++) {
            if (ALERT_EVENTS[i].id === category) return ALERT_EVENTS[i];
        }
        return null;
    }

    function isStockAlertKey(key) {
        return !!alertEventMeta(key);
    }

    function getCustomAlertEvent(id) {
        if (!alertsDoc) return null;
        for (var i = 0; i < alertsDoc.custom.length; i++) {
            if (alertsDoc.custom[i].id === id) return alertsDoc.custom[i];
        }
        return null;
    }

    function lookFromAlertState(st) {
        return normalizeAlertLook(st);
    }

    function alertSelectedVariant(category) {
        var rec = alertsDoc && alertsDoc.events[category];
        if (!rec || rec.selected === 'template') return null;
        for (var i = 0; i < rec.variants.length; i++) {
            if (rec.variants[i].id === rec.selected) return rec.variants[i];
        }
        return null;
    }

    // Editing a template FORKS (ruled: the template stays untouched and
    // selectable) — the fork snapshots the live param25 look as templateState
    // the first time, so re-selecting "Template" restores exactly that.
    function forkAlertVariant(category) {
        var rec = alertsDoc.events[category];
        var live = lookFromAlertState(alertsState[category]);
        if (!rec.templateState) rec.templateState = live;
        var variant = {
            id: mintAlertId('v'),
            name: 'Custom ' + (rec.variants.length + 1),
            state: normalizeAlertLook(live),
            flowId: null,
            condition: { firsttime: false, platform: '' }
        };
        rec.variants.push(variant);
        rec.selected = variant.id;
        return variant;
    }

    // The selected option is what fires live: write the whole look through to
    // the SAME param25 keys the popup reads/writes (canonical saveSetting),
    // keeping alertsState (this surface's live truth) in lockstep.
    function applyLookToCategory(category, look) {
        var map = ALERT_PARAM_MAP[category];
        var st = alertsState[category];
        if (!map || !st) return;
        ['accent', 'template', 'font', 'media', 'sound'].forEach(function (field) {
            st[field] = look[field] || '';
            saveAlertSetting('textparam25', map[field], st[field]);
        });
        st.style = look.style || 'twitch';
        saveAlertSetting('optionparam25', map.style, st.style);
    }

    function selectAlertVariant(category, selected) {
        var rec = alertsDoc.events[category];
        if (!rec) return;
        rec.selected = selected;
        var variant = alertSelectedVariant(category);
        var look = variant ? variant.state : (rec.templateState || lookFromAlertState(alertsState[category]));
        applyLookToCategory(category, look);
        saveAlertsDoc();
        renderAlertsConfig();
        queueAlertsPreviewReload();
    }

    function mintAlertId(prefix) {
        return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    }

    function setAlertField(category, field, value, rowEl) {
        var st = alertsState[category];
        var map = ALERT_PARAM_MAP[category];
        if (!st || !map || !alertsDoc) return;
        if (field !== 'enabled' && alertsDoc.events[category].selected === 'template') {
            forkAlertVariant(category); // editing a template saves-as a new option
            saveAlertsDoc();
            renderAlertsConfig();
        }
        var variant = alertSelectedVariant(category);
        st[field] = value;
        if (variant && field !== 'enabled') variant.state[field] = value;
        if (rowEl) rowEl.classList.toggle('is-set', field === 'style' ? value !== 'twitch' : !!value);

        if (field === 'enabled') {
            var enable = map.enable;
            saveAlertSetting('param25', enable.param, enable.invert ? !value : !!value);
        } else if (field === 'style') {
            saveAlertSetting('optionparam25', map.style, value);
        } else {
            saveAlertSetting('textparam25', map[field], value);
        }
        if (variant) saveAlertsDoc();
        updateAlertInheritLine(category);
        renderAlertsList(); // On/Off state on the row follows the real setting
        queueAlertsPreviewReload();
    }

    function setDefaultLookField(field, value, rowEl) {
        if (!alertsDoc) return;
        alertsDoc.defaults.state[field] = value;
        if (rowEl) rowEl.classList.toggle('is-set', field === 'style' ? value !== 'twitch' : !!value);
        saveAlertsDoc();
        queueAlertsPreviewReload(); // the preview composes inherited defaults
    }

    // "Inheriting default" vs "custom", per FIELD: an event field left at its
    // blank/stock value inherits the All-types default's value in the
    // composed overlay URL (alertComposedField below) — this line says so.
    function alertInheritLineText(category) {
        var st = alertsState[category];
        var def = alertsDoc ? alertsDoc.defaults.state : blankAlertLook();
        var inheriting = [];
        var custom = [];
        ['accent', 'style', 'template', 'font', 'media', 'sound'].forEach(function (field) {
            if (!isBlankAlertField(field, st[field])) { custom.push(field); return; }
            if (!isBlankAlertField(field, def[field])) inheriting.push(field);
        });
        if (custom.length && inheriting.length) return 'Custom look · inheriting default: ' + inheriting.join(', ');
        if (custom.length) return 'Custom look';
        if (inheriting.length) return 'Inheriting default look (' + inheriting.join(', ') + ')';
        return 'Stock built-in look';
    }

    function updateAlertInheritLine(category) {
        var el = document.getElementById('arcade-evt-inherit');
        if (el && isStockAlertKey(alertsSelectedKey) && alertsSelectedKey === category) {
            el.textContent = alertInheritLineText(category);
        }
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

    // ONE getSettings read for all 7 categories' saved param25 values PLUS
    // the arcade-owned variants doc + tier list — same shape/IPC the Style
    // tab's loadStyleSettings() already uses.
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
                            });
                            // Tier NAMES list — S51's Points-page admin takes
                            // this key over; until then it is seeded ONCE with
                            // the minimal default and only ever READ here.
                            var tiersEntry = settings[ALERT_TIERS_KEY];
                            var tiersRaw = (tiersEntry && typeof tiersEntry.textparam1 === 'string') ? tiersEntry.textparam1 : '';
                            var parsedTiers = null;
                            if (tiersRaw) {
                                try {
                                    var t = JSON.parse(tiersRaw);
                                    if (Array.isArray(t) && t.length && t.every(function (x) { return typeof x === 'string' && x; })) parsedTiers = t;
                                } catch (e) { parsedTiers = null; }
                            }
                            if (parsedTiers) {
                                alertTiers = parsedTiers;
                            } else {
                                saveAlertSetting('textparam1', ALERT_TIERS_KEY, JSON.stringify(alertTiers));
                            }
                            var docEntry = settings[ALERT_VARIANTS_KEY];
                            alertsDoc = normalizeAlertsDoc((docEntry && typeof docEntry.textparam1 === 'string') ? docEntry.textparam1 : '');
                        } catch (e) { console.error('[arcade-shell] alerts settings parse failed:', e); }
                        resolve();
                    });
                    return;
                }
            } catch (e) { console.error('[arcade-shell] alerts settings load failed:', e); }
            alertsDoc = normalizeAlertsDoc('');
            setAlertsStatus('settings bridge unavailable — alert edits will not persist', true);
            resolve();
        });
    }

    // Per-event URL params from the CURRENT in-memory state — shared by the
    // preview builder (adds &preview/&embedded) and the real Copy-overlay-
    // URL builder (does not). A field left at its blank/stock value INHERITS
    // the All-types default's value (alertComposedField); anything still
    // blank rides the alert box's own built-in defaults and is omitted, so
    // an untouched setup composes byte-identically to the pre-S47 builder.
    function alertComposedField(category, field) {
        var st = alertsState[category];
        var own = st ? st[field] : '';
        if (!isBlankAlertField(field, own)) return own;
        var def = (alertsDoc && alertsDoc.defaults) ? alertsDoc.defaults.state[field] : '';
        return isBlankAlertField(field, def) ? '' : def;
    }

    function buildAlertEventParams() {
        var params = [];
        ALERT_EVENTS.forEach(function (evt) {
            var map = ALERT_PARAM_MAP[evt.id];
            var st = alertsState[evt.id];
            var accent = alertComposedField(evt.id, 'accent');
            var style = alertComposedField(evt.id, 'style');
            var template = alertComposedField(evt.id, 'template');
            var font = alertComposedField(evt.id, 'font');
            var media = alertComposedField(evt.id, 'media');
            var sound = alertComposedField(evt.id, 'sound');
            if (accent) params.push(map.accent + '=' + encodeURIComponent(accent));
            if (style && style !== 'twitch') params.push(map.style + '=' + encodeURIComponent(style));
            if (template) params.push(map.template + '=' + encodeURIComponent(template));
            if (font) params.push(map.font + '=' + encodeURIComponent(font));
            if (media) params.push(map.media + '=' + encodeURIComponent(media));
            if (sound) params.push(map.sound + '=' + encodeURIComponent(sound));
            var enable = map.enable;
            var paramShouldBeSet = enable.invert ? !st.enabled : !!st.enabled;
            if (paramShouldBeSet) params.push(enable.param);
        });
        return params;
    }

    function buildAlertsPreviewParams(sessionId) {
        return ['session=' + encodeURIComponent(sessionId), 'preview=1', 'embedded=1'].concat(buildAlertEventParams());
    }

    // S47B (D2-C) — which page the preview frame should host right now:
    // 'actions' when the selected event is a flow-backed custom event whose
    // flow qualifies for the overlay-only test-fire (its actions render on
    // the actions overlay, so that is the honest preview surface), 'alerts'
    // otherwise (today's multi-alerts.html &preview=1 frame).
    function alertsPreviewWantsActionsMode() {
        var customEvt = getCustomAlertEvent(alertsSelectedKey);
        if (!customEvt) return false;
        return getAlertFlowOverlayTestState(customEvt.flowId).ok === true;
    }

    // Re-evaluates the desired mode against live flow state and re-inits the
    // frame ONLY on a mode flip — called from surface renders (selection
    // changes, tab re-entry), never on a timer. Before the first init the
    // mode is unset; that first load is owned by ensureAlertsPanelLive.
    function syncAlertsPreviewMode() {
        var frame = document.getElementById('arcade-alerts-preview-frame');
        if (!frame || !alertsPanelLive || !frame.dataset.alertsPreviewMode) return;
        var mode = alertsPreviewWantsActionsMode() ? 'actions' : 'alerts';
        if (frame.dataset.alertsPreviewMode !== mode) initAlertsPreviewFrame();
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
        var mode = alertsPreviewWantsActionsMode() ? 'actions' : 'alerts';
        var myToken = ++alertsPreviewToken;
        frame.dataset.alertsPreviewReady = '';
        frame.dataset.alertsPreviewMode = mode;
        setAlertsPreviewHint('Loading preview…');
        if (mode === 'actions') {
            // S47B — flow-test preview: actions.html WITHOUT a session, inert
            // by construction (no bridge iframe, no socket — its session
            // gate, actions.html:2028-2040); the &preview=1 param rides along
            // to mark intent (actions.html has no preview gate of its own —
            // the isolation HERE is that no transport ever exists in this
            // frame). Its session modal is hidden by a shell-injected style
            // once loaded (same DRESS idiom as installStockFrameDressing).
            // &obsws= points stock's unconditional OBS probe
            // (actions.html:1145-1146 dials the OBS default 1s after EVERY
            // load) at a dead localhost port, so the isolated frame never
            // touches the operator's real OBS either.
            resolver('actions.html', { extraParams: ['preview=1', 'embedded=1', 'obsws=' + encodeURIComponent('ws://127.0.0.1:9')] }).then(function (resolved) {
                if (myToken !== alertsPreviewToken) return; // superseded by a newer reload
                if (resolved && resolved.url) {
                    frame.onload = function () {
                        if (myToken !== alertsPreviewToken) return;
                        try {
                            var doc = frame.contentDocument;
                            if (doc && doc.head) {
                                var style = doc.createElement('style');
                                style.textContent = '#sessionModal{display:none!important}';
                                doc.head.appendChild(style);
                            }
                        } catch (e) {}
                        frame.dataset.alertsPreviewReady = '1';
                        setAlertsPreviewHint('Preview ready — Fire test alert runs this event’s overlay actions here only.');
                    };
                    frame.src = resolved.url;
                }
            }).catch(function (e) {
                console.error('[arcade-shell] actions preview init failed:', e);
                setAlertsPreviewHint('preview failed — see console');
            });
            return;
        }
        Promise.resolve(getSession()).then(function (sessionId) {
            if (!sessionId) { setAlertsPreviewHint('waiting for session…'); return; }
            return resolver('multi-alerts.html', { extraParams: buildAlertsPreviewParams(sessionId) }).then(function (resolved) {
                if (myToken !== alertsPreviewToken) return; // superseded by a newer reload
                if (resolved && resolved.url) {
                    frame.onload = function () {
                        if (myToken !== alertsPreviewToken) return;
                        frame.dataset.alertsPreviewReady = '1';
                        setAlertsPreviewHint('Preview ready — select an event on the left, then Fire test alert.');
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
    // ensureStylePanelLive(): one getSettings read, then list + config +
    // first preview load.
    function ensureAlertsPanelLive() {
        if (alertsPanelLive) {
            // S47B — re-entering the tab IS a surface render: re-evaluate the
            // first-timers switch (D1-B) and flow test-fire qualification
            // (D2-C) against live state — the flow may have been edited in
            // the editor since the last render. No polling, render-driven only.
            renderAlertsList();
            renderAlertsConfig(); // flips the preview surface too (syncAlertsPreviewMode)
            return;
        }
        alertsPanelLive = true;
        loadAlertsSettings().then(function () {
            renderAlertsList();
            renderAlertsConfig();
            initAlertsPreviewFrame();
        });
    }

    // The preview pane's ONE test-fire. The stock 7 fire into the isolated
    // &preview=1 multi-alerts frame; the All-types default has no event of
    // its own. S47B (ruled D2-C): a flow-backed custom event MAY fire here
    // too — but only when every action node in its flow is overlay-type
    // (getAlertFlowOverlayTestState, default-deny); otherwise the honest
    // reason is named and the Flow editor's own test panel remains the path.
    function fireSelectedTestAlert() {
        if (isStockAlertKey(alertsSelectedKey)) {
            fireTestAlert(alertsSelectedKey);
            return;
        }
        if (alertsSelectedKey === ALERT_DEFAULT_KEY) {
            setAlertsPreviewHint('The default look has no event of its own — select an event to test-fire.');
            return;
        }
        var customEvt = getCustomAlertEvent(alertsSelectedKey);
        if (!customEvt) return;
        var testState = getAlertFlowOverlayTestState(customEvt.flowId); // re-qualify at fire time
        if (!testState.ok) {
            setAlertsPreviewHint(testState.reason);
            return;
        }
        fireFlowTestAlert(customEvt, testState.flow);
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
        if (frame.dataset.alertsPreviewMode === 'actions') {
            // S47B — actions.html's own clear idiom (clear_layer, actions.html:1823)
            try {
                if (typeof frame.contentWindow.testAction === 'function') {
                    frame.contentWindow.testAction({ actionType: 'clear_layer', layer: 'all' });
                }
            } catch (e) {}
            return;
        }
        frame.contentWindow.postMessage({ multiAlertsPreview: false }, '*');
    }

    // --------------------------------------------------------------------
    // S47B (ruled D2-C) — the flow test-fire. Isolation is STRUCTURAL, the
    // same doctrine as the stock 7's preview path: delivery targets ONLY the
    // preview frame's own window — here via actions.html's OWN exposed test
    // hook (window.testAction, actions.html:2020-2024 — the page's built-in
    // processInput entry), never a postMessage upward, never P2P, never the
    // session. The frame is actions.html loaded WITHOUT a session, inert by
    // construction (no bridge iframe, no socket — actions.html:1211-1220,
    // :1292-1311, :2028-2040). The flow's REAL action chain runs through
    // stock's own engine — evaluateFlow/executeAction on a THROWAWAY
    // EventFlowSystem whose one transport (sendTargetP2P) is aimed at the
    // preview frame and whose every other transport is a blocked stub — so
    // payload building is stock code, not a parallel engine and not a
    // dry-run fork. A staged in-memory copy swaps the trigger head for ONE
    // always-true messageProperties trigger (empty requiredProperties pass —
    // EventFlowSystem.js:2856-2858) so the actions fire on demand in their
    // real connection order; the operator's flow is never written back.
    // --------------------------------------------------------------------
    function fireFlowTestAlert(customEvt, flow) {
        var frame = document.getElementById('arcade-alerts-preview-frame');
        if (!frame || !frame.contentWindow || frame.dataset.alertsPreviewMode !== 'actions' || !frame.dataset.alertsPreviewReady) {
            setAlertsPreviewHint('preview still loading — try again in a moment');
            return;
        }
        var bg = getBackgroundWindow();
        var testWin = frame.contentWindow;
        // The EventFlowSystem CLASS is a script-global on the background
        // page, not a window property (background.js:18698-18724 exposes
        // only the instance) — reach it through the live instance.
        var FlowSystemClass = bg && bg.eventFlowSystem && bg.eventFlowSystem.constructor;
        if (typeof FlowSystemClass !== 'function') {
            setAlertsPreviewHint('flow system unavailable — test in the flow editor');
            return;
        }
        if (typeof testWin.testAction !== 'function') {
            setAlertsPreviewHint('preview not ready for flow tests — reload the preview');
            return;
        }

        // Staged copy: always-true trigger head → the flow's REAL action
        // chain. Entry actions = actions whose ORIGINAL upstream included a
        // non-action node (trigger/logic/state); action→action connections
        // carry over verbatim; orphaned actions stay orphaned (they would
        // never fire live either — honest).
        var rawNodes = JSON.parse(JSON.stringify(flow.nodes || []));
        var rawConnections = JSON.parse(JSON.stringify(flow.connections || []));
        var actionNodes = rawNodes.filter(function (n) { return n && n.type === 'action'; });
        var actionIds = {};
        actionNodes.forEach(function (n) { actionIds[n.id] = true; });
        var entryIds = {};
        rawConnections.forEach(function (c) {
            if (actionIds[c.to] && !actionIds[c.from]) entryIds[c.to] = true;
        });
        if (!Object.keys(entryIds).length) {
            setAlertsPreviewHint('the flow’s actions aren’t wired to a trigger — nothing would fire');
            return;
        }
        var staged = {
            id: flow.id + '__previewtest',
            name: (flow.name || 'flow') + ' (preview test)',
            active: true,
            nodes: [{ id: '__test_trigger', type: 'trigger', triggerType: 'messageProperties', x: 40, y: 40, config: { requiredProperties: [], forbiddenProperties: [], requireAll: true } }].concat(actionNodes),
            connections: rawConnections.filter(function (c) { return actionIds[c.from] && actionIds[c.to]; })
                .map(function (c) { return { from: c.from, to: c.to }; })
        };
        Object.keys(entryIds).forEach(function (id) { staged.connections.push({ from: '__test_trigger', to: id }); });

        var poster = function (payload) {
            try {
                var action = payload && payload.overlayNinja ? payload.overlayNinja : payload;
                if (action) testWin.testAction(action);
            } catch (e) { console.error('[arcade-shell] preview action post failed:', e); }
        };
        var blocked = function () { console.warn('[arcade-shell] preview flow fire: non-overlay transport blocked'); };
        var throwaway = new FlowSystemClass({
            dbName: 'arcadeAlertPreviewFireDB', // own scratch DB + BroadcastChannel namespace — torn down below
            sendTargetP2P: poster,
            sendMessageToTabs: blocked,
            sendToDestinations: blocked,
            sendMessageToBackground: blocked
        });
        var testMessage = {
            type: 'twitch', chatname: 'TestUser', userid: 'testuser',
            chatmessage: 'Test alert fired from the Alerts tab',
            event: customEvt.eventType || 'test', firsttime: true, timestamp: Date.now()
        };
        setAlertsPreviewHint('Firing test into the preview…');
        Promise.resolve(throwaway.initPromise).then(function () {
            return throwaway.evaluateFlow(staged, testMessage);
        }).then(function () {
            setAlertsPreviewHint('Test fired into the preview only — nothing reached the live session.');
        }).catch(function (e) {
            console.error('[arcade-shell] flow preview test failed:', e);
            setAlertsPreviewHint('flow test failed — see console');
        }).then(function () {
            // Teardown the throwaway: close its BroadcastChannel + IndexedDB
            // handle, then delete the scratch DB so nothing persists.
            try { if (throwaway.userMemoryChannel) throwaway.userMemoryChannel.close(); } catch (e) {}
            try { if (throwaway.db) throwaway.db.close(); } catch (e) {}
            try {
                var del = bg.indexedDB.deleteDatabase('arcadeAlertPreviewFireDB');
                del.onblocked = function () { console.warn('[arcade-shell] preview fire DB delete blocked'); };
            } catch (e) {}
        });
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
    // S47 — left list (events grouped by the stock sectioning, ALERT_GROUPS)
    // --------------------------------------------------------------------
    function renderAlertsList() {
        var list = document.getElementById('arcade-alerts-list');
        if (!list || !alertsDoc) return;
        list.innerHTML = '';

        list.appendChild(buildAlertListRow({
            key: ALERT_DEFAULT_KEY,
            icon: '★',
            label: 'All types — default',
            tier: null,
            stateText: null
        }));

        ALERT_GROUPS.forEach(function (group) {
            var header = document.createElement('div');
            header.className = 'arcade-evt-group__title';
            header.textContent = group.label;
            list.appendChild(header);
            group.events.forEach(function (cat) {
                var evt = alertEventMeta(cat);
                var rec = alertsDoc.events[cat];
                var st = alertsState[cat];
                list.appendChild(buildAlertListRow({
                    key: cat,
                    icon: evt.emoji,
                    label: evt.label,
                    tier: rec.tier,
                    stateText: st.enabled ? 'on' : 'off',
                    stateOn: !!st.enabled
                }));
            });
        });

        if (alertsDoc.custom.length) {
            var customHeader = document.createElement('div');
            customHeader.className = 'arcade-evt-group__title';
            customHeader.textContent = 'Custom events';
            list.appendChild(customHeader);
            alertsDoc.custom.forEach(function (c) {
                var flowState = getAlertFlowState(c.flowId);
                list.appendChild(buildAlertListRow({
                    key: c.id,
                    icon: '🧩',
                    label: c.name,
                    tier: c.tier,
                    stateText: flowState === 'active' ? 'on' : (flowState === 'inactive' ? 'off' : '—'),
                    stateOn: flowState === 'active',
                    stateTitle: flowState === 'missing' ? 'flow missing — the Event flow door reseeds it' : (flowState === 'unknown' ? 'flow system not up yet' : '')
                }));
            });
        }
    }

    function buildAlertListRow(opts) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'arcade-evt-item';
        row.dataset.arcadeAlertKey = opts.key;
        row.setAttribute('role', 'option');
        var selected = alertsSelectedKey === opts.key;
        row.classList.toggle('is-on', selected);
        row.setAttribute('aria-selected', String(selected));

        var label = document.createElement('span');
        label.className = 'arcade-evt-item__label';
        label.textContent = (opts.icon ? opts.icon + ' ' : '') + opts.label;
        row.appendChild(label);

        if (opts.tier) {
            var chip = document.createElement('span');
            chip.className = 'arcade-evt-tier' + (opts.tier === alertTiers[0] ? ' arcade-evt-tier--high' : '');
            chip.textContent = opts.tier;
            chip.title = 'Priority tier — set on the right';
            row.appendChild(chip);
        }

        if (opts.stateText) {
            var state = document.createElement('span');
            state.className = 'arcade-evt-state ' + (opts.stateOn ? 'arcade-evt-state--on' : 'arcade-evt-state--off');
            state.textContent = opts.stateText;
            if (opts.stateTitle) state.title = opts.stateTitle;
            row.appendChild(state);
        }

        row.addEventListener('click', function () {
            selectAlertsKey(opts.key);
        });
        return row;
    }

    function selectAlertsKey(key) {
        if (alertsSelectedKey === key) return;
        alertsSelectedKey = key;
        renderAlertsList();
        renderAlertsConfig(); // S47B — also flips the preview surface via syncAlertsPreviewMode
    }

    // --------------------------------------------------------------------
    // S47 — right side: edit/config for the selected event
    // --------------------------------------------------------------------
    function renderAlertsConfig() {
        var host = document.getElementById('arcade-alerts-config');
        if (!host || !alertsDoc) return;
        host.innerHTML = '';
        if (alertsSelectedKey === ALERT_DEFAULT_KEY) { renderDefaultAlertConfig(host); syncAlertsPreviewMode(); return; }
        var customEvt = getCustomAlertEvent(alertsSelectedKey);
        if (customEvt) { renderCustomAlertConfig(host, customEvt); syncAlertsPreviewMode(); return; }
        if (isStockAlertKey(alertsSelectedKey)) { renderStockAlertConfig(host, alertsSelectedKey); }
        syncAlertsPreviewMode(); // S47B — every config render re-checks the preview surface
    }

    function buildAlertConfigHead(iconLabel, stateText, stateOn, stateTitle) {
        var head = document.createElement('div');
        head.className = 'arcade-evt-config__head';
        var title = document.createElement('h3');
        title.className = 'arcade-evt-config__name';
        title.textContent = iconLabel;
        head.appendChild(title);
        if (stateText) {
            var chip = document.createElement('span');
            chip.className = 'arcade-evt-state ' + (stateOn ? 'arcade-evt-state--on' : 'arcade-evt-state--off');
            chip.textContent = stateText;
            if (stateTitle) chip.title = stateTitle;
            head.appendChild(chip);
        }
        return head;
    }

    function buildAlertTierRow(currentTier, onChange) {
        var row = document.createElement('div');
        row.className = 'arcade-alert-row';
        var lbl = document.createElement('label');
        lbl.textContent = 'Priority tier';
        row.appendChild(lbl);
        var select = document.createElement('select');
        alertTiers.forEach(function (tier) {
            var o = document.createElement('option');
            o.value = tier;
            o.textContent = tier;
            select.appendChild(o);
        });
        if (alertTiers.indexOf(currentTier) === -1) {
            var extra = document.createElement('option');
            extra.value = currentTier;
            extra.textContent = currentTier;
            select.appendChild(extra);
        }
        select.value = currentTier;
        select.title = 'Tier names come from the shared tier list — its admin lives on the Points page';
        select.addEventListener('change', function () { onChange(select.value); });
        row.appendChild(select);
        return row;
    }

    function renderStockAlertConfig(host, category) {
        var evt = alertEventMeta(category);
        var rec = alertsDoc.events[category];
        var st = alertsState[category];

        host.appendChild(buildAlertConfigHead(evt.emoji + ' ' + evt.label, st.enabled ? 'on' : 'off', !!st.enabled, 'Driven by the real alert-enabled setting'));

        // Variant dropdown — Template + saved customs; the selected option
        // is what fires live (written through to param25 on selection).
        var variantRow = document.createElement('div');
        variantRow.className = 'arcade-evt-vrow';
        var variantLbl = document.createElement('label');
        variantLbl.textContent = 'Variant';
        variantRow.appendChild(variantLbl);
        var variantSelect = document.createElement('select');
        variantSelect.id = 'arcade-evt-variant';
        var templateOpt = document.createElement('option');
        templateOpt.value = 'template';
        templateOpt.textContent = 'Template (stock settings)';
        variantSelect.appendChild(templateOpt);
        rec.variants.forEach(function (v) {
            var o = document.createElement('option');
            o.value = v.id;
            o.textContent = v.name;
            variantSelect.appendChild(o);
        });
        variantSelect.value = rec.selected;
        variantSelect.addEventListener('change', function () {
            selectAlertVariant(category, variantSelect.value);
        });
        variantRow.appendChild(variantSelect);
        var variant = alertSelectedVariant(category);
        if (variant) {
            var renameBtn = document.createElement('button');
            renameBtn.type = 'button';
            renameBtn.className = 'arcade-btn arcade-btn--sm';
            renameBtn.textContent = 'Rename';
            renameBtn.addEventListener('click', function () {
                startVariantRename(variant, renameBtn);
            });
            variantRow.appendChild(renameBtn);
        }
        host.appendChild(variantRow);

        var inherit = document.createElement('div');
        inherit.className = 'arcade-evt-inherit';
        inherit.id = 'arcade-evt-inherit';
        inherit.textContent = alertInheritLineText(category);
        host.appendChild(inherit);

        host.appendChild(buildAlertTierRow(rec.tier, function (tier) {
            rec.tier = tier;
            saveAlertsDoc();
            renderAlertsList();
        }));

        var doors = document.createElement('div');
        doors.className = 'arcade-evt-doors';
        var styleBtn = document.createElement('button');
        styleBtn.type = 'button';
        styleBtn.className = 'arcade-btn arcade-btn--sm';
        styleBtn.textContent = 'Style';
        styleBtn.setAttribute('aria-pressed', String(alertsStyleOpen));
        styleBtn.addEventListener('click', function () {
            alertsStyleOpen = !alertsStyleOpen;
            renderAlertsConfig();
        });
        doors.appendChild(styleBtn);
        var flowBtn = document.createElement('button');
        flowBtn.type = 'button';
        flowBtn.className = 'arcade-btn arcade-btn--sm';
        flowBtn.textContent = 'Event flow';
        flowBtn.addEventListener('click', function () {
            openAlertFlowDoor(category);
        });
        doors.appendChild(flowBtn);
        host.appendChild(doors);

        if (alertsStyleOpen) {
            var styleSection = document.createElement('div');
            styleSection.className = 'arcade-evt-style';

            var enableRow = buildArcadeToggle({ // TASK-68 — shared .arcade-toggle (item 8 sweep)
                label: 'Enabled',
                checked: st.enabled,
                onChange: function (checked) {
                    setAlertField(category, 'enabled', checked, null);
                    renderAlertsConfig();
                }
            });
            enableRow.querySelector('input').dataset.arcadeAlertField = 'enabled';
            styleSection.appendChild(enableRow);

            var accentRow = buildAlertFieldRow(category, 'accent', 'Accent', CATEGORY_ACCENT_DEFAULTS[category] || '#9146ff');
            syncAlertFieldRow(accentRow, 'accent', st.accent);
            styleSection.appendChild(accentRow);
            var styleRow = buildAlertStyleRow(category);
            syncAlertFieldRow(styleRow, 'style', st.style);
            styleSection.appendChild(styleRow);
            var templateRow = buildAlertFieldRow(category, 'template', 'Headline', ALERT_TEMPLATE_PLACEHOLDER[category] || '');
            syncAlertFieldRow(templateRow, 'template', st.template);
            styleSection.appendChild(templateRow);
            var fontRow = buildAlertFieldRow(category, 'font', 'Font', 'Georgia, serif');
            syncAlertFieldRow(fontRow, 'font', st.font);
            styleSection.appendChild(fontRow);
            var mediaRow = buildAlertFieldRow(category, 'media', 'Fallback media', 'https://…');
            syncAlertFieldRow(mediaRow, 'media', st.media);
            styleSection.appendChild(mediaRow);
            // TASK-70 (Lane 3) — "upload a media file": the SAME mechanism
            // Event Flow already uses for local media (preload's localMedia
            // bridge → the app's local media server → a 127.0.0.1 media URL),
            // reused verbatim — never a new upload path.
            mediaRow.appendChild(buildAlertMediaUploadBtn(category, 'media', 'image'));
            var soundRow = buildAlertFieldRow(category, 'sound', 'Sound URL', 'https://…');
            syncAlertFieldRow(soundRow, 'sound', st.sound);
            styleSection.appendChild(soundRow);
            soundRow.appendChild(buildAlertMediaUploadBtn(category, 'sound', 'audio'));

            host.appendChild(styleSection);
        }

        if (variant) {
            host.appendChild(buildAlertConditionBox(category, variant));
        }

        var flowLine = document.createElement('div');
        flowLine.className = 'arcade-evt-flowline';
        if (variant && variant.flowId) {
            var flowState = getAlertFlowState(variant.flowId);
            flowLine.textContent = 'Flow: ' + flowState + (flowState === 'missing' ? ' — the Event flow door reseeds it' : '');
        } else {
            flowLine.textContent = variant
                ? 'Flow: none yet — the Event flow door seeds a trigger → gif + sound skeleton.'
                : 'Template selected — editing style or opening the Event flow door saves-as a new variant.';
        }
        host.appendChild(flowLine);
    }

    function syncAlertFieldRow(row, field, value) {
        var input = row.querySelector('[data-arcade-alert-field="' + field + '"]');
        if (!input) return;
        input.value = value || (field === 'style' ? 'twitch' : '');
        row.classList.toggle('is-set', !isBlankAlertField(field, input.value));
    }

    // TASK-70 (Lane 3) — the per-event Style section's "upload a media
    // file". The mechanism is Event Flow's own local-media rail VERBATIM
    // (actions/EventFlowEditor.js:6788's chooseLocalMediaBtn handler):
    // localMedia.select → localMedia.start → localMedia.getMediaUrl(asset.id)
    // → the URL lands in the field. No new upload path, no data-URIs.
    function buildAlertMediaUploadBtn(category, field, mediaType) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'arcade-btn arcade-btn--sm arcade-alert-upload';
        btn.textContent = 'Upload…';
        btn.title = 'Choose a local ' + (mediaType === 'audio' ? 'audio' : 'image/gif') + ' file — served by the app’s local media server (the same rail Event Flow’s Choose Local File uses)';
        btn.setAttribute('aria-label', 'Upload a local ' + (mediaType === 'audio' ? 'sound' : 'media') + ' file for the ' + category + ' alert');
        btn.addEventListener('click', function () {
            var lm = window.ninjafy && window.ninjafy.localMedia;
            if (!lm || typeof lm.select !== 'function') {
                setAlertsStatus('local media rail unavailable in this build', true);
                return;
            }
            btn.disabled = true;
            lm.select({ mediaType: mediaType }).then(function (result) {
                if (!result || !result.success || !result.asset) return null; // canceled
                return lm.start().then(function () { return lm.getMediaUrl(result.asset.id); });
            }).then(function (res) {
                if (!res) return;
                if (!res.url) throw new Error('no media url');
                var row = btn.closest('.arcade-alert-row');
                var input = row && row.querySelector('[data-arcade-alert-field="' + field + '"]');
                if (input) input.value = res.url;
                setAlertField(category, field, res.url, row);
                setAlertsStatus(field + ' uploaded — local media URL set on ' + category);
            }).catch(function (e) {
                console.error('[arcade-shell] alert media upload failed:', e);
                setAlertsStatus('upload failed — ' + (e && e.message ? e.message : e), true);
            }).finally(function () { btn.disabled = false; });
        });
        return btn;
    }

    function startVariantRename(variant, btn) {
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'arcade-evt-rename';
        input.value = variant.name;
        btn.replaceWith(input);
        input.focus();
        input.select();
        var done = false;
        function commit(save) {
            if (done) return;
            done = true;
            if (save && input.value.trim()) {
                variant.name = input.value.trim();
                saveAlertsDoc();
            }
            renderAlertsList();
            renderAlertsConfig();
        }
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { commit(true); }
            else if (e.key === 'Escape') { commit(false); }
        });
        input.addEventListener('blur', function () { commit(true); });
    }

    // Priority condition — wires ONLY through stock EventFlow evaluators
    // (see ALERT_CONDITION_PLATFORMS' comment). Edits sync into the variant's
    // flow head; a flow the operator restructured by hand is left alone with
    // an honest status instead of being clobbered.
    function buildAlertConditionBox(category, variant) {
        var box = document.createElement('div');
        box.className = 'arcade-evt-cond';
        var title = document.createElement('div');
        title.className = 'arcade-evt-cond__title';
        title.textContent = 'Priority condition — this variant’s flow fires only when:';
        box.appendChild(title);

        var ftLabel = buildArcadeToggle({ // TASK-68 — shared .arcade-toggle (item 8 sweep)
            label: 'first-time chatter',
            hint: 'Rides the real firsttime message property — needs the stock first-timers setting on (background.js sets firsttime only then)',
            checked: !!variant.condition.firsttime,
            onChange: function (checked) {
                variant.condition.firsttime = checked;
                saveAlertsDoc();
                syncVariantFlowCondition(category, variant);
            }
        });
        ftLabel.classList.add('arcade-evt-cond__opt-toggle');
        // S47B (ruled D1-B) — one-click first-timers switch, rendered ONLY
        // while the stock `firsttimers` setting is off (state re-read from
        // the background page on every render — no polling, NO auto-enable
        // anywhere). One click writes the setting through the SAME canonical
        // saveSetting payload the popup's own toggle uses for it
        // (popup.js:6259-6267), plus the popup's companion local-DB re-enable
        // when disableDB is on (popup.js:5538-5546 — background.js:16595
        // sets `firsttime` only under firsttimers && !disableDB).
        var ftBg = getBackgroundWindow();
        var firsttimersOn = !!(ftBg && typeof ftBg.getSettingFlag === 'function' && ftBg.getSettingFlag('firsttimers'));
        if (!firsttimersOn) {
            var ftOnBtn = document.createElement('button');
            ftOnBtn.type = 'button';
            ftOnBtn.className = 'arcade-btn arcade-btn--sm arcade-evt-cond__ft-on';
            ftOnBtn.textContent = 'Turn on first-timers';
            ftOnBtn.title = 'Turns on stock first-time chatter detection — the dock will start highlighting first-time chatters (that is the stock behavior this flag controls). If the local message database is disabled it is re-enabled too, because detection needs it.';
            ftOnBtn.addEventListener('click', function () {
                ftOnBtn.disabled = true;
                saveAlertSetting('setting', 'firsttimers', true);
                if (ftBg && typeof ftBg.getSettingFlag === 'function' && ftBg.getSettingFlag('disableDB')) {
                    saveAlertSetting('setting', 'disableDB', false);
                }
                setAlertsStatus('first-time chatter detection turned on — the dock now highlights first-time chatters');
                setTimeout(function () { renderAlertsConfig(); }, 400); // re-read state → the button is gone
            });
            ftLabel.appendChild(ftOnBtn);
        }
        box.appendChild(ftLabel);

        var platLabel = document.createElement('label');
        platLabel.className = 'arcade-evt-cond__opt';
        platLabel.appendChild(document.createTextNode('on platform'));
        var platSelect = document.createElement('select');
        var anyOpt = document.createElement('option');
        anyOpt.value = '';
        anyOpt.textContent = 'any';
        platSelect.appendChild(anyOpt);
        ALERT_CONDITION_PLATFORMS.forEach(function (p) {
            var o = document.createElement('option');
            o.value = p;
            o.textContent = p;
            platSelect.appendChild(o);
        });
        platSelect.value = variant.condition.platform || '';
        platSelect.addEventListener('change', function () {
            variant.condition.platform = platSelect.value;
            saveAlertsDoc();
            syncVariantFlowCondition(category, variant);
        });
        platLabel.appendChild(platSelect);
        box.appendChild(platLabel);

        var hint = document.createElement('div');
        hint.className = 'arcade-evt-cond__hint';
        hint.textContent = 'Both ride what EventFlow already evaluates — first-time uses the stock firsttimers setting’s firsttime flag; platform uses the trigger’s own source filter.';
        box.appendChild(hint);
        return box;
    }

    function renderDefaultAlertConfig(host) {
        host.appendChild(buildAlertConfigHead('★ All types — default', null, false));
        var blurb = document.createElement('p');
        blurb.className = 'arcade-evt-blurb';
        blurb.textContent = 'One look every event inherits unless it sets its own — per-event config says “inheriting default” vs “custom” honestly. Edits here never touch per-event settings; fields left blank everywhere ride the alert box’s built-in defaults.';
        host.appendChild(blurb);

        var def = alertsDoc.defaults.state;
        var section = document.createElement('div');
        section.className = 'arcade-evt-style';
        section.appendChild(buildDefaultLookRow('accent', 'Accent', '#9146ff'));
        section.appendChild(buildDefaultLookStyleRow());
        section.appendChild(buildDefaultLookRow('template', 'Headline', '{name} …'));
        section.appendChild(buildDefaultLookRow('font', 'Font', 'Georgia, serif'));
        section.appendChild(buildDefaultLookRow('media', 'Fallback media', 'https://…'));
        section.appendChild(buildDefaultLookRow('sound', 'Sound URL', 'https://…'));
        host.appendChild(section);
    }

    function buildDefaultLookRow(field, label, placeholder) {
        var row = document.createElement('div');
        row.className = 'arcade-alert-row';
        var lbl = document.createElement('label');
        lbl.textContent = label;
        row.appendChild(lbl);
        var input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.placeholder = placeholder || '';
        input.value = alertsDoc.defaults.state[field] || '';
        row.classList.toggle('is-set', !isBlankAlertField(field, input.value));
        input.addEventListener('input', debounce(function () {
            setDefaultLookField(field, input.value, row);
        }, 300));
        row.appendChild(input);
        return row;
    }

    function buildDefaultLookStyleRow() {
        var row = document.createElement('div');
        row.className = 'arcade-alert-row';
        var lbl = document.createElement('label');
        lbl.textContent = 'Style preset';
        row.appendChild(lbl);
        var select = document.createElement('select');
        ALERT_STYLE_OPTIONS.forEach(function (opt) {
            var o = document.createElement('option');
            o.value = opt;
            o.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
            select.appendChild(o);
        });
        select.value = alertsDoc.defaults.state.style || 'twitch';
        row.classList.toggle('is-set', !isBlankAlertField('style', select.value));
        select.addEventListener('change', function () {
            setDefaultLookField('style', select.value, row);
        });
        row.appendChild(select);
        return row;
    }

    function renderCustomAlertConfig(host, customEvt) {
        var flowState = getAlertFlowState(customEvt.flowId);
        host.appendChild(buildAlertConfigHead('🧩 ' + customEvt.name,
            flowState === 'active' ? 'on' : (flowState === 'inactive' ? 'off' : '—'),
            flowState === 'active',
            flowState === 'missing' ? 'flow missing — the Event flow door reseeds it' : ''));

        var nameRow = document.createElement('div');
        nameRow.className = 'arcade-alert-row';
        var nameLbl = document.createElement('label');
        nameLbl.textContent = 'Name';
        nameRow.appendChild(nameLbl);
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.autocomplete = 'off';
        nameInput.value = customEvt.name;
        nameInput.addEventListener('input', debounce(function () {
            customEvt.name = nameInput.value.trim() || customEvt.name;
            saveAlertsDoc();
            renderAlertsList();
        }, 300));
        nameRow.appendChild(nameInput);
        host.appendChild(nameRow);

        var stateLine = document.createElement('div');
        stateLine.className = 'arcade-evt-inherit';
        stateLine.textContent = 'Flow-backed event — the look lives in its flow (gif, sound, text, webhook…). Flow: ' + flowState + '.';
        host.appendChild(stateLine);

        host.appendChild(buildAlertTierRow(customEvt.tier, function (tier) {
            customEvt.tier = tier;
            saveAlertsDoc();
            renderAlertsList();
        }));

        var doors = document.createElement('div');
        doors.className = 'arcade-evt-doors';
        var styleBtn = document.createElement('button');
        styleBtn.type = 'button';
        styleBtn.className = 'arcade-btn arcade-btn--sm';
        styleBtn.textContent = 'Style';
        styleBtn.disabled = true;
        styleBtn.title = 'The look lives in this event’s flow — gif, sound and text actions edit in the Flow editor.';
        doors.appendChild(styleBtn);
        var flowBtn = document.createElement('button');
        flowBtn.type = 'button';
        flowBtn.className = 'arcade-btn arcade-btn--sm';
        flowBtn.textContent = 'Event flow';
        flowBtn.addEventListener('click', function () {
            if (customEvt.flowId && getAlertFlowState(customEvt.flowId) !== 'missing') {
                openAlertFlowInEditor(customEvt.flowId);
                return;
            }
            setAlertsStatus('seeding flow…');
            seedAlertFlow(null, null, customEvt).then(function (flowId) {
                customEvt.flowId = flowId;
                saveAlertsDoc();
                renderAlertsList();
                renderAlertsConfig();
                setAlertsStatus('');
                openAlertFlowInEditor(flowId);
            }).catch(function (e) {
                console.error('[arcade-shell] custom event flow seed failed:', e);
                setAlertsStatus('flow system unavailable — flow not seeded', true);
            });
        });
        doors.appendChild(flowBtn);
        host.appendChild(doors);

        // S47B (ruled D2-C) — honest test-fire qualification, re-evaluated
        // on EVERY render from the live flow's action nodes (the flow may
        // have been edited in the editor since the last render).
        var overlayTest = getAlertFlowOverlayTestState(customEvt.flowId);
        var testLine = document.createElement('div');
        testLine.className = 'arcade-evt-flowline';
        testLine.textContent = overlayTest.ok
            ? 'Test-fire: overlay-only flow — Fire test alert runs its actions in the isolated preview above (nothing reaches the live session).'
            : 'Test-fire unavailable — ' + overlayTest.reason;
        host.appendChild(testLine);

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'arcade-btn arcade-btn--sm arcade-evt-remove';
        removeBtn.textContent = 'Remove from shelf';
        removeBtn.addEventListener('click', function () {
            if (removeBtn.dataset.armed === '1') {
                alertsDoc.custom = alertsDoc.custom.filter(function (c) { return c.id !== customEvt.id; });
                saveAlertsDoc();
                alertsSelectedKey = 'follow';
                renderAlertsList();
                renderAlertsConfig();
                setAlertsStatus('card removed — its flow stays in the Flow editor (delete it there if unwanted)');
                return;
            }
            removeBtn.dataset.armed = '1';
            removeBtn.textContent = 'Click again to remove (the flow is kept)';
            setTimeout(function () {
                removeBtn.dataset.armed = '';
                if (document.body.contains(removeBtn)) removeBtn.textContent = 'Remove from shelf';
            }, 3000);
        });
        host.appendChild(removeBtn);
    }

    // --------------------------------------------------------------------
    // S47 — flow plumbing. Under the hood alerts stay multi-alerts.html +
    // EventFlow: seeds/updates go through the background page's OWN
    // eventFlowSystem (frame2, same bridge the analytics rail reads), never
    // a parallel engine. Flow IDs are minted HERE with entropy and passed
    // in — saveFlow only falls back to Date.now().toString() when id is
    // falsy (EventFlowSystem.js:1494-1496), so the S41 same-millisecond
    // import collision can't bite this path; each seed is one save, one
    // flow, one gesture.
    // --------------------------------------------------------------------
    function withAlertFlowSystem(fn) {
        var bg = getBackgroundWindow();
        if (!bg || !bg.eventFlowSystem) return Promise.reject(new Error('EventFlow system unavailable'));
        var fsys = bg.eventFlowSystem;
        return Promise.resolve(fsys.initPromise).then(function () { return fn(fsys); });
    }

    function getAlertFlowState(flowId) {
        if (!flowId) return 'none';
        var bg = getBackgroundWindow();
        if (!bg || !bg.eventFlowSystem || !Array.isArray(bg.eventFlowSystem.flows)) return 'unknown';
        var flow = bg.eventFlowSystem.flows.find(function (f) { return f.id === flowId; });
        if (!flow) return 'missing';
        return flow.active !== false ? 'active' : 'inactive';
    }

    // --------------------------------------------------------------------
    // S47B (ruled D2-C) — overlay-only test-fire qualification. Reads the
    // flow's ACTION nodes only (never the condition-sync machinery) and is
    // re-run on every surface render — the flow may have been edited in the
    // editor. Default-deny: any action id off ALERT_OVERLAY_ONLY_ACTIONS
    // disqualifies, and the reason names the FIRST disqualifying action.
    // --------------------------------------------------------------------
    function alertActionFamilyLabel(actionType) {
        if (!actionType) return 'unknown';
        if (actionType.indexOf('obs') === 0 || actionType === 'triggerOBSScene') return 'OBS';
        if (actionType.indexOf('spotify') === 0) return 'Spotify';
        if (actionType.indexOf('tts') === 0) return 'TTS';
        if (actionType.indexOf('midi') === 0) return 'MIDI';
        var labels = {
            webhook: 'webhook', customJs: 'custom JS', relay: 'relay', sendMessage: 'send-message',
            addPoints: 'points', spendPoints: 'points',
            blockMessage: 'message-blocking', returnMessage: 'message-return', continueAsync: 'async-continue',
            modifyMessage: 'message-modify', addPrefix: 'message-modify', addSuffix: 'message-modify',
            findReplace: 'message-modify', removeText: 'message-modify', setProperty: 'message-modify',
            featureMessage: 'feature-message', pinMessage: 'pin-message', reflectionFilter: 'reflection-filter',
            rememberUser: 'user-memory', forgetUser: 'user-memory', clearUserMemory: 'user-memory', pickRandomUser: 'user-memory',
            setGateState: 'state-control', resetStateNode: 'state-control', setCounter: 'state-control', incrementCounter: 'state-control'
        };
        return labels[actionType] || ('unknown "' + actionType + '"');
    }

    function getAlertFlowOverlayTestState(flowId) {
        var bg = getBackgroundWindow();
        if (!bg || !bg.eventFlowSystem || !Array.isArray(bg.eventFlowSystem.flows)) {
            return { ok: false, reason: 'flow system not up yet — test in the flow editor' };
        }
        var flow = bg.eventFlowSystem.flows.find(function (f) { return f.id === flowId; });
        if (!flow) return { ok: false, reason: 'flow missing — the Event flow door reseeds it' };
        var actions = (flow.nodes || []).filter(function (n) { return n && n.type === 'action'; });
        if (!actions.length) return { ok: false, reason: 'flow has no actions yet — nothing to test', flow: flow };
        for (var i = 0; i < actions.length; i++) {
            if (ALERT_OVERLAY_ONLY_ACTIONS.indexOf(actions[i].actionType) === -1) {
                return { ok: false, reason: 'contains a ' + alertActionFamilyLabel(actions[i].actionType) + ' action — test in the flow editor', flow: flow };
            }
        }
        return { ok: true, flow: flow };
    }

    // Alert-shaped skeleton (trigger → overlay actions) — the same shape the
    // stock FLOW_TEMPLATES ship (EventFlowEditor.js:41-53, :163-177), with
    // the editor's own sample assets (its playTenorGiphy/playAudioClip
    // defaults, :2949-2951 + FLOW_TEMPLATES' join.wav) so a fresh seed can
    // visibly fire. Priority conditions wire the head ONLY: platform rides
    // the event trigger's own config.sources filter, first-time adds a
    // messageProperties trigger + AND gate — both stock evaluators.
    function buildAlertFlowSpec(category, variant, customEvt) {
        var triggerDef = customEvt
            ? { triggerType: customEvt.triggerType, eventType: customEvt.eventType }
            : ALERT_EVENT_TRIGGERS[category];
        var condition = (variant && variant.condition) || { firsttime: false, platform: '' };

        var trigger = { id: 'trigger_1', type: 'trigger', triggerType: triggerDef.triggerType, x: 185, y: 50, config: {} };
        if (triggerDef.triggerType === 'eventCustom') trigger.config.eventType = triggerDef.eventType || 'my_custom_event';
        if (condition.platform) trigger.config.sources = [condition.platform];

        var nodes = [trigger];
        var connections = [];
        var head = 'trigger_1';
        if (condition.firsttime) {
            nodes.push({ id: 'trigger_2', type: 'trigger', triggerType: 'messageProperties', x: 430, y: 50, config: { requiredProperties: ['firsttime'], forbiddenProperties: [], requireAll: true } });
            nodes.push({ id: 'logic_1', type: 'logic', logicType: 'AND', x: 300, y: 210, config: {} });
            connections.push({ from: 'trigger_1', to: 'logic_1' }, { from: 'trigger_2', to: 'logic_1' });
            head = 'logic_1';
        }
        nodes.push({ id: 'action_1', type: 'action', actionType: 'playTenorGiphy', x: 120, y: 390, config: { mediaUrl: 'https://giphy.com/embed/X9izlczKyCpmCSZu0l', mediaType: 'iframe', duration: 10000, width: 100, height: 100, x: 0, y: 0, randomX: false, randomY: false, useLayer: false, clearFirst: true } });
        nodes.push({ id: 'action_2', type: 'action', actionType: 'playAudioClip', x: 470, y: 390, config: { audioUrl: 'https://vdo.ninja/media/join.wav', volume: 1.0 } });
        connections.push({ from: head, to: 'action_1' }, { from: head, to: 'action_2' });
        return { nodes: nodes, connections: connections };
    }

    function seedAlertFlow(category, variant, customEvt) {
        return withAlertFlowSystem(function (fsys) {
            var label = customEvt ? customEvt.name : (alertEventMeta(category).label + (variant ? ' — ' + variant.name : ''));
            var spec = buildAlertFlowSpec(category, variant, customEvt);
            var flow = {
                id: mintAlertId('s47-' + (customEvt ? 'custom' : category)),
                name: 'Alert: ' + label,
                description: 'Seeded by the Arcade Alerts surface — trigger → overlay actions; refine freely.',
                active: true,
                nodes: spec.nodes,
                connections: spec.connections
            };
            return fsys.saveFlow(flow).then(function (saved) { return saved.id; });
        });
    }

    // One flow per variant, exactly one seed even when condition edits land
    // faster than the seed resolves (an in-flight seed is shared, never
    // doubled — an orphaned twin flow would be litter in the user's editor).
    var alertFlowSeedPending = {}; // variant id -> in-flight seed Promise (session-only, never persisted)

    function ensureVariantFlow(category, variant) {
        if (variant.flowId && getAlertFlowState(variant.flowId) !== 'missing') {
            return Promise.resolve(variant.flowId);
        }
        if (alertFlowSeedPending[variant.id]) return alertFlowSeedPending[variant.id];
        setAlertsStatus('seeding flow…');
        var p = seedAlertFlow(category, variant, null).then(function (flowId) {
            variant.flowId = flowId;
            saveAlertsDoc();
            delete alertFlowSeedPending[variant.id];
            return flowId;
        }).catch(function (e) {
            delete alertFlowSeedPending[variant.id];
            throw e;
        });
        alertFlowSeedPending[variant.id] = p;
        return p;
    }

    function syncVariantFlowCondition(category, variant) {
        ensureVariantFlow(category, variant).then(function (flowId) {
            return withAlertFlowSystem(function (fsys) {
                var flow = fsys.flows.find(function (f) { return f.id === flowId; });
                if (!flow) return null; // raced a delete in the editor — next edit reseeds
                var trigger = flow.nodes.find(function (n) { return n.id === 'trigger_1'; });
                if (!trigger) {
                    setAlertsStatus('flow was restructured in the editor — edit its condition there');
                    return null;
                }
                if (variant.condition.platform) { trigger.config.sources = [variant.condition.platform]; }
                else { delete trigger.config.sources; }
                var hasGate = flow.nodes.some(function (n) { return n.id === 'logic_1'; });
                if (variant.condition.firsttime && !hasGate) {
                    flow.nodes.push({ id: 'trigger_2', type: 'trigger', triggerType: 'messageProperties', x: 430, y: 50, config: { requiredProperties: ['firsttime'], forbiddenProperties: [], requireAll: true } });
                    flow.nodes.push({ id: 'logic_1', type: 'logic', logicType: 'AND', x: 300, y: 210, config: {} });
                    flow.connections = flow.connections.map(function (c) {
                        return c.from === 'trigger_1' ? { from: 'logic_1', to: c.to } : c;
                    });
                    flow.connections.push({ from: 'trigger_1', to: 'logic_1' }, { from: 'trigger_2', to: 'logic_1' });
                } else if (!variant.condition.firsttime && hasGate) {
                    flow.connections = flow.connections.map(function (c) {
                        return c.from === 'logic_1' ? { from: 'trigger_1', to: c.to } : c;
                    }).filter(function (c) {
                        return c.to !== 'logic_1';
                    });
                    flow.nodes = flow.nodes.filter(function (n) { return n.id !== 'trigger_2' && n.id !== 'logic_1'; });
                }
                return fsys.saveFlow(flow);
            });
        }).then(function (saved) {
            if (saved === null || saved === undefined) return;
            saveAlertsDoc();
            renderAlertsConfig();
            setAlertsStatus('condition wired into the flow');
        }).catch(function (e) {
            console.error('[arcade-shell] alert flow condition sync failed:', e);
            setAlertsStatus('flow system unavailable — condition saved locally only', true);
        });
    }

    // [Event flow] door — opens the flow backing the SELECTED variant in the
    // stock editor (seeds the skeleton first when none exists). Opening it
    // on a template is an edit of the template's flow → ruled round 4: that
    // saves-as a new variant, template untouched.
    function openAlertFlowDoor(category) {
        var variant = alertSelectedVariant(category);
        if (!variant) {
            variant = forkAlertVariant(category);
            saveAlertsDoc();
        }
        ensureVariantFlow(category, variant).then(function (flowId) {
            renderAlertsConfig();
            setAlertsStatus('');
            openAlertFlowInEditor(flowId);
        }).catch(function (e) {
            console.error('[arcade-shell] alert flow seed failed:', e);
            renderAlertsConfig();
            setAlertsStatus('flow system unavailable — variant saved without a flow', true);
        });
    }

    function openAlertFlowInEditor(flowId) {
        navigateArcadeTab('eventflow'); // stock nav click → frame2 shows the editor view
        var tries = 0;
        var timer = setInterval(function () {
            tries++;
            var bg = getBackgroundWindow();
            if (bg && bg.flowEditor && typeof bg.flowEditor.loadFlow === 'function') {
                clearInterval(timer);
                try {
                    bg.flowEditor.loadFlow(flowId);
                    if (typeof bg.flowEditor.loadFlowList === 'function') bg.flowEditor.loadFlowList();
                } catch (e) { console.error('[arcade-shell] open flow in editor failed:', e); }
            } else if (tries > 120) { // ~30s — frame2 can still be booting
                clearInterval(timer);
            }
        }, 250);
    }

    // --------------------------------------------------------------------
    // S47 — "+ Add event" picker: stock dedicated triggers not on the shelf
    // yet (ALERT_ADD_EVENT_DEFAULTS) + Build your own… Each pick seeds an
    // alert-shaped skeleton flow and lands a card on the shelf; Build your
    // own… then opens the flow builder on that seed.
    //
    // H18-A backfill (TASK-47/S50 dispatch rider 2): the full house
    // disclosure contract, mirrored from S49's command picker — focus in on
    // open, Escape closes, focus returns to the trigger on close-without-
    // pick, aria-haspopup/aria-expanded/aria-controls on the trigger,
    // click-outside closes; a pick lands focus on the new shelf row.
    // --------------------------------------------------------------------
    var alertAddPickerKeydown = null;

    function closeAddEventPicker(returnFocus) {
        var existing = document.getElementById('arcade-evt-add-modal');
        if (existing) existing.remove();
        if (alertAddPickerKeydown) {
            document.removeEventListener('keydown', alertAddPickerKeydown);
            alertAddPickerKeydown = null;
        }
        var trigger = document.getElementById('arcade-alerts-add');
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
            if (returnFocus) trigger.focus();
        }
    }

    function openAddEventPicker() {
        if (!alertsDoc) return;
        closeAddEventPicker(false);
        var trigger = document.getElementById('arcade-alerts-add');
        var back = document.createElement('div');
        back.className = 'arcade-evt-modal-back';
        back.id = 'arcade-evt-add-modal';
        var modal = document.createElement('div');
        modal.className = 'arcade-evt-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-label', 'Add event');

        var title = document.createElement('h3');
        title.className = 'arcade-evt-modal__title';
        title.tabIndex = -1;
        title.textContent = 'Add event';
        modal.appendChild(title);

        var sub = document.createElement('p');
        sub.className = 'arcade-evt-modal__blurb';
        sub.textContent = 'Stock triggers that aren’t on the shelf yet — each lands as a card backed by its own flow.';
        modal.appendChild(sub);

        ALERT_ADD_EVENT_DEFAULTS.forEach(function (opt) {
            modal.appendChild(buildAddEventPick(opt.label, opt.desc, function () {
                addCustomAlertEvent({ name: opt.label, triggerType: opt.triggerType, eventType: opt.eventType }, false);
            }));
        });
        modal.appendChild(buildAddEventPick('Build your own…', 'The flow builder, seeded with an alert-shaped skeleton (trigger → overlay action).', function () {
            addCustomAlertEvent({ name: 'Custom event ' + (alertsDoc.custom.length + 1), triggerType: 'eventCustom', eventType: 'my_custom_event' }, true);
        }, true));

        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'arcade-btn arcade-btn--sm';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', function () { closeAddEventPicker(true); });
        modal.appendChild(cancel);

        back.appendChild(modal);
        back.addEventListener('click', function (e) { if (e.target === back) closeAddEventPicker(true); });
        document.body.appendChild(back);
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
        alertAddPickerKeydown = function (e) {
            if (e.key === 'Escape' && document.getElementById('arcade-evt-add-modal')) {
                e.stopPropagation();
                closeAddEventPicker(true);
            }
        };
        document.addEventListener('keydown', alertAddPickerKeydown);
        var firstPick = modal.querySelector('.arcade-evt-modal__pick');
        (firstPick || title).focus();
    }

    function buildAddEventPick(name, desc, onPick, isBuild) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'arcade-evt-modal__pick' + (isBuild ? ' arcade-evt-modal__pick--build' : '');
        var nameEl = document.createElement('span');
        nameEl.className = 'arcade-evt-modal__pick-name';
        nameEl.textContent = name;
        btn.appendChild(nameEl);
        var descEl = document.createElement('span');
        descEl.className = 'arcade-evt-modal__pick-desc';
        descEl.textContent = desc;
        btn.appendChild(descEl);
        btn.addEventListener('click', onPick);
        return btn;
    }

    function addCustomAlertEvent(spec, openEditor) {
        closeAddEventPicker(false); // a pick — focus lands on the new row, not the trigger (H18-A backfill)
        var customEvt = {
            id: mintAlertId('evt'),
            name: spec.name,
            triggerType: spec.triggerType,
            eventType: spec.eventType || '',
            flowId: null,
            tier: defaultAlertTier()
        };
        setAlertsStatus('seeding flow…');
        seedAlertFlow(null, null, customEvt).then(function (flowId) {
            customEvt.flowId = flowId;
            alertsDoc.custom.push(customEvt);
            saveAlertsDoc();
            alertsSelectedKey = customEvt.id;
            renderAlertsList();
            renderAlertsConfig();
            setAlertsStatus('"' + customEvt.name + '" landed on the shelf');
            var rowEl = document.querySelector('#arcade-alerts-list [data-arcade-alert-key="' + customEvt.id + '"]');
            if (rowEl) {
                // The multi-alerts preview is an out-of-process iframe holding
                // browser-level focus — reclaim it for the main frame first or
                // the row focus silently no-ops; and the selection just set the
                // preview reloading, so re-claim again after that load lands
                // (both halves measured in the S50 harness).
                window.focus();
                rowEl.focus();
                var previewFrame = document.getElementById('arcade-alerts-preview-frame');
                if (previewFrame) {
                    previewFrame.addEventListener('load', function refocusRow() {
                        previewFrame.removeEventListener('load', refocusRow);
                        window.focus();
                        rowEl.focus();
                    });
                }
            }
            if (openEditor) openAlertFlowInEditor(flowId);
        }).catch(function (e) {
            console.error('[arcade-shell] add event flow seed failed:', e);
            setAlertsStatus('flow system unavailable — event not added', true);
        });
    }

    // --------------------------------------------------------------------
    // S48 — THE GAMES HUB + THE POINTS LOOP (TASK-45, ruled 0018.06.03 a₿;
    // dispatch rider: reuse the S47 Alerts interior — top-preview/bottom-
    // config, grouped left list, .arcade-evt-*/.arcade-alert-row shapes —
    // new .arcade-game-* classes extend, never fork, that idiom).
    //
    // LANE 1 — the hub. 'games' is a CUSTOM_TAB (own in-shell panel), so the
    // stock streams page is never driven for it and the stock Welcome
    // interstitial zero-source profiles get there is NOT inherited (the trap
    // the S46 report flagged — avoided by construction, not by a workaround).
    // LEFT = the streamer's shelf of ACTIVE games + "+ Add game" (a picker
    // pop-window whose cards each run the game's OWN demo — the arcade demo-
    // cabinet). RIGHT = BIG isolated preview on TOP, config below.
    //
    // THE GAMES REGISTRY below is the stock picker's option list
    // (popup.html games-preset-select — 20 since TASK-63 added dopaminedrop
    // + phraseguess, the S48 report's data-only seam), each capability
    // MEASURED from the bundle source, not assumed:
    //   - demo:      the page reads &demo (all but battle.html — battle's
    //                simulateWebSocket() attract runs unconditionally at
    //                boot, battle.html:1841, so its preview demos anyway).
    //   - cmdsuffix: the page reads &cmdsuffix (battle.html:184,
    //                chaosmode:346, chickenroyale:226, dancingparade:230,
    //                emojitower:261, petrace:322, treasurehunt:304) — the
    //                census-cited pattern the editable start command
    //                generalizes. The 11 command-less games take every chat
    //                message as play, so there is no command to edit.
    //   - chroma:    the page reads &chroma (green-screen key ground) — 11
    //                games. dancingparade's body is transparent BY DESIGN
    //                (its :22 background — the popup's chroma toggle for it
    //                writes a param the page never reads, a dead toggle
    //                upstream). battle/colorwars/emojitower/petrace read NO
    //                transparency param — said honestly.
    //   - transparent: the page reads &transparent (REAL alpha, not a key
    //                ground) — TASK-63's ruled work. treasurehunt (house
    //                patch: backdrop goes clear and every dug cell becomes a
    //                true alpha hole — the dig digs through the STREAM, the
    //                dirt field keeps rendering), wordchain (house patch,
    //                backdrop goes clear), dopaminedrop (ships with the param
    //                natively — board elements only).
    //   - dark:      the page reads &darkmode — same 11 as chroma.
    //   - avatar:    the page renders the chatter's profile picture off
    //                data.chatimg — battle.html:419 (addPlayer(chatname,
    //                chatimg…)) and chickenroyale:1993/2007 only.
    //                dancingparade's dancers are emoji characters + name
    //                labels — no pfp path. Nothing is wired beyond this.
    //   - font:      NO stock game reads a font-size/font-family URL param
    //                and none supports &css/&b64css (grep-verified) — the
    //                style commons say so honestly instead of fake-wiring.
    //
    // PREVIEW ISOLATION GUARANTEE: game pages append their vdo bridge iframe
    // UNCONDITIONALLY (demo mode included — e.g. dancingparade:529-538) and
    // fall back to a hardcoded 'test' room sessionless, so an isolated
    // preview can never ride the real session OR the fallback. Every hub
    // preview/picker-demo URL therefore carries a RANDOM throwaway room
    // (gamesPreviewRoom — an empty room nobody publishes to) plus &demo
    // where the page reads it. Copy-overlay-URL is the mirror image: the
    // REAL chat-dock session, the stored per-game options, NEVER &demo and
    // never the preview room.
    //
    // LANE 2 — the points loop surfaced. points.js already accrues (message
    // engagement + the house watch-time patch): measured earn model =
    // pointsPerEngagement (default 1) per engagementWindow (default 15 min),
    // streak bonus floor(streak × 0.1 × base) capped at 2×, streak breaks
    // after 1h quiet (points.js:83-89, :242-269). The pinned "Points &
    // unlocks" shelf row opens: the EARN card (real current rates off
    // getSettings, edit door to Deck Settings), the UNLOCKS table
    // (threshold → effect name, streamer-edited, arcadePointsUnlocks — v1
    // renders the ledger and says honestly the EXECUTION wiring is a
    // follow-up task; flows/overlays read it through the canonical settings
    // chain), and the leaderboard overlay door (stock leaderboard.html —
    // &demo stays preview-only, ruled). The Main-tab pulse tile reads REAL
    // IndexedDB rows off the analytics bridge (window.pointsSystem is a
    // background-page global, points.js:815) — today's earners computed
    // from each record's engagementHistory (one entry per awarded window,
    // capped at 100 ≈ 25h at the default window, so a day is always whole);
    // streak bonuses aren't attributable per day, so the tile says "base"
    // and never dresses the number up.
    //
    // Setting keys (all textparam1, canonical saveSetting — the reserved
    // arcadeAlert*/arcadeStylePresets keys are untouched):
    //   arcadeGameShelf      JSON array of active game ids (shelf order)
    //   arcadeGameCmdSuffix  JSON map id -> sanitized suffix
    //   arcadeGameStyle      JSON map id -> {chroma, transparent, dark, demo}
    //   arcadePointsUnlocks  JSON array [{threshold, name}]
    // --------------------------------------------------------------------
    var GAMES = [
        { id: 'spampower', file: 'games.html', emoji: '⚡', name: 'Spam Power', blurb: 'Chat activity powers the core — the harder chat spams, the higher the charge.', cmds: [], cmdsuffix: false, demo: true, chroma: true, dark: true, avatar: false },
        { id: 'battle', file: 'battle.html', emoji: '⚔️', name: 'Battlefield Mayhem', blurb: 'Automated chat combat — viewers join, move, and taunt; computer players fill the arena (its built-in attract mode is the demo).', cmds: ['!join', '!left', '!right', '!up', '!down', '!say'], cmdsuffix: true, demo: false, chroma: false, dark: false, avatar: true },
        { id: 'emojirain', file: 'games/emojirain.html', emoji: '🌧️', name: 'Emoji Rain', blurb: 'Emojis from chat fall down the screen — image emotes included (house patch).', cmds: [], cmdsuffix: false, demo: true, chroma: true, dark: true, avatar: false },
        { id: 'chatwars', file: 'games/chatwars.html', emoji: '⚔️', name: 'Chat Wars', blurb: 'Team territory battle — every chatter fights for their side.', cmds: [], cmdsuffix: false, demo: true, chroma: true, dark: true, avatar: false },
        { id: 'wordstorm', file: 'games/wordstorm.html', emoji: '🌪️', name: 'Word Storm', blurb: 'A collective word cloud built out of chat messages.', cmds: [], cmdsuffix: false, demo: true, chroma: true, dark: true, avatar: false },
        { id: 'chaosmode', file: 'games/chaosmode.html', emoji: '💀', name: 'Chaos Mode', blurb: 'Visual madness — chat triggers explosions, glitches, shakes and portals.', cmds: ['!explode', '!glitch', '!shake', '!portal'], cmdsuffix: true, demo: true, chroma: true, dark: true, avatar: false },
        { id: 'colorsymphony', file: 'games/colorsymphony.html', emoji: '🎵', name: 'Color Symphony', blurb: 'Chat messages paint musical colors across the screen.', cmds: [], cmdsuffix: false, demo: true, chroma: true, dark: true, avatar: false },
        { id: 'chatgarden', file: 'games/chatgarden.html', emoji: '🌻', name: 'Chat Garden', blurb: 'Viewers grow virtual plants by chatting.', cmds: [], cmdsuffix: false, demo: true, chroma: true, dark: true, avatar: false },
        { id: 'pixelbattle', file: 'games/pixelbattle.html', emoji: '🎨', name: 'Pixel Battle', blurb: 'Collaborative pixel art, one chat message at a time.', cmds: [], cmdsuffix: false, demo: true, chroma: true, dark: true, avatar: false },
        { id: 'memorylane', file: 'games/memorylane.html', emoji: '📷', name: 'Memory Lane', blurb: 'Nostalgic photo stories drawn from chat.', cmds: [], cmdsuffix: false, demo: true, chroma: true, dark: true, avatar: false },
        { id: 'rhythmpulse', file: 'games/rhythmpulse.html', emoji: '🎵', name: 'Rhythm Pulse', blurb: 'Chat builds musical beats together.', cmds: [], cmdsuffix: false, demo: true, chroma: true, dark: true, avatar: false, sound: true },
        { id: 'petrace', file: 'games/petrace.html', emoji: '🏁', name: 'Pet Race', blurb: 'Viewers join the race and their pets run for the finish.', cmds: ['!join'], cmdsuffix: true, demo: true, chroma: false, dark: false, avatar: false },
        { id: 'wordchain', file: 'games/wordchain.html', emoji: '🔤', name: 'Word Chain', blurb: 'A word-puzzle chain carried by chat.', cmds: [], cmdsuffix: false, demo: true, chroma: false, dark: false, avatar: false, transparent: true },
        { id: 'emojitower', file: 'games/emojitower.html', emoji: '🏗️', name: 'Emoji Tower', blurb: 'Chat drops emojis onto a growing tower — gravity is rude.', cmds: ['!drop'], cmdsuffix: true, demo: true, chroma: false, dark: false, avatar: false },
        { id: 'colorwars', file: 'games/colorwars.html', emoji: '🎨', name: 'Color Wars', blurb: 'Territory painting — chat claims the canvas color by color.', cmds: [], cmdsuffix: false, demo: true, chroma: false, dark: false, avatar: false },
        { id: 'treasurehunt', file: 'games/treasurehunt.html', emoji: '🏴‍☠️', name: 'Treasure Hunt', blurb: 'Grid exploration — chat digs for treasure square by square.', cmds: ['!dig'], cmdsuffix: true, demo: true, chroma: false, dark: false, avatar: false, transparent: true },
        { id: 'dancingparade', file: 'games/dancingparade.html', emoji: '💃', name: 'Dancing Parade', blurb: 'A lower-third parade — join and your dancer struts across. Transparent by design.', cmds: ['!join', '!dance', '!leave'], cmdsuffix: true, demo: true, chroma: false, dark: false, avatar: false, transparentByDesign: true },
        { id: 'chickenroyale', file: 'games/chickenroyale.html', emoji: '🍗', name: 'Chicken Royale', blurb: '3D battle royale — last chicken standing takes the island.', cmds: ['!join', '!start'], cmdsuffix: true, demo: true, chroma: true, dark: true, avatar: true },
        { id: 'dopaminedrop', file: 'games/dopaminedrop.html', emoji: '🕳️', name: 'Dopamine Drop', blurb: 'Pachinko-style ball drop — chatters drop avatar balls down the peg board for multipliers.', cmds: ['!dd', '!drop'], cmdsuffix: true, demo: true, chroma: false, dark: false, avatar: true, transparent: true },
        { id: 'phraseguess', file: 'games/phraseguess.html', emoji: '💬', name: 'Phrase Guess', blurb: 'Chat races to guess the hidden phrase — every message is a guess.', cmds: [], cmdsuffix: false, demo: true, chroma: false, dark: false, avatar: false }
    ];

    var GAME_POINTS_KEY = '__points__'; // the pinned shelf row's selection key
    var GAME_SHELF_KEY = 'arcadeGameShelf';
    var GAME_CMDSUFFIX_KEY = 'arcadeGameCmdSuffix';
    var GAME_STYLE_KEY = 'arcadeGameStyle';
    var POINTS_UNLOCKS_KEY = 'arcadePointsUnlocks';

    var gamesPanelLive = false;
    var gamesShelf = [];        // ordered active game ids
    var gameCmdSuffix = {};     // id -> suffix (raw; sanitized at compose time)
    var gameStyleDoc = {};      // id -> { chroma:bool, transparent:bool, dark:bool, demo:bool }
    var pointsUnlocks = [];     // [{ threshold:number, name:string }]
    var pointsEarnState = { enabled: null, per: null, windowMin: null };
    var gamesSelectedKey = null;
    var gamesPreviewToken = 0;
    var gamesRemoveArmTimer = null;
    // The isolated preview room — a RANDOM throwaway label, never the real
    // session and never the games' hardcoded 'test' fallback (see the
    // PREVIEW ISOLATION GUARANTEE above).
    var gamesPreviewRoom = 'arcade-game-preview-' + Math.random().toString(36).slice(2, 8);

    function findGame(id) {
        for (var i = 0; i < GAMES.length; i++) { if (GAMES[i].id === id) return GAMES[i]; }
        return null;
    }

    // The same sanitize every cmdsuffix-capable game applies to the param
    // (lowercase, strip non [a-z0-9]) — applied at compose time so the URL
    // always matches what the game will actually answer to.
    function sanitizeGameCmdSuffix(raw) {
        return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function gameStyleFor(id) {
        var st = gameStyleDoc[id];
        return (st && typeof st === 'object') ? st : {};
    }

    function setGamesStatus(text, isError) {
        var el = document.getElementById('arcade-games-status');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-error', !!isError);
    }

    function setGamesPreviewHint(text) {
        var el = document.getElementById('arcade-games-preview-hint');
        if (el) el.textContent = text;
    }

    function buildGamesPanel() {
        var panel = document.createElement('section');
        panel.className = 'arcade-games';
        panel.setAttribute('aria-label', 'Games hub — shelf, demos, and the points loop');
        panel.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title">GAMES</span>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-alerts-status" id="arcade-games-status"></span>' +
            '<button type="button" class="arcade-btn arcade-btn--sm arcade-btn--primary" id="arcade-games-copy">Copy overlay URL</button>' +
            '</div>' +
            '<div class="arcade-alerts-body">' +
            '<div class="arcade-evt-list-col">' +
            '<div class="arcade-evt-list" id="arcade-games-list" role="listbox" aria-label="Active games"></div>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-games-add" ' +
            'aria-haspopup="dialog" aria-expanded="false" aria-controls="arcade-game-picker">+ Add game</button>' +
            '</div>' +
            '<div class="arcade-alerts-stage">' +
            '<div class="arcade-alerts-preview">' +
            '<div class="arcade-alerts-preview-bar">' +
            '<span class="arcade-style-hint" id="arcade-games-preview-hint">Add a game to preview it here — every preview is an isolated demo, never your live session.</span>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-games-reload">Reload preview</button>' +
            '</div>' +
            '<iframe id="arcade-games-preview-frame" title="Game preview — isolated demo"></iframe>' +
            '</div>' +
            '<div class="arcade-evt-config" id="arcade-games-config"></div>' +
            '</div>' +
            '</div>';
        document.body.appendChild(panel);

        panel.querySelector('#arcade-games-copy').addEventListener('click', function (e) {
            copyGamesOverlayUrl(e.currentTarget);
        });
        panel.querySelector('#arcade-games-reload').addEventListener('click', function () {
            initGamesPreviewFrame();
        });
        panel.querySelector('#arcade-games-add').addEventListener('click', openGamePicker);

        // H18-A (TASK-46/S49 ruled rider) — the shelf's role="listbox" is a
        // promise: ArrowUp/ArrowDown/Home/End move the selection (aria-
        // selected follows) instead of the role sitting half-kept. Rows are
        // real buttons, so Tab already reaches them; arrows are the listbox
        // contract on top. Selection re-renders the rows, so focus is re-
        // landed on the fresh element for the same key afterwards.
        var shelfList = panel.querySelector('#arcade-games-list');
        shelfList.addEventListener('keydown', function (e) {
            if (['ArrowUp', 'ArrowDown', 'Home', 'End'].indexOf(e.key) === -1) return;
            var rows = Array.prototype.slice.call(shelfList.querySelectorAll('[data-arcade-game-key]'));
            if (!rows.length) return;
            e.preventDefault();
            var idx = rows.findIndex(function (r) { return r.dataset.arcadeGameKey === gamesSelectedKey; });
            if (e.key === 'Home') idx = 0;
            else if (e.key === 'End') idx = rows.length - 1;
            else idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
            var key = rows[idx].dataset.arcadeGameKey;
            selectGamesKey(key);
            var fresh = shelfList.querySelector('[data-arcade-game-key="' + key + '"]');
            if (fresh) fresh.focus();
        });
    }

    // Lazy boot on first Games-tab visit — the S47 idiom: ONE getSettings
    // read hydrates shelf + cmd suffixes + per-game style + unlocks + the
    // earn card's real rates, then list + config + first preview. Re-entry
    // IS a surface render (S47B doctrine): re-read so edits made in Deck
    // Settings since the last visit show honestly.
    function ensureGamesPanelLive() {
        loadGamesSettings().then(function () {
            if (!gamesPanelLive) {
                gamesPanelLive = true;
                if (!gamesSelectedKey || (gamesSelectedKey !== GAME_POINTS_KEY && gamesShelf.indexOf(gamesSelectedKey) === -1)) {
                    gamesSelectedKey = gamesShelf.length ? gamesShelf[0] : GAME_POINTS_KEY;
                }
            }
            renderGamesList();
            renderGamesConfig();
            initGamesPreviewFrame();
        });
    }

    function loadGamesSettings() {
        return new Promise(function (resolve) {
            try {
                if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                    window.ninjafy.sendMessage(null, { getSettings: true }, function (response) {
                        try {
                            var settings = (response && response.settings) || {};
                            var shelfEntry = settings[GAME_SHELF_KEY];
                            var shelf = null;
                            try { shelf = JSON.parse((shelfEntry && typeof shelfEntry.textparam1 === 'string') ? shelfEntry.textparam1 : ''); } catch (e) { shelf = null; }
                            gamesShelf = Array.isArray(shelf) ? shelf.filter(function (id) { return !!findGame(id); }) : [];
                            var cmdEntry = settings[GAME_CMDSUFFIX_KEY];
                            var cmds = null;
                            try { cmds = JSON.parse((cmdEntry && typeof cmdEntry.textparam1 === 'string') ? cmdEntry.textparam1 : ''); } catch (e) { cmds = null; }
                            gameCmdSuffix = (cmds && typeof cmds === 'object' && !Array.isArray(cmds)) ? cmds : {};
                            var styleEntry = settings[GAME_STYLE_KEY];
                            var styles = null;
                            try { styles = JSON.parse((styleEntry && typeof styleEntry.textparam1 === 'string') ? styleEntry.textparam1 : ''); } catch (e) { styles = null; }
                            gameStyleDoc = (styles && typeof styles === 'object' && !Array.isArray(styles)) ? styles : {};
                            var unlocksEntry = settings[POINTS_UNLOCKS_KEY];
                            var unlocks = null;
                            try { unlocks = JSON.parse((unlocksEntry && typeof unlocksEntry.textparam1 === 'string') ? unlocksEntry.textparam1 : ''); } catch (e) { unlocks = null; }
                            pointsUnlocks = Array.isArray(unlocks) ? unlocks.filter(function (u) {
                                return u && typeof u === 'object' && isFinite(Number(u.threshold)) && typeof u.name === 'string';
                            }).map(function (u) { return { threshold: Math.max(1, Math.round(Number(u.threshold))), name: u.name }; }) : [];
                            var enabledEntry = settings.enablePointsSystem;
                            pointsEarnState.enabled = !!(enabledEntry && enabledEntry.setting);
                            var perEntry = settings.pointsPerEngagement;
                            var per = perEntry && Number(perEntry.numbersetting);
                            pointsEarnState.per = (isFinite(per) && per > 0) ? per : 1; // points.js:83 falls back to 1 the same way
                            var winEntry = settings.engagementWindow;
                            var winMin = winEntry && Number(winEntry.numbersetting);
                            pointsEarnState.windowMin = (isFinite(winMin) && winMin > 0) ? winMin : 15; // points.js:84 — 15min default
                        } catch (e) { console.error('[arcade-shell] games settings parse failed:', e); }
                        resolve();
                    });
                    return;
                }
            } catch (e) { console.error('[arcade-shell] games settings load failed:', e); }
            setGamesStatus('settings bridge unavailable — edits will not persist', true);
            resolve();
        });
    }

    // Every S48 write rides the canonical saveSetting IPC — but ASYNC, no
    // callback, deliberately. A callback makes the preload answer with
    // ipcRenderer.sendSync (preload.js:735), and main.js's relay branch
    // (main.js:9421 — mainFrame.frames goes transiently undefined while the
    // frame tree churns, e.g. the demo cabinet's 17 iframes) can then throw
    // before the sync reply is set, DEADLOCKING the renderer (found by the
    // S48 harness: even Runtime.evaluate queues forever). Async send rides
    // the same canonical IPC without ever blocking the shell on the relay.
    // One idempotent re-send at +600ms covers the flip side of the same
    // hazard: a relay that throws before reaching background.js loses that
    // write — the retry lands it once the frame tree settles (same value,
    // so a double-landing is a no-op).
    function saveGameSetting(key, json) {
        try {
            if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                var payload = { cmd: 'saveSetting', type: 'textparam1', target: null, setting: key, value: json };
                window.ninjafy.sendMessage(null, payload);
                setTimeout(function () {
                    try { window.ninjafy.sendMessage(null, payload); } catch (e) { /* noop */ }
                }, 600);
            }
        } catch (e) { console.error('[arcade-shell] game setting save failed:', e); }
    }

    function saveGameShelf() { saveGameSetting(GAME_SHELF_KEY, JSON.stringify(gamesShelf)); }
    function saveGameCmdSuffixes() { saveGameSetting(GAME_CMDSUFFIX_KEY, JSON.stringify(gameCmdSuffix)); }
    function saveGameStyles() { saveGameSetting(GAME_STYLE_KEY, JSON.stringify(gameStyleDoc)); }
    function savePointsUnlocks() { saveGameSetting(POINTS_UNLOCKS_KEY, JSON.stringify(pointsUnlocks)); }

    // --------------------------------------------------------------------
    // S48 — LEFT: the shelf (active games) + the pinned Points & unlocks row
    // --------------------------------------------------------------------
    function renderGamesList() {
        var list = document.getElementById('arcade-games-list');
        if (!list) return;
        list.innerHTML = '';
        if (!gamesShelf.length) {
            var empty = document.createElement('div');
            empty.className = 'arcade-src-empty arcade-fx-grid';
            empty.textContent = 'No games on the shelf yet — “+ Add game” opens the demo cabinet.';
            list.appendChild(empty);
        }
        gamesShelf.forEach(function (id) {
            var game = findGame(id);
            if (!game) return; // unknown ids were filtered at load; belt-and-braces
            list.appendChild(buildGameListRow({
                key: game.id,
                icon: game.emoji,
                label: game.name,
                stateText: 'active',
                stateOn: true
            }));
        });
        var divider = document.createElement('div');
        divider.className = 'arcade-game-list__divider';
        list.appendChild(divider);
        list.appendChild(buildGameListRow({
            key: GAME_POINTS_KEY,
            icon: '🏆',
            label: 'Points & unlocks',
            stateText: pointsEarnState.enabled ? 'on' : 'off',
            stateOn: pointsEarnState.enabled === true,
            stateTitle: pointsEarnState.enabled === true
                ? 'The stock points system is on'
                : 'The stock points system is off — the earn card on the right has the door'
        }));
    }

    function buildGameListRow(opts) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'arcade-evt-item';
        row.dataset.arcadeGameKey = opts.key;
        row.setAttribute('role', 'option');
        var selected = gamesSelectedKey === opts.key;
        row.classList.toggle('is-on', selected);
        row.setAttribute('aria-selected', String(selected));
        var label = document.createElement('span');
        label.className = 'arcade-evt-item__label';
        label.textContent = (opts.icon ? opts.icon + ' ' : '') + opts.label;
        row.appendChild(label);
        if (opts.stateText) {
            var state = document.createElement('span');
            state.className = 'arcade-evt-state ' + (opts.stateOn ? 'arcade-evt-state--on' : 'arcade-evt-state--off');
            state.textContent = opts.stateText;
            if (opts.stateTitle) state.title = opts.stateTitle;
            row.appendChild(state);
        }
        row.addEventListener('click', function () {
            selectGamesKey(opts.key);
        });
        return row;
    }

    function selectGamesKey(key) {
        if (gamesSelectedKey === key) return;
        gamesSelectedKey = key;
        renderGamesList();
        renderGamesConfig();
        initGamesPreviewFrame();
    }

    // --------------------------------------------------------------------
    // S48 — RIGHT: config for the selected game (or the points page)
    // --------------------------------------------------------------------
    function renderGamesConfig() {
        var config = document.getElementById('arcade-games-config');
        if (!config) return;
        config.innerHTML = '';
        var copyBtn = document.getElementById('arcade-games-copy');
        if (gamesSelectedKey === GAME_POINTS_KEY) {
            // TASK-68 — the head copy door NAMES what it copies (the Admiral's
            // "weird link" was an unlabelled copy of whatever was selected).
            if (copyBtn) copyBtn.textContent = 'Copy URL — Leaderboard';
            renderPointsConfig(config);
            return;
        }
        var game = findGame(gamesSelectedKey);
        if (copyBtn) copyBtn.textContent = game ? ('Copy URL — ' + game.name) : 'Copy overlay URL';
        if (!game) {
            var empty = document.createElement('p');
            empty.className = 'arcade-evt-blurb';
            empty.textContent = 'Select a game on the left, or “+ Add game” to pull one out of the demo cabinet.';
            config.appendChild(empty);
            return;
        }

        var head = document.createElement('div');
        head.className = 'arcade-evt-config__head';
        var name = document.createElement('span');
        name.className = 'arcade-evt-config__name';
        name.textContent = game.emoji + ' ' + game.name;
        head.appendChild(name);
        config.appendChild(head);

        var blurb = document.createElement('p');
        blurb.className = 'arcade-evt-blurb';
        blurb.textContent = game.blurb;
        config.appendChild(blurb);

        // Start command — the &cmdsuffix pattern generalized. Command games
        // get the editable suffix; the 11 command-less games say so plainly.
        var cmdRow = document.createElement('div');
        cmdRow.className = 'arcade-game-cmd';
        var cmdTitle = document.createElement('div');
        cmdTitle.className = 'arcade-evt-cond__title';
        cmdTitle.textContent = 'Start command';
        cmdRow.appendChild(cmdTitle);
        if (game.cmds.length) {
            var chips = document.createElement('div');
            chips.className = 'arcade-game-cmdchips';
            var suffixNow = sanitizeGameCmdSuffix(gameCmdSuffix[game.id] || '');
            game.cmds.forEach(function (cmd) {
                var chip = document.createElement('span');
                chip.className = 'arcade-game-cmdchip';
                chip.textContent = cmd + suffixNow;
                chips.appendChild(chip);
            });
            cmdRow.appendChild(chips);
            if (game.cmdsuffix) {
                var sfxRow = document.createElement('div');
                sfxRow.className = 'arcade-alert-row';
                var sfxLabel = document.createElement('label');
                sfxLabel.textContent = 'Command suffix';
                sfxRow.appendChild(sfxLabel);
                var sfxInput = document.createElement('input');
                sfxInput.type = 'text';
                sfxInput.autocomplete = 'off';
                sfxInput.placeholder = 'e.g. ' + game.id.slice(0, 2);
                sfxInput.value = suffixNow;
                sfxInput.title = 'Rides the stock &cmdsuffix= param — letters/numbers only, exactly what the game sanitizes';
                sfxInput.addEventListener('input', debounce(function () {
                    var clean = sanitizeGameCmdSuffix(sfxInput.value);
                    if (clean) gameCmdSuffix[game.id] = clean; else delete gameCmdSuffix[game.id];
                    saveGameCmdSuffixes();
                    sfxInput.value = clean;
                    // Update the chips in place (no config re-render — the
                    // input keeps focus while the streamer types); the
                    // preview follows on the usual debounce.
                    var chipEls = chips.querySelectorAll('.arcade-game-cmdchip');
                    game.cmds.forEach(function (cmd, i) {
                        if (chipEls[i]) chipEls[i].textContent = cmd + clean;
                    });
                    queueGamesPreviewReload();
                }, 300));
                sfxRow.appendChild(sfxInput);
                cmdRow.appendChild(sfxRow);
                var sfxHint = document.createElement('div');
                sfxHint.className = 'arcade-evt-cond__hint';
                sfxHint.textContent = 'A suffix makes the commands unique when several games share one session — the stock &cmdsuffix= param, stored per game.';
                cmdRow.appendChild(sfxHint);
            }
        } else {
            var noCmd = document.createElement('div');
            noCmd.className = 'arcade-evt-cond__hint';
            noCmd.textContent = 'No command — every chat message plays.';
            cmdRow.appendChild(noCmd);
        }
        config.appendChild(cmdRow);

        if (game.avatar) {
            var avatarLine = document.createElement('div');
            avatarLine.className = 'arcade-evt-cond__hint';
            avatarLine.textContent = 'Player avatars: pulls the chatter’s profile picture automatically (the page’s own chatimg path).';
            config.appendChild(avatarLine);
        }

        var doors = document.createElement('div');
        doors.className = 'arcade-evt-doors';
        // TASK-68 — the per-game copy door INSIDE the config: unambiguous
        // about what it copies (the head button follows the selection).
        var cfgCopyBtn = document.createElement('button');
        cfgCopyBtn.type = 'button';
        cfgCopyBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        cfgCopyBtn.textContent = 'Copy overlay URL';
        cfgCopyBtn.title = 'The live overlay URL for ' + game.name + ' — real session, your style flags, never the demo';
        cfgCopyBtn.addEventListener('click', function () { copyGamesOverlayUrl(cfgCopyBtn); });
        doors.appendChild(cfgCopyBtn);
        var styleBtn = document.createElement('button');
        styleBtn.type = 'button';
        styleBtn.className = 'arcade-btn arcade-btn--sm';
        styleBtn.textContent = 'Customize style';
        doors.appendChild(styleBtn);
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'arcade-btn arcade-btn--sm arcade-evt-remove';
        removeBtn.textContent = 'Remove from shelf';
        doors.appendChild(removeBtn);
        config.appendChild(doors);

        var styleSection = document.createElement('div');
        styleSection.className = 'arcade-evt-style';
        styleSection.hidden = true;
        styleBtn.addEventListener('click', function () {
            styleSection.hidden = !styleSection.hidden;
            styleBtn.textContent = styleSection.hidden ? 'Customize style' : 'Hide style';
        });
        buildGameStyleSection(game, styleSection);
        config.appendChild(styleSection);

        // Remove-from-shelf — confirm-on-second-click (the S47 idiom); the
        // game's stored options stay saved, so re-adding restores them.
        removeBtn.addEventListener('click', function () {
            if (removeBtn.dataset.armed === '1') {
                clearTimeout(gamesRemoveArmTimer);
                gamesShelf = gamesShelf.filter(function (id) { return id !== game.id; });
                saveGameShelf();
                setGamesStatus('"' + game.name + '" left the shelf — its settings stay saved');
                gamesSelectedKey = gamesShelf.length ? gamesShelf[0] : GAME_POINTS_KEY;
                renderGamesList();
                renderGamesConfig();
                initGamesPreviewFrame();
                return;
            }
            removeBtn.dataset.armed = '1';
            removeBtn.textContent = 'Remove "' + game.name + '"? Click again';
            clearTimeout(gamesRemoveArmTimer);
            gamesRemoveArmTimer = setTimeout(function () {
                removeBtn.dataset.armed = '';
                removeBtn.textContent = 'Remove from shelf';
            }, 2500);
        });

        var pointsNote = document.createElement('div');
        pointsNote.className = 'arcade-evt-cond__hint';
        pointsNote.textContent = 'Playing is chatting — chatters earn loyalty points at the standard rate while the points system is on (see 🏆 Points & unlocks on the left).';
        config.appendChild(pointsNote);
    }

    function buildGameStyleSection(game, section) {
        // Transparency — the stock chroma toggle re-homed, the TASK-63 real-
        // alpha &transparent toggle where the page reads it, or the honest
        // state when the page has no support.
        if (game.chroma) {
            section.appendChild(buildGameToggleRow(game, 'chroma', 'Green-screen background (&chroma)', 'Key it out in OBS — the game paints a #00ff00 ground.'));
        }
        if (game.transparent) {
            section.appendChild(buildGameToggleRow(game, 'transparent', 'Transparent overlay mode (&transparent)', 'Real alpha — the backdrop goes clear; in Treasure Hunt every dug hole shows the stream through it.'));
        }
        if (!game.chroma && !game.transparent) {
            if (game.transparentByDesign) {
                var native = document.createElement('div');
                native.className = 'arcade-evt-cond__hint';
                native.textContent = 'Transparent by design — a lower-third overlay; nothing to set.';
                section.appendChild(native);
            } else {
                var noTrans = document.createElement('div');
                noTrans.className = 'arcade-evt-cond__hint';
                noTrans.textContent = 'Transparency: not supported — this game reads no chroma/transparent param.';
                section.appendChild(noTrans);
            }
        }
        if (game.dark) {
            section.appendChild(buildGameToggleRow(game, 'dark', 'Dark mode (&darkmode)', 'The game’s own night palette.'));
        }
        // Demo mode — the census's 17 popup demo toggles re-homed HERE, and
        // here they drive the PREVIEW only; the copy-URL never carries &demo.
        if (game.demo) {
            section.appendChild(buildGameToggleRow(game, 'demo', 'Demo mode (preview only)', 'Auto-players in the preview above — never copied into the live overlay URL.'));
        } else {
            var attract = document.createElement('div');
            attract.className = 'arcade-evt-cond__hint';
            attract.textContent = 'Attract mode is built in — the preview always demos with computer players.';
            section.appendChild(attract);
        }
        // The style commons' font knobs, measured honestly: NO stock game
        // reads font-size/font-family params or &css — nothing to wire.
        var fontNote = document.createElement('div');
        fontNote.className = 'arcade-evt-cond__hint';
        fontNote.textContent = 'Font size / font family: not supported — no stock game reads font params (measured across all 20).';
        section.appendChild(fontNote);
    }

    // --------------------------------------------------------------------
    // TASK-68 (WALK 2A item 8) — .arcade-toggle, the ONE shared switch for
    // every enable-class checkbox on NATIVE arcade surfaces. Real toggle
    // look (track + thumb, clear on/off color states — the CSS lives in
    // arcade-shell.css, body.arcade-shell-scoped), label + control ADJACENT
    // (the old label-left / checkbox-far-right grid gap is gone), label
    // text never wraps under the control. The input stays a real checkbox
    // inside the label — keyboard (Tab/Space) and screen-reader semantics
    // are the native ones; aria-label/labelledby carry over per call site.
    // Embedded STOCK checkboxes (inside dressed stock frames) stay stock —
    // dress only — per the ruling.
    // --------------------------------------------------------------------
    function buildArcadeToggle(opts) {
        // opts: { id, label, checked, hint, ariaLabel, bare, onChange(checked) }
        // bare: no text span — the surrounding row already carries the label
        // (the Style builder's control rows); label + control adjacency is
        // then the row's own grid, the switch is the control.
        var wrap = document.createElement('label');
        wrap.className = 'arcade-toggle' + (opts.bare ? ' arcade-toggle--bare' : '');
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'arcade-toggle__input';
        if (opts.id) input.id = opts.id;
        input.checked = !!opts.checked;
        if (opts.ariaLabel) input.setAttribute('aria-label', opts.ariaLabel);
        var track = document.createElement('span');
        track.className = 'arcade-toggle__track';
        track.setAttribute('aria-hidden', 'true');
        var thumb = document.createElement('span');
        thumb.className = 'arcade-toggle__thumb';
        track.appendChild(thumb);
        wrap.appendChild(input);
        wrap.appendChild(track);
        if (!opts.bare) {
            var text = document.createElement('span');
            text.className = 'arcade-toggle__label';
            text.textContent = opts.label;
            wrap.appendChild(text);
        }
        if (opts.hint) { wrap.title = opts.hint; }
        if (typeof opts.onChange === 'function') {
            input.addEventListener('change', function () { opts.onChange(!!input.checked); });
        }
        return wrap;
    }

    function buildGameToggleRow(game, field, label, hint) {
        return buildArcadeToggle({
            id: 'arcade-game-' + field + '-' + game.id,
            label: label,
            hint: hint,
            checked: !!gameStyleFor(game.id)[field],
            onChange: function (checked) {
                var st = gameStyleDoc[game.id] && typeof gameStyleDoc[game.id] === 'object' ? gameStyleDoc[game.id] : {};
                st[field] = checked;
                gameStyleDoc[game.id] = st;
                saveGameStyles();
                queueGamesPreviewReload(); // the preview wears the configured look
            }
        });
    }

    // --------------------------------------------------------------------
    // S48 — the preview (always an isolated demo) + the copy URL (always the
    // real session, never a demo). See the PREVIEW ISOLATION GUARANTEE.
    // --------------------------------------------------------------------
    function buildGamePreviewParams(game) {
        var params = ['session=' + encodeURIComponent(gamesPreviewRoom)];
        var st = gameStyleFor(game.id);
        if (game.demo && st.demo) params.push('demo');
        if (game.chroma && st.chroma) params.push('chroma');
        if (game.transparent && st.transparent) params.push('transparent');
        if (game.dark && st.dark) params.push('darkmode');
        var suffix = sanitizeGameCmdSuffix(gameCmdSuffix[game.id] || '');
        if (game.cmdsuffix && suffix) params.push('cmdsuffix=' + encodeURIComponent(suffix));
        if (game.sound) params.push('nosound'); // TASK-66 — previews are silent too (quiet-cabinet law, same class)
        return params;
    }

    function initGamesPreviewFrame() {
        var frame = document.getElementById('arcade-games-preview-frame');
        if (!frame || !gamesPanelLive) return;
        frame.setAttribute('allow', "autoplay 'none'"); // TASK-66 — preview demos are silent (master-mute floor)
        var resolver = window.resolveSocialStreamPage;
        if (typeof resolver !== 'function') {
            setGamesPreviewHint('preview unavailable (app helpers not found)');
            return;
        }
        var myToken = ++gamesPreviewToken;
        frame.dataset.arcadeGamePreviewReady = '';
        if (gamesSelectedKey === GAME_POINTS_KEY) {
            // Leaderboard door — stock leaderboard.html; &demo stays
            // preview-only (ruled), the room is the throwaway preview room.
            setGamesPreviewHint('Loading leaderboard demo…');
            resolver('leaderboard.html', { extraParams: ['session=' + encodeURIComponent(gamesPreviewRoom), 'demo'] }).then(function (resolved) {
                if (myToken !== gamesPreviewToken) return;
                if (resolved && resolved.url) {
                    frame.onload = function () {
                        if (myToken !== gamesPreviewToken) return;
                        frame.dataset.arcadeGamePreviewReady = '1';
                        // Stock only seeds its demo users in the topbar
                        // ticker layout (leaderboard.html:2488), so the
                        // default-layout demo honestly renders empty — an
                        // isolated room has no board to show.
                        setGamesPreviewHint('Leaderboard preview — honestly empty in an isolated room; Copy leaderboard URL takes the live overlay (no demo).');
                    };
                    frame.src = resolved.url;
                }
            }).catch(function (e) {
                console.error('[arcade-shell] leaderboard preview init failed:', e);
                setGamesPreviewHint('preview failed — see console');
            });
            return;
        }
        var game = findGame(gamesSelectedKey);
        if (!game) {
            frame.removeAttribute('src');
            setGamesPreviewHint('Add a game to preview it here — every preview is an isolated demo, never your live session.');
            return;
        }
        setGamesPreviewHint('Loading demo…');
        resolver(game.file, { extraParams: buildGamePreviewParams(game) }).then(function (resolved) {
            if (myToken !== gamesPreviewToken) return;
            if (resolved && resolved.url) {
                frame.onload = function () {
                    if (myToken !== gamesPreviewToken) return;
                    frame.dataset.arcadeGamePreviewReady = '1';
                    setGamesPreviewHint('Preview ready — isolated demo, never your live session.');
                };
                frame.src = resolved.url;
            }
        }).catch(function (e) {
            console.error('[arcade-shell] game preview init failed:', e);
            setGamesPreviewHint('preview failed — see console');
        });
    }

    var gamesReloadTimer = null;
    function queueGamesPreviewReload() {
        if (!gamesPanelLive) return;
        clearTimeout(gamesReloadTimer);
        gamesReloadTimer = setTimeout(initGamesPreviewFrame, 400);
    }

    function buildGamesOverlayUrl() {
        var resolver = window.resolveSocialStreamPage;
        if (typeof resolver !== 'function') {
            return Promise.reject(new Error('overlay resolver unavailable'));
        }
        var langParams = (typeof window.getLanguageExtraParams === 'function') ? window.getLanguageExtraParams() : [];
        var isPoints = gamesSelectedKey === GAME_POINTS_KEY;
        var game = isPoints ? null : findGame(gamesSelectedKey);
        if (!isPoints && !game) return Promise.reject(new Error('no game selected'));

        function withSession(sessionId) {
            var params = [];
            if (sessionId) params.push('session=' + encodeURIComponent(sessionId));
            if (game) {
                // The real overlay URL: stored options only — NEVER &demo and
                // never the preview room (the ruled mirror of the preview).
                var st = gameStyleFor(game.id);
                if (game.chroma && st.chroma) params.push('chroma');
                if (game.transparent && st.transparent) params.push('transparent');
                if (game.dark && st.dark) params.push('darkmode');
                var suffix = sanitizeGameCmdSuffix(gameCmdSuffix[game.id] || '');
                if (game.cmdsuffix && suffix) params.push('cmdsuffix=' + encodeURIComponent(suffix));
            }
            params = params.concat(langParams);
            return resolver(isPoints ? 'leaderboard.html' : game.file, { extraParams: params }).then(function (resolved) {
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

    function copyGamesOverlayUrl(btn) {
        if (gamesSelectedKey !== GAME_POINTS_KEY && !findGame(gamesSelectedKey)) {
            setGamesStatus('select a game first', true);
            return;
        }
        buildGamesOverlayUrl().then(function (url) {
            if (!url) throw new Error('empty overlay url');
            return copyToClipboard(url).then(function () {
                flashButton(btn, 'Copied ✓');
                // TASK-68 — the copy SAYS what rode (the Admiral's copy
                // "lost &transparent" with no hint of what was in it). The
                // session id itself is never echoed — names and flags only.
                var game = gamesSelectedKey === GAME_POINTS_KEY ? null : findGame(gamesSelectedKey);
                var rode = [];
                if (game) {
                    var st = gameStyleFor(game.id);
                    if (game.chroma && st.chroma) rode.push('chroma');
                    if (game.transparent && st.transparent) rode.push('transparent');
                    if (game.dark && st.dark) rode.push('darkmode');
                    var suffix = sanitizeGameCmdSuffix(gameCmdSuffix[game.id] || '');
                    if (game.cmdsuffix && suffix) rode.push('cmdsuffix=' + suffix);
                }
                setGamesStatus('Copied — ' + (game ? game.name + ' overlay' : 'leaderboard') + ' URL: real session' + (rode.length ? ' + ' + rode.join(' + ') : '') + ', never the demo room.');
            });
        }).catch(function (e) {
            console.error('[arcade-shell] copy games overlay url failed:', e);
            flashButton(btn, 'Copy failed', 2200);
        });
    }

    // --------------------------------------------------------------------
    // S48 — the demo cabinet (picker pop-window). One card per game NOT on
    // the shelf, each running the game's OWN demo in a small frame (attract
    // mode) off the same throwaway preview room — never a live session.
    // Frames load lazily as they scroll into view (seventeen live canvases
    // at once would jank the shell for no reason).
    //
    // H18-A (TASK-46/S49 ruled rider) — the cabinet gets the full house
    // disclosure contract: focus moves INTO the dialog on open, Escape
    // closes, focus returns to the "+ Add game" trigger on close-without-
    // pick, the trigger carries aria-haspopup/aria-expanded/aria-controls,
    // and click-outside still closes (that part S48 already had). A pick
    // (Add to shelf) lands focus on the new shelf row — the destination.
    // --------------------------------------------------------------------
    var gamePickerKeydown = null; // document Escape listener while the cabinet is open
    var cabSoundOn = false;       // TASK-66 — cabinet sound is OFF by default; the toggle is per-cabinet, never persisted

    // The quiet-cabinet law (TASK-66): demo frames are SILENT by default.
    // Two layers: a cabinet-level master mute (Permissions-Policy autoplay
    // 'none' — the floor, catches anything that would autoplay audio) and a
    // per-game param where the game really supports one (rhythmpulse reads
    // &nosound — it's the one game with Web Audio, grep-verified).
    function cabFrameAllow() {
        return cabSoundOn ? 'autoplay *' : "autoplay 'none'";
    }

    function cabDemoParams(game) {
        var params = ['session=' + encodeURIComponent(gamesPreviewRoom)];
        if (game.demo) params.push('demo'); // the cabinet always demos
        if (game.sound && !cabSoundOn) params.push('nosound');
        return params;
    }

    function openGamePicker() {
        closeGamePicker(false);
        var trigger = document.getElementById('arcade-games-add');
        var back = document.createElement('div');
        back.className = 'arcade-evt-modal-back';
        back.id = 'arcade-game-picker';
        var modal = document.createElement('div');
        modal.className = 'arcade-evt-modal arcade-game-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-label', 'Add a game — the demo cabinet');
        var title = document.createElement('h3');
        title.className = 'arcade-evt-modal__title';
        title.tabIndex = -1; // heading fallback for focus-into-dialog
        title.textContent = 'Add a game — the demo cabinet';
        modal.appendChild(title);
        var blurb = document.createElement('p');
        blurb.className = 'arcade-evt-modal__blurb';
        blurb.textContent = 'Every cabinet runs the game’s own isolated demo — never your live session. Demos are silent by default.';
        modal.appendChild(blurb);
        var soundBtn = document.createElement('button');
        soundBtn.type = 'button';
        soundBtn.className = 'arcade-btn arcade-btn--sm arcade-game-cab__sound';
        soundBtn.setAttribute('aria-pressed', 'false');
        soundBtn.textContent = '🔇 Cabinet sound: off';
        soundBtn.title = 'Default silent — unmute the demos on this cabinet only (never saved)';
        soundBtn.addEventListener('click', function () {
            cabSoundOn = !cabSoundOn;
            soundBtn.setAttribute('aria-pressed', String(cabSoundOn));
            soundBtn.textContent = cabSoundOn ? '🔊 Cabinet sound: on' : '🔇 Cabinet sound: off';
            // The allow attribute only applies at navigation — re-src every
            // loaded demo so the flip takes effect honestly.
            pendingFrames.forEach(function (entry) {
                entry.frame.setAttribute('allow', cabFrameAllow());
                if (entry.loaded) {
                    entry.loaded = false;
                    var params = cabDemoParams(entry.game);
                    resolver(entry.game.file, { extraParams: params }).then(function (resolved) {
                        if (!resolved || !resolved.url) return;
                        entry.url = resolved.url;
                        loadCabFrame(entry);
                    });
                }
            });
        });
        modal.appendChild(soundBtn);
        var grid = document.createElement('div');
        grid.className = 'arcade-game-cabinet';
        modal.appendChild(grid);
        var inactive = GAMES.filter(function (g) { return gamesShelf.indexOf(g.id) === -1; });
        if (!inactive.length) {
            var none = document.createElement('p');
            none.className = 'arcade-evt-modal__blurb';
            none.textContent = 'Every game is already on the shelf.';
            grid.appendChild(none);
        }
        var pendingFrames = [];
        inactive.forEach(function (game) {
            var card = document.createElement('div');
            card.className = 'arcade-game-cab';
            var name = document.createElement('div');
            name.className = 'arcade-game-cab__name';
            name.textContent = game.emoji + ' ' + game.name;
            card.appendChild(name);
            var frame = document.createElement('iframe');
            frame.className = 'arcade-game-cab__demo';
            frame.title = game.name + ' — demo';
            frame.setAttribute('loading', 'lazy');
            frame.setAttribute('allow', cabFrameAllow()); // quiet-cabinet master mute
            card.appendChild(frame);
            pendingFrames.push({ frame: frame, game: game });
            var cabBlurb = document.createElement('div');
            cabBlurb.className = 'arcade-game-cab__blurb';
            cabBlurb.textContent = game.blurb;
            card.appendChild(cabBlurb);
            var add = document.createElement('button');
            add.type = 'button';
            add.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
            add.textContent = 'Add to shelf';
            add.addEventListener('click', function () {
                gamesShelf.push(game.id);
                saveGameShelf();
                closeGamePicker(false); // a pick — focus goes to the destination, not the trigger
                setGamesStatus('"' + game.name + '" landed on the shelf');
                selectGamesKey(game.id);
                if (gamesSelectedKey !== game.id) { // first selection — selectGamesKey no-ops when equal
                    renderGamesList();
                    renderGamesConfig();
                    initGamesPreviewFrame();
                }
                // H17-B analog — after the pick, focus lands on the new row.
                var rowEl = document.querySelector('#arcade-games-list [data-arcade-game-key="' + game.id + '"]');
                if (rowEl) rowEl.focus();
            });
            card.appendChild(add);
            grid.appendChild(card);
        });
        back.appendChild(modal);
        back.addEventListener('click', function (e) { if (e.target === back) closeGamePicker(true); });
        document.body.appendChild(back);
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
        gamePickerKeydown = function (e) {
            if (e.key === 'Escape' && document.getElementById('arcade-game-picker')) {
                e.stopPropagation();
                closeGamePicker(true);
            }
        };
        document.addEventListener('keydown', gamePickerKeydown);
        // Focus lands IN the dialog on open — first card action, else the title.
        var firstAction = modal.querySelector('.arcade-game-cab .arcade-btn');
        (firstAction || title).focus();

        // Lazy demo loading: resolve each card's demo URL up front (cheap —
        // it's just URL composition), but only hand a frame its src once the
        // card is near the viewport.
        var resolver = window.resolveSocialStreamPage;
        if (typeof resolver !== 'function') return;
        pendingFrames.forEach(function (entry) {
            var params = cabDemoParams(entry.game);
            resolver(entry.game.file, { extraParams: params }).then(function (resolved) {
                if (!resolved || !resolved.url) return;
                entry.url = resolved.url;
                if (entry.visible) loadCabFrame(entry);
            });
        });
        if (typeof IntersectionObserver === 'function') {
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (en) {
                    if (!en.isIntersecting) return;
                    var entry = en.target.__cabEntry;
                    if (entry) {
                        entry.visible = true;
                        loadCabFrame(entry);
                        observer.unobserve(en.target);
                    }
                });
            }, { root: grid, rootMargin: '200px' });
            pendingFrames.forEach(function (entry) {
                entry.frame.__cabEntry = entry;
                observer.observe(entry.frame);
            });
        } else {
            pendingFrames.forEach(function (entry) { entry.visible = true; loadCabFrame(entry); });
        }
    }

    function loadCabFrame(entry) {
        if (!entry || !entry.visible || !entry.url || entry.loaded) return;
        if (!document.getElementById('arcade-game-picker')) return; // modal closed meanwhile
        entry.loaded = true;
        entry.frame.src = entry.url;
    }

    function closeGamePicker(returnFocus) {
        var back = document.getElementById('arcade-game-picker');
        if (back) back.remove(); // the demo iframes die with the modal
        if (gamePickerKeydown) {
            document.removeEventListener('keydown', gamePickerKeydown);
            gamePickerKeydown = null;
        }
        var trigger = document.getElementById('arcade-games-add');
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
            if (returnFocus) trigger.focus(); // close-without-pick returns to the trigger
        }
    }

    // --------------------------------------------------------------------
    // S48 — LANE 2: the points page (earn card + unlocks table + the
    // leaderboard door — its preview/copy ride the shared frame/URL code).
    // --------------------------------------------------------------------
    function renderPointsConfig(config) {
        // S51 — the Games hub "Points & unlocks" row is now a CROSS-LINK,
        // not a duplicate config (Rider 3: Deck Settings → Points system is
        // THE one home for points/engagement configuration; this row keeps
        // pointing at the same destination). The earn state line stays live
        // so the shelf row's on/off chip is explained right here.
        var head = document.createElement('div');
        head.className = 'arcade-evt-config__head';
        var name = document.createElement('span');
        name.className = 'arcade-evt-config__name';
        name.textContent = '🏆 Points & unlocks';
        head.appendChild(name);
        config.appendChild(head);

        var earnLine = document.createElement('p');
        earnLine.className = 'arcade-evt-blurb';
        earnLine.textContent = pointsEarnState.enabled === true
            ? 'Points are ON — chatters earn ' + pointsEarnState.per + ' point' + (pointsEarnState.per === 1 ? '' : 's') +
              ' per ' + pointsEarnState.windowMin + '-minute engagement window (base rate, stock rules).'
            : 'The points system is OFF — no points accrue until it’s on.';
        config.appendChild(earnLine);

        var homeLine = document.createElement('p');
        homeLine.className = 'arcade-evt-blurb';
        homeLine.textContent = 'Earn rates, the unlocks table, alert priority tiers, points backup, and the ' +
            'Botrix / StreamElements import lanes all live in one place now — Deck Settings → Points system.';
        config.appendChild(homeLine);

        var doors = document.createElement('div');
        doors.className = 'arcade-evt-doors';
        var deckBtn = document.createElement('button');
        deckBtn.type = 'button';
        deckBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        deckBtn.textContent = 'Open Points system';
        deckBtn.addEventListener('click', function () {
            navigateArcadeTab('settings');
            if (typeof window.arcadeDeckSelect === 'function') window.arcadeDeckSelect('points');
        });
        doors.appendChild(deckBtn);
        config.appendChild(doors);

        var lbNote = document.createElement('div');
        lbNote.className = 'arcade-evt-cond__hint';
        lbNote.textContent = 'The leaderboard overlay (stock leaderboard.html) demos above; “Copy leaderboard URL” takes the live overlay into OBS.';
        config.appendChild(lbNote);
    }

    // S51 — the unlocks row builder moved to Deck Settings → Points system
    // (THE one home, Rider 3); the Games hub keeps only a cross-link. The
    // builder now takes the list it edits + a re-render callback so both
    // homes (only the deck section renders it today) share the one idiom.
    function buildUnlockRow(unlock, idx, list, onChanged) {
        var row = document.createElement('div');
        row.className = 'arcade-game-unlock';
        var thresholdInput = document.createElement('input');
        thresholdInput.type = 'number';
        thresholdInput.min = '1';
        thresholdInput.step = '1';
        thresholdInput.value = String(unlock.threshold);
        thresholdInput.title = 'Points threshold';
        thresholdInput.setAttribute('aria-label', 'Unlock points threshold');
        thresholdInput.addEventListener('change', function () {
            var v = Math.max(1, Math.round(Number(thresholdInput.value) || 0));
            thresholdInput.value = String(v);
            list[idx].threshold = v;
            savePointsUnlocks();
        });
        row.appendChild(thresholdInput);
        var arrow = document.createElement('span');
        arrow.className = 'arcade-game-unlock__arrow';
        arrow.textContent = '→';
        row.appendChild(arrow);
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.autocomplete = 'off';
        nameInput.placeholder = 'effect name — e.g. Emote storm';
        nameInput.setAttribute('aria-label', 'Unlock effect name');
        nameInput.value = unlock.name;
        nameInput.addEventListener('input', debounce(function () {
            list[idx].name = nameInput.value;
            savePointsUnlocks();
        }, 300));
        row.appendChild(nameInput);
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'arcade-btn arcade-btn--sm';
        remove.textContent = '×';
        remove.title = 'Remove this unlock';
        remove.setAttribute('aria-label', 'Remove this unlock');
        remove.addEventListener('click', function () {
            list.splice(idx, 1);
            savePointsUnlocks();
            if (typeof onChanged === 'function') onChanged();
        });
        row.appendChild(remove);
        return row;
    }

    // --------------------------------------------------------------------
    // S48 — LANE 2 on Main: the POINTS pulse tile + top-earners rows on the
    // analytics rail. Real IndexedDB reads off the analytics bridge (the
    // background page's window.pointsSystem global — the same pure-read
    // pattern getLastMessagesDB/buildViewerCountsFromMetaStore already use).
    // "Today" = entries in each record's engagementHistory since local
    // midnight (one entry per awarded window) × the live pointsPerEngagement
    // — BASE rate only; streak bonuses aren't attributable per day and the
    // sub says so. Dash laws apply: system off or nobody earned yet = dash.
    // --------------------------------------------------------------------
    var pointsPulseToken = 0;

    function readPointsEarnersToday(sys) {
        var startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        var startMs = startOfToday.getTime();
        return Promise.resolve(sys.ensureDB()).then(function (db) {
            return new Promise(function (resolve) {
                var out = [];
                try {
                    var tx = db.transaction(sys.storeName, 'readonly');
                    tx.objectStore(sys.storeName).openCursor().onsuccess = function (e) {
                        var cursor = e.target.result;
                        if (cursor) {
                            var u = cursor.value || {};
                            var hist = Array.isArray(u.engagementHistory) ? u.engagementHistory : [];
                            var windows = 0;
                            for (var i = 0; i < hist.length; i++) { if (hist[i] >= startMs) windows++; }
                            if (windows > 0 && u.username) {
                                out.push({
                                    username: String(u.username),
                                    type: String(u.type || ''),
                                    today: windows * (sys.pointsPerEngagement || 1),
                                    total: (Number(u.points) || 0) - (Number(u.pointsSpent) || 0)
                                });
                            }
                            cursor.continue();
                        } else {
                            resolve(out);
                        }
                    };
                    tx.onerror = function () { resolve(out); };
                } catch (e) { resolve(out); }
            });
        });
    }

    function renderPointsPulse() {
        var valEl = document.getElementById('arcade-stat-points-value');
        var subEl = document.getElementById('arcade-stat-points-sub');
        var rowsEl = document.getElementById('arcade-points-rows');
        if (!valEl || !subEl || !rowsEl) return;
        var my = ++pointsPulseToken;
        var bg = getBackgroundWindow();
        var sys = bg && bg.pointsSystem;
        if (!sys || typeof sys.ensureDB !== 'function') return; // bridge not up yet — honest "connecting…" dash
        var enabled = null;
        try { enabled = (typeof bg.getSettingFlag === 'function') ? !!bg.getSettingFlag('enablePointsSystem') : null; } catch (e) { enabled = null; }
        if (enabled === false) {
            arcadeFxSetNumber(valEl, null); // dash stays dash
            valEl.classList.add('is-dash');
            subEl.textContent = 'points system off — Games → Points & unlocks';
            rowsEl.innerHTML = '';
            return;
        }
        readPointsEarnersToday(sys).then(function (earners) {
            if (my !== pointsPulseToken) return; // superseded by a newer poll
            earners.sort(function (a, b) { return (b.today - a.today) || (b.total - a.total); });
            rowsEl.innerHTML = '';
            if (!earners.length) {
                arcadeFxSetNumber(valEl, null);
                valEl.classList.add('is-dash');
                subEl.textContent = 'no base points earned yet today';
                var empty = document.createElement('li');
                empty.className = 'arcade-src-empty arcade-fx-grid';
                empty.textContent = enabled === null
                    ? 'Points reads waiting on the background bridge.'
                    : 'No earners yet today — points accrue on chat engagement.';
                rowsEl.appendChild(empty);
                return;
            }
            arcadeFxSetNumber(valEl, earners[0].today); // S44 M3 — tick TO the real value
            valEl.classList.remove('is-dash');
            subEl.textContent = earners[0].username + ' · base pts today';
            earners.slice(0, 3).forEach(function (earner, idx) {
                var li = document.createElement('li');
                li.className = 'arcade-frow';
                li.innerHTML =
                    '<span class="arcade-pill arcade-pill--mono">' + (idx + 1) + '</span>' +
                    '<span class="arcade-frow__label"></span>' +
                    '<span class="arcade-frow__total arcade-fx-ticker">—</span>' +
                    '<span class="arcade-frow__delta arcade-fx-ticker">—</span>';
                li.querySelector('.arcade-frow__label').textContent = earner.username;
                li.querySelector('.arcade-frow__label').title = (earner.type ? earner.type + ' · ' : '') + 'today: base pts · right: all-time available';
                rowsEl.appendChild(li);
                arcadeFxSetNumber(li.querySelector('.arcade-frow__total'), earner.today);
                arcadeFxSetNumber(li.querySelector('.arcade-frow__delta'), earner.total);
            });
        }).catch(function (e) {
            console.error('[arcade-shell] points pulse read failed:', e);
        });
    }

    // --------------------------------------------------------------------
    // S49 — COMMANDS + TIMERS (TASK-46, ruled 0018.06.03 a₿; Lane 1 — the
    // !golive pattern, generalized). A gallery door card ("Commands", Chat &
    // Text) opens this custom tab: LEFT = the streamer's commands and timers
    // as a left-list (the .arcade-evt-* idiom), RIGHT = the selected row's
    // config. A command = name + (canned response | full event flow) +
    // cooldown + role gate; a timer = every N minutes, post a message.
    //
    // NO PARALLEL BOT ENGINE: every row is backed by a REAL EventFlow flow,
    // seeded/edited through the background page's own eventFlowSystem (the
    // S47 withAlertFlowSystem bridge — generic, it is just frame2's engine).
    // The machinery each field rides is stock, measured in
    // actions/EventFlowSystem.js:
    //   - command match   messageEquals trigger (exact, like !golive) — :2124
    //   - role gate       userRole trigger (message[role], e.g. mod) — :2200
    //   - cooldown        randomChance trigger with probability 1 + cooldownMs
    //                     — the engine's ONLY cooldown mechanism (:2782-2839,
    //                     editor-exposed as "Minimum time between triggers");
    //                     probability 1 makes it a deterministic gate. In the
    //                     editor the node honestly reads "100% chance (Ns
    //                     cooldown)".
    //   - canned response sendMessage action, destination 'reply' (back to the
    //                     source tab, the stock auto-responder's semantic) —
    //                     :3429; sanitizeMode 'safe'; reflection-flagged so
    //                     the reply can't re-trigger flows.
    //   - timer           timeInterval trigger (seconds) — :2437. The engine's
    //                     1s scheduler runs in stock (background.js:18727),
    //                     ticking active time-based flows with a null message;
    //                     sendMessage destination 'all' needs no message
    //                     context (:3480). THE TIMER GAP THE BRIEF ASKED ABOUT
    //                     DOES NOT EXIST — the trigger ships and is live.
    // Surface-owned flows carry id prefixes s49-cmd-/s49-tmr- and are
    // regenerated wholesale on each edit (the surface OWNS their shape);
    // a flow the operator restructured in the editor fails the shape check
    // and the surface says so honestly instead of stomping it. !golive /
    // !golive off appear as IMPORTED rows (detected by their messageEquals
    // text) — read-only doors to their flows, never edited here.
    //
    // No settings keys minted for commands — the flow engine's IndexedDB IS
    // the store (duplicating it into savedSync would be the parallel-engine
    // smell the brief bans). Flow IDs are minted shell-side with entropy
    // (mintAlertId — the S47 idiom) so the saveFlow Date.now() fallback
    // collision can't bite.
    // --------------------------------------------------------------------
    var cmdRows = [];            // session cache: [{kind:'command'|'timer'|'imported', flowId, label, form, active, restructured}]
    var cmdSelectedId = null;    // flowId of the selected row (session-only)
    var commandsPanelLive = false;
    var cmdSaveTimer = null;

    function buildCommandsPanel() {
        var panel = document.createElement('section');
        panel.className = 'arcade-commands';
        panel.setAttribute('aria-label', 'Commands and timers');
        panel.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title">COMMANDS</span>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-alerts-status" id="arcade-cmd-status"></span>' +
            '</div>' +
            '<div class="arcade-alerts-body">' +
            '<div class="arcade-evt-list-col">' +
            '<div class="arcade-evt-list" id="arcade-cmd-list" role="listbox" aria-label="Commands and timers"></div>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-cmd-add" ' +
            'aria-haspopup="dialog" aria-expanded="false" aria-controls="arcade-cmd-add-modal">+ New command</button>' +
            '</div>' +
            '<div class="arcade-alerts-stage">' +
            '<div class="arcade-evt-config arcade-evt-config--fill" id="arcade-cmd-config"></div>' +
            '</div>' +
            '</div>';
        document.body.appendChild(panel);

        panel.querySelector('#arcade-cmd-add').addEventListener('click', openCmdPicker);

        // Same H18-A listbox contract as the games shelf (S49 rider): arrows
        // move the selection, aria-selected follows.
        var list = panel.querySelector('#arcade-cmd-list');
        list.addEventListener('keydown', function (e) {
            if (['ArrowUp', 'ArrowDown', 'Home', 'End'].indexOf(e.key) === -1) return;
            var rows = Array.prototype.slice.call(list.querySelectorAll('[data-arcade-cmd-id]'));
            if (!rows.length) return;
            e.preventDefault();
            var idx = rows.findIndex(function (r) { return r.dataset.arcadeCmdId === cmdSelectedId; });
            if (e.key === 'Home') idx = 0;
            else if (e.key === 'End') idx = rows.length - 1;
            else idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
            var id = rows[idx].dataset.arcadeCmdId;
            selectCmdRow(id);
            var fresh = list.querySelector('[data-arcade-cmd-id="' + id + '"]');
            if (fresh) fresh.focus();
        });
    }

    function setCmdStatus(text, isError) {
        var el = document.getElementById('arcade-cmd-status');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-error', !!isError);
    }

    // Lazy boot on first visit; re-entry re-reads (S47B doctrine — the editor
    // may have changed flows since the last visit). Boot-restore races:
    // frame2's eventFlowSystem only exists once its initPromise resolves, so
    // an early "unavailable" answer retries briefly before the honest line.
    var cmdLoadRetryTimer = null;
    var cmdLoadRetries = 0;

    function ensureCommandsPanelLive() {
        loadCmdRows().then(function (ok) {
            if (ok === false) { // engine not up yet — boot race, not a failure
                if (cmdLoadRetries < 20 && !cmdLoadRetryTimer) {
                    cmdLoadRetries++;
                    cmdLoadRetryTimer = setTimeout(function () {
                        cmdLoadRetryTimer = null;
                        ensureCommandsPanelLive();
                    }, 1000);
                }
                return;
            }
            cmdLoadRetries = 0;
            commandsPanelLive = true;
            if (!cmdSelectedId || !cmdRows.some(function (r) { return r.flowId === cmdSelectedId; })) {
                cmdSelectedId = cmdRows.length ? cmdRows[0].flowId : null;
            }
            renderCmdList();
            renderCmdConfig();
        });
    }

    function loadCmdRows() {
        return withAlertFlowSystem(function (fsys) {
            var rows = [];
            (fsys.flows || []).forEach(function (flow) {
                if (!flow || typeof flow.id !== 'string') return;
                if (flow.id.indexOf('s49-cmd-') === 0) {
                    var parsed = parseCmdFlowShape(flow, 'command');
                    rows.push({ kind: 'command', flowId: flow.id, flow: flow, label: parsed.ok ? parsed.form.name : flow.name, form: parsed.ok ? parsed.form : null, restructured: !parsed.ok, active: flow.active !== false });
                } else if (flow.id.indexOf('s49-tmr-') === 0) {
                    var parsedT = parseCmdFlowShape(flow, 'timer');
                    rows.push({ kind: 'timer', flowId: flow.id, flow: flow, label: parsedT.ok ? timerRowLabel(parsedT.form) : flow.name, form: parsedT.ok ? parsedT.form : null, restructured: !parsedT.ok, active: flow.active !== false });
                } else {
                    // The S41 house flows (!golive / !golive off) — imported
                    // by the operator, detected by their exact-match trigger.
                    var trig = (flow.nodes || []).find(function (n) { return n && n.type === 'trigger' && n.triggerType === 'messageEquals'; });
                    var text = trig && trig.config && typeof trig.config.text === 'string' ? trig.config.text.trim() : '';
                    if (text === '!golive' || text === '!golive off') {
                        rows.push({ kind: 'imported', flowId: flow.id, flow: flow, label: flow.name || text, active: flow.active !== false });
                    }
                }
            });
            cmdRows = rows;
            return true;
        }).catch(function (e) {
            if (cmdLoadRetries < 20) return false; // boot race — the caller retries quietly
            console.error('[arcade-shell] commands load failed:', e);
            cmdRows = [];
            setCmdStatus('flow system unavailable — commands cannot load', true);
            return true; // final answer — stop retrying, show the honest state
        });
    }

    function timerRowLabel(form) {
        var msg = form.message.length > 28 ? form.message.slice(0, 28) + '…' : form.message;
        return 'every ' + form.intervalMin + 'm — ' + (msg || '(empty message)');
    }

    // The surface-owned shape: trigger_1 (messageEquals|timeInterval) +
    // optional trigger_2 (userRole) + optional trigger_3 (randomChance
    // cooldown) + optional logic_1 (AND) + action_1 (sendMessage). Anything
    // else = the operator restructured it in the editor — hands off.
    var CMD_SHAPE_NODE_IDS = ['trigger_1', 'trigger_2', 'trigger_3', 'logic_1', 'action_1'];

    function parseCmdFlowShape(flow, kind) {
        var nodes = flow.nodes || [];
        var foreign = nodes.some(function (n) { return !n || CMD_SHAPE_NODE_IDS.indexOf(n.id) === -1; });
        if (foreign) return { ok: false };
        var trig = nodes.find(function (n) { return n.id === 'trigger_1' && n.type === 'trigger'; });
        var action = nodes.find(function (n) { return n.id === 'action_1' && n.type === 'action' && n.actionType === 'sendMessage'; });
        if (!trig || !action) return { ok: false };
        var roleNode = nodes.find(function (n) { return n.id === 'trigger_2' && n.triggerType === 'userRole'; });
        var cdNode = nodes.find(function (n) { return n.id === 'trigger_3' && n.triggerType === 'randomChance'; });
        if (kind === 'command') {
            if (trig.triggerType !== 'messageEquals') return { ok: false };
            return {
                ok: true,
                form: {
                    name: (trig.config && trig.config.text) || '',
                    response: (action.config && action.config.template) || '',
                    cooldownSec: cdNode ? Math.round(((cdNode.config && cdNode.config.cooldownMs) || 0) / 1000) : 0,
                    role: (roleNode && roleNode.config && roleNode.config.role) || ''
                }
            };
        }
        if (trig.triggerType !== 'timeInterval' || roleNode || cdNode) return { ok: false };
        return {
            ok: true,
            form: {
                intervalMin: Math.max(1, Math.round(((trig.config && trig.config.interval) || 1800) / 60)),
                message: (action.config && action.config.template) || ''
            }
        };
    }

    function buildCmdFlowSpec(form) {
        var nodes = [{ id: 'trigger_1', type: 'trigger', triggerType: 'messageEquals', x: 185, y: 50, config: { text: form.name } }];
        var connections = [];
        var heads = ['trigger_1'];
        if (form.role) {
            nodes.push({ id: 'trigger_2', type: 'trigger', triggerType: 'userRole', x: 430, y: 50, config: { role: form.role } });
            heads.push('trigger_2');
        }
        if (form.cooldownSec > 0) {
            nodes.push({ id: 'trigger_3', type: 'trigger', triggerType: 'randomChance', x: 670, y: 50, config: { probability: 1, cooldownMs: form.cooldownSec * 1000, maxPerMinute: 0, requireMessage: true } });
            heads.push('trigger_3');
        }
        var head = 'trigger_1';
        if (heads.length > 1) {
            nodes.push({ id: 'logic_1', type: 'logic', logicType: 'AND', x: 300, y: 210, config: {} });
            heads.forEach(function (h) { connections.push({ from: h, to: 'logic_1' }); });
            head = 'logic_1';
        }
        nodes.push({ id: 'action_1', type: 'action', actionType: 'sendMessage', x: 300, y: 390, config: { template: form.response, destination: 'reply', sanitizeMode: 'safe', timeout: 1000 } });
        connections.push({ from: head, to: 'action_1' });
        return { nodes: nodes, connections: connections };
    }

    function buildTimerFlowSpec(form) {
        return {
            nodes: [
                { id: 'trigger_1', type: 'trigger', triggerType: 'timeInterval', x: 185, y: 50, config: { interval: form.intervalMin * 60 } },
                { id: 'action_1', type: 'action', actionType: 'sendMessage', x: 300, y: 250, config: { template: form.message, destination: 'all', sanitizeMode: 'safe', timeout: 1000 } }
            ],
            connections: [{ from: 'trigger_1', to: 'action_1' }]
        };
    }

    // One save per edit, through the engine's own saveFlow (IndexedDB — no
    // IPC, so the S48 sendSync trap class doesn't apply here). Debounced from
    // the text inputs; the flow keeps its id and its place in the editor.
    function saveCmdRow(row) {
        if (!row || row.restructured || !row.form) return Promise.resolve();
        return withAlertFlowSystem(function (fsys) {
            var flow = fsys.flows.find(function (f) { return f.id === row.flowId; });
            if (!flow) { setCmdStatus('flow missing — deleted in the editor?', true); return null; }
            var spec = row.kind === 'timer' ? buildTimerFlowSpec(row.form) : buildCmdFlowSpec(row.form);
            flow.nodes = spec.nodes;
            flow.connections = spec.connections;
            flow.name = row.kind === 'timer'
                ? 'Timer: ' + timerRowLabel(row.form)
                : 'Command: ' + (row.form.name || '(unnamed)');
            flow.active = row.active;
            return fsys.saveFlow(flow);
        }).catch(function (e) {
            console.error('[arcade-shell] command save failed:', e);
            setCmdStatus('save failed — flow system unavailable', true);
        });
    }

    function queueCmdSave(row) {
        clearTimeout(cmdSaveTimer);
        cmdSaveTimer = setTimeout(function () {
            saveCmdRow(row).then(function () { setCmdStatus('saved'); });
        }, 400);
    }

    function renderCmdList() {
        var list = document.getElementById('arcade-cmd-list');
        if (!list) return;
        list.innerHTML = '';
        if (!cmdRows.length) {
            var empty = document.createElement('div');
            empty.className = 'arcade-src-empty arcade-fx-grid';
            empty.textContent = 'No commands yet — “+ New command” seeds a real event flow.';
            list.appendChild(empty);
        }

        // TASK-68 (WALK 2A item 7) — the user's ACTIVE commands lead as
        // sub-items of the Commands crumb (indented one notch under the
        // breadcrumb trail); paused commands, timers and the imported house
        // flows follow under their own small group captions. Click any row
        // = its config on the right (unchanged selectCmdRow contract).
        function caption(text) {
            var cap = document.createElement('div');
            cap.className = 'arcade-evt-group__title';
            cap.textContent = text;
            list.appendChild(cap);
        }
        function cmdRowBtn(row, sub) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'arcade-evt-item' + (sub ? ' arcade-evt-item--sub' : '');
            btn.dataset.arcadeCmdId = row.flowId;
            btn.setAttribute('role', 'option');
            var selected = cmdSelectedId === row.flowId;
            btn.classList.toggle('is-on', selected);
            btn.setAttribute('aria-selected', String(selected));
            var label = document.createElement('span');
            label.className = 'arcade-evt-item__label';
            var icon = row.kind === 'timer' ? '⏱ ' : (row.kind === 'imported' ? '📥 ' : '⌨️ ');
            label.textContent = icon + row.label;
            if (row.restructured) label.title = 'This flow was customized in the flow editor — edit it there';
            btn.appendChild(label);
            var state = document.createElement('span');
            state.className = 'arcade-evt-state ' + (row.active ? 'arcade-evt-state--on' : 'arcade-evt-state--off');
            state.textContent = row.active ? 'active' : 'off';
            state.title = row.active ? 'The backing flow is active' : 'The backing flow is paused';
            btn.appendChild(state);
            btn.addEventListener('click', function () { selectCmdRow(row.flowId); });
            return btn;
        }

        var activeCmds = cmdRows.filter(function (r) { return r.kind === 'command' && r.active; });
        var pausedCmds = cmdRows.filter(function (r) { return r.kind === 'command' && !r.active; });
        var timers = cmdRows.filter(function (r) { return r.kind === 'timer'; });
        var imported = cmdRows.filter(function (r) { return r.kind === 'imported'; });

        if (activeCmds.length) {
            caption('Active commands');
            activeCmds.forEach(function (row) { list.appendChild(cmdRowBtn(row, true)); });
        }
        if (pausedCmds.length) {
            caption('Paused');
            pausedCmds.forEach(function (row) { list.appendChild(cmdRowBtn(row, true)); });
        }
        if (timers.length) {
            caption('Timers');
            timers.forEach(function (row) { list.appendChild(cmdRowBtn(row, true)); });
        }
        if (imported.length) {
            caption('Imported');
            imported.forEach(function (row) { list.appendChild(cmdRowBtn(row, true)); });
        }
        // Honest import hint — the S41 house flows only exist once the
        // operator imports them (outbox task-38-s41 JSONs).
        if (!cmdRows.some(function (r) { return r.kind === 'imported'; })) {
            var hint = document.createElement('div');
            hint.className = 'arcade-evt-cond__hint arcade-cmd-import-hint';
            hint.textContent = 'The !golive house flows aren’t imported on this setup — they list here automatically once they are.';
            list.appendChild(hint);
        }
    }

    function selectCmdRow(flowId) {
        if (cmdSelectedId === flowId) return;
        cmdSelectedId = flowId;
        renderCmdList();
        renderCmdConfig();
    }

    function selectedCmdRow() {
        return cmdRows.find(function (r) { return r.flowId === cmdSelectedId; }) || null;
    }

    function renderCmdConfig() {
        var config = document.getElementById('arcade-cmd-config');
        if (!config) return;
        config.innerHTML = '';
        var row = selectedCmdRow();
        if (!row) {
            var empty = document.createElement('p');
            empty.className = 'arcade-evt-blurb';
            empty.textContent = 'Select a command on the left, or “+ New command” to seed one.';
            config.appendChild(empty);
            return;
        }

        var head = document.createElement('div');
        head.className = 'arcade-evt-config__head';
        var name = document.createElement('span');
        name.className = 'arcade-evt-config__name';
        name.textContent = row.kind === 'timer' ? '⏱ Timer' : (row.kind === 'imported' ? '📥 Imported flow' : '⌨️ Command');
        head.appendChild(name);
        config.appendChild(head);

        var blurb = document.createElement('p');
        blurb.className = 'arcade-evt-blurb';
        blurb.textContent = row.kind === 'imported'
            ? 'Imported house flow — read-only here; the door below opens it in the flow editor.'
            : 'Backed by a real event flow (' + row.flowId + ') — edits here rewrite that flow; refine it further in the flow editor any time.';
        config.appendChild(blurb);

        if (row.kind === 'imported') {
            var importDoors = document.createElement('div');
            importDoors.className = 'arcade-evt-doors';
            var openBtn2 = document.createElement('button');
            openBtn2.type = 'button';
            openBtn2.className = 'arcade-btn arcade-btn--sm';
            openBtn2.textContent = 'Open in Flow editor';
            openBtn2.addEventListener('click', function () { openAlertFlowInEditor(row.flowId); });
            importDoors.appendChild(openBtn2);
            config.appendChild(importDoors);
            return;
        }

        if (row.restructured) {
            var hands = document.createElement('div');
            hands.className = 'arcade-evt-cond__hint';
            hands.textContent = 'This flow was customized in the flow editor — the surface leaves it alone now. Edit it there.';
            config.appendChild(hands);
            var handsDoors = document.createElement('div');
            handsDoors.className = 'arcade-evt-doors';
            var handsBtn = document.createElement('button');
            handsBtn.type = 'button';
            handsBtn.className = 'arcade-btn arcade-btn--sm';
            handsBtn.textContent = 'Open in Flow editor';
            handsBtn.addEventListener('click', function () { openAlertFlowInEditor(row.flowId); });
            handsDoors.appendChild(handsBtn);
            config.appendChild(handsDoors);
            appendCmdActiveAndDelete(config, row);
            return;
        }

        if (row.kind === 'command') buildCmdForm(config, row);
        else buildTimerForm(config, row);
        appendCmdActiveAndDelete(config, row);
    }

    function buildCmdForm(config, row) {
        var form = row.form;

        var cmdField = document.createElement('div');
        cmdField.className = 'arcade-alert-row';
        var cmdLabel = document.createElement('label');
        cmdLabel.textContent = 'Command';
        cmdField.appendChild(cmdLabel);
        var cmdInput = document.createElement('input');
        cmdInput.type = 'text';
        cmdInput.autocomplete = 'off';
        cmdInput.placeholder = '!discord';
        cmdInput.value = form.name;
        cmdInput.title = 'Exact chat message that fires it — chatters type it verbatim';
        cmdInput.addEventListener('input', function () {
            var clean = sanitizeCmdName(cmdInput.value);
            form.name = clean;
            row.label = clean || '(unnamed command)';
            renderCmdList();
            queueCmdSave(row);
        });
        cmdInput.addEventListener('blur', function () { cmdInput.value = form.name; });
        cmdField.appendChild(cmdInput);
        config.appendChild(cmdField);
        var cmdHint = document.createElement('div');
        cmdHint.className = 'arcade-evt-cond__hint';
        cmdHint.textContent = 'Exact match (stock messageEquals, same as !golive) — “!discord” fires, “!discord please” does not.';
        config.appendChild(cmdHint);

        var respField = document.createElement('div');
        respField.className = 'arcade-alert-row arcade-alert-row--top';
        var respLabel = document.createElement('label');
        respLabel.textContent = 'Canned response';
        respField.appendChild(respLabel);
        var respInput = document.createElement('textarea');
        respInput.rows = 3;
        respInput.value = form.response;
        respInput.placeholder = 'What the bot replies in chat';
        respInput.title = 'Posted as a reply on the platform the command came from (stock sendMessage, destination reply)';
        respInput.addEventListener('input', function () {
            form.response = respInput.value;
            queueCmdSave(row);
        });
        respField.appendChild(respInput);
        config.appendChild(respField);

        var cdField = document.createElement('div');
        cdField.className = 'arcade-alert-row';
        var cdLabel = document.createElement('label');
        cdLabel.textContent = 'Cooldown (seconds)';
        cdField.appendChild(cdLabel);
        var cdInput = document.createElement('input');
        cdInput.type = 'number';
        cdInput.min = '0';
        cdInput.step = '1';
        cdInput.value = String(form.cooldownSec);
        cdInput.title = 'Minimum seconds between fires — the engine’s own cooldown gate (0 = no cooldown)';
        cdInput.addEventListener('change', function () {
            var v = Math.max(0, Math.round(Number(cdInput.value) || 0));
            cdInput.value = String(v);
            form.cooldownSec = v;
            queueCmdSave(row);
        });
        cdField.appendChild(cdInput);
        config.appendChild(cdField);

        var roleField = document.createElement('div');
        roleField.className = 'arcade-alert-row';
        var roleLabel = document.createElement('label');
        roleLabel.textContent = 'Who can run it';
        roleField.appendChild(roleLabel);
        var roleSelect = document.createElement('select');
        roleSelect.innerHTML = '<option value="">Everyone</option><option value="mod">Mods only</option>';
        roleSelect.value = form.role;
        roleSelect.title = 'Stock userRole trigger — the same gate !golive rides';
        roleSelect.addEventListener('change', function () {
            form.role = roleSelect.value;
            queueCmdSave(row);
        });
        roleField.appendChild(roleSelect);
        config.appendChild(roleField);
    }

    function buildTimerForm(config, row) {
        var form = row.form;

        var intField = document.createElement('div');
        intField.className = 'arcade-alert-row';
        var intLabel = document.createElement('label');
        intLabel.textContent = 'Every (minutes)';
        intField.appendChild(intLabel);
        var intInput = document.createElement('input');
        intInput.type = 'number';
        intInput.min = '1';
        intInput.step = '1';
        intInput.value = String(form.intervalMin);
        intInput.title = 'Stock timeInterval trigger — fires on the engine’s own scheduler';
        intInput.addEventListener('change', function () {
            var v = Math.max(1, Math.round(Number(intInput.value) || 0));
            intInput.value = String(v);
            form.intervalMin = v;
            row.label = timerRowLabel(form);
            renderCmdList();
            queueCmdSave(row);
        });
        intField.appendChild(intInput);
        config.appendChild(intField);

        var msgField = document.createElement('div');
        msgField.className = 'arcade-alert-row arcade-alert-row--top';
        var msgLabel = document.createElement('label');
        msgLabel.textContent = 'Message';
        msgField.appendChild(msgLabel);
        var msgInput = document.createElement('textarea');
        msgInput.rows = 3;
        msgInput.value = form.message;
        msgInput.placeholder = 'e.g. Merch and tip links live at the store — type !store';
        msgInput.title = 'Posted to every connected platform on the interval (stock sendMessage, destination all)';
        msgInput.addEventListener('input', function () {
            form.message = msgInput.value;
            row.label = timerRowLabel(form);
            renderCmdList();
            queueCmdSave(row);
        });
        msgField.appendChild(msgInput);
        config.appendChild(msgField);

        var liveHint = document.createElement('div');
        liveHint.className = 'arcade-evt-cond__hint';
        liveHint.textContent = 'Posts to every connected platform on the interval while the app is running — timers don’t know live state; toggle it off when you’re done.';
        config.appendChild(liveHint);
    }

    function appendCmdActiveAndDelete(config, row) {
        var activeRow = buildArcadeToggle({ // TASK-68 — shared .arcade-toggle (item 8 sweep)
            label: 'active (the flow fires)',
            checked: row.active,
            onChange: function (checked) {
                row.active = checked;
                if (!row.restructured) queueCmdSave(row);
                else {
                    // Restructured flows only get their active flag touched —
                    // never a node rewrite.
                    withAlertFlowSystem(function (fsys) {
                        var flow = fsys.flows.find(function (f) { return f.id === row.flowId; });
                        if (flow) { flow.active = row.active; return fsys.saveFlow(flow); }
                        return null;
                    }).catch(function (e) { console.error('[arcade-shell] command active-toggle failed:', e); });
                }
                renderCmdList();
            }
        });
        activeRow.classList.add('arcade-cmd-active');
        config.appendChild(activeRow);

        var doors = document.createElement('div');
        doors.className = 'arcade-evt-doors';
        var openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'arcade-btn arcade-btn--sm';
        openBtn.textContent = 'Open in Flow editor';
        openBtn.addEventListener('click', function () { openAlertFlowInEditor(row.flowId); });
        doors.appendChild(openBtn);
        if (row.kind !== 'imported') {
            var delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'arcade-btn arcade-btn--sm arcade-evt-remove';
            delBtn.textContent = 'Delete';
            delBtn.addEventListener('click', function () {
                if (!delBtn.dataset.armed) { // confirm-on-second-click, the S47 idiom
                    delBtn.dataset.armed = '1';
                    delBtn.textContent = 'Click again to delete the flow';
                    setTimeout(function () {
                        delBtn.dataset.armed = '';
                        if (document.body.contains(delBtn)) delBtn.textContent = 'Delete';
                    }, 3000);
                    return;
                }
                withAlertFlowSystem(function (fsys) { return fsys.deleteFlow(row.flowId); }).then(function () {
                    cmdRows = cmdRows.filter(function (r) { return r.flowId !== row.flowId; });
                    cmdSelectedId = cmdRows.length ? cmdRows[0].flowId : null;
                    renderCmdList();
                    renderCmdConfig();
                    setCmdStatus('flow deleted');
                }).catch(function (e) {
                    console.error('[arcade-shell] command delete failed:', e);
                    setCmdStatus('delete failed — flow system unavailable', true);
                });
            });
            doors.appendChild(delBtn);
        }
        config.appendChild(doors);
    }

    function sanitizeCmdName(value) {
        var clean = String(value || '').replace(/\s+/g, '').toLowerCase();
        if (clean && clean.charAt(0) !== '!') clean = '!' + clean;
        return clean.slice(0, 32);
    }

    // "+ New command" picker — Command or Timer. Built to the H18-A house
    // disclosure contract from birth: focus in on open, Escape closes, focus
    // returns to the trigger on close-without-pick, aria-expanded/controls on
    // the trigger, click-outside closes.
    var cmdPickerKeydown = null;

    function closeCmdPicker(returnFocus) {
        var existing = document.getElementById('arcade-cmd-add-modal');
        if (existing) existing.remove();
        if (cmdPickerKeydown) {
            document.removeEventListener('keydown', cmdPickerKeydown);
            cmdPickerKeydown = null;
        }
        var trigger = document.getElementById('arcade-cmd-add');
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
            if (returnFocus) trigger.focus();
        }
    }

    function openCmdPicker() {
        closeCmdPicker(false);
        var trigger = document.getElementById('arcade-cmd-add');
        var back = document.createElement('div');
        back.className = 'arcade-evt-modal-back';
        back.id = 'arcade-cmd-add-modal';
        var modal = document.createElement('div');
        modal.className = 'arcade-evt-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-label', 'New command or timer');
        var title = document.createElement('h3');
        title.className = 'arcade-evt-modal__title';
        title.tabIndex = -1;
        title.textContent = 'New command or timer';
        modal.appendChild(title);
        var sub = document.createElement('p');
        sub.className = 'arcade-evt-modal__blurb';
        sub.textContent = 'Either kind lands as a real event flow you can refine in the flow editor.';
        modal.appendChild(sub);
        modal.appendChild(buildAddEventPick('⌨️ Command', 'Chat types !something, the bot replies — cooldown and a role gate if you want them.', function () {
            addCmdRow('command');
        }));
        modal.appendChild(buildAddEventPick('⏱ Timer', 'Every N minutes, post a message to every connected platform (the store shoutout pattern).', function () {
            addCmdRow('timer');
        }));
        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'arcade-btn arcade-btn--sm';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', function () { closeCmdPicker(true); });
        modal.appendChild(cancel);
        back.appendChild(modal);
        back.addEventListener('click', function (e) { if (e.target === back) closeCmdPicker(true); });
        document.body.appendChild(back);
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
        cmdPickerKeydown = function (e) {
            if (e.key === 'Escape' && document.getElementById('arcade-cmd-add-modal')) {
                e.stopPropagation();
                closeCmdPicker(true);
            }
        };
        document.addEventListener('keydown', cmdPickerKeydown);
        var firstPick = modal.querySelector('.arcade-evt-modal__pick');
        (firstPick || title).focus();
    }

    function addCmdRow(kind) {
        closeCmdPicker(false); // a pick — focus lands on the new row, not the trigger
        var flowId = mintAlertId(kind === 'timer' ? 's49-tmr' : 's49-cmd');
        var form = kind === 'timer'
            ? { intervalMin: 30, message: '' }
            : { name: '!newcmd', response: '', cooldownSec: 0, role: '' };
        var flow = {
            id: flowId,
            name: kind === 'timer' ? 'Timer: every 30m' : 'Command: !newcmd',
            description: 'Seeded by the Arcade Commands surface — refine freely; heavy edits hand it back to the surface read-only.',
            active: false, // starts OFF — an empty response/message should never fire; the operator arms it
            nodes: [],
            connections: []
        };
        var spec = kind === 'timer' ? buildTimerFlowSpec(form) : buildCmdFlowSpec(form);
        flow.nodes = spec.nodes;
        flow.connections = spec.connections;
        withAlertFlowSystem(function (fsys) { return fsys.saveFlow(flow); }).then(function () {
            var row = { kind: kind, flowId: flowId, flow: flow, label: kind === 'timer' ? timerRowLabel(form) : form.name, form: form, restructured: false, active: false };
            cmdRows.push(row);
            cmdSelectedId = flowId;
            renderCmdList();
            renderCmdConfig();
            setCmdStatus(kind === 'timer' ? 'timer seeded — set its message, then switch it active' : 'command seeded — set its response, then switch it active');
            var rowEl = document.querySelector('#arcade-cmd-list [data-arcade-cmd-id="' + flowId + '"]');
            if (rowEl) rowEl.focus();
        }).catch(function (e) {
            console.error('[arcade-shell] command seed failed:', e);
            setCmdStatus('flow system unavailable — nothing added', true);
        });
    }


    // --------------------------------------------------------------------
    // S49 — GOAL BARS (TASK-46, Lane 2 — NEW BUILD; the census confirms
    // stock ships no goal-bar overlay). A gallery door card ("Goal Bars",
    // Widgets) opens this custom tab: LEFT = the streamer's goals as a
    // left-list + the platform-program set imports, RIGHT = an isolated demo
    // preview on TOP (goal-bar.html?demo=… — zero network, no session) and
    // the selected goal's config BELOW. Copy overlay URL composes the REAL
    // session URL (never &demo), the ruled mirror of the preview.
    //
    // REAL NUMBERS ONLY: the overlay (goal-bar.html, a new house file) draws
    // current values from what the app already receives — the meta-store
    // broadcasts (viewer_updates, and follower_updates via the small
    // background.js publish seam this task adds — see the file's header),
    // observed sub events, and tip events; sats/custom goals advance
    // manually via the starting-count the config bakes into the URL. Unknown
    // values render dash-face + empty bar, NEVER an estimate (honest-time
    // law). The "Right now" line in the config reads the shell's own
    // analytics bridge (arcadeAnalytics.followerCounts/viewerCounts — real
    // metaDataStore readings, the same source the Main rail uses).
    //
    // TYPE SUPPORT (measured, not assumed):
    //   followers  absolute totals per platform — metaDataStore
    //              follower_update entries (background.js:6783), broadcast
    //              as follower_updates by the S49 publish seam.
    //   viewers    live concurrent per platform — the stock viewer_updates
    //              broadcast (background.js:6797, documented sample payload
    //              in the bundle AGENTS.md). CURRENT reading — no 30-day
    //              average exists anywhere in the app, and none is faked.
    //   subs       observed subscription events this session (event names
    //              from multi-alerts.js:55-80) + the manual starting count.
    //   sats       tip events (hasDonation leading-number, the tipjar-mini
    //              convention) + the manual starting count.
    //   custom     manual counter — the starting count is the whole value.
    //
    // Setting key (textparam1, canonical saveSetting via the S48 async
    // saveGameSetting idiom — writes can land while the preview frame
    // churns):  arcadeGoals  JSON array [{id,type,label,target,current,
    // source,fill,ruleset}]. Reserved arcadeAlert*/arcadeStylePresets/
    // arcadeGame*/arcadePointsUnlocks keys untouched.
    //
    // PLATFORM RULESETS — preset goal SETS imported as a group of bars,
    // encoded as DATA below with a source URL + accessed date per set
    // (requirements change; the report cites where each number came from).
    // Stream-hours/days bars import as MANUAL counters — the app holds no
    // cumulative stream-time source, so the honest mechanic is the streamer
    // advancing them, not an invented tracker.
    // --------------------------------------------------------------------
    var GOAL_TYPES = [
        { id: 'followers', label: 'Followers' },
        { id: 'viewers', label: 'Viewers (live)' },
        { id: 'subs', label: 'Subs (this session)' },
        { id: 'sats', label: 'Sats / tips' },
        { id: 'custom', label: 'Custom counter' }
    ];

    var GOAL_RULESETS = [
        {
            id: 'twitch-affiliate', name: 'Twitch Affiliate',
            source: 'https://help.twitch.tv/s/article/joining-the-affiliate-program',
            accessed: '2026-08-26',
            note: 'Rolling 30-day window (25 followers / 4 hours / 4 days / 3 avg viewers — the 2026 bar; the classic 50-follower bar was lowered). The followers/viewers bars read live counts — Twitch judges the 30-day window, the app has no windowed-average source.',
            goals: [
                { type: 'followers', source: 'twitch', label: 'Twitch followers', target: 25 },
                { type: 'viewers', source: 'twitch', label: 'Twitch viewers (live now)', target: 3 },
                { type: 'custom', source: '', label: 'Stream hours (manual)', target: 4 },
                { type: 'custom', source: '', label: 'Stream days (manual)', target: 4 }
            ]
        },
        {
            id: 'kick-affiliate', name: 'Kick Affiliate',
            source: 'https://help.kick.com/en/articles/12273402-how-to-become-a-kick-affiliate-how-kick-streaming-works',
            accessed: '2026-08-26',
            note: '75 followers + 5 streamed hours; the 5-hour requirement is cumulative per Kick’s help article.',
            goals: [
                { type: 'followers', source: 'kick', label: 'Kick followers', target: 75 },
                { type: 'custom', source: '', label: 'Stream hours (manual)', target: 5 }
            ]
        }
    ];

    var GOALS_KEY = 'arcadeGoals';
    var goalsDoc = [];            // [{id,type,label,target,current,source,fill,ruleset?}]
    var goalsSelectedId = null;
    var goalsPanelLive = false;

    function buildGoalsPanel() {
        var panel = document.createElement('section');
        panel.className = 'arcade-goals';
        panel.setAttribute('aria-label', 'Goal bars');
        panel.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title">GOAL BARS</span>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-alerts-status" id="arcade-goals-status"></span>' +
            '<button type="button" class="arcade-btn arcade-btn--sm arcade-btn--primary" id="arcade-goals-copy">Copy overlay URL</button>' +
            '</div>' +
            '<div class="arcade-alerts-body">' +
            '<div class="arcade-evt-list-col">' +
            '<div class="arcade-evt-list" id="arcade-goals-list" role="listbox" aria-label="Goals"></div>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-goals-add">+ New goal</button>' +
            '<div class="arcade-goal-sets" id="arcade-goal-sets"></div>' +
            '</div>' +
            '<div class="arcade-alerts-stage">' +
            '<div class="arcade-alerts-preview">' +
            '<div class="arcade-alerts-preview-bar">' +
            '<span class="arcade-style-hint" id="arcade-goals-preview-hint">The preview is a zero-network demo of the look — the overlay only counts what your session really sees.</span>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-goals-reload">Reload preview</button>' +
            '</div>' +
            '<iframe id="arcade-goals-preview-frame" title="Goal bar preview — zero-network demo"></iframe>' +
            '</div>' +
            '<div class="arcade-evt-config" id="arcade-goals-config"></div>' +
            '</div>' +
            '</div>';
        document.body.appendChild(panel);

        panel.querySelector('#arcade-goals-copy').addEventListener('click', function (e) {
            copyGoalsOverlayUrl(e.currentTarget);
        });
        panel.querySelector('#arcade-goals-reload').addEventListener('click', function () {
            initGoalsPreviewFrame();
        });
        panel.querySelector('#arcade-goals-add').addEventListener('click', function () {
            addGoal({ type: 'custom', label: 'New goal', target: 100, current: 0, source: '', fill: '' });
        });

        // Program-set import buttons (data-driven — one per GOAL_RULESETS entry).
        var setsHost = panel.querySelector('#arcade-goal-sets');
        var setsTitle = document.createElement('div');
        setsTitle.className = 'arcade-evt-cond__title';
        setsTitle.textContent = 'Import a program set';
        setsHost.appendChild(setsTitle);
        GOAL_RULESETS.forEach(function (set) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'arcade-btn arcade-btn--sm arcade-goal-set__btn';
            btn.textContent = '+ ' + set.name; // S50 tofu fix — U+FF0B fullwidth plus rendered as □; ASCII matches the sibling add buttons
            btn.title = set.note + ' — source: ' + set.source + ' (accessed ' + set.accessed + ')';
            btn.addEventListener('click', function () { importGoalRuleset(set); });
            setsHost.appendChild(btn);
        });

        // Same H18-A listbox contract as the other S49 shelves.
        var list = panel.querySelector('#arcade-goals-list');
        list.addEventListener('keydown', function (e) {
            if (['ArrowUp', 'ArrowDown', 'Home', 'End'].indexOf(e.key) === -1) return;
            var rows = Array.prototype.slice.call(list.querySelectorAll('[data-arcade-goal-id]'));
            if (!rows.length) return;
            e.preventDefault();
            var idx = rows.findIndex(function (r) { return r.dataset.arcadeGoalId === goalsSelectedId; });
            if (e.key === 'Home') idx = 0;
            else if (e.key === 'End') idx = rows.length - 1;
            else idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
            var id = rows[idx].dataset.arcadeGoalId;
            selectGoalRow(id);
            var fresh = list.querySelector('[data-arcade-goal-id="' + id + '"]');
            if (fresh) fresh.focus();
        });
    }

    function setGoalsStatus(text, isError) {
        var el = document.getElementById('arcade-goals-status');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-error', !!isError);
    }

    function ensureGoalsPanelLive() {
        loadGoalsSettings().then(function () {
            goalsPanelLive = true;
            if (!goalsSelectedId || !goalsDoc.some(function (g) { return g.id === goalsSelectedId; })) {
                goalsSelectedId = goalsDoc.length ? goalsDoc[0].id : null;
            }
            renderGoalsList();
            renderGoalsConfig();
            initGoalsPreviewFrame();
        });
    }

    function loadGoalsSettings() {
        return new Promise(function (resolve) {
            try {
                if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                    window.ninjafy.sendMessage(null, { getSettings: true }, function (response) {
                        try {
                            var settings = (response && response.settings) || {};
                            var entry = settings[GOALS_KEY];
                            var doc = null;
                            try { doc = JSON.parse((entry && typeof entry.textparam1 === 'string') ? entry.textparam1 : ''); } catch (e) { doc = null; }
                            goalsDoc = (Array.isArray(doc) ? doc : []).filter(function (g) {
                                return g && typeof g === 'object' && typeof g.id === 'string' && goalTypeMeta(g.type);
                            }).map(function (g) {
                                return {
                                    id: g.id,
                                    type: g.type,
                                    label: typeof g.label === 'string' ? g.label : 'Goal',
                                    target: Math.max(1, Math.round(Number(g.target) || 0) || 100),
                                    current: Math.max(0, Number(g.current) || 0),
                                    source: typeof g.source === 'string' ? g.source : '',
                                    fill: typeof g.fill === 'string' ? g.fill : '',
                                    ruleset: typeof g.ruleset === 'string' ? g.ruleset : ''
                                };
                            });
                        } catch (e) { console.error('[arcade-shell] goals settings parse failed:', e); }
                        resolve();
                    });
                    return;
                }
            } catch (e) { console.error('[arcade-shell] goals settings load failed:', e); }
            setGoalsStatus('settings bridge unavailable — edits will not persist', true);
            resolve();
        });
    }

    function saveGoals() { saveGameSetting(GOALS_KEY, JSON.stringify(goalsDoc)); } // S48 async idiom — preview churn safe

    function goalTypeMeta(typeId) {
        return GOAL_TYPES.find(function (t) { return t.id === typeId; }) || null;
    }

    function selectedGoal() {
        return goalsDoc.find(function (g) { return g.id === goalsSelectedId; }) || null;
    }

    function addGoal(spec) {
        var goal = {
            id: mintAlertId('s49-goal'),
            type: spec.type,
            label: spec.label,
            target: Math.max(1, Math.round(Number(spec.target) || 0) || 100),
            current: Math.max(0, Number(spec.current) || 0),
            source: spec.source || '',
            fill: spec.fill || '',
            ruleset: spec.ruleset || ''
        };
        goalsDoc.push(goal);
        saveGoals();
        goalsSelectedId = goal.id;
        renderGoalsList();
        renderGoalsConfig();
        initGoalsPreviewFrame();
        setGoalsStatus('"' + goal.label + '" added');
        var rowEl = document.querySelector('#arcade-goals-list [data-arcade-goal-id="' + goal.id + '"]');
        if (rowEl) rowEl.focus();
        return goal;
    }

    function importGoalRuleset(set) {
        var added = 0;
        set.goals.forEach(function (spec) {
            var dupe = goalsDoc.some(function (g) {
                return g.ruleset === set.id && g.type === spec.type && g.target === spec.target && g.label === spec.label;
            });
            if (dupe) return;
            added++;
            addGoal({
                type: spec.type, label: spec.label, target: spec.target,
                current: 0, source: spec.source || '', fill: '', ruleset: set.id
            });
        });
        setGoalsStatus(added
            ? set.name + ' — ' + added + ' bar' + (added === 1 ? '' : 's') + ' imported'
            : set.name + ' is already imported');
    }

    function renderGoalsList() {
        var list = document.getElementById('arcade-goals-list');
        if (!list) return;
        list.innerHTML = '';
        if (!goalsDoc.length) {
            var empty = document.createElement('div');
            empty.className = 'arcade-src-empty arcade-fx-grid';
            empty.textContent = 'No goals yet — “+ New goal”, or import a program set below.';
            list.appendChild(empty);
        }
        goalsDoc.forEach(function (goal) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'arcade-evt-item';
            btn.dataset.arcadeGoalId = goal.id;
            btn.setAttribute('role', 'option');
            var selected = goalsSelectedId === goal.id;
            btn.classList.toggle('is-on', selected);
            btn.setAttribute('aria-selected', String(selected));
            var label = document.createElement('span');
            label.className = 'arcade-evt-item__label';
            label.textContent = '🎯 ' + goal.label;
            btn.appendChild(label);
            var state = document.createElement('span');
            state.className = 'arcade-evt-state arcade-evt-state--off';
            var meta = goalTypeMeta(goal.type);
            state.textContent = meta ? meta.label : goal.type;
            state.title = 'target ' + goal.target + (goal.source ? ' · ' + goal.source : '');
            btn.appendChild(state);
            btn.addEventListener('click', function () { selectGoalRow(goal.id); });
            list.appendChild(btn);
        });
    }

    function selectGoalRow(id) {
        if (goalsSelectedId === id) return;
        goalsSelectedId = id;
        renderGoalsList();
        renderGoalsConfig();
        initGoalsPreviewFrame();
    }

    // The "Right now" honest line — real counts off the shell's own
    // analytics bridge (metaDataStore readings, never estimates). Unknown
    // stays a dash.
    function goalRightNowText(goal) {
        if (goal.type !== 'followers' && goal.type !== 'viewers') return null;
        var counts = goal.type === 'followers' ? arcadeAnalytics.followerCounts : arcadeAnalytics.viewerCounts;
        var ready = goal.type === 'followers' ? arcadeAnalytics.followersReady : arcadeAnalytics.viewersReady;
        if (!ready) return '— (no reading yet)';
        var total = 0, seen = false;
        Object.keys(counts).forEach(function (k) {
            if (goal.source && k.toLowerCase() !== goal.source) return;
            var n = parseInt(counts[k], 10);
            if (isFinite(n)) { total += n; seen = true; }
        });
        if (!seen) return '— (no ' + (goal.source || 'platform') + ' reading yet)';
        return total.toLocaleString('en-US') + (goal.source ? ' on ' + goal.source : ' across platforms');
    }

    function renderGoalsConfig() {
        var config = document.getElementById('arcade-goals-config');
        if (!config) return;
        config.innerHTML = '';
        var goal = selectedGoal();
        if (!goal) {
            var empty = document.createElement('p');
            empty.className = 'arcade-evt-blurb';
            empty.textContent = 'Select a goal on the left, or “+ New goal”.';
            config.appendChild(empty);
            return;
        }

        var head = document.createElement('div');
        head.className = 'arcade-evt-config__head';
        var name = document.createElement('span');
        name.className = 'arcade-evt-config__name';
        name.textContent = '🎯 ' + goal.label;
        head.appendChild(name);
        config.appendChild(head);

        var rightNow = goalRightNowText(goal);
        if (rightNow !== null) {
            var nowLine = document.createElement('p');
            nowLine.className = 'arcade-evt-blurb';
            nowLine.innerHTML = 'Right now: <span class="arcade-fx-ticker"></span>';
            nowLine.querySelector('.arcade-fx-ticker').textContent = rightNow;
            config.appendChild(nowLine);
        }

        var blurb = document.createElement('p');
        blurb.className = 'arcade-evt-blurb';
        blurb.textContent = {
            followers: 'Reads the app’s real follower totals — dash-faced until a platform reports.',
            viewers: 'Live concurrent viewers right now — a current reading, never a 30-day average.',
            subs: 'Counts subscription events the overlay sees this session, on top of the starting count.',
            sats: 'Tip events add their amount on top of the starting count (same naive leading-number rule as Tip Jar Mini).',
            custom: 'Manual counter — the starting count you set here is the value. You advance it.'
        }[goal.type] || '';
        config.appendChild(blurb);

        // Label
        var labelRow = document.createElement('div');
        labelRow.className = 'arcade-alert-row';
        var labelLabel = document.createElement('label');
        labelLabel.textContent = 'Label';
        labelRow.appendChild(labelLabel);
        var labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.autocomplete = 'off';
        labelInput.value = goal.label;
        labelInput.addEventListener('input', debounce(function () {
            goal.label = labelInput.value.slice(0, 60);
            saveGoals();
            renderGoalsList();
            queueGoalsPreviewReload();
        }, 300));
        labelRow.appendChild(labelInput);
        config.appendChild(labelRow);

        // Type
        var typeRow = document.createElement('div');
        typeRow.className = 'arcade-alert-row';
        var typeLabel = document.createElement('label');
        typeLabel.textContent = 'Type';
        typeRow.appendChild(typeLabel);
        var typeSelect = document.createElement('select');
        typeSelect.dataset.goalField = 'type';
        GOAL_TYPES.forEach(function (t) {
            var opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.label;
            typeSelect.appendChild(opt);
        });
        typeSelect.value = goal.type;
        typeSelect.addEventListener('change', function () {
            goal.type = typeSelect.value;
            saveGoals();
            renderGoalsList();
            renderGoalsConfig();
            initGoalsPreviewFrame();
        });
        typeRow.appendChild(typeSelect);
        config.appendChild(typeRow);

        // Platform (followers/viewers only)
        if (goal.type === 'followers' || goal.type === 'viewers') {
            var srcRow = document.createElement('div');
            srcRow.className = 'arcade-alert-row';
            var srcLabel = document.createElement('label');
            srcLabel.textContent = 'Platform';
            srcRow.appendChild(srcLabel);
            var srcSelect = document.createElement('select');
            srcSelect.dataset.goalField = 'source';
            [['', 'All platforms (summed)'], ['twitch', 'Twitch'], ['kick', 'Kick'], ['youtube', 'YouTube']].forEach(function (pair) {
                var opt = document.createElement('option');
                opt.value = pair[0];
                opt.textContent = pair[1];
                srcSelect.appendChild(opt);
            });
            srcSelect.value = goal.source;
            srcSelect.addEventListener('change', function () {
                goal.source = srcSelect.value;
                saveGoals();
                renderGoalsConfig();
                initGoalsPreviewFrame();
            });
            srcRow.appendChild(srcSelect);
            config.appendChild(srcRow);
        }

        // Target
        var targetRow = document.createElement('div');
        targetRow.className = 'arcade-alert-row';
        var targetLabel = document.createElement('label');
        targetLabel.textContent = 'Target';
        targetRow.appendChild(targetLabel);
        var targetInput = document.createElement('input');
        targetInput.type = 'number';
        targetInput.min = '1';
        targetInput.step = '1';
        targetInput.value = String(goal.target);
        targetInput.addEventListener('change', function () {
            var v = Math.max(1, Math.round(Number(targetInput.value) || 0));
            targetInput.value = String(v);
            goal.target = v;
            saveGoals();
            renderGoalsList();
            initGoalsPreviewFrame();
        });
        targetRow.appendChild(targetInput);
        config.appendChild(targetRow);

        // Starting count (subs/sats/custom)
        if (goal.type === 'subs' || goal.type === 'sats' || goal.type === 'custom') {
            var curRow = document.createElement('div');
            curRow.className = 'arcade-alert-row';
            var curLabel = document.createElement('label');
            curLabel.textContent = 'Starting count';
            curRow.appendChild(curLabel);
            var curInput = document.createElement('input');
            curInput.type = 'number';
            curInput.min = '0';
            curInput.step = '1';
            curInput.value = String(goal.current);
            curInput.title = 'Baked into the overlay URL — the overlay adds what it sees on top';
            curInput.addEventListener('change', function () {
                var v = Math.max(0, Math.round(Number(curInput.value) || 0));
                curInput.value = String(v);
                goal.current = v;
                saveGoals();
                initGoalsPreviewFrame();
            });
            curRow.appendChild(curInput);
            config.appendChild(curRow);
            var curHint = document.createElement('div');
            curHint.className = 'arcade-evt-cond__hint';
            curHint.textContent = 'Baked into the URL — after changing it, copy the overlay URL again for OBS.';
            config.appendChild(curHint);
        }

        // Fill color (optional style knob, scoped)
        var fillRow = document.createElement('div');
        fillRow.className = 'arcade-alert-row';
        var fillLabel = document.createElement('label');
        fillLabel.textContent = 'Fill color';
        fillRow.appendChild(fillLabel);
        var fillInput = document.createElement('input');
        fillInput.type = 'text';
        fillInput.autocomplete = 'off';
        fillInput.placeholder = '#35d0ff (default)';
        fillInput.value = goal.fill;
        fillInput.title = 'Any CSS color — rides the overlay’s own &fillcolor= param';
        fillInput.addEventListener('input', debounce(function () {
            goal.fill = fillInput.value.trim().slice(0, 40);
            saveGoals();
            queueGoalsPreviewReload();
        }, 300));
        fillRow.appendChild(fillInput);
        config.appendChild(fillRow);

        var doors = document.createElement('div');
        doors.className = 'arcade-evt-doors';
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'arcade-btn arcade-btn--sm arcade-evt-remove';
        removeBtn.textContent = 'Remove goal';
        removeBtn.addEventListener('click', function () {
            if (!removeBtn.dataset.armed) { // confirm-on-second-click, S47 idiom
                removeBtn.dataset.armed = '1';
                removeBtn.textContent = 'Click again to remove';
                setTimeout(function () {
                    removeBtn.dataset.armed = '';
                    if (document.body.contains(removeBtn)) removeBtn.textContent = 'Remove goal';
                }, 3000);
                return;
            }
            goalsDoc = goalsDoc.filter(function (g) { return g.id !== goal.id; });
            saveGoals();
            goalsSelectedId = goalsDoc.length ? goalsDoc[0].id : null;
            renderGoalsList();
            renderGoalsConfig();
            initGoalsPreviewFrame();
        });
        doors.appendChild(removeBtn);
        config.appendChild(doors);
    }

    // --------------------------------------------------------------------
    // Preview (isolated demo — goal-bar.html?demo=partial, ZERO network, no
    // session at all) and Copy overlay URL (the real session, never &demo) —
    // the ruled mirror pair.
    // --------------------------------------------------------------------
    var goalsPreviewTimer = null;

    function queueGoalsPreviewReload() {
        clearTimeout(goalsPreviewTimer);
        goalsPreviewTimer = setTimeout(initGoalsPreviewFrame, 500);
    }

    function goalParams(goal, forLive) {
        var params = [];
        params.push('type=' + encodeURIComponent(goal.type));
        params.push('label=' + encodeURIComponent(goal.label));
        params.push('target=' + encodeURIComponent(String(goal.target)));
        if (goal.source) params.push('source=' + encodeURIComponent(goal.source));
        if (goal.fill) params.push('fillcolor=' + encodeURIComponent(goal.fill));
        if (goal.type === 'subs' || goal.type === 'sats' || goal.type === 'custom') {
            params.push('current=' + encodeURIComponent(String(goal.current)));
        }
        if (!forLive) params.push('demo=partial'); // preview = zero-network demo of the look
        var langParams = (typeof window.getLanguageExtraParams === 'function') ? window.getLanguageExtraParams() : [];
        return params.concat(langParams);
    }

    function initGoalsPreviewFrame() {
        var frame = document.getElementById('arcade-goals-preview-frame');
        if (!frame) return;
        var goal = selectedGoal();
        if (!goal) { frame.removeAttribute('src'); return; }
        var resolver = window.resolveSocialStreamPage;
        if (typeof resolver !== 'function') return;
        // No session param at all — demo mode never joins anything (the
        // overlay's own honest no-session state is bypassed by &demo).
        resolver('goal-bar.html', { extraParams: goalParams(goal, false) }).then(function (resolved) {
            if (resolved && resolved.url) frame.src = resolved.url;
        }).catch(function (e) { console.error('[arcade-shell] goals preview resolve failed:', e); });
    }

    function buildGoalsOverlayUrl() {
        var resolver = window.resolveSocialStreamPage;
        if (typeof resolver !== 'function') return Promise.reject(new Error('overlay resolver unavailable'));
        var goal = selectedGoal();
        if (!goal) return Promise.reject(new Error('no goal selected'));
        function withSession(sessionId) {
            var params = [];
            if (sessionId) params.push('session=' + encodeURIComponent(sessionId));
            params = params.concat(goalParams(goal, true));
            return resolver('goal-bar.html', { extraParams: params }).then(function (resolved) {
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

    function copyGoalsOverlayUrl(btn) {
        if (!selectedGoal()) {
            setGoalsStatus('select a goal first', true);
            return;
        }
        buildGoalsOverlayUrl().then(function (url) {
            if (!url) throw new Error('no url');
            return copyToClipboard(url).then(function () { flashButton(btn, 'Copied ✓'); });
        }).catch(function (e) {
            console.error('[arcade-shell] copy goal overlay url failed:', e);
            flashButton(btn, 'Copy failed', 2200);
        });
    }

    // --------------------------------------------------------------------
    // S50 — FRAMES & CAMERAS + THE TIP JAR RAILS (TASK-47, ruled 0018.06.03
    // a₿; dispatch rider 2, base ebd3bd6). Design of record: the brief.
    //
    // LANE 1 — FRAMES & CAMERAS (this section). The gallery door now opens
    // this custom tab instead of the bare stock vdo page (the vdo tab
    // itself stays reachable via the More▾ hatch — and its vdo.html:356
    // base URL is repointed to the house instance this same task, one line,
    // mirror-mastered, exactly the scope the S41 gate's lane-4 report set).
    //
    //   ADD A DEVICE — the stock vdo.html page embedded as-is: it mints the
    //   stream ID in the BROWSER's localStorage and renders the house-VDO
    //   camera link + QR (post-repoint). Zero SSN storage — H11 by
    //   construction.
    //
    //   GUESTS — VDO's own room mechanics through links (SSN orchestrates
    //   URLs, it never proxies media). The room is DERIVED from the app's
    //   own session id (never stored by us — recomputed on every visit);
    //   each guest's push id is DERIVED from their name (a pure function).
    //   So settings hold NAMES ONLY — the HONESTY FENCE H11 (S41 lane 4,
    //   verbatim law): "the publish token lives in the guest's browser and
    //   URL; SSN stores destination NAMES only, never keys." The invite
    //   link (the publish credential) exists only ephemerally, for copying.
    //   Link shapes (vdo-ninja skill §3/§4, verified against docs.vdo.ninja):
    //     invite:  ?room=<room>&push=<slug>&webcam&label=<name>
    //     solo:    ?room=<room>&view=<slug>&solo&cleanoutput   (OBS embed)
    //
    //   FRAMES — border/style presets around any source. The mechanism is
    //   honestly CSS: the house workflow is Copy overlay URL → OBS browser
    //   source, and OBS's own Custom CSS box carries the frame (skill:
    //   "OBS browser-source CSS box works too"). No transport invented, no
    //   media touched. Gold #D9B24E is deliberately absent from the presets
    //   (money-only lock); live-green is absent too (LIVE lock).
    //
    // LANE 2 — THE TIP JAR RAILS (further below, its own section). PLACEMENT
    // LAW (ruled round 6): money configs live under the MONEY category of
    // Add-ons — Set up opens from the Money card, NEVER inside Frames &
    // Cameras. WALLET LAW (absolute): receive-side public strings ONLY.
    //
    // Settings keys minted (textparam1, canonical saveSetting via the S48
    // async saveGameSetting idiom — both panels host iframes, so writes can
    // land during frame churn; every getSettings read is sequenced BEFORE
    // the first iframe src is set, the same sendSync discipline):
    //   arcadeFrameGuests  JSON array of guest NAMES (nothing else — H11)
    //   arcadeFrameStyle   JSON {preset, color, width, radius} — style data
    //   arcadeTipRails     JSON {lightning, npub, lud16} — PUBLIC receive
    //                      strings / identifiers only (wallet law)
    // Reserved keys (arcadeAlertTiers/arcadeAlertVariants/arcadeStylePresets/
    // arcadeGameShelf/arcadeGameCmdSuffix/arcadeGameStyle/arcadePointsUnlocks/
    // arcadeGoals) untouched.
    // --------------------------------------------------------------------
    var HOUSE_VDO_BASE = 'https://vdo.pacsarcade.com/'; // S41 gate-scoped repoint — since TASK-66 the DEFAULT value of the VDO-instance setting, not the only value
    var STOCK_VDO_BASE = 'https://vdo.ninja/';          // Steve's hosted instance — always selectable
    var VDO_BASE_KEY = 'arcadeVdoBase';                 // NEW (TASK-66) — canonical setting: '' = house default, else a validated https URL
    var FRAMES_GUESTS_KEY = 'arcadeFrameGuests';
    var FRAME_STYLE_KEY = 'arcadeFrameStyle';
    var TIP_RAILS_KEY = 'arcadeTipRails';
    var FRAMES_DEVICE_KEY = '__device__';
    var FRAMES_STYLE_ZONE_KEY = '__frames__';
    var FRAMES_INVITE_KEY = '__invite__';
    var TIPJAR_RAILS_KEY = '__rails__';

    var FRAME_PRESETS = [
        { id: 'edge', name: 'Clean edge', color: '#33d6ff', width: 4, radius: 10 },
        { id: 'rounded', name: 'Soft rounded', color: '#e8eaf0', width: 2, radius: 24 },
        { id: 'shadow', name: 'Drop shadow', color: '#33d6ff', width: 0, radius: 12 },
        { id: 'pixel', name: 'Pixel', color: '#ff5ca8', width: 4, radius: 0 }
    ];
    var FRAME_PRESET_DEFAULT = 'edge';

    var frameGuests = [];            // names only, persisted
    var frameStyleDoc = { preset: FRAME_PRESET_DEFAULT, color: '#33d6ff', width: 4, radius: 10 };
    var tipRails = { lightning: '', npub: '', lud16: '' };
    var framesRoom = '';             // derived from the session id every visit — never persisted
    var framesVdoBaseSetting = '';   // '' = house default; else a validated https://…/ URL (the arcadeVdoBase setting)
    var framesSelectedKey = FRAMES_DEVICE_KEY;
    var framesScopedGuest = '';      // guest slug the Frames zone is scoped to ('' = any source)
    var tipjarSelectedKey = TIPJAR_RAILS_KEY;
    var framesPanelLive = false;
    var tipjarPanelLive = false;

    // --------------------------------------------------------------------
    // TASK-70 (Lane 2) — the GOAL JAR LOOK. One house doc (canonical
    // saveSetting, textparam1 — the same rail the games/jar docs ride)
    // carries the chosen jar style + optional own jar image; both compose
    // into the demo-isolated live preview AND the real-session copy URL.
    //
    // THE 5 LOOKS — stock ships 3 themes (tipjar.html:765 `// default, neon,
    // gold`, classes at :312-335); the 2 house looks are CSS-only, delivered
    // through stock's own &b64css param (featured.html:1573's block, the
    // same idiom the Style builder rides) plus stock's own fill/track URL
    // params (tipjar.html:796-809). Zero stock bytes touched.
    //
    // UPLOAD YOUR OWN — the jar's image slot is stock's &jarimage param
    // (tipjar.html:774, applied at :860 to #cup-overlay). Stock's own
    // in-page upload (:2274, &controls panel) is FileReader→data-URI→
    // localStorage — trapped on the machine/browser that uploaded it, so it
    // can never reach an OBS browser source. The HONEST mechanism here is
    // the app's existing local-media rail (the SAME one Event Flow's "Choose
    // Local File" uses — preload.js localMedia bridge → the app's local
    // media server): pick a file, get a http://127.0.0.1:<port>/media/<id>
    // URL, carry it on &jarimage=. OBS on this machine can load that.
    // --------------------------------------------------------------------
    var TIPJAR_STYLE_KEY = 'arcadeTipjarStyle';
    var tipjarStyle = { look: 'default', jarimage: '' };
    var TIPJAR_LOOKS = [
        { id: 'default', label: 'Classic', origin: 'stock', params: [] },
        { id: 'neon', label: 'Neon', origin: 'stock', params: ['theme=neon'] },
        { id: 'gold', label: 'Gold', origin: 'stock', params: ['theme=gold'] },
        {
            id: 'ice', label: 'Glacier', origin: 'house',
            params: ['fillstart=' + encodeURIComponent('#33d6ff'), 'fillend=' + encodeURIComponent('#7c5cff'), 'trackcolor=' + encodeURIComponent('#10131a'), 'barradius=14'],
            css: '#tip-text { color: #d8f4ff !important; text-shadow: 0 0 12px rgba(51, 214, 255, 0.65) !important; }\n' +
                '.goal-meter-container { border: 1px solid #33d6ff !important; box-shadow: 0 0 24px rgba(51, 214, 255, 0.35) !important; background: rgba(10, 16, 24, 0.85) !important; }'
        },
        {
            id: 'ember', label: 'Ember', origin: 'house',
            params: ['fillstart=' + encodeURIComponent('#ffb03c'), 'fillend=' + encodeURIComponent('#ff4455'), 'trackcolor=' + encodeURIComponent('#1a1010'), 'barradius=14'],
            css: '#tip-text { color: #ffe9d8 !important; text-shadow: 0 0 12px rgba(255, 68, 85, 0.6) !important; }\n' +
                '.goal-meter-container { border: 1px solid #ff9a3c !important; box-shadow: 0 0 24px rgba(255, 68, 85, 0.35) !important; background: rgba(24, 10, 10, 0.85) !important; }'
        }
    ];

    function tipjarLookById(id) {
        var found = TIPJAR_LOOKS[0];
        TIPJAR_LOOKS.forEach(function (l) { if (l.id === id) found = l; });
        return found;
    }

    // The look's full URL params (theme/fill/css + the uploaded jar image),
    // shared by the preview and the copy URL.
    function tipjarStyleUrlParams() {
        var look = tipjarLookById(tipjarStyle.look);
        var params = look.params.slice();
        if (look.css) params.push('b64css=' + encodeCssB64(look.css));
        if (tipjarStyle.jarimage) params.push('jarimage=' + encodeURIComponent(tipjarStyle.jarimage));
        return params;
    }

    // TASK-71 (item 6, H27 ruled) — BOTH jar doors, first-class, no
    // either/or picker: the card and the interior each carry two labeled
    // copy doors that NAME their target and echo what rode (the T68 copy
    // idiom). Both are real-session URLs, never the demo.
    function buildTipjarGoalOverlayUrl() {
        var el = elementCardById('tipjar');
        return loadTipjarStyleSettings().then(function () { return buildElementOverlayUrl(el, tipjarStyleUrlParams()); });
    }
    function buildTipjarVisualOverlayUrl() {
        // the Visual jar's own defaults live inline since the T70 merge —
        // the receive rails compose in.
        var el = { id: 'tipjar-mini', overlayPage: 'tipjar-mini.html', params: ['goal=100', 'label=Tip Jar', 'layout=full'] };
        return buildElementOverlayUrl(el, tipRailsUrlParams());
    }
    function copyTipjarUrl(which, btn) {
        var label = which === 'goal' ? 'Goal jar' : 'Visual jar';
        var p = which === 'goal' ? buildTipjarGoalOverlayUrl() : buildTipjarVisualOverlayUrl();
        p.then(function (url) {
            if (!url) throw new Error('no url');
            return copyToClipboard(url).then(function () { flashButton(btn, 'Copied ' + label + ' URL ✓'); });
        }).catch(function (e) {
            console.error('[arcade-shell] copy ' + which + ' jar url failed:', e);
            flashButton(btn, 'Copy failed', 2200);
        });
    }
    function buildTipjarCopyDoor(which, primary) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'arcade-btn arcade-btn--sm' + (primary ? ' arcade-btn--primary' : '');
        btn.textContent = which === 'goal' ? 'Copy Goal jar URL' : 'Copy Visual jar URL';
        btn.title = (which === 'goal'
            ? 'The stock tipjar.html overlay, real session, wearing the chosen jar look'
            : 'The lean house tipjar-mini overlay, real session, with your receive rails') + ' — never the demo';
        btn.addEventListener('click', function () { copyTipjarUrl(which, btn); });
        return btn;
    }

    function loadTipjarStyleSettings() {
        return new Promise(function (resolve) {
            try {
                if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                    window.ninjafy.sendMessage(null, { getSettings: true }, function (response) {
                        try {
                            var settings = (response && response.settings) || {};
                            var entry = settings[TIPJAR_STYLE_KEY];
                            var doc = null;
                            try { doc = JSON.parse((entry && typeof entry.textparam1 === 'string') ? entry.textparam1 : ''); } catch (e) { doc = null; }
                            if (doc && typeof doc === 'object') {
                                tipjarStyle = {
                                    look: TIPJAR_LOOKS.some(function (l) { return l.id === doc.look; }) ? doc.look : 'default',
                                    jarimage: typeof doc.jarimage === 'string' ? doc.jarimage.slice(0, 300) : ''
                                };
                            }
                        } catch (e) { console.error('[arcade-shell] tipjar style parse failed:', e); }
                        resolve();
                    });
                    return;
                }
            } catch (e) { console.error('[arcade-shell] tipjar style load failed:', e); }
            resolve();
        });
    }

    function saveTipjarStyle() { saveGameSetting(TIPJAR_STYLE_KEY, JSON.stringify(tipjarStyle)); }

    function setFramesStatus(text, isError) {
        var el = document.getElementById('arcade-frames-status');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-error', !!isError);
    }

    function setTipjarStatus(text, isError) {
        var el = document.getElementById('arcade-tipjar-status');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-error', !!isError);
    }

    function guestSlug(name) {
        return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
    }

    // TASK-66 — the VDO instance is a CHOICE, not a constant. Shape law:
    // https only, host (+optional port), root path. Anything else is refused
    // honestly — the composed links never carry a shape we didn't validate.
    function validateVdoBase(raw) {
        var v = String(raw || '').trim();
        if (!v) return '';
        if (v.length > 120) return null;
        if (!/^https:\/\/[a-z0-9.-]+(?::[0-9]{2,5})?\/?$/i.test(v)) return null;
        return v.replace(/\/?$/, '/');
    }

    function vdoBase() {
        return framesVdoBaseSetting || HOUSE_VDO_BASE;
    }

    function guestInviteUrl(name) {
        if (!framesRoom) return '';
        return vdoBase() + '?room=' + encodeURIComponent(framesRoom) +
            '&push=' + encodeURIComponent(guestSlug(name)) + '&webcam&label=' + encodeURIComponent(name);
    }

    function guestSoloUrl(name) {
        if (!framesRoom) return '';
        return vdoBase() + '?room=' + encodeURIComponent(framesRoom) +
            '&view=' + encodeURIComponent(guestSlug(name)) + '&solo&cleanoutput';
    }

    // The guest room rides the app's OWN session id — recomputed on every
    // visit, never written to settings. Rotate the session and the room (and
    // every outstanding invite) moves with it; the surface says so.
    function resolveFramesRoom() {
        return new Promise(function (resolve) {
            function done(id) {
                var clean = String(id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                framesRoom = clean ? ('ssn-' + clean.slice(0, 32)) : '';
                resolve();
            }
            try {
                if (typeof window.getChatDockSessionId === 'function') {
                    Promise.resolve(window.getChatDockSessionId()).then(done, function () { done(null); });
                    return;
                }
            } catch (e) { /* fall through */ }
            done(null);
        });
    }

    function loadFramesSettings() {
        return new Promise(function (resolve) {
            try {
                if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                    window.ninjafy.sendMessage(null, { getSettings: true }, function (response) {
                        try {
                            var settings = (response && response.settings) || {};
                            var guestsEntry = settings[FRAMES_GUESTS_KEY];
                            var guestsDoc = null;
                            try { guestsDoc = JSON.parse((guestsEntry && typeof guestsEntry.textparam1 === 'string') ? guestsEntry.textparam1 : ''); } catch (e) { guestsDoc = null; }
                            frameGuests = (Array.isArray(guestsDoc) ? guestsDoc : []).filter(function (n) {
                                return typeof n === 'string' && guestSlug(n);
                            }).map(function (n) { return n.slice(0, 40); });
                            var styleEntry = settings[FRAME_STYLE_KEY];
                            var styleDoc = null;
                            try { styleDoc = JSON.parse((styleEntry && typeof styleEntry.textparam1 === 'string') ? styleEntry.textparam1 : ''); } catch (e) { styleDoc = null; }
                            if (styleDoc && typeof styleDoc === 'object') {
                                frameStyleDoc = {
                                    preset: FRAME_PRESETS.some(function (p) { return p.id === styleDoc.preset; }) ? styleDoc.preset : FRAME_PRESET_DEFAULT,
                                    color: typeof styleDoc.color === 'string' && styleDoc.color ? styleDoc.color.slice(0, 40) : '#33d6ff',
                                    width: Math.max(0, Math.min(16, Math.round(Number(styleDoc.width) || 0))),
                                    radius: Math.max(0, Math.min(32, Math.round(Number(styleDoc.radius) || 0)))
                                };
                            }
                            var vdoEntry = settings[VDO_BASE_KEY];
                            var vdoRaw = (vdoEntry && typeof vdoEntry.textparam1 === 'string') ? vdoEntry.textparam1 : '';
                            var vdoValid = validateVdoBase(vdoRaw);
                            framesVdoBaseSetting = (vdoValid === null) ? '' : vdoValid; // a corrupt stored shape falls back to the house default honestly
                        } catch (e) { console.error('[arcade-shell] frames settings parse failed:', e); }
                        resolve();
                    });
                    return;
                }
            } catch (e) { console.error('[arcade-shell] frames settings load failed:', e); }
            setFramesStatus('settings bridge unavailable — edits will not persist', true);
            resolve();
        });
    }

    function loadTipRailsSettings() {
        return new Promise(function (resolve) {
            try {
                if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                    window.ninjafy.sendMessage(null, { getSettings: true }, function (response) {
                        try {
                            var settings = (response && response.settings) || {};
                            var entry = settings[TIP_RAILS_KEY];
                            var doc = null;
                            try { doc = JSON.parse((entry && typeof entry.textparam1 === 'string') ? entry.textparam1 : ''); } catch (e) { doc = null; }
                            if (doc && typeof doc === 'object') {
                                tipRails = {
                                    lightning: typeof doc.lightning === 'string' ? doc.lightning.slice(0, 200) : '',
                                    npub: typeof doc.npub === 'string' ? doc.npub.slice(0, 120) : '',
                                    lud16: typeof doc.lud16 === 'string' ? doc.lud16.slice(0, 120) : ''
                                };
                            }
                        } catch (e) { console.error('[arcade-shell] tip rails parse failed:', e); }
                        resolve();
                    });
                    return;
                }
            } catch (e) { console.error('[arcade-shell] tip rails load failed:', e); }
            setTipjarStatus('settings bridge unavailable — edits will not persist', true);
            resolve();
        });
    }

    function saveFrameGuests() { saveGameSetting(FRAMES_GUESTS_KEY, JSON.stringify(frameGuests)); }
    function saveFrameStyle() { saveGameSetting(FRAME_STYLE_KEY, JSON.stringify(frameStyleDoc)); }
    function saveTipRails() { saveGameSetting(TIP_RAILS_KEY, JSON.stringify(tipRails)); }

    // Wallet law tripwire (absolute): receive-side public strings ONLY. If a
    // pasted value smells like a SECRET (a nostr private key, a wallet-connect
    // string), the whole save is refused with the honest line — nothing that
    // can sign is ever persisted.
    function tipRailsSecretSmell(value) {
        return /nsec1/i.test(value) || /nostr\+walletconnect/i.test(value);
    }

    function tipRailsUrlParams() {
        var params = [];
        if (tipRails.lightning) params.push('lightning=' + encodeURIComponent(tipRails.lightning));
        if (tipRails.lud16) params.push('zaplud16=' + encodeURIComponent(tipRails.lud16));
        if (tipRails.npub) params.push('zapnpub=' + encodeURIComponent(tipRails.npub));
        return params;
    }

    // ---- Lane 1 panel ------------------------------------------------------
    function buildFramesPanel() {
        var panel = document.createElement('section');
        panel.className = 'arcade-frames';
        panel.setAttribute('aria-label', 'Frames and cameras');
        panel.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title">FRAMES &amp; CAMERAS</span>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-alerts-status" id="arcade-frames-status"></span>' +
            '</div>' +
            '<div class="arcade-alerts-body">' +
            '<div class="arcade-evt-list-col">' +
            '<div class="arcade-evt-list" id="arcade-frames-list" role="listbox" aria-label="Cameras and guests"></div>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-guest-add">+ Invite a guest</button>' +
            '</div>' +
            '<div class="arcade-alerts-stage">' +
            '<div class="arcade-evt-config" id="arcade-frames-config"></div>' +
            '</div>' +
            '</div>';
        document.body.appendChild(panel);

        panel.querySelector('#arcade-guest-add').addEventListener('click', function () {
            selectFramesKey(FRAMES_INVITE_KEY);
            var nameInput = document.getElementById('arcade-guest-name');
            if (nameInput) nameInput.focus(); // H17-B — focus lands IN the destination form
        });
        attachArcadeListboxNav(panel.querySelector('#arcade-frames-list'), '[data-arcade-frames-key]',
            function () { return framesSelectedKey; }, selectFramesKey,
            function (row) { return row.dataset.arcadeFramesKey; });
    }

    function ensureFramesPanelLive() {
        // Re-entry IS a surface render (S47B doctrine): re-read every visit.
        // Order matters (S48 sendSync trap): the sync-IPC settings reads AND
        // the room resolution all land BEFORE any iframe src is set — the
        // device frame only appears inside renderFramesConfig().
        loadFramesSettings().then(function () {
            return resolveFramesRoom();
        }).then(function () {
            framesPanelLive = true;
            renderFramesList();
            renderFramesConfig();
        });
    }

    function buildFramesListRow(opts) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'arcade-evt-item' + (opts.sub ? ' arcade-evt-item--sub' : '');
        row.dataset.arcadeFramesKey = opts.key;
        row.setAttribute('role', 'option');
        var selected = framesSelectedKey === opts.key;
        row.classList.toggle('is-on', selected);
        row.setAttribute('aria-selected', String(selected));
        var label = document.createElement('span');
        label.className = 'arcade-evt-item__label';
        label.textContent = (opts.icon ? opts.icon + ' ' : '') + opts.label;
        row.appendChild(label);
        if (opts.stateText) {
            var state = document.createElement('span');
            state.className = 'arcade-evt-state arcade-evt-state--off';
            state.textContent = opts.stateText;
            row.appendChild(state);
        }
        row.addEventListener('click', function () { selectFramesKey(opts.key); });
        return row;
    }

    function renderFramesList() {
        var list = document.getElementById('arcade-frames-list');
        if (!list) return;
        list.innerHTML = '';
        // TASK-68 (WALK 2A item 9) — "Add a device" and "Frames" fold under
        // ONE left entry (the nesting the Admiral drew): a collapsible
        // Camera & frames group, expanded by default, sub-rows indented.
        // The group head is a disclosure control, NOT a listbox option —
        // arrow-walking still lands only on real destinations.
        var group = document.createElement('button');
        group.type = 'button';
        group.className = 'arcade-evt-item arcade-frames-grouphead';
        group.setAttribute('aria-expanded', list.dataset.framesGroupOpen !== '0' ? 'true' : 'false');
        group.setAttribute('aria-label', 'Camera and frames — fold or unfold the group');
        var groupLabel = document.createElement('span');
        groupLabel.className = 'arcade-evt-item__label';
        groupLabel.textContent = '📷 Camera & frames';
        group.appendChild(groupLabel);
        var chevron = document.createElement('span');
        chevron.className = 'arcade-frames-grouphead__chev';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = list.dataset.framesGroupOpen !== '0' ? '▾' : '▸';
        group.appendChild(chevron);
        list.appendChild(group);
        var subs = document.createElement('div');
        subs.className = 'arcade-frames-groupsubs';
        subs.hidden = list.dataset.framesGroupOpen === '0';
        subs.appendChild(buildFramesListRow({ key: FRAMES_DEVICE_KEY, icon: '➕', label: 'Add a device', sub: true }));
        subs.appendChild(buildFramesListRow({ key: FRAMES_STYLE_ZONE_KEY, icon: '🖼', label: 'Frames', sub: true }));
        list.appendChild(subs);
        group.addEventListener('click', function () {
            var open = list.dataset.framesGroupOpen !== '0';
            list.dataset.framesGroupOpen = open ? '0' : '1';
            subs.hidden = open;
            group.setAttribute('aria-expanded', String(!open));
            chevron.textContent = open ? '▸' : '▾';
        });
        var guestsHeader = document.createElement('div');
        guestsHeader.className = 'arcade-evt-group__title';
        guestsHeader.textContent = 'Guests';
        list.appendChild(guestsHeader);
        frameGuests.forEach(function (name) {
            list.appendChild(buildFramesListRow({ key: guestSlug(name), icon: '🎥', label: name, stateText: 'invited' }));
        });
        if (!frameGuests.length) {
            var none = document.createElement('div');
            none.className = 'arcade-frames-empty';
            none.textContent = 'No guests yet — an invite link mints from a name.';
            list.appendChild(none);
        }
    }

    function selectFramesKey(key) {
        framesSelectedKey = key;
        renderFramesList();
        renderFramesConfig();
    }

    function renderFramesConfig() {
        var host = document.getElementById('arcade-frames-config');
        if (!host) return;
        host.innerHTML = '';
        if (framesSelectedKey === FRAMES_DEVICE_KEY) { renderFramesDeviceConfig(host); return; }
        if (framesSelectedKey === FRAMES_INVITE_KEY) { renderFramesInviteConfig(host); return; }
        if (framesSelectedKey === FRAMES_STYLE_ZONE_KEY) { renderFramesStyleConfig(host); return; }
        var guestName = null;
        frameGuests.forEach(function (n) { if (guestSlug(n) === framesSelectedKey) guestName = n; });
        if (guestName) { renderFramesGuestConfig(host, guestName); return; }
        // Stale selection (guest removed elsewhere) — fall back honestly.
        framesSelectedKey = FRAMES_DEVICE_KEY;
        renderFramesList();
        renderFramesDeviceConfig(host);
    }

    // TASK-68 (WALK 2A item 9) — the embedded camera page FILLS the pane:
    // the frame is sized to its content's real height (same-origin measure,
    // re-measured on content resize), so the PANE scrolls and the frame
    // never grows its own inner scrollbar. Cross-origin/hosted frames keep
    // the CSS fallback height honestly (can't measure what we can't reach).
    function fitArcadeFrameToContent(frame) {
        if (!frame) return;
        var apply = function () {
            try {
                var doc = frame.contentDocument;
                if (!doc || !doc.documentElement) return;
                // TASK-69: popup.html pins html/body to height:100%, so
                // scrollHeight RATCHETS (never drops below the current frame
                // height — collapsing a berthed group left dead space). The
                // berthed root's own box is the honest content height.
                var root = doc.getElementById('arcade-deck-popup-root');
                var h = root
                    ? Math.ceil(root.getBoundingClientRect().height) + 12
                    : Math.max(
                        doc.documentElement.scrollHeight || 0,
                        doc.body ? doc.body.scrollHeight : 0
                    );
                h = Math.max(h, 360); // never collapse to nothing — the honest floor
                // only write on a real change — a redundant write re-feeds the observer
                if (Math.abs((parseFloat(frame.style.height) || 0) - h) > 2) frame.style.height = h + 'px';
            } catch (e) { /* cross-origin — the CSS fallback stands */ }
        };
        apply();
        try {
            var doc = frame.contentDocument;
            if (doc && doc.body && typeof MutationObserver === 'function') {
                // TASK-69: the re-measure trigger is a MutationObserver, NOT a
                // ResizeObserver. An RO on the embedded body pairs with the
                // height write as a feedback loop in Chromium's delivery
                // cycle — every frames-tab visit spammed ~180 "ResizeObserver
                // loop completed with undelivered notifications" errors
                // (caught by the console census). Content changes are what
                // actually matter (collapsibles, popup.js late injects), and
                // those are mutations. rAF-throttled + deduped writes.
                var pending = false;
                var schedule = function () {
                    if (pending) return;
                    pending = true;
                    requestAnimationFrame(function () { pending = false; apply(); });
                };
                var mo = new MutationObserver(schedule);
                mo.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
                // stock's collapsibles flip display via :checked — a pure CSS
                // state change, invisible to the MutationObserver. Any click
                // inside the embed re-fits (after the 0.25s transition).
                doc.addEventListener('click', function () {
                    schedule();
                    setTimeout(apply, 450);
                });
                // pure reflow without a mutation (window narrowed, text wraps
                // taller) — the shell window's resize is the signal.
                window.addEventListener('resize', schedule);
            }
        } catch (e) { /* noop */ }
    }

    function renderFramesDeviceConfig(host) {
        var title = document.createElement('div');
        title.className = 'arcade-evt-cond__title';
        title.textContent = 'Add a device — phone, tablet, remote cam';
        host.appendChild(title);
        var hint = document.createElement('p');
        hint.className = 'arcade-style-hint';
        hint.textContent = 'Open the camera link on the device (or scan the QR) and it starts broadcasting; the OBS link is the receive side for your browser source. Links ride your chosen VDO instance (' + vdoBase() + ' — Deck Settings → Connections).';
        host.appendChild(hint);
        var frameWrap = document.createElement('div');
        frameWrap.className = 'arcade-frames-device';
        var frame = document.createElement('iframe');
        frame.id = 'arcade-frames-device-frame';
        frame.title = 'Add a device — house VDO camera link and QR';
        frameWrap.appendChild(frame);
        host.appendChild(frameWrap);
        var resolver = window.resolveSocialStreamPage;
        if (typeof resolver === 'function') {
            // TASK-66 — the embedded vdo page reads &base= (validated there,
            // falling back to its built-in house default); the page mints its
            // own publish id, so its links/QR are masked by the same dress.
            resolver('vdo.html', { extraParams: ['base=' + encodeURIComponent(vdoBase())] }).then(function (resolved) {
                if (resolved && resolved.url) {
                    frame.dataset.ssappOrigin = resolved.origin || '';
                    frame.addEventListener('load', function () {
                        injectDressIntoFrame(frame, 'arcade-dress-vdo', DRESS_VDO_CSS);
                        maskSessionIdSurfaces(frame.contentDocument, null);
                        wireArcadeNavFrame(frame); // TASK-68 — mouse back/forward inside the embed drives the shell stack
                        fitArcadeFrameToContent(frame); // TASK-68 — the frame FILLS the pane; the pane scrolls, never the frame
                        frame.classList.add('is-live'); // TASK-68 — hidden until dress + first mask pass (no unmasked first paint)
                    });
                    frame.src = resolved.url;
                }
            }).catch(function (e) { console.error('[arcade-shell] device page resolve failed:', e); });
        }
        // HONESTY FENCE H11 (S41 lane 4, verbatim law) — carried on the UI.
        var note = document.createElement('p');
        note.className = 'arcade-frames-honest';
        note.textContent = 'Honesty note: the device’s publish token lives in your browser and in the VDO link itself — SSN stores nothing about it, never keys.';
        host.appendChild(note);
    }

    function renderFramesInviteConfig(host) {
        var title = document.createElement('div');
        title.className = 'arcade-evt-cond__title';
        title.textContent = 'Invite a guest';
        host.appendChild(title);
        var hint = document.createElement('p');
        hint.className = 'arcade-style-hint';
        hint.textContent = 'The name mints the link: their invite and their solo view URL both derive from it, so only the name is ever stored.';
        host.appendChild(hint);
        var row = document.createElement('div');
        row.className = 'arcade-frames-linkrow';
        var input = document.createElement('input');
        input.type = 'text';
        input.id = 'arcade-guest-name';
        input.autocomplete = 'off';
        input.placeholder = 'Guest name (e.g. Jess)';
        input.setAttribute('aria-label', 'Guest name');
        row.appendChild(input);
        var createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        createBtn.textContent = 'Create invite';
        createBtn.addEventListener('click', function () { inviteGuest(input.value); });
        row.appendChild(createBtn);
        host.appendChild(row);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); inviteGuest(input.value); }
        });
    }

    function inviteGuest(rawName) {
        var name = String(rawName || '').trim().slice(0, 40);
        var slug = guestSlug(name);
        if (!slug) {
            setFramesStatus('the name needs at least one letter or digit — it mints the link', true);
            return;
        }
        var dupe = frameGuests.some(function (n) { return guestSlug(n) === slug; });
        if (dupe) {
            setFramesStatus('a guest with that link-name is already listed — names mint their links', true);
            return;
        }
        frameGuests.push(name);
        saveFrameGuests();
        framesSelectedKey = slug;
        renderFramesList();
        renderFramesConfig();
        setFramesStatus('invite minted for "' + name + '"');
        var rowEl = document.querySelector('#arcade-frames-list [data-arcade-frames-key="' + slug + '"]');
        if (rowEl) rowEl.focus(); // a pick — focus lands on the new row, not the trigger
    }

    function renderFramesGuestConfig(host, name) {
        var title = document.createElement('div');
        title.className = 'arcade-evt-cond__title';
        title.textContent = '🎥 ' + name;
        host.appendChild(title);
        if (!framesRoom) {
            var noSession = document.createElement('p');
            noSession.className = 'arcade-frames-honest';
            noSession.textContent = 'Guest rooms derive from your SSN session — connect one and the links mint here.';
            host.appendChild(noSession);
        } else {
            host.appendChild(buildFramesLinkRow('Invite link (send to the guest)', guestInviteUrl(name), 'Copy invite link'));
            host.appendChild(buildFramesLinkRow('Solo view (their camera, for OBS)', guestSoloUrl(name), 'Add to stream'));
        }
        var actions = document.createElement('div');
        actions.className = 'arcade-frames-actions';
        var frameBtn = document.createElement('button');
        frameBtn.type = 'button';
        frameBtn.className = 'arcade-btn arcade-btn--sm';
        frameBtn.textContent = 'Frame this camera';
        frameBtn.addEventListener('click', function () {
            framesScopedGuest = guestSlug(name);
            selectFramesKey(FRAMES_STYLE_ZONE_KEY);
        });
        actions.appendChild(frameBtn);
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'arcade-btn arcade-btn--sm';
        removeBtn.textContent = 'Remove guest';
        removeBtn.addEventListener('click', function () {
            if (removeBtn.dataset.confirm !== '1') { // two-click confirm, S47 idiom
                removeBtn.dataset.confirm = '1';
                removeBtn.textContent = 'Click again to remove';
                return;
            }
            frameGuests = frameGuests.filter(function (n) { return guestSlug(n) !== guestSlug(name); });
            saveFrameGuests();
            if (framesScopedGuest === guestSlug(name)) framesScopedGuest = '';
            framesSelectedKey = FRAMES_DEVICE_KEY;
            renderFramesList();
            renderFramesConfig();
            setFramesStatus('"' + name + '" removed — their invite link stops being listed here');
        });
        actions.appendChild(removeBtn);
        host.appendChild(actions);
        // HONESTY FENCE H11 (S41 lane 4, verbatim law) — carried on the UI.
        var note = document.createElement('p');
        note.className = 'arcade-frames-honest';
        note.textContent = 'Honesty note: the publish token lives in your guest’s browser and in their invite link — SSN stores their name only, never keys. Guests join through VDO’s own room; SSN orchestrates the links, it never touches the media.';
        host.appendChild(note);
    }

    function buildFramesLinkRow(labelText, url, ctaText) {
        var wrap = document.createElement('div');
        wrap.className = 'arcade-frames-linkblock';
        var label = document.createElement('div');
        label.className = 'arcade-evt-cond__label';
        label.textContent = labelText;
        wrap.appendChild(label);
        var row = document.createElement('div');
        row.className = 'arcade-frames-linkrow';
        var input = document.createElement('input');
        input.type = 'text';
        input.readOnly = true;
        input.value = url;
        input.setAttribute('aria-label', labelText + ' — hidden, focus or hover to reveal, click to copy');
        input.title = 'Click to copy';
        // TASK-66 — the room inside these links derives from the session id,
        // so the whole link goes quiet (the copy still carries the real one).
        input.classList.add('arcade-masked-value');
        input.addEventListener('click', function () {
            copyToClipboard(url).then(function () { setFramesStatus('Copied ✓ — ' + labelText.toLowerCase()); });
        });
        row.appendChild(input);
        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        copyBtn.textContent = ctaText;
        copyBtn.addEventListener('click', function () {
            copyToClipboard(url).then(function () { flashButton(copyBtn, 'Copied ✓'); }, function () { flashButton(copyBtn, 'Copy failed', 2200); });
        });
        row.appendChild(copyBtn);
        wrap.appendChild(row);
        return wrap;
    }

    function renderFramesStyleConfig(host) {
        var scopedName = null;
        frameGuests.forEach(function (n) { if (guestSlug(n) === framesScopedGuest) scopedName = n; });
        var title = document.createElement('div');
        title.className = 'arcade-evt-cond__title';
        title.textContent = 'Frames — border & style presets';
        host.appendChild(title);
        var scope = document.createElement('p');
        scope.className = 'arcade-style-hint';
        scope.textContent = scopedName
            ? ('Framing: ' + scopedName + '’s camera — pair the CSS with their solo link (the guest row has it).')
            : 'Framing: any camera or source — the CSS rides the OBS browser source, so it frames whatever you point it at.';
        host.appendChild(scope);

        var presetsRow = document.createElement('div');
        presetsRow.className = 'arcade-frames-presets';
        presetsRow.setAttribute('role', 'group');
        presetsRow.setAttribute('aria-label', 'Frame presets');
        FRAME_PRESETS.forEach(function (preset) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'arcade-btn arcade-btn--sm';
            btn.textContent = preset.name;
            btn.setAttribute('aria-pressed', String(frameStyleDoc.preset === preset.id));
            btn.addEventListener('click', function () {
                frameStyleDoc.preset = preset.id;
                frameStyleDoc.color = preset.color;
                frameStyleDoc.width = preset.width;
                frameStyleDoc.radius = preset.radius;
                saveFrameStyle();
                renderFramesConfig();
            });
            presetsRow.appendChild(btn);
        });
        host.appendChild(presetsRow);

        host.appendChild(buildFrameStyleField('Border color', 'text', frameStyleDoc.color, '#33d6ff', '', function (v) {
            frameStyleDoc.color = v.slice(0, 40) || '#33d6ff';
        }));
        host.appendChild(buildFrameStyleField('Border width (px)', 'number', String(frameStyleDoc.width), '4', '16', function (v) {
            frameStyleDoc.width = Math.max(0, Math.min(16, Math.round(Number(v) || 0)));
        }));
        host.appendChild(buildFrameStyleField('Corner radius (px)', 'number', String(frameStyleDoc.radius), '10', '32', function (v) {
            frameStyleDoc.radius = Math.max(0, Math.min(32, Math.round(Number(v) || 0)));
        }));

        var actions = document.createElement('div');
        actions.className = 'arcade-frames-actions';
        var copyCssBtn = document.createElement('button');
        copyCssBtn.type = 'button';
        copyCssBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        copyCssBtn.textContent = 'Copy frame CSS';
        copyCssBtn.addEventListener('click', function () {
            copyToClipboard(frameCssText()).then(function () { flashButton(copyCssBtn, 'Copied ✓'); }, function () { flashButton(copyCssBtn, 'Copy failed', 2200); });
        });
        actions.appendChild(copyCssBtn);
        if (scopedName && framesRoom) {
            var copySoloBtn = document.createElement('button');
            copySoloBtn.type = 'button';
            copySoloBtn.className = 'arcade-btn arcade-btn--sm';
            copySoloBtn.textContent = 'Copy solo link';
            copySoloBtn.addEventListener('click', function () {
                copyToClipboard(guestSoloUrl(scopedName)).then(function () { flashButton(copySoloBtn, 'Copied ✓'); }, function () { flashButton(copySoloBtn, 'Copy failed', 2200); });
            });
            actions.appendChild(copySoloBtn);
        }
        host.appendChild(actions);
        var how = document.createElement('p');
        how.className = 'arcade-frames-honest';
        how.textContent = 'How it lands: OBS browser source → Properties → Custom CSS — paste the frame CSS there. The frame rides the source; the room never sees it.';
        host.appendChild(how);
    }

    function buildFrameStyleField(labelText, type, value, placeholder, max, apply) {
        var wrap = document.createElement('div');
        wrap.className = 'arcade-frames-field';
        var label = document.createElement('label');
        label.textContent = labelText;
        var input = document.createElement('input');
        input.type = type;
        input.autocomplete = 'off';
        input.value = value;
        input.placeholder = placeholder;
        if (type === 'number') { input.min = '0'; input.max = max || '32'; }
        label.appendChild(input);
        wrap.appendChild(label);
        input.addEventListener('input', debounce(function () {
            apply(input.value.trim());
            saveFrameStyle();
        }, 400));
        return wrap;
    }

    function frameCssText() {
        var st = frameStyleDoc;
        var decls = 'box-sizing: border-box !important;';
        if (st.width > 0) decls += ' border: ' + st.width + 'px ' + (st.preset === 'pixel' ? 'dashed' : 'solid') + ' ' + st.color + ' !important;';
        if (st.radius > 0) decls += ' border-radius: ' + st.radius + 'px !important;';
        if (st.preset === 'shadow') decls += ' filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.55)) !important;';
        if (st.preset === 'pixel') decls += ' image-rendering: pixelated !important;';
        return 'html, body { background: transparent !important; margin: 0 !important; }\nvideo { ' + decls + ' }';
    }

    // ---- Lane 2 — THE TIP JAR RAILS -----------------------------------------
    // PLACEMENT LAW (ruled round 6): money configs live under the MONEY
    // category of Add-ons — this interior opens from the Money cards' Set up
    // button, NEVER inside Frames & Cameras or any other surface.
    // WALLET LAW (absolute): receive-side public strings ONLY — no keys, no
    // wallet-connect secrets, no NWC, nothing that signs. The rails RENDER
    // on the jar overlay (tipjar-mini.html, extended this task — not a third
    // jar): the lightning address/LNURL becomes a QR + link, the zap
    // identifiers become text lines. Platform tips stay the legacy rail.
    function buildTipjarPanel() {
        var panel = document.createElement('section');
        panel.className = 'arcade-tipjar';
        panel.setAttribute('aria-label', 'Tip jar');
        panel.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title">TIP JAR</span>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-alerts-status" id="arcade-tipjar-status"></span>' +
            '</div>' +
            '<div class="arcade-alerts-body">' +
            '<div class="arcade-evt-list-col">' +
            '<div class="arcade-evt-list" id="arcade-tipjar-list" role="listbox" aria-label="Tip jar setup"></div>' +
            '</div>' +
            '<div class="arcade-alerts-stage">' +
            '<div class="arcade-evt-config" id="arcade-tipjar-config"></div>' +
            '</div>' +
            '</div>';
        document.body.appendChild(panel);
        attachArcadeListboxNav(panel.querySelector('#arcade-tipjar-list'), '[data-arcade-tipjar-key]',
            function () { return tipjarSelectedKey; }, selectTipjarKey,
            function (row) { return row.dataset.arcadeTipjarKey; });
    }

    function ensureTipjarPanelLive() {
        // Re-entry re-reads (S47B doctrine); the sync-IPC settings read lands
        // BEFORE any preview iframe src is set (S48 sendSync discipline).
        loadTipRailsSettings().then(function () {
            return loadTipjarStyleSettings(); // TASK-70 (Lane 2) — the jar look doc
        }).then(function () {
            tipjarPanelLive = true;
            renderTipjarList();
            renderTipjarConfig();
        });
    }

    function buildTipjarListRow(opts) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'arcade-evt-item';
        row.dataset.arcadeTipjarKey = opts.key;
        row.setAttribute('role', 'option');
        var selected = tipjarSelectedKey === opts.key;
        row.classList.toggle('is-on', selected);
        row.setAttribute('aria-selected', String(selected));
        var label = document.createElement('span');
        label.className = 'arcade-evt-item__label';
        label.textContent = (opts.icon ? opts.icon + ' ' : '') + opts.label;
        row.appendChild(label);
        if (opts.stateText) {
            var state = document.createElement('span');
            state.className = 'arcade-evt-state arcade-evt-state--off';
            state.textContent = opts.stateText;
            row.appendChild(state);
        }
        row.addEventListener('click', function () { selectTipjarKey(opts.key); });
        return row;
    }

    function renderTipjarList() {
        var list = document.getElementById('arcade-tipjar-list');
        if (!list) return;
        list.innerHTML = '';
        list.appendChild(buildTipjarListRow({ key: TIPJAR_RAILS_KEY, icon: '⚡', label: 'Payment rails', stateText: 'set up' }));
        var jarsHeader = document.createElement('div');
        jarsHeader.className = 'arcade-evt-group__title';
        jarsHeader.textContent = 'Jars';
        list.appendChild(jarsHeader);
        // TASK-70 (Lane 2) — the Admiral: "tips and tips mini jar are the
        // same menu, one is a goal and one is a visual." One interior, both
        // jars, renamed to what they ARE.
        list.appendChild(buildTipjarListRow({ key: 'tipjar', label: 'Goal jar', stateText: 'stock tipjar.html' }));
        list.appendChild(buildTipjarListRow({ key: 'tipjar-mini', label: 'Visual jar', stateText: 'rails render here' }));
    }

    function selectTipjarKey(key) {
        tipjarSelectedKey = key;
        renderTipjarList();
        renderTipjarConfig();
    }

    function renderTipjarConfig() {
        var host = document.getElementById('arcade-tipjar-config');
        if (!host) return;
        host.innerHTML = '';
        if (tipjarSelectedKey === 'tipjar-mini') { renderTipjarMiniConfig(host); return; }
        if (tipjarSelectedKey === 'tipjar') { renderTipjarStockConfig(host); return; }
        renderTipjarRailsConfig(host);
    }

    function renderTipjarRailsConfig(host) {
        var title = document.createElement('div');
        title.className = 'arcade-evt-cond__title';
        title.textContent = 'Payment rails — Set up';
        host.appendChild(title);
        var legacy = document.createElement('p');
        legacy.className = 'arcade-style-hint';
        legacy.textContent = 'Platform tips (superchats, bits, Ko-fi / Fourthwall webhooks) keep counting exactly as they always have — the legacy rail needs no setup. These rails render on the Visual jar.';
        host.appendChild(legacy);

        host.appendChild(buildTipjarRailField('Lightning address / LNURL', 'lightning', tipRails.lightning,
            'you@wallet.com or LNURL1…',
            'A public receive string — rendered as a QR + link on the Visual jar.'));
        host.appendChild(buildTipjarRailField('Zaps (nostr) — npub', 'npub', tipRails.npub,
            'npub1…',
            'A public identifier — shown as a zap line on the jar.'));
        host.appendChild(buildTipjarRailField('Zaps — lud16 address', 'lud16', tipRails.lud16,
            'you@wallet.com',
            'The human-readable zap address — shown as a zap line on the jar.'));

        // WALLET LAW (absolute) — carried on the UI, enforced on the save.
        var note = document.createElement('p');
        note.className = 'arcade-frames-honest';
        note.textContent = 'Receive-side public strings only. No keys, no wallet-connect strings, nothing that signs — nothing here can send. Settlement truth stays with your payment provider; the jar only renders where tips can reach you.';
        host.appendChild(note);
    }

    function buildTipjarRailField(labelText, field, value, placeholder, hintText) {
        var wrap = document.createElement('div');
        wrap.className = 'arcade-frames-field arcade-tipjar-rail';
        var label = document.createElement('label');
        label.textContent = labelText;
        var input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.value = value;
        input.placeholder = placeholder;
        input.dataset.arcadeRailField = field;
        label.appendChild(input);
        wrap.appendChild(label);
        var hint = document.createElement('div');
        hint.className = 'arcade-tipjar-rail__hint';
        hint.textContent = hintText;
        wrap.appendChild(hint);
        input.addEventListener('input', debounce(function () {
            var clean = input.value.trim();
            if (tipRailsSecretSmell(clean)) {
                setTipjarStatus('that looks like a SECRET — receive-side public strings only; it was not saved', true);
                return; // the wallet-law tripwire: refuse, save nothing
            }
            tipRails[field] = clean;
            saveTipRails();
            setTipjarStatus('rails saved — they render on the Visual jar');
            if (tipjarSelectedKey === 'tipjar-mini') initTipjarPreviewFrame();
        }, 500));
        return wrap;
    }

    // TASK-70 — renamed from tipjarCardElement (S50): a generic ELEMENTS
    // finder now that featured/music/hype/map ride it too.
    function elementCardById(id) {
        var found = null;
        ELEMENTS.forEach(function (el) { if (el.id === id) found = el; });
        return found;
    }

    function renderTipjarMiniConfig(host) {
        var title = document.createElement('div');
        title.className = 'arcade-evt-cond__title';
        title.textContent = 'Visual jar';
        host.appendChild(title);
        var hint = document.createElement('p');
        hint.className = 'arcade-style-hint';
        hint.textContent = 'The lean house jar (tipjar-mini) — running total + goal bar + your receive rails. The preview is a zero-network demo (scripted fake tips, DEMO ribbon) — the rails you set up render on the real overlay exactly as shown.';
        host.appendChild(hint);
        var preview = document.createElement('div');
        preview.className = 'arcade-alerts-preview arcade-tipjar-preview';
        var previewBar = document.createElement('div');
        previewBar.className = 'arcade-alerts-preview-bar';
        var reloadBtn = document.createElement('button');
        reloadBtn.type = 'button';
        reloadBtn.className = 'arcade-btn arcade-btn--sm';
        reloadBtn.id = 'arcade-tipjar-reload';
        reloadBtn.textContent = 'Reload preview';
        previewBar.appendChild(reloadBtn);
        preview.appendChild(previewBar);
        var frame = document.createElement('iframe');
        frame.id = 'arcade-tipjar-preview-frame';
        frame.title = 'Visual jar preview — zero-network demo';
        preview.appendChild(frame);
        host.appendChild(preview);
        reloadBtn.addEventListener('click', initTipjarPreviewFrame);

        var actions = document.createElement('div');
        actions.className = 'arcade-frames-actions';
        // TASK-71 (item 6) — the Visual jar's door names its target and
        // echoes what rode; the Goal jar door rides beside it (both
        // first-class, no picker).
        actions.appendChild(buildTipjarCopyDoor('visual', true));
        actions.appendChild(buildTipjarCopyDoor('goal', false));
        host.appendChild(actions);
        var defaults = document.createElement('p');
        defaults.className = 'arcade-style-hint';
        defaults.textContent = 'Goal, label and layout ride the defaults (goal 100 · “Tip Jar” · full layout).';
        host.appendChild(defaults);
        initTipjarPreviewFrame();
    }

    function initTipjarPreviewFrame() {
        var frame = document.getElementById('arcade-tipjar-preview-frame');
        if (!frame) return;
        groundWidgetPreviewFrame(frame); // TASK-70 — the dark demo ground
        var resolver = window.resolveSocialStreamPage;
        if (typeof resolver !== 'function') return;
        // No session param at all — &demo never joins anything (the ruled
        // mirror of Copy overlay URL, which always carries the real session).
        var params = ['demo=1', 'goal=100', 'label=Tip Jar', 'layout=full'].concat(tipRailsUrlParams());
        resolver('tipjar-mini.html', { extraParams: params }).then(function (resolved) {
            if (resolved && resolved.url) frame.src = resolved.url;
        }).catch(function (e) { console.error('[arcade-shell] tipjar preview resolve failed:', e); });
    }

    // TASK-70 (Lane 2) — the Goal jar zone: demo-isolated LIVE preview on
    // top (stock tipjar.html + the house &demo mode — scripted fake tips
    // through the page's REAL processTip, a throwaway preview room, zero
    // network), then the style chooser (5 looks: stock's 3 themes + 2 house
    // CSS-only looks — cited at TIPJAR_LOOKS), upload-your-own jar image via
    // the app's local-media rail, and the real-session copy.
    var tipjarStockPreviewToken = 0;

    function initTipjarStockPreviewFrame() {
        var frame = document.getElementById('arcade-tipjar-stock-preview-frame');
        if (!frame) return;
        groundWidgetPreviewFrame(frame);
        var resolver = window.resolveSocialStreamPage;
        if (typeof resolver !== 'function') return;
        var myToken = ++tipjarStockPreviewToken;
        // &demo + a throwaway preview room — never the operator's session
        // (the ruled mirror of Copy overlay URL below).
        var params = ['demo=1', 'session=' + encodeURIComponent(gamesPreviewRoom)].concat(tipjarStyleUrlParams());
        resolver('tipjar.html', { extraParams: params }).then(function (resolved) {
            if (myToken !== tipjarStockPreviewToken) return;
            if (resolved && resolved.url) frame.src = resolved.url;
        }).catch(function (e) { console.error('[arcade-shell] tipjar stock preview resolve failed:', e); });
    }

    function renderTipjarStockConfig(host) {
        var title = document.createElement('div');
        title.className = 'arcade-evt-cond__title';
        title.textContent = 'Goal jar';
        host.appendChild(title);
        var about = document.createElement('p');
        about.className = 'arcade-style-hint';
        about.textContent = 'The full stock jar — themes, sound, confetti, leaderboard. The preview is a zero-network demo (scripted fake tips, DEMO ribbon, isolated room) — never your live session.';
        host.appendChild(about);

        var preview = document.createElement('div');
        preview.className = 'arcade-alerts-preview arcade-tipjar-preview';
        var previewBar = document.createElement('div');
        previewBar.className = 'arcade-alerts-preview-bar';
        var reloadBtn = document.createElement('button');
        reloadBtn.type = 'button';
        reloadBtn.className = 'arcade-btn arcade-btn--sm';
        reloadBtn.textContent = 'Reload preview';
        previewBar.appendChild(reloadBtn);
        preview.appendChild(previewBar);
        var frame = document.createElement('iframe');
        frame.id = 'arcade-tipjar-stock-preview-frame';
        frame.title = 'Goal jar preview — zero-network demo';
        preview.appendChild(frame);
        host.appendChild(preview);
        reloadBtn.addEventListener('click', initTipjarStockPreviewFrame);

        // ---- the style chooser: ~5 jar looks (3 stock themes + 2 house) ----
        var lookTitle = document.createElement('div');
        lookTitle.className = 'arcade-evt-cond__title';
        lookTitle.textContent = 'Jar look';
        host.appendChild(lookTitle);
        var looks = document.createElement('div');
        looks.className = 'arcade-frames-presets';
        looks.setAttribute('role', 'group');
        looks.setAttribute('aria-label', 'Jar look');
        TIPJAR_LOOKS.forEach(function (look) {
            var chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'arcade-btn arcade-btn--sm';
            chip.textContent = look.label + (look.origin === 'house' ? ' ⌂' : '');
            chip.title = (look.origin === 'stock' ? 'Stock theme' : 'House look (CSS-only, rides stock’s own params)') + ' — ' + look.id;
            chip.setAttribute('aria-pressed', String(tipjarStyle.look === look.id));
            chip.addEventListener('click', function () {
                tipjarStyle.look = look.id;
                saveTipjarStyle();
                renderTipjarConfig(); // re-render syncs the chips + preview
                setTipjarStatus('jar look: ' + look.label);
            });
            looks.appendChild(chip);
        });
        host.appendChild(looks);

        // ---- upload your own jar image (the local-media rail) ----
        var uploadRow = document.createElement('div');
        uploadRow.className = 'arcade-frames-actions';
        var uploadBtn = document.createElement('button');
        uploadBtn.type = 'button';
        uploadBtn.className = 'arcade-btn arcade-btn--sm';
        uploadBtn.textContent = 'Upload your own jar image';
        uploadBtn.title = 'Pick an image file — it rides the app’s local media server (the same rail Event Flow’s Choose Local File uses) and lands in the jar’s image slot';
        uploadBtn.addEventListener('click', function () {
            var lm = window.ninjafy && window.ninjafy.localMedia;
            if (!lm || typeof lm.select !== 'function') {
                setTipjarStatus('local media rail unavailable in this build', true);
                return;
            }
            uploadBtn.disabled = true;
            lm.select({ mediaType: 'image' }).then(function (result) {
                if (!result || !result.success || !result.asset) return null; // canceled — nothing to say
                return lm.start().then(function () { return lm.getMediaUrl(result.asset.id); });
            }).then(function (res) {
                if (!res) return;
                if (!res.url) throw new Error('no media url');
                tipjarStyle.jarimage = res.url;
                saveTipjarStyle();
                renderTipjarConfig();
                setTipjarStatus('jar image set — it renders on the Goal jar overlay');
            }).catch(function (e) {
                console.error('[arcade-shell] jar image upload failed:', e);
                setTipjarStatus('jar image upload failed — ' + (e && e.message ? e.message : e), true);
            }).finally(function () { uploadBtn.disabled = false; });
        });
        uploadRow.appendChild(uploadBtn);
        if (tipjarStyle.jarimage) {
            var clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'arcade-btn arcade-btn--sm';
            clearBtn.textContent = 'Remove jar image';
            clearBtn.addEventListener('click', function () {
                tipjarStyle.jarimage = '';
                saveTipjarStyle();
                renderTipjarConfig();
                setTipjarStatus('jar image removed — stock jar art restored');
            });
            uploadRow.appendChild(clearBtn);
            var current = document.createElement('span');
            current.className = 'arcade-evt-cond__hint';
            current.textContent = 'Own jar image active (local media server — OBS on this machine can reach it).';
            uploadRow.appendChild(current);
        }
        host.appendChild(uploadRow);
        var uploadNote = document.createElement('p');
        uploadNote.className = 'arcade-evt-cond__hint';
        uploadNote.textContent = 'The jar look and your image ride the copy URL below — stock’s &theme / fill / &b64css / &jarimage params, no forked jar.';
        host.appendChild(uploadNote);

        var actions = document.createElement('div');
        actions.className = 'arcade-frames-actions';
        // TASK-71 (item 6) — the Goal jar's door names its target and
        // echoes what rode; the Visual jar door rides beside it (both
        // first-class, no picker).
        actions.appendChild(buildTipjarCopyDoor('goal', true));
        actions.appendChild(buildTipjarCopyDoor('visual', false));
        host.appendChild(actions);
        initTipjarStockPreviewFrame();
    }

    // ====================================================================
    // TASK-70 (WALK 2C) — THE WIDGET INTERIORS. One shared shape for the
    // single-widget Add-ons interiors (Lanes 1/3): panel head + ONE stage
    // column (no left list — one widget per interior): the Add-ons crumb on
    // top, then a demo-isolated preview card, then the config cards below.
    // Reuses the .arcade-alerts-preview / .arcade-evt-* idioms; every write
    // rides canonical saveSetting (saveGameSetting/saveDeckSetting), every
    // copy URL carries the REAL session, every preview an isolated throwaway
    // room or the page's own zero-network demo mode.
    // ====================================================================

    // One settings-doc loader for the small house option docs this task adds
    // (featured whitelist, hype toggles, map toggles, music look). Same
    // getSettings shape loadTipRailsSettings uses; parse failures degrade to
    // the defaults, never throw.
    function loadHouseDoc(key, defaults, sanitize) {
        return new Promise(function (resolve) {
            var doc = JSON.parse(JSON.stringify(defaults));
            try {
                if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                    window.ninjafy.sendMessage(null, { getSettings: true }, function (response) {
                        try {
                            var settings = (response && response.settings) || {};
                            var entry = settings[key];
                            var parsed = null;
                            try { parsed = JSON.parse((entry && typeof entry.textparam1 === 'string') ? entry.textparam1 : ''); } catch (e) { parsed = null; }
                            if (parsed && typeof parsed === 'object') {
                                Object.keys(defaults).forEach(function (k) {
                                    if (parsed[k] !== undefined && typeof parsed[k] === typeof defaults[k]) doc[k] = parsed[k];
                                });
                                if (typeof sanitize === 'function') doc = sanitize(doc) || doc;
                            }
                        } catch (e) { console.error('[arcade-shell] house doc parse failed (' + key + '):', e); }
                        resolve(doc);
                    });
                    return;
                }
            } catch (e) { console.error('[arcade-shell] house doc load failed (' + key + '):', e); }
            resolve(doc);
        });
    }

    // The shared widget-panel skeleton. Returns the panel; the interior
    // fills #arcade-<id>-stage. The crumb is prepended at live time by
    // installAddonsCrumbs (stage-top variant — these panels have no left
    // list column).
    function buildWidgetPanel(id, titleText, ariaLabel) {
        var panel = document.createElement('section');
        panel.className = 'arcade-widget arcade-' + id;
        panel.setAttribute('aria-label', ariaLabel);
        panel.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title">' + titleText + '</span>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-alerts-status" id="arcade-' + id + '-status"></span>' +
            '</div>' +
            '<div class="arcade-widget-stage" id="arcade-' + id + '-stage"></div>';
        document.body.appendChild(panel);
        return panel;
    }

    function widgetStatus(id, text, isError) {
        var el = document.getElementById('arcade-' + id + '-status');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-error', !!isError);
    }

    // The demo-isolated preview card (bar with reload + the frame). The
    // loader callback composes params and resolves the frame src; it owns
    // the isolation contract (&demo / throwaway room — never the live
    // session).
    function buildWidgetPreviewCard(id, titleText, hintText, loader) {
        var wrap = document.createElement('div');
        wrap.className = 'arcade-alerts-preview arcade-widget-preview';
        var bar = document.createElement('div');
        bar.className = 'arcade-alerts-preview-bar';
        var label = document.createElement('span');
        label.className = 'arcade-widget-preview__label';
        label.textContent = titleText;
        bar.appendChild(label);
        var reloadBtn = document.createElement('button');
        reloadBtn.type = 'button';
        reloadBtn.className = 'arcade-btn arcade-btn--sm';
        reloadBtn.textContent = 'Reload preview';
        reloadBtn.addEventListener('click', loader);
        bar.appendChild(reloadBtn);
        wrap.appendChild(bar);
        var frame = document.createElement('iframe');
        frame.id = 'arcade-' + id + '-preview-frame';
        frame.title = titleText + ' — demo-isolated preview';
        wrap.appendChild(frame);
        var host = document.createElement('div');
        host.appendChild(wrap);
        if (hintText) {
            var hint = document.createElement('p');
            hint.className = 'arcade-style-hint';
            hint.textContent = hintText;
            host.appendChild(hint);
        }
        return host;
    }

    // TASK-70 — overlay pages are transparent-by-design (OBS composites
    // them). In a PREVIEW that honesty reads as invisible text on the
    // walker's white base, so every widget/gallery preview frame gets an
    // honest dark demo ground injected at load (same-origin only, marked
    // arcade-preview-ground, never carried into a copy URL).
    function groundWidgetPreviewFrame(frame) {
        if (!frame) return;
        frame.addEventListener('load', function () {
            try {
                var doc = frame.contentDocument;
                if (!doc || !doc.head || doc.getElementById('arcade-preview-ground')) return;
                var style = doc.createElement('style');
                style.id = 'arcade-preview-ground';
                style.textContent = 'html, body { background: #10131a !important; }';
                doc.head.appendChild(style);
            } catch (e) { /* cross-origin/hosted preview — no ground, honest blank */ }
        });
    }

    function widgetPreviewResolve(frameId, page, params, tokenCheck) {
        var frame = document.getElementById(frameId);
        if (!frame) return;
        groundWidgetPreviewFrame(frame);
        var resolver = window.resolveSocialStreamPage;
        if (typeof resolver !== 'function') return;
        resolver(page, { extraParams: params }).then(function (resolved) {
            if (tokenCheck && !tokenCheck()) return;
            if (resolved && resolved.url) frame.src = resolved.url;
        }).catch(function (e) { console.error('[arcade-shell] widget preview resolve failed (' + page + '):', e); });
    }

    // Small config-card primitives (the arcade-alert-card idiom).
    function buildWidgetCard(titleText) {
        var card = document.createElement('article');
        card.className = 'arcade-alert-card';
        var head = document.createElement('div');
        head.className = 'arcade-alert-card__head';
        var name = document.createElement('h3');
        name.className = 'arcade-alert-card__name';
        name.textContent = titleText;
        head.appendChild(name);
        card.appendChild(head);
        var body = document.createElement('div');
        body.className = 'arcade-alert-card__body';
        card.appendChild(body);
        return { card: card, body: body };
    }

    function widgetHint(body, text) {
        var hint = document.createElement('p');
        hint.className = 'arcade-style-hint';
        hint.textContent = text;
        body.appendChild(hint);
        return hint;
    }

    // --------------------------------------------------------------------
    // LANE 1 — FEATURED CHAT (the ruled three-chat model: home chat = dock,
    // featured chat = THIS, normal chat). Focus mode: who gets featured +
    // the message filters, plainly. The preview is stock featured.html in
    // the house &demo mode (mirror-mastered this task — zero network, two
    // scripted messages through the REAL processData filter chain, so a set
    // whitelist visibly filters in the preview).
    //
    // WHO GETS FEATURED — stock's REAL doors (cited):
    //  - Manual from the dock: click a message = feature instantly, CTRL+
    //    click = queue, ALT+click = pin (dock.html:12025's own title).
    //  - Auto-feature VIP messages (stock key autofeaturevip, dock.html:4362
    //    + :12008) and auto-feature privileged users (autofeaturepriv,
    //    dock.html:4363 + :11997) — the two toggles below write those keys
    //    through the canonical saveSetting, exactly like the popup's own
    //    checkboxes (they live in stock's hostbot group, honestly noted).
    //  - FIRST-TIMERS: NO stock setting auto-features first-timer messages —
    //    featured.html has zero firsttime handling (skill map confirms).
    //    Flagged, not faked: the honest line below says so.
    //
    // MESSAGE FILTERS — featured.html's REAL filter params (its own source,
    // :1689-1700 + :1542-1545 + :2760-2776): &onlyfrom/&hidefrom (platforms),
    // &filterevents, and &filterfeaturedusers (a name whitelist — only those
    // chatters may be featured at all). The whitelist is surfaced natively
    // here (rides the preview + copy URL). "Skip emoji-only" is DOCK-ONLY
    // stock (&noemojisonly, dock.html:5704) — featured.html does NOT read
    // it; flagged to the Admiral, honestly stated, not wired.
    // --------------------------------------------------------------------
    var FEATURED_OPTS_KEY = 'arcadeFeaturedOptions';
    var featuredOpts = { whitelist: '' };
    var featuredPanelLive = false;
    var featuredPreviewToken = 0;

    function loadFeaturedOptions() {
        return loadHouseDoc(FEATURED_OPTS_KEY, { whitelist: '' }, function (doc) {
            doc.whitelist = String(doc.whitelist || '').slice(0, 300);
            return doc;
        }).then(function (doc) { featuredOpts = doc; });
    }
    function saveFeaturedOptions() { saveGameSetting(FEATURED_OPTS_KEY, JSON.stringify(featuredOpts)); }

    function featuredUrlParams() {
        var wl = featuredOpts.whitelist.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        return wl.length ? ['filterfeaturedusers=' + encodeURIComponent(wl.join(','))] : [];
    }

    function initFeaturedPreviewFrame() {
        var myToken = ++featuredPreviewToken;
        // &demo: zero-network; the page's own seeds ride processData — with a
        // whitelist set, only "DemoFren" renders (the filter REALLY filters).
        var params = ['demo=1', 'session=' + encodeURIComponent(gamesPreviewRoom)].concat(featuredUrlParams());
        widgetPreviewResolve('arcade-featured-preview-frame', 'featured.html', params, function () { return myToken === featuredPreviewToken; });
    }

    function buildFeaturedPanel() {
        buildWidgetPanel('featured', 'FEATURED CHAT', 'Featured Chat');
    }

    function ensureFeaturedPanelLive() {
        loadFeaturedOptions().then(function () {
            featuredPanelLive = true;
            renderFeaturedStage();
        });
    }

    // The stage crumb (installAddonsCrumbs, stage-top variant) must survive
    // every re-render — clear AROUND it, never through it.
    function clearWidgetStage(stage) {
        var crumb = stage.querySelector('.arcade-crumb');
        stage.innerHTML = '';
        if (crumb) stage.appendChild(crumb);
    }

    function renderFeaturedStage() {
        var stage = document.getElementById('arcade-featured-stage');
        if (!stage) return;
        clearWidgetStage(stage);
        stage.appendChild(buildWidgetPreviewCard('featured', 'Featured overlay',
            'Zero-network demo — two scripted fake messages ride the real filter chain. Set the whitelist below and only “DemoFren” shows; the filter really filters.',
            initFeaturedPreviewFrame));

        // ---- Who gets featured ----
        var who = buildWidgetCard('Who gets featured');
        widgetHint(who.body, 'Hand-picked from the dock: on the Main chat, click any message to feature it instantly — CTRL+click adds it to the queue, ALT+click pins it. (The dock’s own message path — nothing to set up here.)');
        var ftBg = getBackgroundWindow();
        [
            { key: 'autofeaturevip', label: 'Auto-feature VIP messages', hint: 'Stock key autofeaturevip — messages from VIP-marked users feature themselves (dock.html:4362).' },
            { key: 'autofeaturepriv', label: 'Auto-feature privileged users', hint: 'Stock key autofeaturepriv — admins/hosts/mods feature themselves (dock.html:4363).' }
        ].forEach(function (opt) {
            var on = !!(ftBg && typeof ftBg.getSettingFlag === 'function' && ftBg.getSettingFlag(opt.key));
            var row = buildArcadeToggle({
                label: opt.label,
                hint: opt.hint,
                checked: on,
                onChange: function (checked) {
                    saveDeckSetting('setting', opt.key, checked); // canonical, the popup's own write shape
                    widgetStatus('featured', opt.label + (checked ? ': on' : ': off') + ' — applies to the dock on its next load');
                }
            });
            who.body.appendChild(row);
        });
        widgetHint(who.body, 'First-timers: stock has NO auto-feature setting for first-timer messages (featured.html has zero firsttime handling) — flagged to the Admiral; not faked here. First-timer DETECTION for alerts/flows lives in Deck Settings → AI.');
        stage.appendChild(who.card);

        // ---- Message filters ----
        var filters = buildWidgetCard('Message filters');
        widgetHint(filters.body, 'Whitelist (stock’s &filterfeaturedusers): when set, ONLY these chatters can be featured at all — the focus-mode switch. Comma-separated names; add :platform to pin one (e.g. DemoFren:twitch).');
        var wlRow = document.createElement('div');
        wlRow.className = 'arcade-frames-field';
        var wlLabel = document.createElement('label');
        wlLabel.textContent = 'Featured-users whitelist';
        var wlInput = document.createElement('input');
        wlInput.type = 'text';
        wlInput.autocomplete = 'off';
        wlInput.spellcheck = false;
        wlInput.placeholder = 'empty = anyone can be featured';
        wlInput.value = featuredOpts.whitelist;
        wlInput.setAttribute('aria-label', 'Featured-users whitelist');
        wlInput.addEventListener('input', debounce(function () {
            featuredOpts.whitelist = wlInput.value.trim();
            saveFeaturedOptions();
            initFeaturedPreviewFrame(); // the live preview re-runs the demo under the new filter
            widgetStatus('featured', featuredOpts.whitelist ? 'whitelist on — the preview shows the filter working' : 'whitelist cleared');
        }, 500));
        wlLabel.appendChild(wlInput);
        wlRow.appendChild(wlLabel);
        filters.body.appendChild(wlRow);
        widgetHint(filters.body, 'Skip emoji-only messages: exists for the DOCK only (stock &noemojisonly) — the featured overlay doesn’t read it. Flagged to the Admiral, not wired. Platform and event filters live in the stock groups below (Visibility).');
        stage.appendChild(filters.card);

        // ---- the berthed stock groups (S51 embed driver, same keys) ----
        var stockCard = buildWidgetCard('Stock featured settings');
        widgetHint(stockCard.body, 'Stock’s full featured groups — overlay, mechanics, visibility, styling, effects. Same stock page, same keys, berthed here. (Featured TTS stays in Deck Settings → Speech.)');
        stage.appendChild(stockCard.card);
        buildDeckPopupEmbed(stage, 'featured', null);

        // ---- copy ----
        var actions = document.createElement('div');
        actions.className = 'arcade-frames-actions';
        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        copyBtn.textContent = 'Copy overlay URL';
        copyBtn.title = 'The REAL session, never the demo — the whitelist rides along when set';
        copyBtn.addEventListener('click', function () {
            var el = elementCardById('featured');
            buildElementOverlayUrl(el, featuredUrlParams()).then(function (url) {
                if (!url) throw new Error('no url');
                return copyToClipboard(url).then(function () {
                    flashButton(copyBtn, 'Copied ✓');
                    widgetStatus('featured', 'Copied — real session' + (featuredOpts.whitelist ? ' + whitelist filter' : '') + ', never the demo.');
                });
            }).catch(function (e) {
                console.error('[arcade-shell] copy featured url failed:', e);
                flashButton(copyBtn, 'Copy failed', 2200);
            });
        });
        actions.appendChild(copyBtn);
        stage.appendChild(actions);

        initFeaturedPreviewFrame();
    }

    // --------------------------------------------------------------------
    // LANE 3 — NOW PLAYING. Preview = the house music-widget in &demo (zero
    // network; the demo title is deliberately LONG so every preview proves
    // song-title containment). The four stock Spotify groups BERTH here
    // (setup / overlay / announcements / commands — the S51 embed driver).
    // The look knobs are the widget's OWN URL params (its header documents
    // them), stored in a house doc and composed into preview + copy.
    // --------------------------------------------------------------------
    var MUSIC_OPTS_KEY = 'arcadeMusicOptions';
    var musicOpts = { layout: 'horizontal', width: '', titlesize: '', fg: '', accent: '' };
    var musicPanelLive = false;
    var musicPreviewToken = 0;

    function loadMusicOptions() {
        return loadHouseDoc(MUSIC_OPTS_KEY, { layout: 'horizontal', width: '', titlesize: '', fg: '', accent: '' }, function (doc) {
            if (['horizontal', 'vertical', 'compact'].indexOf(doc.layout) === -1) doc.layout = 'horizontal';
            ['width', 'titlesize'].forEach(function (k) { doc[k] = /^\d{0,4}$/.test(doc[k]) ? doc[k] : ''; });
            ['fg', 'accent'].forEach(function (k) { doc[k] = /^#[0-9a-fA-F]{0,8}$/.test(doc[k]) ? doc[k] : ''; });
            return doc;
        }).then(function (doc) { musicOpts = doc; });
    }
    function saveMusicOptions() { saveGameSetting(MUSIC_OPTS_KEY, JSON.stringify(musicOpts)); }

    function musicUrlParams() {
        var params = ['layout=' + musicOpts.layout];
        if (musicOpts.width) params.push('width=' + musicOpts.width);
        if (musicOpts.titlesize) params.push('titlesize=' + musicOpts.titlesize);
        if (musicOpts.fg) params.push('fg=' + encodeURIComponent(musicOpts.fg));
        if (musicOpts.accent) params.push('progresscolor=' + encodeURIComponent(musicOpts.accent));
        return params;
    }

    function initMusicPreviewFrame() {
        var myToken = ++musicPreviewToken;
        var params = ['demo=1'].concat(musicUrlParams());
        widgetPreviewResolve('arcade-music-preview-frame', 'music-widget.html', params, function () { return myToken === musicPreviewToken; });
    }

    function buildMusicPanel() {
        buildWidgetPanel('music', 'NOW PLAYING', 'Now Playing');
    }

    function ensureMusicPanelLive() {
        loadMusicOptions().then(function () {
            musicPanelLive = true;
            renderMusicStage();
        });
    }

    function renderMusicStage() {
        var stage = document.getElementById('arcade-music-stage');
        if (!stage) return;
        clearWidgetStage(stage);
        stage.appendChild(buildWidgetPreviewCard('music', 'Now Playing overlay',
            'Zero-network demo — the demo track’s title is deliberately long on purpose: it must stay INSIDE the widget (ellipsis / wrapped), never overflow.',
            initMusicPreviewFrame));

        // ---- the look ----
        var look = buildWidgetCard('The look');
        var layoutRow = document.createElement('div');
        layoutRow.className = 'arcade-alert-row';
        var layoutLbl = document.createElement('label');
        layoutLbl.textContent = 'Layout';
        layoutRow.appendChild(layoutLbl);
        var layoutSel = document.createElement('select');
        layoutSel.setAttribute('aria-label', 'Now Playing layout');
        ['horizontal', 'vertical', 'compact'].forEach(function (v) {
            var o = document.createElement('option');
            o.value = v;
            o.textContent = v.charAt(0).toUpperCase() + v.slice(1);
            if (musicOpts.layout === v) o.selected = true;
            layoutSel.appendChild(o);
        });
        layoutSel.addEventListener('change', function () {
            musicOpts.layout = layoutSel.value;
            saveMusicOptions();
            initMusicPreviewFrame();
        });
        layoutRow.appendChild(layoutSel);
        look.body.appendChild(layoutRow);

        function musicField(labelText, field, placeholder, hint) {
            var row = document.createElement('div');
            row.className = 'arcade-frames-field';
            var lbl = document.createElement('label');
            lbl.textContent = labelText;
            var input = document.createElement('input');
            input.type = 'text';
            input.autocomplete = 'off';
            input.spellcheck = false;
            input.placeholder = placeholder;
            input.value = musicOpts[field];
            input.setAttribute('aria-label', labelText);
            input.addEventListener('input', debounce(function () {
                musicOpts[field] = input.value.trim();
                saveMusicOptions();
                initMusicPreviewFrame();
            }, 500));
            lbl.appendChild(input);
            row.appendChild(lbl);
            if (hint) {
                var h = document.createElement('div');
                h.className = 'arcade-tipjar-rail__hint';
                h.textContent = hint;
                row.appendChild(h);
            }
            return row;
        }
        look.body.appendChild(musicField('Width (px)', 'width', '420 default', 'The widget never grows past this — long titles shrink inside it.'));
        look.body.appendChild(musicField('Title size (px)', 'titlesize', '16 default', ''));
        look.body.appendChild(musicField('Text color', 'fg', '#e8eaf0 default', 'Sets title + artist color (the widget’s &fg shorthand).'));
        look.body.appendChild(musicField('Progress bar color', 'accent', 'green default', ''));
        stage.appendChild(look.card);

        // ---- the berthed Spotify groups ----
        var sp = buildWidgetCard('Spotify connection (stock settings)');
        widgetHint(sp.body, 'Stock’s Spotify groups berth here — setup (client id/secret + Connect), overlay behavior, announcements, commands. Same stock page, same keys. The token lives in stock’s own store and NEVER leaves the background page: the widget reads track data over the session feed (stock spotify-overlay.html’s exact mechanism), so the copy URL below carries no token — nothing to paste, nothing to leak.');
        stage.appendChild(sp.card);
        buildDeckPopupEmbed(stage, 'music', null);

        // ---- copy ----
        var actions = document.createElement('div');
        actions.className = 'arcade-frames-actions';
        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        copyBtn.textContent = 'Copy overlay URL';
        copyBtn.title = 'Real session, your look params — token-free by design: the widget is fed by your Spotify connection (the setup group above) over the session, stock’s own way';
        copyBtn.addEventListener('click', function () {
            var el = elementCardById('music');
            buildElementOverlayUrl(el, musicUrlParams()).then(function (url) {
                if (!url) throw new Error('no url');
                return copyToClipboard(url).then(function () {
                    flashButton(copyBtn, 'Copied ✓');
                    widgetStatus('music', 'Copied — real session, token-free (the Spotify connection feeds it).');
                });
            }).catch(function (e) {
                console.error('[arcade-shell] copy music url failed:', e);
                flashButton(copyBtn, 'Copy failed', 2200);
            });
        });
        actions.appendChild(copyBtn);
        stage.appendChild(actions);

        initMusicPreviewFrame();
    }

    // --------------------------------------------------------------------
    // LANE 3 — HYPE TRAIN. Preview = stock hype.html in a throwaway room
    // (honest zeros — an isolated room has no viewers). The toggles are
    // stock's REAL hype URL params (verified against hype.html's own
    // urlParams reads: viewersonly/chattersonly/combineall/combineyoutube/
    // hidetitle/transparent/darkmode), stored in a house doc and composed
    // into preview + copy.
    // --------------------------------------------------------------------
    var HYPE_OPTS_KEY = 'arcadeHypeOptions';
    var hypeOpts = { viewersonly: false, chattersonly: false, combineall: false, combineyoutube: false, hidetitle: false, transparent: false };
    var hypePanelLive = false;
    var hypePreviewToken = 0;
    var HYPE_TOGGLES = [
        { key: 'viewersonly', label: 'Viewers only', hint: 'Count viewers, not chatters (stock &viewersonly).' },
        { key: 'chattersonly', label: 'Chatters only', hint: 'Count chatters, not viewers (stock &chattersonly).' },
        { key: 'combineall', label: 'Combine all platforms', hint: 'One total across every connected platform (stock &combineall).' },
        { key: 'combineyoutube', label: 'Combine YouTube streams', hint: 'Merge multiple YouTube sources into one count (stock &combineyoutube).' },
        { key: 'hidetitle', label: 'Hide the title', hint: 'Stock &hidetitle.' },
        { key: 'transparent', label: 'Transparent background', hint: 'Stock &transparent — for OBS.' }
    ];

    function loadHypeOptions() {
        return loadHouseDoc(HYPE_OPTS_KEY, { viewersonly: false, chattersonly: false, combineall: false, combineyoutube: false, hidetitle: false, transparent: false })
            .then(function (doc) { hypeOpts = doc; });
    }
    function saveHypeOptions() { saveGameSetting(HYPE_OPTS_KEY, JSON.stringify(hypeOpts)); }

    function hypeUrlParams() {
        var params = [];
        HYPE_TOGGLES.forEach(function (t) { if (hypeOpts[t.key]) params.push(t.key); });
        return params;
    }

    function initHypePreviewFrame() {
        var myToken = ++hypePreviewToken;
        var frame = document.getElementById('arcade-hype-preview-frame');
        if (frame && !frame.dataset.hypeNoteWired) {
            frame.dataset.hypeNoteWired = '1';
            frame.addEventListener('load', function () {
                // Stock hides the whole widget at zero counts (parentHolder
                // gets .hidden) — correct for OBS, a black box in a preview.
                // Say so IN the frame (shell-side note, preview-only, never
                // part of the copied URL). Checked at load and once late
                // (the page settles its zero state async).
                var apply = function () {
                    try {
                        var doc = frame.contentDocument;
                        if (!doc || !doc.body) return;
                        var holder = doc.getElementById('parentHolder');
                        if (!holder || !holder.classList.contains('hidden')) return;
                        if (doc.getElementById('arcade-hype-empty-note')) return;
                        var note = doc.createElement('div');
                        note.id = 'arcade-hype-empty-note';
                        note.textContent = 'Stock hides this widget at zero counts — on your live session it appears the moment chatters or viewers are around.';
                        note.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font:400 13px/1.5 sans-serif;color:#9ba1ad;pointer-events:none;';
                        doc.body.appendChild(note);
                    } catch (e) { /* hosted/cross-origin — the hint below the frame carries it */ }
                };
                apply();
                setTimeout(apply, 2500);
            });
        }
        var params = ['session=' + encodeURIComponent(gamesPreviewRoom)].concat(hypeUrlParams());
        widgetPreviewResolve('arcade-hype-preview-frame', 'hype.html', params, function () { return myToken === hypePreviewToken; });
    }

    function buildHypePanel() {
        buildWidgetPanel('hype', 'HYPE TRAIN', 'Hype Train');
    }

    function ensureHypePanelLive() {
        loadHypeOptions().then(function () {
            hypePanelLive = true;
            renderHypeStage();
        });
    }

    function renderHypeStage() {
        var stage = document.getElementById('arcade-hype-stage');
        if (!stage) return;
        clearWidgetStage(stage);
        stage.appendChild(buildWidgetPreviewCard('hype', 'Hype Train overlay',
            'Isolated preview room — honestly reads zero (no live viewers in a throwaway room). The real session drives the real counts.',
            initHypePreviewFrame));

        var opts = buildWidgetCard('What it counts');
        HYPE_TOGGLES.forEach(function (t) {
            opts.body.appendChild(buildArcadeToggle({
                label: t.label,
                hint: t.hint,
                checked: !!hypeOpts[t.key],
                onChange: function (checked) {
                    hypeOpts[t.key] = checked;
                    saveHypeOptions();
                    initHypePreviewFrame();
                }
            }));
        });
        widgetHint(opts.body, 'These are stock’s real hype URL params — they ride the preview above and the copy below.');
        stage.appendChild(opts.card);

        var actions = document.createElement('div');
        actions.className = 'arcade-frames-actions';
        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        copyBtn.textContent = 'Copy overlay URL';
        copyBtn.addEventListener('click', function () {
            var el = elementCardById('hype');
            buildElementOverlayUrl(el, hypeUrlParams()).then(function (url) {
                if (!url) throw new Error('no url');
                return copyToClipboard(url).then(function () {
                    flashButton(copyBtn, 'Copied ✓');
                    widgetStatus('hype', 'Copied — real session + your options, never the preview room.');
                });
            }).catch(function (e) {
                console.error('[arcade-shell] copy hype url failed:', e);
                flashButton(copyBtn, 'Copy failed', 2200);
            });
        });
        actions.appendChild(copyBtn);
        stage.appendChild(actions);

        initHypePreviewFrame();
    }

    // --------------------------------------------------------------------
    // LANE 3 — FREN MAP (un-stubbed: stock's map.html). Viewers pin
    // themselves by chat command; the overlay draws them on the world map.
    // Options are stock's real map URL params (map.html:414-419's own
    // aliases: mapautofit/mapspam/maphidenumbers/mapcolorintensity).
    // --------------------------------------------------------------------
    var MAP_OPTS_KEY = 'arcadeMapOptions';
    var mapOpts = { mapautofit: false, mapspam: false, maphidenumbers: false, mapcolorintensity: false };
    var mapPanelLive = false;
    var mapPreviewToken = 0;
    var MAP_TOGGLES = [
        { key: 'mapautofit', label: 'Auto-fit the map to pins', hint: 'Zoom to frame every pinned fren (stock &mapautofit).' },
        { key: 'mapspam', label: 'Let frens move their pin', hint: 'A fren can re-pin themselves (stock &mapspam — multi-vote).' },
        { key: 'maphidenumbers', label: 'Hide the pin counts', hint: 'Stock &maphidenumbers.' },
        { key: 'mapcolorintensity', label: 'Heat-colored pins', hint: 'Pins color by how many frens share a spot (stock &mapcolorintensity).' }
    ];

    function loadMapOptions() {
        return loadHouseDoc(MAP_OPTS_KEY, { mapautofit: false, mapspam: false, maphidenumbers: false, mapcolorintensity: false })
            .then(function (doc) { mapOpts = doc; });
    }
    function saveMapOptions() { saveGameSetting(MAP_OPTS_KEY, JSON.stringify(mapOpts)); }

    function mapUrlParams() {
        var params = [];
        MAP_TOGGLES.forEach(function (t) { if (mapOpts[t.key]) params.push(t.key); });
        return params;
    }

    function initMapPreviewFrame() {
        var myToken = ++mapPreviewToken;
        var params = ['session=' + encodeURIComponent(gamesPreviewRoom)].concat(mapUrlParams());
        widgetPreviewResolve('arcade-map-preview-frame', 'map.html', params, function () { return myToken === mapPreviewToken; });
    }

    function buildMapPanel() {
        buildWidgetPanel('map', 'FREN MAP', 'Fren Map');
    }

    function ensureMapPanelLive() {
        loadMapOptions().then(function () {
            mapPanelLive = true;
            renderMapStage();
        });
    }

    function renderMapStage() {
        var stage = document.getElementById('arcade-map-stage');
        if (!stage) return;
        clearWidgetStage(stage);
        stage.appendChild(buildWidgetPreviewCard('map', 'Fren Map overlay',
            'Isolated preview room — an empty map is honest here (no frens pinned in a throwaway room). On the real overlay, viewers pin themselves from chat.',
            initMapPreviewFrame));

        var opts = buildWidgetCard('Map behavior');
        MAP_TOGGLES.forEach(function (t) {
            opts.body.appendChild(buildArcadeToggle({
                label: t.label,
                hint: t.hint,
                checked: !!mapOpts[t.key],
                onChange: function (checked) {
                    mapOpts[t.key] = checked;
                    saveMapOptions();
                    initMapPreviewFrame();
                }
            }));
        });
        stage.appendChild(opts.card);

        var actions = document.createElement('div');
        actions.className = 'arcade-frames-actions';
        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        copyBtn.textContent = 'Copy overlay URL';
        copyBtn.addEventListener('click', function () {
            var el = elementCardById('map');
            buildElementOverlayUrl(el, mapUrlParams()).then(function (url) {
                if (!url) throw new Error('no url');
                return copyToClipboard(url).then(function () {
                    flashButton(copyBtn, 'Copied ✓');
                    widgetStatus('map', 'Copied — real session + your options, never the preview room.');
                });
            }).catch(function (e) {
                console.error('[arcade-shell] copy map url failed:', e);
                flashButton(copyBtn, 'Copy failed', 2200);
            });
        });
        actions.appendChild(copyBtn);
        stage.appendChild(actions);

        initMapPreviewFrame();
    }

    // --------------------------------------------------------------------
    // LANE 4 — OVERLAY TEMPLATES gallery (RULED: surface-only — no builder).
    // The list IS the source-verified THEME_PAGES census (the Style tab's
    // own inventory: chat themes + featured-styles + the special full-screen
    // pages — credits/danmaku/ticker-news included). LEFT: the templates as
    // a selectable list. RIGHT: demo-isolated preview (throwaway preview
    // room, never the live session) + Copy URL (real session). Lane-4 note
    // for the retirement pathway: this gallery and the Style tab's Browse
    // Looks modal read the SAME census — a future per-add-on Style world
    // can point both at it.
    // --------------------------------------------------------------------
    var overlaysSelectedFile = null;
    var overlaysPanelLive = false;
    var overlaysPreviewToken = 0;

    // Disk-verified 0018.06.05 (TASK-70 census): the 21 theme pages the
    // bundle carries locally (the 3 Admiral-named specials — credits /
    // danmaku / ticker-news — mirror-mastered verbatim into the bundle THIS
    // task). Everything else in THEME_PAGES resolves to the hosted site —
    // the gallery marks those HOSTED and says why a preview may stay blank
    // offline.
    var OVERLAY_LOCAL_FILES = {
        'compact-classic.html': true, 'compact-clean.html': true, 'compact-glass.html': true,
        'horizontal.html': true, 'notimeoutmessages.html': true, 'overlay-bubbles.html': true,
        'overlay-cards.html': true, 'overlay-comic-classic.html': true, 'overlay-comic-pop.html': true,
        'overlay-credits.html': true, 'overlay-danmaku.html': true, 'overlay-neon-cyberpunk.html': true,
        'overlay-particles.html': true, 'overlay-ticker-news.html': true, 'overlay-typewriter.html': true,
        'overlay-xacception.html': true, 'pretty.html': true, 'sampleoverlay_reverse.html': true,
        'spiritoverlay.html': true, 'Neutron/chatOnly.html': true, 'Neutron/stream.html': true
    };

    function buildOverlaysPanel() {
        var panel = document.createElement('section');
        panel.className = 'arcade-overlays';
        panel.setAttribute('aria-label', 'Overlay templates');
        panel.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title">OVERLAY TEMPLATES</span>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-alerts-status" id="arcade-overlays-status"></span>' +
            '</div>' +
            '<div class="arcade-alerts-body">' +
            '<div class="arcade-evt-list-col">' +
            '<div class="arcade-evt-list" id="arcade-overlays-list" role="listbox" aria-label="Overlay templates"></div>' +
            '</div>' +
            '<div class="arcade-alerts-stage">' +
            '<div class="arcade-evt-config" id="arcade-overlays-config"></div>' +
            '</div>' +
            '</div>';
        document.body.appendChild(panel);
        attachArcadeListboxNav(panel.querySelector('#arcade-overlays-list'), '[data-arcade-overlay-file]',
            function () { return overlaysSelectedFile; }, selectOverlayTemplate,
            function (row) { return row.dataset.arcadeOverlayFile; });
    }

    function ensureOverlaysPanelLive() {
        overlaysPanelLive = true;
        if (!overlaysSelectedFile && THEME_PAGES.length) overlaysSelectedFile = THEME_PAGES[0].file;
        renderOverlaysList();
        renderOverlaysConfig();
    }

    var OVERLAYS_GROUP_LABEL = { chat: 'Chat themes', overlay: 'Featured message styles', special: 'Special full-screen' };

    function renderOverlaysList() {
        var list = document.getElementById('arcade-overlays-list');
        if (!list) return;
        list.innerHTML = '';
        ['chat', 'overlay', 'special'].forEach(function (target) {
            var entries = THEME_PAGES.filter(function (e) { return e.target === target; });
            if (!entries.length) return;
            var header = document.createElement('div');
            header.className = 'arcade-evt-group__title';
            header.textContent = OVERLAYS_GROUP_LABEL[target] || target;
            list.appendChild(header);
            entries.forEach(function (entry) {
                var row = document.createElement('button');
                row.type = 'button';
                row.className = 'arcade-evt-item';
                row.dataset.arcadeOverlayFile = entry.file;
                row.setAttribute('role', 'option');
                var selected = overlaysSelectedFile === entry.file;
                row.classList.toggle('is-on', selected);
                row.setAttribute('aria-selected', String(selected));
                var label = document.createElement('span');
                label.className = 'arcade-evt-item__label';
                label.textContent = entry.name;
                row.appendChild(label);
                var state = document.createElement('span');
                state.className = 'arcade-evt-state ' + (entry.cssb64 ? 'arcade-evt-state--on' : 'arcade-evt-state--off');
                state.textContent = entry.cssb64 ? 'stylable' : 'fixed look';
                state.title = entry.cssb64 ? 'Reads &b64css — a future per-add-on style editor can dress it' : 'Its own fixed look — no css override support (source-verified)';
                row.appendChild(state);
                if (!OVERLAY_LOCAL_FILES[entry.file]) {
                    var hosted = document.createElement('span');
                    hosted.className = 'arcade-evt-state arcade-evt-state--off';
                    hosted.textContent = 'hosted';
                    hosted.title = 'Not in the local bundle — resolves to socialstream.ninja; needs network to preview';
                    row.appendChild(hosted);
                }
                row.addEventListener('click', function () { selectOverlayTemplate(entry.file); });
                list.appendChild(row);
            });
        });
    }

    function selectOverlayTemplate(file) {
        overlaysSelectedFile = file;
        renderOverlaysList();
        renderOverlaysConfig();
    }

    function findThemePageEntry(file) {
        var found = null;
        THEME_PAGES.forEach(function (e) { if (e.file === file) found = e; });
        return found;
    }

    function initOverlaysPreviewFrame() {
        var entry = findThemePageEntry(overlaysSelectedFile);
        if (!entry) return;
        var myToken = ++overlaysPreviewToken;
        // Demo-isolated: the throwaway preview room, never the live session.
        // loadlast is inert on every one of these pages today (the THEME_PAGES
        // support map) but harmless if a future theme reads it.
        var params = ['session=' + encodeURIComponent(gamesPreviewRoom), 'loadlast=30'];
        widgetPreviewResolve('arcade-overlays-preview-frame', 'themes/' + entry.file, params, function () { return myToken === overlaysPreviewToken; });
    }

    function renderOverlaysConfig() {
        var host = document.getElementById('arcade-overlays-config');
        if (!host) return;
        host.innerHTML = '';
        var entry = findThemePageEntry(overlaysSelectedFile);
        if (!entry) {
            widgetHint(host, 'Pick a template on the left.');
            return;
        }

        var title = document.createElement('div');
        title.className = 'arcade-evt-cond__title';
        title.textContent = entry.name;
        host.appendChild(title);
        widgetHint(host,
            (THEME_TARGET_LABEL[entry.target] === 'SPECIAL' ? 'A full-screen special (not a chat list). ' : '') +
            (OVERLAY_LOCAL_FILES[entry.file] ? '' : 'Hosted page (not in the local bundle) — the preview needs network; offline it honestly stays blank. ') +
            'The preview runs in an isolated throwaway room — never your live session. The copy below carries the REAL session.');

        var preview = document.createElement('div');
        preview.className = 'arcade-alerts-preview arcade-widget-preview';
        var bar = document.createElement('div');
        bar.className = 'arcade-alerts-preview-bar';
        var reloadBtn = document.createElement('button');
        reloadBtn.type = 'button';
        reloadBtn.className = 'arcade-btn arcade-btn--sm';
        reloadBtn.textContent = 'Reload preview';
        reloadBtn.addEventListener('click', initOverlaysPreviewFrame);
        bar.appendChild(reloadBtn);
        preview.appendChild(bar);
        var frame = document.createElement('iframe');
        frame.id = 'arcade-overlays-preview-frame';
        frame.title = entry.name + ' — demo-isolated preview';
        preview.appendChild(frame);
        host.appendChild(preview);

        var actions = document.createElement('div');
        actions.className = 'arcade-frames-actions';
        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        copyBtn.textContent = 'Copy overlay URL';
        copyBtn.addEventListener('click', function () {
            copyElementOverlayUrl({ overlayPage: 'themes/' + entry.file, params: [] }, copyBtn);
            widgetStatus('overlays', 'Copying — ' + entry.name + ', real session, never the preview room.');
        });
        actions.appendChild(copyBtn);
        host.appendChild(actions);

        widgetHint(host, entry.cssb64
            ? 'Stylable: this template reads &b64css — per-add-on style editing can dress it when that lane lands.'
            : 'Fixed look: this template has no css override support (source-verified in the census).');
        initOverlaysPreviewFrame();
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
    // TASK-67 (Lane 3): the Main-pane "Edit chat" quick panel's tuning
    // (canonical: the arcadeDockTune setting; localStorage mirror — the
    // interface flag's doctrine). The DOCK (APP) preview must render
    // against the SAME truth the real dock boots with, so the mirror
    // overlays the static house defaults here exactly the way
    // ensureChatDockLoaded does it in index.html.
    function readArcadeDockTune() {
        try { return JSON.parse(localStorage.getItem('arcadeDockTune') || '{}') || {}; } catch (e) { return {}; }
    }
    function arcadeDockAppPreviewParams() {
        var tune = readArcadeDockTune();
        var out = [];
        ARCADE_DOCK_APP_PREVIEW_PARAMS.forEach(function (p) {
            if (p.indexOf('scale=') === 0) { out.push('scale=' + (tune.scale || '1.45')); return; }
            if (p.indexOf('opacity=') === 0) { out.push('opacity=' + (tune.opacity || '0.65')); return; }
            if (p === 'darkmode') { if (tune.dark !== false) out.push(p); return; }
            if (p.indexOf('font=') === 0) {
                var f = ('font' in tune) ? String(tune.font || '') : 'opendyslexic';
                if (f) out.push('font=' + encodeURIComponent(f));
                return;
            }
            out.push(p);
        });
        return out;
    }
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

    // TASK-67 (Lane 4) — the curated font dropdown choices. Honest scope:
    // these ride --font-family, so they must be families the dock can
    // actually resolve — its bundled Sora stack (the default), its bundled
    // OpenDyslexic @font-face, and the generic system stacks. Custom… is
    // the free-text door for any locally-installed family. (Stock's
    // &googlefont param would FETCH a Google Font over the network — the
    // CSS var alone doesn't load fonts, so no pretend entry for it here.)
    var ARCADE_FONT_CHOICES = [
        { v: '', label: 'Dock default (Sora stack)' },
        { v: 'opendyslexic', label: 'OpenDyslexic (bundled)' },
        { v: 'system-ui', label: 'System UI' },
        { v: 'sans-serif', label: 'Sans-serif (system)' },
        { v: 'serif', label: 'Serif (system)' },
        { v: 'monospace', label: 'Monospace (system)' },
        { v: 'cursive', label: 'Cursive (system)' },
        { v: '__custom__', label: 'Custom…' }
    ];

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
        // TASK-67 (Lane 4) — font family is a DROPDOWN now ("not a type
        // in"): curated families the dock really supports (its bundled Sora
        // stack + OpenDyslexic @font-face + system stacks) + Custom…, which
        // reveals the free-text for any locally-installed family. Values
        // ride --font-family exactly as the old text control's did.
        { id: 'fontFamily', label: 'Font family', kind: 'font', vars: ['--font-family'] },
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
            // TASK-67 (Lane 4) — the living CSS pane: what the current picks
            // compose, live, read-only until unlocked ("this way the user
            // can learn about it as they go, or edit it themselves").
            '<div class="arcade-field" id="arcade-style-composed-field">' +
            '<label for="arcade-style-composed">COMPOSED CSS — LIVE FROM YOUR PICKS</label>' +
            '<span class="arcade-field__hint">tracks the pickers as you move them — Copy it, or unlock to fork it into hand-edited Custom CSS (one-way: manual edits stop tracking the pickers)</span></div>' +
            '<pre id="arcade-style-composed" class="arcade-style-composed" tabindex="0" role="region" aria-label="Composed CSS, live from the current picks"></pre>' +
            '<div class="arcade-evt-doors">' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-style-composed-copy">Copy CSS</button>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-style-composed-unlock">Unlock to edit…</button>' +
            '</div>' +
            // TASK-67 (Lane 4) — Steve's preset pickers, surfaced in Style.
            '<div class="arcade-field arcade-style-steves">' +
            '<label>STEVE’S PRESETS — THE OBS OVERLAYS</label>' +
            '<span class="arcade-field__hint">stock’s ready-made preset lists (popup.html’s own overlay-preset-select + featured-preset-select), same canonical params. Honest scope: presets swap the whole OBS overlay page — the chat-overlay list dresses the OBS chat widget, the featured list the single-message overlay. The app dock can’t wear a whole page, so it takes its look from the pickers above instead.</span>' +
            '<div class="arcade-style-steves__row">' +
            '<select id="arcade-style-steve-overlay" aria-label="Steve’s chat overlay presets"></select>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-style-steve-overlay-copy">Copy overlay URL</button>' +
            '</div>' +
            '<div class="arcade-style-steves__row">' +
            '<select id="arcade-style-steve-featured" aria-label="Steve’s featured overlay presets"></select>' +
            '<button type="button" class="arcade-btn arcade-btn--sm" id="arcade-style-steve-featured-copy">Copy featured URL</button>' +
            '</div>' +
            // TASK-70 (Lane 1) — the cross-link where the featured settings
            // used to be reachable from: their HOME is the Featured Chat
            // add-on interior now; Style keeps the LOOK presets only.
            '<span class="arcade-field__hint">Who gets featured and the message filters moved to their own home: Add-ons → <button type="button" class="arcade-linklike" id="arcade-style-featured-crosslink">Featured Chat</button>.</span>' +
            '</div>' +
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

        // TASK-67 (Lane 4) — living CSS pane wiring.
        panel.querySelector('#arcade-style-composed-copy').addEventListener('click', function () {
            var btn = this;
            copyToClipboard(composedCssForDisplay()).then(function () { flashButton(btn, 'Copied ✓'); })
                .catch(function () { flashButton(btn, 'Copy failed', 2200); });
        });
        var composedUnlockBtn = panel.querySelector('#arcade-style-composed-unlock');
        composedUnlockBtn.addEventListener('click', function () {
            // One-way fork, confirm-on-second-click (house idiom): the
            // current picks flatten into hand-edited Custom CSS and the
            // pickers reset — manual edits stop tracking the pickers.
            if (composedUnlockBtn.dataset.armed !== 'true') {
                composedUnlockBtn.dataset.armed = 'true';
                composedUnlockBtn.textContent = 'Unlock — pickers reset, CSS goes to Custom CSS. Confirm?';
                setTimeout(function () {
                    if (composedUnlockBtn.isConnected) {
                        composedUnlockBtn.dataset.armed = 'false';
                        composedUnlockBtn.textContent = 'Unlock to edit…';
                    }
                }, 5000);
                return;
            }
            var css = composedCssForDisplay();
            styleState = {};
            syncStyleControlsFromState();
            styleUserCss = css;
            var ta = panel.querySelector('#arcade-style-usercss');
            if (ta) ta.value = css;
            composedUnlockBtn.dataset.armed = 'false';
            composedUnlockBtn.textContent = 'Unlock to edit…';
            queueStylePreviewRefresh();
            renderComposedCss();
            setStyleStatus('Unlocked — your picks are now flat Custom CSS (the pickers no longer track them). Clear Custom CSS to start over.');
        });

        // TASK-67 (Lane 4) — Steve's preset pickers. The option lists are
        // stock's own selects, verbatim (popup.html:4765-4791 overlay,
        // :4823-4852 featured); the Copy door composes the URL with the
        // same canonical params via the shared element-URL builder (real
        // session, language params, stock encode).
        var overlaySel = panel.querySelector('#arcade-style-steve-overlay');
        STEVE_OVERLAY_PRESETS.forEach(function (p) {
            var o = document.createElement('option');
            o.value = p.v;
            o.textContent = p.label;
            overlaySel.appendChild(o);
        });
        var featuredSel = panel.querySelector('#arcade-style-steve-featured');
        STEVE_FEATURED_PRESETS.forEach(function (p) {
            var o = document.createElement('option');
            o.value = p.v;
            o.textContent = p.label;
            featuredSel.appendChild(o);
        });
        panel.querySelector('#arcade-style-steve-overlay-copy').addEventListener('click', function () {
            var btn = this;
            var spec = splitStevePresetValue(overlaySel.value || 'sampleoverlay.html');
            copyElementOverlayUrl({ overlayPage: spec.page, params: spec.params }, btn);
        });
        panel.querySelector('#arcade-style-steve-featured-copy').addEventListener('click', function () {
            var btn = this;
            var spec = splitStevePresetValue(featuredSel.value || 'featured.html');
            copyElementOverlayUrl({ overlayPage: spec.page, params: spec.params }, btn);
        });
        // TASK-70 (Lane 1) — the cross-link to Featured Chat's own home.
        panel.querySelector('#arcade-style-featured-crosslink').addEventListener('click', function () {
            navigateArcadeTab('featured');
        });
    }

    // TASK-67 (Lane 4) — stock's preset lists, verbatim from popup.html.
    // Chat overlay presets (overlay-preset-select, popup.html:4765-4791):
    var STEVE_OVERLAY_PRESETS = [
        { v: 'sampleoverlay.html', label: '📄 Sample Overlay - Basic chat overlay' },
        { v: 'themes/compact-classic.html', label: '💬 Compact Classic - Dense Twitch/IRC-style chat' },
        { v: 'themes/compact-classic.html?ultra', label: '⚡ Compact Ultra - Super dense minimum-height chat' },
        { v: 'themes/compact-clean.html', label: '🧼 Compact Clean - Tidy compact cards' },
        { v: 'themes/compact-glass.html', label: '🪟 Compact Glass - Frosted compact rows' },
        { v: 'themes/overlay-comic-pop.html', label: '💥 Comic Pop Dock - Stackable pop art chat' },
        { v: 'themes/overlay-comic-classic.html', label: '🗯️ Comic Pop Classic - Featured style chat' },
        { v: 'themes/horizontal.html', label: '➡️ Horizontal Scroll - Right-to-left ticker' },
        { v: 'themes/overlay-ticker-news.html', label: '📰 News Ticker - Breaking-news crawl bar' },
        { v: 'themes/overlay-credits.html', label: '🎬 Movie Credits - Continuous rolling credits' },
        { v: 'themes/overlay-danmaku.html', label: '🎯 Danmaku Bullet Chat - Messages fly across screen' },
        { v: 'themes/overlay-neon-cyberpunk.html', label: '⚡ Neon Cyberpunk - Futuristic glitch effects' },
        { v: 'themes/overlay-particles.html', label: '✨ Particle System - Floating message effects' },
        { v: 'themes/overlay-typewriter.html', label: '⌨️ Terminal Typewriter - Retro typing effects' },
        { v: 'themes/overlay-bubbles.html', label: '🫧 Bubble Chat - Floating speech bubbles' },
        { v: 'themes/overlay-cards.html', label: '🃏 Card Flip 3D - Interactive card animations' },
        { v: 'themes/overlay-xacception.html', label: '❎ Simple Alternative - Basic bubble message' },
        { v: 'themes/pretty.html', label: '✨ Pretty Theme - Holographic style' },
        { v: 'themes/Neutron/chatOnly.html', label: '⚛️ Neutron Chat - Sci-fi gaming theme' },
        { v: 'themes/Neutron/stream.html', label: '⚛️ Neutron Stream - Full stream layout' },
        { v: 'themes/Windows3.1/index.html', label: '🖥️ Windows 3.1 - Retro computing' },
        { v: 'themes/deuks_overlay/overlay1.html', label: '🎬 Deuks Overlay 1 - Custom streaming' },
        { v: 'themes/deuks_overlay/overlay2.html', label: '🎬 Deuks Overlay 2 - Alternative layout' },
        { v: 'themes/rainbowpuke/index.html', label: '🌈 Rainbow Puke - Colorful chaos' },
        { v: 'themes/t3nk3y/index.html', label: '🎮 T3nk3y Theme - Gaming style' },
        { v: 'themes/LuckyLootTube/luckyloottube.html', label: '🎁 LuckyLootTube - Liquid Glass' }
    ];
    // Featured overlay presets (featured-preset-select, popup.html:4823-4852):
    var STEVE_FEATURED_PRESETS = [
        { v: '', label: 'Classic (Full Customization)' },
        { v: 'themes/featured-styles/featured-modern.html?style=glass', label: 'Modern Glass' },
        { v: 'themes/featured-styles/featured-modern.html?style=neon', label: 'Neon Glow' },
        { v: 'themes/featured-styles/featured-modern.html?style=minimal', label: 'Minimal Clean' },
        { v: 'themes/featured-styles/featured-modern.html?style=gaming', label: 'Gaming RGB' },
        { v: 'themes/featured-styles/featured-modern.html?style=twitch', label: 'Twitch Style' },
        { v: 'themes/featured-styles/featured-animated.html?style=bounce', label: 'Animated Bounce' },
        { v: 'themes/featured-styles/featured-animated.html?style=slide', label: 'Animated Slide' },
        { v: 'themes/featured-styles/featured-animated.html?style=typewriter', label: 'Typewriter' },
        { v: 'themes/featured-styles/featured-animated.html?style=comic', label: 'Comic Pop' },
        { v: 'themes/featured-styles/featured-animated.html?style=holo', label: 'Holographic' },
        { v: 'themes/featured-styles/featured-3d.html?style=cube', label: '3D Cube' },
        { v: 'themes/featured-styles/featured-3d.html?style=flip', label: 'Card Flip' },
        { v: 'themes/featured-styles/featured-3d.html?style=float', label: 'Floating Panels' },
        { v: 'themes/featured-styles/featured-3d.html?style=helix', label: 'Helix Spiral' },
        { v: 'themes/featured-styles/featured-3d.html?style=iso', label: 'Isometric' },
        { v: 'themes/featured-styles/featured-particles.html?style=fireflies', label: 'Fireflies' },
        { v: 'themes/featured-styles/featured-particles.html?style=snow', label: 'Snow Fall' },
        { v: 'themes/featured-styles/featured-particles.html?style=matrix', label: 'Matrix Rain' },
        { v: 'themes/featured-styles/featured-particles.html?style=bubbles', label: 'Bubbles' },
        { v: 'themes/featured-styles/featured-particles.html?style=stars', label: 'Starfield' },
        { v: 'themes/featured-styles/featured-slide.html', label: 'Sliding Effects' },
        { v: 'themes/featured-styles/featured-gradient.html', label: 'Gradient Animations' },
        { v: 'themes/featured-styles/featured-retro.html', label: 'Retro/Synthwave' },
        { v: 'themes/featured-styles/featured-glass.html', label: 'Glassmorphism' },
        { v: 'themes/featured-styles/featured-cyberpunk.html', label: 'Cyberpunk' },
        { v: 'themes/featured-styles/featured-gaming.html', label: 'Gaming Themed' },
        { v: 'themes/featured-styles/featured-elegant.html', label: 'Elegant & Sophisticated' },
        { v: 'themes/featured-styles/featured-dynamic.html', label: 'Dynamic Physics' },
        { v: 'themes/featured-styles/featured-neon.html', label: 'Neon Glow' }
    ];
    // 'themes/foo.html?style=glass' → { page, params:['style=glass'] } — the
    // option value's query string IS the canonical param set stock composes.
    function splitStevePresetValue(value) {
        var parts = String(value || '').split('?');
        return { page: parts[0] || 'featured.html', params: parts[1] ? parts[1].split('&').filter(Boolean) : [] };
    }

    // TASK-67 (Lane 4) — the living CSS pane: the composed blob minus the
    // style-builder state marker (that's plumbing, not something to learn).
    function composedCssForDisplay() {
        var blob = buildStyleCss();
        var stripped = blob.replace(/^\s*\/\*[\s\S]*?\*\/\n?/, '');
        return stripped || '/* nothing picked yet — the dock’s default look applies */';
    }
    function renderComposedCss() {
        var pre = document.getElementById('arcade-style-composed');
        if (pre) pre.textContent = composedCssForDisplay();
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
            input.className = 'arcade-toggle__input'; // TASK-68 — the shared switch look (item 8 sweep); the row's own label stays the text side
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
        } else if (ctl.kind === 'font') {
            // TASK-67 (Lane 4) — curated dropdown + Custom… free-text door.
            input = document.createElement('select');
            ARCADE_FONT_CHOICES.forEach(function (f) {
                var o = document.createElement('option');
                o.value = f.v;
                o.textContent = f.label;
                input.appendChild(o);
            });
            var customFont = document.createElement('input');
            customFont.type = 'text';
            customFont.className = 'arcade-style-fontcustom';
            customFont.placeholder = 'e.g. "Inter", sans-serif';
            customFont.setAttribute('aria-label', 'Custom font family');
            customFont.hidden = true;
            customFont.addEventListener('input', function () {
                setStyleValue(ctl.id, customFont.value.trim());
                row.classList.toggle('is-set', !!customFont.value.trim());
            });
            input.__fontCustom = customFont;
            input.addEventListener('change', function () {
                if (input.value === '__custom__') {
                    customFont.hidden = false;
                    customFont.focus();
                    setStyleValue(ctl.id, customFont.value.trim());
                    row.classList.toggle('is-set', !!customFont.value.trim());
                } else {
                    customFont.hidden = true;
                    setStyleValue(ctl.id, input.value);
                    row.classList.toggle('is-set', !!input.value);
                }
            });
        } else {
            input = document.createElement('input');
            input.type = 'text';
            if (ctl.placeholder) input.placeholder = ctl.placeholder;
            input.addEventListener('input', function () { setStyleValue(ctl.id, input.value.trim()); row.classList.toggle('is-set', !!input.value.trim()); });
        }
        input.id = 'arcade-style-ctl-' + ctl.id;
        row.appendChild(input);
        if (ctl.kind === 'toggle') { // TASK-68 — the switch's track rides the shared .arcade-toggle CSS (input + track sibling idiom)
            var styleTrack = document.createElement('span');
            styleTrack.className = 'arcade-toggle__track';
            styleTrack.setAttribute('aria-hidden', 'true');
            var styleThumb = document.createElement('span');
            styleThumb.className = 'arcade-toggle__thumb';
            styleTrack.appendChild(styleThumb);
            row.appendChild(styleTrack);
        }
        if (input.__fontCustom) row.appendChild(input.__fontCustom);
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
            else if (ctl.kind === 'font') {
                var fontVal = has ? String(styleState[ctl.id]) : '';
                var fontCustom = input.__fontCustom;
                var known = ARCADE_FONT_CHOICES.some(function (f) { return f.v === fontVal && f.v !== '__custom__'; });
                if (has && !known) {
                    input.value = '__custom__';
                    if (fontCustom) { fontCustom.hidden = false; fontCustom.value = fontVal; }
                } else {
                    input.value = fontVal;
                    if (fontCustom) { fontCustom.hidden = true; fontCustom.value = ''; }
                }
            }
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
        loadStyleSettings().then(function () { renderComposedCss(); initStylePreviewFrame(); });
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
        renderComposedCss(); // TASK-67 — the living CSS pane tracks every pick immediately
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
        var baseParams = activeStyleProfile === 'dock' ? arcadeDockAppPreviewParams() : ARCADE_WIDGET_PREVIEW_PARAMS;
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
            var baseParams = (activeStyleProfile === 'dock' ? arcadeDockAppPreviewParams() : ARCADE_WIDGET_PREVIEW_PARAMS).slice();
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
    // this shell), so its sub says "since boot" (renderWatchTime) and it does
    // NOT honor the period selector. The sub once carried a "· est" suffix —
    // TASK-69 cut it: the value is a real integral, and branding real data as
    // estimated lies the other way (the honest-time law cuts both). Confirmed
    // by a points.js trace (0018.05.25): SSN has NO
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
            '<div class="arcade-panel-head"><span class="arcade-panel-title arcade-side-hide">ANALYTICS</span>' +
            '<span class="arcade-spacer arcade-side-hide"></span>' +
            '<button type="button" class="arcade-btn arcade-btn--sm arcade-btn--icon" id="arcade-side-toggle" ' +
            'aria-expanded="true" aria-label="Collapse analytics rail" title="Collapse analytics rail">«</button></div>' +
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
            // TASK-67 — the OBS link tile gains its config door: deep-link
            // to Deck Settings → Connections, where the stock OBS WebSocket
            // group (obsws/obspw fields, names only) rides the embed.
            '<button type="button" class="arcade-btn arcade-btn--sm arcade-onair__config" id="arcade-onair-config" ' +
            'title="Configure the OBS WebSocket link — Deck Settings → Connections">⚙ OBS link</button>' +
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
            // S48 — the points pulse tile: top earner TODAY off real points
            // IndexedDB reads via the bridge (renderPointsPulse); base rate
            // only, dash-faced while off/unearned — dash stays dash.
            '<div class="arcade-stat"><span class="arcade-stat__label">TOP EARNER TODAY</span>' +
            '<span class="arcade-stat__value arcade-fx-ticker is-dash" id="arcade-stat-points-value">—</span><span class="arcade-stat__sub" id="arcade-stat-points-sub">points: connecting…</span></div>' +
            '</div>' +
            '<div class="arcade-field"><label>FOLLOWER DELTA</label><span class="arcade-field__hint">Δ since this session started — no historical archive yet</span></div>' +
            '<ul class="arcade-frow-list" id="arcade-follower-rows"></ul>' +
            // S48 — top earners today (base pts off today's engagement
            // windows; all-time available on the right). Real reads only.
            '<div class="arcade-field"><label>POINTS — TOP EARNERS TODAY</label><span class="arcade-field__hint">base pts from today’s engagement windows · right: all-time available</span></div>' +
            '<ul class="arcade-frow-list" id="arcade-points-rows"></ul>' +
            '<div class="arcade-field"><label>RECENT NOTIFICATIONS</label><span class="arcade-field__hint">latest from chat history, any period</span></div>' +
            '<div id="arcade-notifications"><div class="arcade-nrow-empty arcade-fx-grid" id="arcade-nrow-empty">Waiting on the background bridge — raids, follows, and ' +
            'donations live in the chat-history store (background.js/db.js); this reads it via frame2, not a fabricated feed.</div>' +
            '<ul class="arcade-nrow-list" id="arcade-nrow-list" hidden></ul></div>' +
            '</div>'
        );
    }

    function initAnalyticsPeriodSelector(side) {
        // TASK-67 — the OBS link tile's config door (Lane 1): deep-link to
        // Deck Settings → Connections; the stock OBS WebSocket group is the
        // FIRST berthed group there (already expanded by the embed driver),
        // and focus lands IN that embed — H17-B destination rule.
        var obsBtn = side.querySelector('#arcade-onair-config');
        if (obsBtn) {
            obsBtn.addEventListener('click', function () {
                navigateArcadeTab('settings');
                if (typeof window.arcadeDeckSelect === 'function') window.arcadeDeckSelect('connections');
                var tries = 0;
                var timer = setInterval(function () {
                    tries++;
                    var frame = document.querySelector('.arcade-settings .arcade-deck-embed__frame');
                    if (frame || tries > 20) {
                        clearInterval(timer);
                        if (frame) {
                            frame.scrollIntoView({ block: 'nearest' });
                            try { frame.focus(); } catch (e) { /* noop */ }
                        }
                    }
                }, 150);
            });
        }
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
        renderPointsPulse(); // S48 — the points pulse tile + top-earners rows (own async token)
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
        if (subEl) subEl.textContent = 'since boot';
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
    // --------------------------------------------------------------------
    // TASK-67 (Lane 2) — ONE shared column-collapse mechanism for every
    // rail/column in the shell ("right rail minimizable like the left",
    // "all tabs' left/right columns like the main tab"). One helper drives
    // button state + aria + persistence (per-column localStorage key); the
    // caller supplies the apply() that flips whatever class/width its
    // column's CSS keys on. The sources rail keeps its LEGACY storage key
    // (arcadeRailCollapsed) so an operator's saved state survives.
    // --------------------------------------------------------------------
    function initArcadeColumnCollapse(opts) {
        // opts: { btn, storeKey, collapseLabel, expandLabel, apply(collapsed) }
        if (!opts || !opts.btn) return;
        var collapsed = false;
        try { collapsed = localStorage.getItem(opts.storeKey) === 'true'; } catch (e) { /* noop */ }
        applyState(collapsed);
        opts.btn.addEventListener('click', function () {
            collapsed = !collapsed;
            applyState(collapsed);
            try { localStorage.setItem(opts.storeKey, collapsed ? 'true' : 'false'); } catch (e) { /* noop */ }
        });
        function applyState(c) {
            opts.apply(c);
            opts.btn.textContent = c ? '»' : '«';
            opts.btn.setAttribute('aria-expanded', String(!c));
            opts.btn.setAttribute('aria-label', c ? opts.expandLabel : opts.collapseLabel);
            opts.btn.title = c ? opts.expandLabel : opts.collapseLabel;
        }
    }

    function initRailCollapseToggle(btn) {
        initArcadeColumnCollapse({
            btn: btn,
            storeKey: 'arcadeRailCollapsed', // legacy key — pre-TASK-67 shape, kept
            collapseLabel: 'Collapse sources to icon rail',
            expandLabel: 'Expand sources',
            apply: function (collapsed) {
                document.body.classList.toggle('arcade-rail-collapsed', collapsed);
            }
        });
    }

    // Every interior with a left list column (the S47/S50
    // .arcade-alerts-body idiom) + the Style tab's controls column. The
    // toggle lives in the panel HEAD (always visible, so a fully-collapsed
    // column is always re-openable); the class rides the column itself.
    function installArcadeColumnToggles() {
        var defs = [
            { panel: '.arcade-ai', col: '.arcade-evt-list-col', key: 'ai-list', label: 'AI zones list' },
            { panel: '.arcade-alerts', col: '.arcade-evt-list-col', key: 'alerts-list', label: 'alerts list' },
            { panel: '.arcade-games', col: '.arcade-evt-list-col', key: 'games-list', label: 'games list' },
            { panel: '.arcade-commands', col: '.arcade-evt-list-col', key: 'commands-list', label: 'commands list' },
            { panel: '.arcade-goals', col: '.arcade-evt-list-col', key: 'goals-list', label: 'goal bars list' },
            { panel: '.arcade-frames', col: '.arcade-evt-list-col', key: 'frames-list', label: 'frames & cameras list' },
            { panel: '.arcade-tipjar', col: '.arcade-evt-list-col', key: 'tipjar-list', label: 'tip jar list' },
            { panel: '.arcade-overlays', col: '.arcade-evt-list-col', key: 'overlays-list', label: 'overlay templates list' },
            { panel: '.arcade-settings', col: '.arcade-evt-list-col', key: 'deck-list', label: 'settings sections list' },
            // Style's left column sits in a fixed-track grid — the track
            // itself must collapse too, hence wrapSel on the grid.
            { panel: '.arcade-style', col: '.arcade-style-controls-col', key: 'style-controls', label: 'style controls', wrapSel: '.arcade-style-cols' }
        ];
        defs.forEach(function (def) {
            var panel = document.querySelector(def.panel);
            if (!panel) return;
            var column = panel.querySelector(def.col);
            var head = panel.querySelector('.arcade-panel-head');
            var title = head && head.querySelector('.arcade-panel-title');
            if (!column || !head || !title) return;
            if (!column.id) column.id = 'arcade-col-' + def.key;
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'arcade-btn arcade-btn--sm arcade-btn--icon arcade-col-toggle';
            btn.setAttribute('aria-controls', column.id);
            title.insertAdjacentElement('afterend', btn);
            var wrap = def.wrapSel ? panel.querySelector(def.wrapSel) : null;
            initArcadeColumnCollapse({
                btn: btn,
                storeKey: 'arcadeColCollapsed:' + def.key,
                collapseLabel: 'Collapse the ' + def.label,
                expandLabel: 'Expand the ' + def.label,
                apply: function (collapsed) {
                    column.classList.toggle('arcade-col-collapsed', collapsed);
                    if (wrap) wrap.classList.toggle('arcade-col-collapsed-wrap', collapsed);
                }
            });
        });
    }

    // The RIGHT rail (Main's analytics side) gets the same affordance as
    // the left — collapsing narrows --arc-side-w, which the content pane's
    // padding-right already tracks (the left rail's own doctrine, mirrored).
    function initSideCollapseToggle(btn) {
        initArcadeColumnCollapse({
            btn: btn,
            storeKey: 'arcadeSideCollapsed',
            collapseLabel: 'Collapse analytics rail',
            expandLabel: 'Expand analytics rail',
            apply: function (collapsed) {
                document.body.classList.toggle('arcade-side-collapsed', collapsed);
            }
        });
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

        // TASK-67 — the NAME is a button: opens the source-details popout
        // (connection state + real per-source details + stock's real
        // per-source actions). The start/stop icon stays its own button.
        var nameWrap = document.createElement('button');
        nameWrap.type = 'button';
        nameWrap.className = 'arcade-src__name arcade-src__namebtn';
        nameWrap.title = 'Source details & actions';
        nameWrap.setAttribute('aria-label', 'Details for ' + sourceDisplayName(source));
        nameWrap.setAttribute('aria-haspopup', 'dialog');
        nameWrap.addEventListener('click', function (e) {
            e.stopPropagation();
            openSourceDetailsPopout(source.id);
        });
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

    // --------------------------------------------------------------------
    // TASK-67 (Lane 1) — THE PROVIDER PICKER, RESTORED. The arcade's
    // "+ Add source" used to just jump to Deck Settings → Connections;
    // stock's big provider list (index.html's .addnew block, the streams
    // page the arcade shell replaced) was unreachable. This registry
    // mirrors that stock block 1:1 (visible entries only — stock keeps
    // 'pilled' hidden, so do we) and each pick calls the SAME stock global
    // the stock button's onclick called — stock's own validation, prompts,
    // and source-creation path, never a re-implementation.
    // --------------------------------------------------------------------
    var ADD_SOURCE_PROVIDERS = [
        { label: 'YouTube', target: 'youtube', kind: 'youtube' },
        { label: 'Twitch', target: 'twitch', kind: 'prompt' },
        { label: 'Kick', target: 'kick', kind: 'prompt' },
        { label: 'VPZONE', target: 'vpzone', kind: 'prompt' },
        { label: 'Velora', target: 'velora', kind: 'prompt' },
        { label: 'Instagram Live', target: 'instagramlive', kind: 'prompt' },
        { label: 'Facebook', target: 'facebook', kind: 'prompt' },
        { label: 'TikTok', target: 'tiktok', kind: 'prompt' },
        { label: 'Picarto', target: 'picarto', kind: 'prompt' },
        { label: 'X.com', target: 'x', kind: 'prompt' },
        { label: 'Mixcloud', target: 'mixcloud', kind: 'prompt' },
        { label: 'TwitCasting', target: 'twitcasting', kind: 'prompt' },
        { label: 'YouNow', target: 'younow', kind: 'prompt' },
        { label: 'CHZZK', target: 'chzzk', kind: 'prompt' },
        { label: 'Nimo', target: 'nimo', kind: 'prompt' },
        { label: 'SOOP Live', target: 'sooplive', kind: 'prompt' },
        { label: 'Rumble', target: 'rumble', kind: 'prompt' },
        { label: 'Rumble Video', target: 'rumble', kind: 'videoid' },
        { label: 'Rumble API Tracker', target: 'rumble', kind: 'rumbleapi' },
        { label: 'Beamstream', target: 'beamstream', kind: 'prompt' },
        { label: 'Parti', target: 'parti', kind: 'prompt' },
        { label: 'Arena Social', target: 'arenasocial', kind: 'prompt' },
        { label: 'BiliBili.com', target: 'bilibilicom', kind: 'prompt' },
        { label: 'BiliBili.tv', target: 'bilibilitv', kind: 'prompt' },
        { label: 'Peertube', target: 'peertube', kind: 'other' },
        { label: 'Other (any chat URL)', target: 'other', kind: 'other' }
    ];
    // kind → the stock global the stock .addnew button wired to (cited from
    // index.html:170-225).
    var ADD_SOURCE_STOCK_FN = {
        youtube: 'showYouTubeAddSourcePrompt',
        prompt: 'newSourcePrompt',
        videoid: 'newSourceVideoIDPrompt',
        rumbleapi: 'newRumbleApiTrackerPrompt',
        other: 'newOtherSourcePrompt'
    };
    var addSourcePickerKeydown = null;

    function openAddSourcePicker() {
        closeAddSourcePicker(false);
        var trigger = document.getElementById('arcade-add-source');
        var back = document.createElement('div');
        back.className = 'arcade-evt-modal-back';
        back.id = 'arcade-addsrc-picker';
        var modal = document.createElement('div');
        modal.className = 'arcade-evt-modal arcade-addsrc-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'Add a chat source — pick a provider');
        var title = document.createElement('h3');
        title.className = 'arcade-evt-modal__title';
        title.tabIndex = -1;
        title.textContent = 'Add a chat source';
        modal.appendChild(title);
        var blurb = document.createElement('p');
        blurb.className = 'arcade-evt-modal__blurb';
        blurb.textContent = 'Pick a provider — stock’s own add flow takes it from there. Type to filter the list.';
        modal.appendChild(blurb);

        var search = document.createElement('input');
        search.type = 'search';
        search.className = 'arcade-addsrc-search';
        search.id = 'arcade-addsrc-search';
        search.placeholder = 'Filter providers…';
        search.autocomplete = 'off';
        search.setAttribute('aria-label', 'Filter providers');
        search.setAttribute('aria-controls', 'arcade-addsrc-list');
        modal.appendChild(search);

        var list = document.createElement('div');
        list.className = 'arcade-addsrc-list';
        list.id = 'arcade-addsrc-list';
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', 'Providers');
        modal.appendChild(list);

        var empty = document.createElement('p');
        empty.className = 'arcade-evt-modal__blurb arcade-addsrc-empty';
        empty.textContent = 'No provider matches — try “other” for any chat URL.';
        empty.hidden = true;
        modal.appendChild(empty);

        ADD_SOURCE_PROVIDERS.forEach(function (p, idx) {
            var opt = document.createElement('button');
            opt.type = 'button';
            opt.className = 'arcade-addsrc-opt';
            opt.setAttribute('role', 'option');
            opt.setAttribute('aria-selected', 'false');
            opt.dataset.arcadeProviderIdx = String(idx);
            opt.dataset.arcadeProviderHay = (p.label + ' ' + p.target).toLowerCase();
            var img = document.createElement('img');
            img.alt = '';
            img.className = 'arcade-addsrc-opt__icon';
            try { img.src = window.getSourceIconUrl ? window.getSourceIconUrl(p.target === 'other' ? 'unknown' : p.target) : ''; } catch (e) { /* noop */ }
            opt.appendChild(img);
            var lab = document.createElement('span');
            lab.className = 'arcade-addsrc-opt__label';
            lab.textContent = p.label;
            opt.appendChild(lab);
            opt.addEventListener('click', function () { pickAddSourceProvider(p); });
            list.appendChild(opt);
        });

        function applyFilter() {
            var q = search.value.trim().toLowerCase();
            var visible = 0;
            Array.prototype.forEach.call(list.children, function (opt) {
                var show = !q || opt.dataset.arcadeProviderHay.indexOf(q) !== -1;
                opt.hidden = !show;
                if (show) visible++;
            });
            empty.hidden = visible !== 0;
        }
        search.addEventListener('input', applyFilter);
        // Arrow keys walk the visible options from the search box itself;
        // Enter picks the first visible one.
        search.addEventListener('keydown', function (e) {
            if (e.key !== 'ArrowDown' && e.key !== 'Enter') return;
            var visibleOpts = Array.prototype.slice.call(list.querySelectorAll('.arcade-addsrc-opt:not([hidden])'));
            if (!visibleOpts.length) return;
            e.preventDefault();
            if (e.key === 'Enter') visibleOpts[0].click();
            else visibleOpts[0].focus();
        });
        list.addEventListener('keydown', function (e) {
            if (['ArrowUp', 'ArrowDown', 'Home', 'End'].indexOf(e.key) === -1) return;
            var opts = Array.prototype.slice.call(list.querySelectorAll('.arcade-addsrc-opt:not([hidden])'));
            if (!opts.length) return;
            e.preventDefault();
            var idx = opts.indexOf(document.activeElement);
            if (e.key === 'Home') idx = 0;
            else if (e.key === 'End') idx = opts.length - 1;
            else idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
            opts[idx].focus();
        });

        back.appendChild(modal);
        back.addEventListener('click', function (e) { if (e.target === back) closeAddSourcePicker(true); });
        document.body.appendChild(back);
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
        addSourcePickerKeydown = function (e) {
            if (e.key === 'Escape' && document.getElementById('arcade-addsrc-picker')) {
                e.stopPropagation();
                closeAddSourcePicker(true);
            }
        };
        document.addEventListener('keydown', addSourcePickerKeydown);
        search.focus(); // H18-A — focus lands IN the dialog, on the filter
    }

    function pickAddSourceProvider(p) {
        closeAddSourcePicker(false);
        var fnName = ADD_SOURCE_STOCK_FN[p.kind];
        var fn = fnName && window[fnName];
        if (typeof fn !== 'function') {
            console.error('[arcade-shell] stock add-source flow missing:', fnName);
            return;
        }
        try {
            if (p.kind === 'youtube') fn('youtube');
            else if (p.kind === 'videoid') fn(p.target);
            else if (p.kind === 'rumbleapi') fn();
            else if (p.kind === 'other') fn(p.target === 'other' ? '' : p.target);
            else fn(p.target);
        } catch (e) {
            console.error('[arcade-shell] add-source flow failed:', e);
        }
        // Focus lands on the destination: the rail's add button stays the
        // anchor, and a successful add re-renders the rail via sourceAdded.
        var trigger = document.getElementById('arcade-add-source');
        if (trigger) trigger.focus();
    }

    function closeAddSourcePicker(returnFocus) {
        var back = document.getElementById('arcade-addsrc-picker');
        if (back) back.remove();
        if (addSourcePickerKeydown) {
            document.removeEventListener('keydown', addSourcePickerKeydown);
            addSourcePickerKeydown = null;
        }
        var trigger = document.getElementById('arcade-add-source');
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
            if (returnFocus) trigger.focus();
        }
    }

    // --------------------------------------------------------------------
    // TASK-67 (Lane 1) — the source DETAILS POPOUT. Clicking a source's
    // name opens a panel with its REAL details (read live off the app's own
    // stateManager) and a door to the full per-source actions stock really
    // exposes — the SSAppStreamDeckBridge command census (index.html
    // :7520-7548): start/stop/restart, mute, visibility, update (replyOnly,
    // autoActivate, accountRole, connectionMode — the last three are
    // stock-gated to a STOPPED source, and the panel says so honestly),
    // remove. Nothing beyond that list is wired, because nothing beyond it
    // exists.
    // --------------------------------------------------------------------
    var srcPopoutKeydown = null;
    var srcPopoutId = null;

    function openSourceDetailsPopout(sourceId) {
        closeSourceDetailsPopout(false);
        srcPopoutId = sourceId;
        var back = document.createElement('div');
        back.className = 'arcade-evt-modal-back';
        back.id = 'arcade-srcpop';
        var modal = document.createElement('div');
        modal.className = 'arcade-evt-modal arcade-srcpop-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'Source details');
        modal.id = 'arcade-srcpop-modal';
        back.appendChild(modal);
        back.addEventListener('click', function (e) { if (e.target === back) closeSourceDetailsPopout(true); });
        document.body.appendChild(back);
        srcPopoutKeydown = function (e) {
            if (e.key === 'Escape' && document.getElementById('arcade-srcpop')) {
                e.stopPropagation();
                closeSourceDetailsPopout(true);
            }
        };
        document.addEventListener('keydown', srcPopoutKeydown);
        renderSourceDetailsPopout();
        // H18-A — focus lands IN the dialog.
        var firstBtn = modal.querySelector('button');
        if (firstBtn) firstBtn.focus();
    }

    function closeSourceDetailsPopout(returnFocus) {
        var back = document.getElementById('arcade-srcpop');
        if (back) back.remove();
        if (srcPopoutKeydown) {
            document.removeEventListener('keydown', srcPopoutKeydown);
            srcPopoutKeydown = null;
        }
        var id = srcPopoutId;
        srcPopoutId = null;
        if (returnFocus && id) {
            var row = document.querySelector('#arcade-src-list [data-arcade-source-id="' + id + '"] .arcade-src__namebtn');
            if (row) row.focus();
        }
    }

    function srcPopDetail(grid, k, v) {
        var key = document.createElement('span');
        key.className = 'arcade-srcpop__k';
        key.textContent = k;
        var val = document.createElement('span');
        val.className = 'arcade-srcpop__v';
        val.textContent = v;
        grid.appendChild(key);
        grid.appendChild(val);
    }

    function renderSourceDetailsPopout() {
        var modal = document.getElementById('arcade-srcpop-modal');
        if (!modal || !srcPopoutId) return;
        var sm = window.stateManager;
        var source = sm && typeof sm.getSource === 'function' ? sm.getSource(srcPopoutId) : null;
        modal.innerHTML = '';
        if (!source) {
            var gone = document.createElement('p');
            gone.className = 'arcade-evt-modal__blurb';
            gone.textContent = 'That source is gone.';
            modal.appendChild(gone);
            return;
        }
        var meta = sourceStatusMeta(source);
        var isRunning = source.status === 'active' || source.status === 'activating';

        var title = document.createElement('h3');
        title.className = 'arcade-evt-modal__title';
        title.tabIndex = -1;
        title.textContent = sourceDisplayName(source);
        modal.appendChild(title);

        // Connection state leads — the Admiral's ask: "see a popout of the
        // details with the connection".
        var stateRow = document.createElement('div');
        stateRow.className = 'arcade-srcpop__state';
        var dot = document.createElement('span');
        dot.className = 'arcade-dot ' + meta.dotClass;
        stateRow.appendChild(dot);
        var stateText = document.createElement('span');
        stateText.textContent = meta.label;
        stateRow.appendChild(stateText);
        modal.appendChild(stateRow);

        var grid = document.createElement('div');
        grid.className = 'arcade-srcpop__grid';
        srcPopDetail(grid, 'Platform', source.target || '—');
        if (source.username) srcPopDetail(grid, 'Channel / user', source.username);
        if (source.videoId) srcPopDetail(grid, 'Video ID', source.videoId);
        srcPopDetail(grid, 'Connection mode', (source.connectionMode || 'classic') + (source.activeConnectionMode ? ' (live: ' + source.activeConnectionMode + ')' : ''));
        if (source.url) srcPopDetail(grid, 'Capture URL', source.url);
        srcPopDetail(grid, 'Muted', source.isMuted ? 'yes' : 'no');
        srcPopDetail(grid, 'Visible in dock', source.isVisible !== false ? 'yes' : 'no');
        srcPopDetail(grid, 'Reply only', source.replyOnly ? 'yes' : 'no');
        srcPopDetail(grid, 'Auto-start', source.autoActivate ? 'yes' : 'no');
        srcPopDetail(grid, 'Account role', source.accountRole || 'normal');
        modal.appendChild(grid);

        // ---- Actions: ONLY what stock's bridge really exposes. ----
        var actions = document.createElement('div');
        actions.className = 'arcade-srcpop__actions';

        function actionBtn(label, aria, danger, onClick) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'arcade-btn arcade-btn--sm' + (danger ? ' arcade-btn--danger' : '');
            btn.textContent = label;
            btn.setAttribute('aria-label', aria);
            btn.addEventListener('click', onClick);
            actions.appendChild(btn);
            return btn;
        }
        function bridgeThen(request) {
            callBridge(request).then(function () {
                // The stateManager events re-render the rail; the popout
                // re-reads live truth the same way.
                setTimeout(renderSourceDetailsPopout, 250);
            });
        }

        actionBtn(isRunning ? '■ Stop' : '● Start', (isRunning ? 'Stop ' : 'Start ') + sourceDisplayName(source), isRunning, function () {
            bridgeThen({ action: isRunning ? 'stopSource' : 'startSource', value: source.id });
        });
        if (isRunning) {
            actionBtn('↻ Restart', 'Restart ' + sourceDisplayName(source), false, function () {
                bridgeThen({ action: 'restartSource', value: source.id });
            });
        }
        actionBtn(source.isMuted ? 'Unmute' : 'Mute', (source.isMuted ? 'Unmute ' : 'Mute ') + sourceDisplayName(source), false, function () {
            bridgeThen({ action: 'toggleSourceMute', value: source.id });
        });
        actionBtn(source.isVisible !== false ? 'Hide from dock' : 'Show in dock', 'Toggle dock visibility for ' + sourceDisplayName(source), false, function () {
            bridgeThen({ action: 'toggleSourceVisibility', value: source.id });
        });
        actionBtn(source.replyOnly ? 'Reply only: on' : 'Reply only: off', 'Toggle reply-only for ' + sourceDisplayName(source), false, function () {
            bridgeThen({ action: 'updateSource', value: { sourceId: source.id, updates: { replyOnly: !source.replyOnly } } });
        });
        actionBtn(source.autoActivate ? 'Auto-start: on' : 'Auto-start: off', 'Toggle auto-start for ' + sourceDisplayName(source), false, function () {
            bridgeThen({ action: 'updateSource', value: { sourceId: source.id, updates: { autoActivate: !source.autoActivate } } });
        });
        modal.appendChild(actions);

        // Role + connection mode — stock gates these to a STOPPED source
        // (inactiveOnlySourceSettings, index.html:7005); the controls say so.
        var tune = document.createElement('div');
        tune.className = 'arcade-srcpop__tune';

        var roleRow = document.createElement('label');
        roleRow.className = 'arcade-srcpop__field';
        var roleLab = document.createElement('span');
        roleLab.textContent = 'Account role';
        var roleSel = document.createElement('select');
        roleSel.setAttribute('aria-label', 'Account role for ' + sourceDisplayName(source));
        ['normal', 'host', 'bot', 'relay'].forEach(function (r) {
            var o = document.createElement('option');
            o.value = r;
            o.textContent = r;
            if ((source.accountRole || 'normal') === r) o.selected = true;
            roleSel.appendChild(o);
        });
        roleSel.disabled = isRunning;
        roleSel.title = isRunning ? 'Stop the source to change its role (stock rule)' : '';
        roleSel.addEventListener('change', function () {
            bridgeThen({ action: 'updateSource', value: { sourceId: source.id, updates: { accountRole: roleSel.value } } });
        });
        roleRow.appendChild(roleLab);
        roleRow.appendChild(roleSel);
        tune.appendChild(roleRow);

        var modes = ['classic'];
        try {
            if (typeof window.supportedConnectionModesForSource === 'function') {
                modes = window.supportedConnectionModesForSource(source);
            }
        } catch (e) { /* noop */ }
        if (modes.length > 1) {
            var modeRow = document.createElement('label');
            modeRow.className = 'arcade-srcpop__field';
            var modeLab = document.createElement('span');
            modeLab.textContent = 'Connection mode';
            var modeSel = document.createElement('select');
            modeSel.setAttribute('aria-label', 'Connection mode for ' + sourceDisplayName(source));
            modes.forEach(function (m) {
                var o = document.createElement('option');
                o.value = m;
                o.textContent = m;
                if ((source.connectionMode || 'classic') === m) o.selected = true;
                modeSel.appendChild(o);
            });
            modeSel.disabled = isRunning;
            modeSel.title = isRunning ? 'Stop the source to change its connection mode (stock rule)' : '';
            modeSel.addEventListener('change', function () {
                bridgeThen({ action: 'updateSource', value: { sourceId: source.id, updates: { connectionMode: modeSel.value } } });
            });
            modeRow.appendChild(modeLab);
            modeRow.appendChild(modeSel);
            tune.appendChild(modeRow);
        }
        modal.appendChild(tune);
        if (isRunning) {
            var stopNote = document.createElement('div');
            stopNote.className = 'arcade-evt-cond__hint';
            stopNote.textContent = 'Role, connection mode and identity edits unlock when the source is stopped — stock’s rule, not ours.';
            modal.appendChild(stopNote);
        }

        var foot = document.createElement('div');
        foot.className = 'arcade-srcpop__foot';
        // TASK-70 (Lane 5) — "reveal full page", restored: the door to
        // stock's per-service FULL options page. Research census: that page
        // is the stock 'streams' page ("🎭 Sources and Settings",
        // index.html:175/203) — Steve's layout with EVERY control a source
        // carries (the ⚙️ settings menu: cache, reply-only, roles, TikTok
        // tools, user-agent + browser-session modals, connection modes,
        // move/remove). The arcade WRAPS it — the Deck Settings stock-stage
        // machinery shows the real page, dressed, beside the section rail;
        // nothing is re-implemented. The door lands scrolled to THIS
        // source's entry with a brief spotlight ring.
        var fullPageBtn = document.createElement('button');
        fullPageBtn.type = 'button';
        fullPageBtn.className = 'arcade-btn arcade-btn--sm';
        fullPageBtn.textContent = 'Reveal full page';
        fullPageBtn.title = 'Steve’s full Sources & Settings page — every option for this source, wrapped by the arcade';
        fullPageBtn.setAttribute('aria-label', 'Reveal the full stock options page for ' + sourceDisplayName(source));
        fullPageBtn.addEventListener('click', function () {
            var sourceId = source.id;
            closeSourceDetailsPopout(false);
            navigateArcadeTab('settings');
            window.arcadeDeckSelect(DECK_STOCKLIB_KEY);
            // Let the stock page's display flip settle, then land ON the
            // source entry (same doctrine as deckFocusStockStage).
            setTimeout(function () {
                var entry = document.getElementById('source-' + sourceId);
                if (entry) {
                    entry.scrollIntoView({ block: 'center' });
                    entry.classList.add('arcade-srcpop-spotlight');
                    setTimeout(function () { entry.classList.remove('arcade-srcpop-spotlight'); }, 3600);
                }
            }, 400);
        });
        foot.appendChild(fullPageBtn);
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--danger';
        removeBtn.textContent = 'Remove source';
        removeBtn.setAttribute('aria-label', 'Remove ' + sourceDisplayName(source));
        removeBtn.addEventListener('click', function () {
            // confirm-on-second-click (house idiom — no window.confirm in
            // the shell's modals).
            if (removeBtn.dataset.armed === 'true') {
                callBridge({ action: 'removeSource', value: source.id });
                closeSourceDetailsPopout(false);
                return;
            }
            removeBtn.dataset.armed = 'true';
            removeBtn.textContent = 'Remove source — click again to confirm';
            setTimeout(function () {
                if (removeBtn.isConnected) {
                    removeBtn.dataset.armed = 'false';
                    removeBtn.textContent = 'Remove source';
                }
            }, 4000);
        });
        foot.appendChild(removeBtn);
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'arcade-btn arcade-btn--sm';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', function () { closeSourceDetailsPopout(true); });
        foot.appendChild(closeBtn);
        modal.appendChild(foot);
    }

    // --------------------------------------------------------------------
    // TASK-67 (Lane 3) — EDIT CHAT from the Main pane. The Admiral: "the
    // chat area text should have the ability to be customized from this
    // main menu… hit a button to edit certain features." A floating chip on
    // the Main chat pane opens a quick panel with the most-used REAL dock
    // params (size/scale, font, opacity, dark mode — the same params
    // index.html's ensureChatDockLoaded composes the app dock URL from),
    // the stock main-chat settings that never made the transition (berthed
    // via the S51 embed driver, DECK_POPUP_SECTIONS['chat-dock']), and a
    // door to the Style tab's full dock section.
    //
    // Persistence: canonical arcadeDockTune setting (S48 async idiom) +
    // the localStorage mirror ensureChatDockLoaded reads synchronously —
    // the interface flag's own doctrine. Apply = a real dock reload via the
    // app's own ensureChatDockLoaded(true).
    // --------------------------------------------------------------------
    var editChatKeydown = null;

    function buildEditChatChip() {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.id = 'arcade-editchat-chip';
        chip.className = 'arcade-editchat-chip';
        chip.textContent = '✎ Edit chat';
        chip.setAttribute('aria-haspopup', 'dialog');
        chip.setAttribute('aria-expanded', 'false');
        chip.setAttribute('aria-controls', 'arcade-editchat-panel');
        chip.title = 'Quick chat styling — size, font, opacity, dark mode, and stock’s full chat settings';
        chip.addEventListener('click', openEditChatPanel);
        document.body.appendChild(chip);
    }

    function openEditChatPanel() {
        closeEditChatPanel(false);
        var chip = document.getElementById('arcade-editchat-chip');
        var tune = readArcadeDockTune();
        var back = document.createElement('div');
        back.className = 'arcade-evt-modal-back';
        back.id = 'arcade-editchat-panel';
        var modal = document.createElement('div');
        modal.className = 'arcade-evt-modal arcade-editchat-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'Edit chat — quick panel');
        back.appendChild(modal);

        var title = document.createElement('h3');
        title.className = 'arcade-evt-modal__title';
        title.tabIndex = -1;
        title.textContent = 'Edit chat';
        modal.appendChild(title);
        var blurb = document.createElement('p');
        blurb.className = 'arcade-evt-modal__blurb';
        blurb.textContent = 'The most-used knobs for this app’s own chat view. Apply reloads the dock with the new look.';
        modal.appendChild(blurb);

        var fields = document.createElement('div');
        fields.className = 'arcade-editchat-fields';

        // Size/scale — the dock's real &scale param (house default 1.45).
        var scaleRow = document.createElement('label');
        scaleRow.className = 'arcade-editchat-row';
        var scaleLab = document.createElement('span');
        scaleLab.textContent = 'Size / scale';
        var scaleInput = document.createElement('input');
        scaleInput.type = 'range';
        scaleInput.min = '0.8';
        scaleInput.max = '2';
        scaleInput.step = '0.05';
        scaleInput.value = String(parseFloat(tune.scale || '1.45'));
        scaleInput.setAttribute('aria-label', 'Chat size / scale');
        var scaleVal = document.createElement('span');
        scaleVal.className = 'arcade-editchat-val';
        scaleVal.textContent = Number(scaleInput.value).toFixed(2) + '×';
        scaleInput.addEventListener('input', function () { scaleVal.textContent = Number(scaleInput.value).toFixed(2) + '×'; });
        scaleRow.appendChild(scaleLab);
        scaleRow.appendChild(scaleInput);
        scaleRow.appendChild(scaleVal);
        fields.appendChild(scaleRow);

        // Font — the dock's real &font param. Curated list (what &font
        // really supports: locally-installed families + the bundled Sora
        // stack + the house OpenDyslexic @font-face); Custom… reveals the
        // free-text for any installed family.
        var fontRow = document.createElement('label');
        fontRow.className = 'arcade-editchat-row';
        var fontLab = document.createElement('span');
        fontLab.textContent = 'Font';
        var fontSel = document.createElement('select');
        fontSel.setAttribute('aria-label', 'Chat font');
        var EDIT_CHAT_FONTS = [
            { v: '__house__', label: 'House default — OpenDyslexic' },
            { v: '', label: 'Dock default — Sora stack' },
            { v: 'system-ui', label: 'System UI' },
            { v: 'sans-serif', label: 'Sans-serif (system)' },
            { v: 'serif', label: 'Serif (system)' },
            { v: 'monospace', label: 'Monospace (system)' },
            { v: '__custom__', label: 'Custom…' }
        ];
        EDIT_CHAT_FONTS.forEach(function (f) {
            var o = document.createElement('option');
            o.value = f.v;
            o.textContent = f.label;
            fontSel.appendChild(o);
        });
        var fontCustom = document.createElement('input');
        fontCustom.type = 'text';
        fontCustom.className = 'arcade-editchat-customfont';
        fontCustom.placeholder = 'Any installed font family, e.g. Inter';
        fontCustom.setAttribute('aria-label', 'Custom chat font family');
        fontCustom.hidden = true;
        if (!('font' in tune)) fontSel.value = '__house__';
        else if (EDIT_CHAT_FONTS.some(function (f) { return f.v === String(tune.font); })) fontSel.value = String(tune.font);
        else { fontSel.value = '__custom__'; fontCustom.hidden = false; fontCustom.value = String(tune.font); }
        fontSel.addEventListener('change', function () {
            fontCustom.hidden = fontSel.value !== '__custom__';
            if (!fontCustom.hidden) fontCustom.focus();
        });
        fontRow.appendChild(fontLab);
        fontRow.appendChild(fontSel);
        fontRow.appendChild(fontCustom);
        fields.appendChild(fontRow);

        // Opacity — the dock's real &opacity param (house default 0.65).
        var opRow = document.createElement('label');
        opRow.className = 'arcade-editchat-row';
        var opLab = document.createElement('span');
        opLab.textContent = 'Opacity';
        var opInput = document.createElement('input');
        opInput.type = 'range';
        opInput.min = '0.2';
        opInput.max = '1';
        opInput.step = '0.05';
        opInput.value = String(parseFloat(tune.opacity || '0.65'));
        opInput.setAttribute('aria-label', 'Chat opacity');
        var opVal = document.createElement('span');
        opVal.className = 'arcade-editchat-val';
        opVal.textContent = Number(opInput.value).toFixed(2);
        opInput.addEventListener('input', function () { opVal.textContent = Number(opInput.value).toFixed(2); });
        opRow.appendChild(opLab);
        opRow.appendChild(opInput);
        opRow.appendChild(opVal);
        fields.appendChild(opRow);

        // Dark mode — the dock's real &darkmode flag (house default ON).
        var darkRow = document.createElement('label');
        darkRow.className = 'arcade-editchat-row';
        var darkLab = document.createElement('span');
        darkLab.textContent = 'Dark mode';
        var darkToggle = document.createElement('button');
        darkToggle.type = 'button';
        darkToggle.className = 'arcade-btn arcade-btn--sm';
        var darkOn = tune.dark !== false;
        darkToggle.setAttribute('aria-pressed', String(darkOn));
        darkToggle.textContent = darkOn ? 'On' : 'Off';
        darkToggle.addEventListener('click', function () {
            darkOn = !darkOn;
            darkToggle.setAttribute('aria-pressed', String(darkOn));
            darkToggle.textContent = darkOn ? 'On' : 'Off';
        });
        darkRow.appendChild(darkLab);
        darkRow.appendChild(darkToggle);
        fields.appendChild(darkRow);
        modal.appendChild(fields);

        var status = document.createElement('div');
        status.className = 'arcade-evt-cond__hint';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        modal.appendChild(status);

        var doors = document.createElement('div');
        doors.className = 'arcade-evt-doors';
        var applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        applyBtn.textContent = 'Apply — reload chat';
        applyBtn.addEventListener('click', function () {
            var next = {
                scale: Number(scaleInput.value).toFixed(2),
                opacity: Number(opInput.value).toFixed(2),
                dark: darkOn
            };
            if (fontSel.value === '__custom__') next.font = fontCustom.value.trim();
            else if (fontSel.value !== '__house__') next.font = fontSel.value;
            // '__house__' = no font key at all — the house default stands.
            var json = JSON.stringify(next);
            saveDeckSetting('textparam1', 'arcadeDockTune', json);
            try { localStorage.setItem('arcadeDockTune', json); } catch (e) { /* noop */ }
            status.textContent = 'Reloading the chat dock…';
            if (typeof window.ensureChatDockLoaded === 'function') {
                window.ensureChatDockLoaded(true).then(function () {
                    status.textContent = 'Applied — the chat dock reloaded with the new look.';
                }).catch(function () {
                    status.textContent = 'Saved, but the dock reload failed — it picks the new look up on next launch.';
                });
            } else {
                status.textContent = 'Saved — the new look applies on next launch.';
            }
        });
        doors.appendChild(applyBtn);
        var styleBtn = document.createElement('button');
        styleBtn.type = 'button';
        styleBtn.className = 'arcade-btn arcade-btn--sm';
        styleBtn.textContent = 'Full styling → Style tab';
        styleBtn.title = 'The Style tab’s DOCK (APP) profile styles this same chat view — colors, type, layout, effects';
        styleBtn.addEventListener('click', function () {
            closeEditChatPanel(false);
            navigateArcadeTab('style');
            // Land on the DOCK (APP) profile — that's the profile that
            // styles THIS chat view.
            var dockBtn = document.querySelector('#arcade-style-profile-seg [data-arcade-style-profile="dock"]');
            if (dockBtn) dockBtn.click();
        });
        doors.appendChild(styleBtn);
        modal.appendChild(doors);

        // The berthed stock chat settings (the groups that never made the
        // arcade transition — same stock page, same handlers, same keys).
        var stockNote = document.createElement('div');
        stockNote.className = 'arcade-evt-cond__title';
        stockNote.textContent = 'Stock’s full chat settings';
        modal.appendChild(stockNote);
        buildDeckPopupEmbed(modal, 'chat-dock', 'Stock’s own dock/chat groups — mechanics, visibility, styling, shading, effects. Same stock settings, same keys; they apply to this chat view per stock’s own wiring.');

        back.addEventListener('click', function (e) { if (e.target === back) closeEditChatPanel(true); });
        document.body.appendChild(back);
        if (chip) chip.setAttribute('aria-expanded', 'true');
        editChatKeydown = function (e) {
            if (e.key === 'Escape' && document.getElementById('arcade-editchat-panel')) {
                e.stopPropagation();
                closeEditChatPanel(true);
            }
        };
        document.addEventListener('keydown', editChatKeydown);
        scaleInput.focus(); // H18-A — focus lands IN the panel
    }

    function closeEditChatPanel(returnFocus) {
        var back = document.getElementById('arcade-editchat-panel');
        if (back) back.remove(); // the stock embed frame dies with the panel
        if (editChatKeydown) {
            document.removeEventListener('keydown', editChatKeydown);
            editChatKeydown = null;
        }
        var chip = document.getElementById('arcade-editchat-chip');
        if (chip) {
            chip.setAttribute('aria-expanded', 'false');
            if (returnFocus) chip.focus();
        }
    }

    function bindStateManager() {
        var sm = window.stateManager;
        if (!sm || typeof sm.on !== 'function') return false;
        renderSourcesRail();
        sm.on('sourceAdded', renderSourcesRail);
        sm.on('sourceUpdated', renderSourcesRail);
        sm.on('sourceRemoved', renderSourcesRail);
        sm.on('allSourcesCleared', renderSourcesRail);
        // TASK-67 — the open details popout tracks live source truth and
        // closes itself if its source is removed.
        sm.on('sourceUpdated', function () { if (srcPopoutId) renderSourceDetailsPopout(); });
        sm.on('sourceRemoved', function (payload) {
            var removedId = payload && (payload.sourceId || payload.id);
            if (srcPopoutId && removedId === srcPopoutId) closeSourceDetailsPopout(false);
        });
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
        '#searchInput::placeholder { color: #9ba1ad; }',
        /* TASK-68 (WALK 2A item 3) — the session embed's floating labels
           become PROPER ROWS (stock's .textInput + label idiom parks the
           label ON the input until focus; in the embed that read as the
           password box / session box / description text overlapping). */
        '#arcade-deck-popup-root .textInputContainer { display: block; width: 100% !important; margin: 10px 0 2px; }',
        /* TASK-70 (WALK 2C) — stock's #667eea "Upload" buttons (beep /
           fallback-image slots in the berthed featured/spotify groups) sit
           white-on-#667eea = 3.66:1; the house button dress (same as T69's
           TTS Test buttons) brings them to token contrast. */
        '#arcade-deck-popup-root .textInputContainer button { background: #191c22 !important; color: #f2f0ea !important; border: 1px solid #2a2e37 !important; }',
        '#arcade-deck-popup-root .textInput + label { position: static; display: block; padding: 2px 0 0; font-size: 1em; color: #9ba1ad; cursor: default; pointer-events: none; }',
        '#arcade-deck-popup-root .textInput + label::before { display: none; }',
        /* TASK-66 — the session id goes quiet: the mask class (JS pass adds it
           wherever the id renders) + the raw session field itself, which
           popup.js fills asynchronously (popup.js:3984) — CSS catches the
           late set with zero timing. */
        '.arcade-deck-masked{filter:blur(6px);transition:filter .15s ease;cursor:pointer;}',
        '.arcade-deck-masked:hover,.arcade-deck-masked:focus,.arcade-deck-masked:focus-within{filter:none;}',
        '#sessionid{filter:blur(6px);transition:filter .15s ease;}',
        '#sessionid:hover,#sessionid:focus{filter:none;}',
        /* TASK-69 (WALK 2B sweep 1) — contrast closes on the dressed stock
           surfaces, token literals only (same palette as the :root remap
           above). Measured by the contrast walker (work/task-69):
           - the TTS info box's <small> sat BLACK on --color-accent-subtle
             (1.24:1 — the Admiral's black-on-black): muted text now;
           - stock's .lightblue anchors (#006f93, 3.18:1) and one bare
             link-blue anchor (1.93:1) → the info token;
           - the TTS test buttons (white on #007bff, 3.98:1) dress like the
             house buttons (panel-2 ground, edge border, ink text);
           - the backups file-handle status row (white on mid-gray, 1.97:1)
             gets the panel-2 ground. */
        '#arcade-deck-popup-root small { color: #9ba1ad; }',
        '#arcade-deck-popup-root a, #arcade-deck-popup-root a:link, #arcade-deck-popup-root a:visited, #arcade-deck-popup-root a.lightblue { color: #35d0ff; }',
        '#arcade-deck-popup-root .tts-test-button { background: #191c22; border: 1px solid #2a2e37; color: #f2f0ea; }',
        '#arcade-deck-popup-root .file-handle-status .status-row { background: #191c22; }'
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
        '#session-id { filter: blur(6px); border-radius: 3px; cursor: pointer; }',
        '#session-id:hover, #session-id:focus { filter: none; }',
        /* TASK-66 — the boot JSON inside #debugOutput prints the id in
           plaintext (the S32 trap): token CSS can't mask log TEXT, so the
           whole log pane goes quiet with the same hover/focus peek. */
        '#debugOutput { background: #191c22; border: 1px solid #2a2e37; border-radius: 6px; filter: blur(6px); transition: filter .15s ease; }',
        '#debugOutput:hover, #debugOutput:focus { filter: none; }',
        '.arcade-deck-masked{filter:blur(6px);transition:filter .15s ease;cursor:pointer;}',
        '.arcade-deck-masked:hover,.arcade-deck-masked:focus,.arcade-deck-masked:focus-within{filter:none;}',
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
        '.qr-code-panel img { max-width: 100%; height: auto; border-radius: 6px; }',
        /* TASK-66 — the page's own publish id is a credential too (a QR IS the
           id): links and the code go quiet with the house peek idiom. */
        '#guest-link, #obs-link { filter: blur(6px); transition: filter .15s ease; }',
        '#guest-link:hover, #guest-link:focus, #obs-link:hover, #obs-link:focus { filter: none; }',
        '#qrcode { filter: blur(8px); transition: filter .15s ease; border-radius: 6px; }',
        '#qrcode:hover, #qrcode:focus, #qrcode:focus-within { filter: none; }',
        '.arcade-deck-masked{filter:blur(6px);transition:filter .15s ease;cursor:pointer;}',
        '.arcade-deck-masked:hover,.arcade-deck-masked:focus,.arcade-deck-masked:focus-within{filter:none;}'
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

    // --------------------------------------------------------------------
    // TASK-66 — the session id goes quiet on EVERY surface. The S51 blur
    // idiom (mask class + hover/focus peek) generalized into one pass that
    // runs inside any same-origin stock document: text nodes and input
    // VALUES carrying the id (or its lowercase/derived-room forms — the S50
    // mask-sweep trap) get the mask class; text carriers also get keyboard
    // focusability + click-to-copy (copies the REAL id). Stock pages fill
    // some of these asynchronously, so callers re-run the pass on a short
    // schedule — the pass is idempotent (dataset guard).
    // --------------------------------------------------------------------
    var shellSessionIdCache = '';
    function withShellSessionId(cb) {
        if (shellSessionIdCache) { cb(shellSessionIdCache); return; }
        try {
            if (typeof window.getChatDockSessionId === 'function') {
                Promise.resolve(window.getChatDockSessionId()).then(function (id) {
                    shellSessionIdCache = String(id || '');
                    cb(shellSessionIdCache);
                }, function () { cb(''); });
                return;
            }
        } catch (e) { /* fall through */ }
        cb('');
    }

    // --------------------------------------------------------------------
    // TASK-71 (item 7, H28 ruled) — the Spotify token JOINS THE SCRUB LIST.
    // Stock's own flow keeps the token in the background page alone
    // (spotify.js persists to the spotifyTokens store; overlays get
    // track-only payloads — spotify-overlay.html:365-367,553-585), so a
    // token literal should never appear on ANY shell surface. If one ever
    // does (a hand-built &token= URL, a settings dump), it masks like the
    // session id — EXCEPT it is never click-to-copyable (never echoed),
    // and attribute carriers (href/src/title/value) get the literal
    // REWRITTEN to the mask string, because CSS blur can't stop a link's
    // hover status-bar leak. Needles are read LIVE each pass (tokens
    // rotate on refresh — a cached needle list would go stale).
    // --------------------------------------------------------------------
    function shellSpotifyTokenNeedles() {
        var tokens = [];
        try {
            var bg = getBackgroundWindow();
            var sp = bg && bg.spotify;
            var bgSettings = (bg && bg.settings) || {};
            [sp && sp.accessToken, sp && sp.refreshToken,
             bgSettings.spotifyAccessToken, bgSettings.spotifyRefreshToken].forEach(function (v) {
                if (typeof v === 'string' && v.length >= 8 && tokens.indexOf(v) === -1) tokens.push(v);
            });
        } catch (e) { /* cross-origin — no needles */ }
        return tokens;
    }

    function maskSpotifyTokenSurfaces(doc, root) {
        var tokens = shellSpotifyTokenNeedles();
        if (!tokens.length) return;
        var scope = root || doc.body;
        if (!scope) return;
        var hasToken = function (s) {
            return typeof s === 'string' && s.length > 0 && tokens.some(function (t) { return s.indexOf(t) !== -1; });
        };
        var markToken = function (el) {
            if (!el || el.nodeType !== 1) return;
            if (el.dataset && el.dataset.arcadeTokenMasked === '1') return;
            el.classList.add('arcade-deck-masked');
            if (el.dataset) el.dataset.arcadeTokenMasked = '1';
            if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
                if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
                el.setAttribute('aria-label', 'Hidden Spotify token — focus or hover to reveal. Never copied, never echoed.');
            }
            // deliberately NO click-to-copy (the session mask copies the real
            // id on click; a token is never placed on the clipboard by us)
        };
        try {
            var walker = doc.createTreeWalker(scope, 4 /* SHOW_TEXT */, null);
            var node;
            var touched = [];
            while ((node = walker.nextNode())) {
                if (!node.nodeValue) continue;
                if (hasToken(node.nodeValue) && touched.indexOf(node.parentElement) === -1) {
                    touched.push(node.parentElement);
                }
            }
            touched.forEach(markToken);
            Array.prototype.slice.call(scope.querySelectorAll('input, textarea')).forEach(function (input) {
                try {
                    if (hasToken(String(input.value || ''))) markToken(input);
                } catch (e) { /* noop */ }
            });
            // Attribute carriers: rewrite the literal OUT of the attribute
            // (display-layer only — the in-memory value is stock's own).
            Array.prototype.slice.call(scope.querySelectorAll('[href], [src], [title], [value], [data-url]')).forEach(function (el) {
                ['href', 'src', 'title', 'value', 'data-url'].forEach(function (attr) {
                    try {
                        var v = el.getAttribute(attr);
                        if (hasToken(v)) {
                            var nv = v;
                            tokens.forEach(function (t) { nv = nv.split(t).join('XXXXXXXXXX'); });
                            el.setAttribute(attr, nv);
                            el.setAttribute('data-arcade-token-scrubbed', '1');
                            markToken(el);
                        }
                    } catch (e) { /* noop */ }
                });
            });
        } catch (e) { /* token masking is best-effort dressing, never fatal */ }
    }

    function maskSessionIdSurfaces(doc, root) {
        if (!doc) return;
        maskSpotifyTokenSurfaces(doc, root); // TASK-71 — the token rides the same schedule as the session id
        withShellSessionId(function (id) {
            if (!id) return;
            // S50 sweep list: the id, its lowercase form, and the derived
            // guest-room id (ssn-<lower>) — any of them IS the session.
            var clean = id.toLowerCase().replace(/[^a-z0-9]/g, '');
            var needles = [id];
            if (id.toLowerCase() !== id) needles.push(id.toLowerCase());
            if (clean) needles.push('ssn-' + clean.slice(0, 32));
            var scope = root || doc.body;
            if (!scope) return;
            var mark = function (el) {
                if (!el || el.nodeType !== 1) return;
                if (el.dataset && el.dataset.arcadeMasked === '1') return;
                el.classList.add('arcade-deck-masked');
                if (el.dataset) el.dataset.arcadeMasked = '1';
                if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
                    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
                    el.setAttribute('aria-label', 'Hidden session value — focus or hover to reveal, click to copy');
                    el.addEventListener('click', function () {
                        copyToClipboard(id).then(function () {
                            var old = el.title;
                            el.title = 'Copied ✓';
                            setTimeout(function () { el.title = old; }, 1200);
                        });
                    });
                } else if (el.readOnly) {
                    el.addEventListener('click', function () {
                        copyToClipboard(id).then(function () {
                            var old = el.title;
                            el.title = 'Copied ✓';
                            setTimeout(function () { el.title = old; }, 1200);
                        });
                    });
                }
            };
            try {
                var walker = doc.createTreeWalker(scope, 4 /* SHOW_TEXT */, null);
                var node;
                var touched = [];
                while ((node = walker.nextNode())) {
                    if (!node.nodeValue) continue;
                    var hit = needles.some(function (n) { return node.nodeValue.indexOf(n) !== -1; });
                    if (hit && touched.indexOf(node.parentElement) === -1) {
                        touched.push(node.parentElement);
                    }
                }
                touched.forEach(mark);
                Array.prototype.slice.call(scope.querySelectorAll('input, textarea')).forEach(function (input) {
                    try {
                        var v = String(input.value || '');
                        if (v && needles.some(function (n) { return v.indexOf(n) !== -1; })) mark(input);
                    } catch (e) { /* noop */ }
                });
                // Known stock carriers that NEED keyboard access for the
                // peek (CSS alone can't add tabindex): the dashboard id span
                // + the boot-JSON log pane (both blurred by DRESS CSS).
                ['session-id', 'debugOutput', 'qrcode'].forEach(function (elId) {
                    var el = doc.getElementById(elId);
                    if (el && !el.hasAttribute('tabindex')) el.tabIndex = 0;
                });
                var sidSpan = doc.getElementById('session-id');
                if (sidSpan && sidSpan.dataset.arcadeMaskedCopy !== '1') {
                    sidSpan.dataset.arcadeMaskedCopy = '1';
                    sidSpan.setAttribute('aria-label', 'Session ID — hidden, focus or hover to reveal, click to copy');
                    sidSpan.addEventListener('click', function () {
                        copyToClipboard(id).then(function () {
                            var old = sidSpan.title;
                            sidSpan.title = 'Copied ✓';
                            setTimeout(function () { sidSpan.title = old; }, 1200);
                        });
                    });
                }
            } catch (e) { /* masking is best-effort dressing, never fatal */ }
        });
    }

    // Re-run schedule for stock pages that fill session values AFTER load
    // (popup.js:3984, the dashboard boot JSON, vdo.html's updateLinks).
    function maskStockFrame(frame) {
        if (!frame) return;
        var run = function () {
            try { maskSessionIdSurfaces(frame.contentDocument, null); } catch (e) { /* cross-origin skip */ }
        };
        run();
        setTimeout(run, 1200);
        setTimeout(run, 3000);
        // TASK-70 (WALK 2C) — popup.js fills/re-fills its generated overlay
        // links (dock.html?session=… etc.) ASYNC on settings load and on
        // every settings sync — past the 3s last pass, so a late fill
        // painted the session id unmasked (caught on the Lane 5 wrap). A
        // debounced mutation pass catches every late fill for the life of
        // the frame document.
        try {
            var doc = frame.contentDocument;
            if (doc && doc.body && !frame.dataset.arcadeMaskObserver) {
                frame.dataset.arcadeMaskObserver = '1';
                var t = null;
                var obs = new doc.defaultView.MutationObserver(function () {
                    clearTimeout(t);
                    t = setTimeout(run, 500);
                });
                obs.observe(doc.body, { childList: true, subtree: true, characterData: true });
                frame.addEventListener('load', function () {
                    try { obs.disconnect(); } catch (e) { /* noop */ }
                    delete frame.dataset.arcadeMaskObserver; // the fresh document gets its own observer via the load pass
                });
            }
        } catch (e) { /* cross-origin/hosted — the timed passes above stand */ }
    }

    // TASK-68 (WALK 2A item 3) — NO UNMASKED FIRST PAINT. The stock frames
    // boot visibility:hidden (CSS, from stylesheet parse) and are revealed
    // only after the dress <style> (which CSS-masks every known session
    // carrier: #session-id, #sessionid, #debugOutput, the vdo links/QR) is
    // confirmed IN the frame document and the first text/value mask pass
    // has run. A safety timer reveals regardless at 6s — a hosted/cross-
    // origin frame can't be dressed, and a stuck-hidden pane is worse than
    // a dressed-late one.
    function revealStockFrameWhenMasked(frame) {
        if (!frame || frame.dataset.arcadeMaskGate === 'done') return;
        var reveal = function () {
            if (frame.dataset.arcadeMaskGate === 'done') return;
            frame.dataset.arcadeMaskGate = 'done';
            frame.classList.add('arcade-frame-live');
        };
        var tryReveal = function () {
            if (frame.dataset.arcadeMaskGate === 'done') return;
            try {
                var doc = frame.contentDocument;
                if (!doc || !doc.head) return; // not loaded yet — the load listener re-fires us
                var dressed = doc.getElementById('arcade-dress-popup') || doc.getElementById('arcade-dress-dashboard') || doc.getElementById('arcade-dress-vdo');
                if (!dressed) return; // dress pending — wait for the next tick/load
                maskSessionIdSurfaces(doc, null); // first text/value pass BEFORE reveal
                reveal();
            } catch (e) {
                reveal(); // cross-origin/hosted — can't dress, don't hold the pane hostage
            }
        };
        // Poll briefly across the load window (the dress lands on the same
        // load event; ordering between listeners isn't guaranteed).
        var tries = 0;
        var tick = function () {
            if (frame.dataset.arcadeMaskGate === 'done') return;
            tryReveal();
            if (++tries < 12 && frame.dataset.arcadeMaskGate !== 'done') setTimeout(tick, 250);
        };
        tick();
        setTimeout(reveal, 6000); // the safety valve, documented above
    }

    // TASK-68 (WALK 2A item 6) — the Event Flow editor's "← Back to
    // Dashboard" was misleading (it always landed on the connection-status
    // dashboard, never where the user came from). Rewired in place: the
    // button becomes "← Back" and walks the shell's nav stack (capture-
    // phase, ahead of dashboard.js's own listener — which stays as the
    // honest fallback when the stack is empty). The in-frame "Open the
    // Action Flow Editor" door pushes the current location first, so back
    // from the editor lands exactly whence the user came.
    function wireEventFlowBackDoor(frame) {
        if (!frame) return;
        var hook = function () {
            var doc;
            try { doc = frame.contentDocument; } catch (e) { return; }
            if (!doc) return;
            try {
                var openBtn = doc.getElementById('showEditorViewButton');
                if (openBtn && openBtn.dataset.arcadeNavPush !== '1') {
                    openBtn.dataset.arcadeNavPush = '1';
                    openBtn.addEventListener('click', function () { navPushCurrent(); }, true);
                }
                var btn = doc.getElementById('back-to-dashboard');
                if (!btn || btn.dataset.arcadeBackWired === '1') return;
                btn.dataset.arcadeBackWired = '1';
                btn.textContent = '← Back';
                btn.setAttribute('aria-label', 'Back — return to where you came from');
                btn.title = 'Back to where you came from — the shell remembers your path (empty path: the dashboard, stock behaviour)';
                btn.addEventListener('click', function (e) {
                    if (shellNavIndex > 0 && arcadeNavBack()) {
                        e.preventDefault();
                        e.stopImmediatePropagation(); // ahead of dashboard.js's showDashboardView
                    } // empty stack: fall through to the stock dashboard, honestly
                }, true);
            } catch (e) { /* noop */ }
        };
        hook();
        frame.addEventListener('load', hook);
    }

    function installStockFrameDressing() {
        dressStockFrame('frame1', 'arcade-dress-popup', DRESS_POPUP_CSS);
        dressStockFrame('frame2', 'arcade-dress-dashboard', DRESS_DASHBOARD_CSS);
        dressStockFrame('frame3', 'arcade-dress-vdo', DRESS_VDO_CSS);
        // TASK-68 — the stock frames get honest accessible names (H18-A);
        // arcade-mode DOM only, stock untouched.
        try {
            var titles = { frame1: 'Stock settings page', frame2: 'Status, logs and the Event Flow editor', frame3: 'VDO.Ninja cameras' };
            Object.keys(titles).forEach(function (fid) {
                var fr = document.getElementById(fid);
                if (fr && !fr.getAttribute('title')) fr.setAttribute('title', titles[fid]);
            });
        } catch (e) { /* noop */ }
        // TASK-66 — the mask pass rides the same frames (load + re-runs).
        ['frame1', 'frame2', 'frame3'].forEach(function (frameId) {
            var frame = document.getElementById(frameId);
            if (!frame) return;
            maskStockFrame(frame);
            frame.addEventListener('load', function () { maskStockFrame(frame); });
            // TASK-68 — first-paint mask law: the frame starts visibility-
            // hidden (arcade-shell.css, from stylesheet parse — before any
            // paint) and is revealed only once the dress (whose CSS masks
            // every known session carrier) AND the first mask pass have
            // landed. The 6s fallback keeps a dress failure (hosted frame,
            // cross-origin) from ever pinning a pane invisible — a missed
            // dress is cosmetic, a dead pane is not.
            revealStockFrameWhenMasked(frame);
            frame.addEventListener('load', function () { revealStockFrameWhenMasked(frame); });
            // TASK-68 — mouse back/forward inside the frame's document
            // drives the shell nav stack (iframe events never bubble up).
            wireArcadeNavFrame(frame);
        });
        wireArcadeNavFrame(document.getElementById('chat-dock-frame'));
        // TASK-68 — the Event Flow editor's ← Back door (frame2 document).
        wireEventFlowBackDoor(document.getElementById('frame2'));

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
            if (!wf.title) wf.title = 'Welcome — getting started'; // shell-side honest title (H18-A); stock mints the frame without one
            injectDressIntoFrame(wf, 'arcade-dress-welcome', DRESS_WELCOME_CSS);
            wf.addEventListener('load', function () {
                injectDressIntoFrame(wf, 'arcade-dress-welcome', DRESS_WELCOME_CSS);
            });
        };
        hookWelcome();
        new MutationObserver(hookWelcome).observe(sourcesEl, { childList: true, subtree: true });
    }

    // --------------------------------------------------------------------
    // S51 (TASK-48) — DECK SETTINGS + CONTROL SURFACES. Deck Settings stops
    // being the stock popup page and becomes the sectioned settings home:
    // a left section list (the sources-rail pattern, .arcade-evt-* idiom)
    // with the stage on the right. Sections:
    //
    //   Session & rooms · Control surfaces · Connections · Speech (TTS) ·
    //   Points system · Backups & storage · Diagnostics
    //
    // The More▾ hatch is RETIRED by this task (see the TABS comment): its
    // stock trio is absorbed here — Status and Logs + Sessions →
    // Diagnostics, Stream Deck Setup → Control surfaces.
    //
    // Stock settings groups are berthed two ways, both riding the SAME
    // canonical saveSetting truth (never a forked copy):
    //   1. NATIVE re-berth — compact house cards writing the same keys the
    //      stock groups own (Points system is the full native section).
    //   2. EMBED — a private popup.html iframe whose DOM is filtered to
    //      ONLY the groups berthed in that section (triplets moved into a
    //      fresh root, everything else display:none), dressed with the same
    //      DRESS_POPUP_CSS the shell already injects into frame1. The stock
    //      page, the stock handlers, the stock keys — one home per group.
    // Groups no section claims stay reachable through the FULL STOCK
    // SETTINGS transition door (the last left-list row, stock-stage) until
    // add-on interiors absorb them — the disposition ledger lives in the
    // S51 report.
    //
    // Laws held: every write rides canonical saveSetting via the S48 async
    // idiom (saveDeckSetting — the sendSync/iframe-churn deadlock trap);
    // getSettings reads are sequenced BEFORE the first iframe src is set
    // (S50 discipline); session IDs render masked-by-default everywhere
    // (blur law) and key NAMES only in docs; all CSS body.arcade-shell
    // -scoped; stock byte-inert (this module early-returns without the
    // body class).
    // --------------------------------------------------------------------
    var DECK_SECTIONS = [
        { id: 'session', label: 'Session & rooms' },
        { id: 'surfaces', label: 'Control surfaces' },
        { id: 'connections', label: 'Connections' },
        { id: 'speech', label: 'Speech (TTS)' },
        { id: 'points', label: 'Points system' },
        { id: 'backups', label: 'Backups & storage' },
        { id: 'diagnostics', label: 'Diagnostics' }
    ];
    var DECK_STOCKLIB_KEY = '__stocklib__'; // the pinned transition-door row

    // Stock popup groups berthed in each EMBED section (disposition ledger
    // in the report — berthed-here). Everything else: moved-to-add-on or
    // the transition door.
    var DECK_POPUP_SECTIONS = {
        session: ['wrapper-session-options'],
        connections: ['wrapper-flowactions-obs-options', 'wrapper-additional-chat-services-options', 'wrapper-beta-sdk-options'],
        speech: ['wrapper-chat-message-tts-options', 'wrapper-featured-tts-options', 'wrapper-flowactions-tts-options', 'wrapper-chatbot-message-tts-options'],
        backups: ['wrapper-export-options', 'wrapper-profiles-options', 'wrapper-chat-message-export-options', 'wrapper-global-mechanics-options'],
        // TASK-64 — the AI console's berthed stock groups (the 0018.06.04
        // audit zone map, verified live; chatbot-message-tts stays in Speech,
        // chatbot-Censor's two real fields are native re-berths in the
        // Moderation zone instead of an embed).
        'ai-cohost': ['wrapper-chatbot-cohost-options', 'wrapper-chatbot-ai-overlay-options'],
        'ai-bot': ['wrapper-chatbot-public-options', 'wrapper-chatbot-ai-prompt-options', 'wrapper-chatbot-private-options'],
        'ai-translate': ['wrapper-ai-auto-translate-options'],
        'ai-models': ['wrapper-bots-options-ext'],
        // TASK-67 (Lane 3) — stock's main-chat (dock) settings that never
        // made the arcade transition, berthed into the Edit-chat quick
        // panel: the dock menu bar + overlay link groups and the five
        // message groups (~173 stock fields; the two already-berthed chat
        // groups — chat-message-tts in Speech, chat-message-export in
        // Backups — stay where they are).
        'chat-dock': [
            'wrapper-chat-menu-options',
            'wrapper-chat-overlay-options',
            'wrapper-chat-message-mechanics-options',
            'wrapper-chat-message-visibility-options',
            'wrapper-chat-message-styling-options',
            'wrapper-chat-message-shading-options',
            'wrapper-chat-message-effects-options'
        ],
        // TASK-70 (Lane 1) — the featured-chat groups berth in the Featured
        // Chat add-on interior (featured-tts stays in Speech).
        featured: [
            'wrapper-featured-overlay-options',
            'wrapper-featured-mechanics-options',
            'wrapper-featured-visibility-options',
            'wrapper-featured-styling-options',
            'wrapper-featured-effects-options'
        ],
        // TASK-70 (Lane 3) — the Spotify groups berth in the Now Playing
        // add-on interior.
        music: [
            'wrapper-spotify-setup',
            'wrapper-spotify-overlay-options',
            'wrapper-spotify-announcements',
            'wrapper-spotify-commands'
        ]
    };

    var ALERT_TIER_RULES_KEY = 'arcadeAlertTierRules'; // NEW (S51) — per-tier promotion-condition policy
    var CONTROL_SURFACES_KEY = 'arcadeControlSurfaces'; // NEW (S51) — configured control-surface devices

    var deckSettingsLive = false;
    var deckSelectedSection = 'session';
    var deckPendingSection = null;   // arcadeDeckSelect() target before the panel is live
    var deckSessionId = '';          // the real id — NEVER rendered unmasked
    var deckPointsState = { enabled: false, per: 1, windowMin: 15, cmdPoints: false, cmdLeaderboard: false, cmdRewards: false };
    var deckTiers = ALERT_TIERS_DEFAULT.slice(); // names — SAME string[] shape S47 seeds/reads
    var deckTierRules = [];          // [{ tier, conditions:[{kind, ...}] }]
    var deckSurfaces = [];           // [{ id, type:'touchportal'|'streamdeck'|'neither', name, at }]
    var deckDiagnosticsView = 'dashboard'; // 'dashboard' | 'sessions' | 'interface' (TASK-66)

    // Every S51 write rides the canonical saveSetting IPC — ASYNC, no
    // callback, + one idempotent retry (the S48 sendSync/iframe-churn trap;
    // this panel hosts popup embeds and stock iframes). Same law as
    // saveGameSetting, generalized to the three storage shapes the deck
    // sections touch.
    function saveDeckSetting(type, key, value) {
        try {
            if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                var payload = { cmd: 'saveSetting', type: type, target: null, setting: key, value: value };
                window.ninjafy.sendMessage(null, payload);
                setTimeout(function () {
                    try { window.ninjafy.sendMessage(null, payload); } catch (e) { /* noop */ }
                }, 600);
            }
        } catch (e) { console.error('[arcade-shell] deck setting save failed:', e); }
    }

    // Command round-trips that need a RESPONSE (points export/import/reset,
    // Stream Deck capabilities). These fire on user gesture at settled
    // frame-tree time — the callback form (sendSync) is only unsafe DURING
    // iframe churn, so these are never wired to load paths.
    function deckCmd(payload, cb) {
        try {
            if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                window.ninjafy.sendMessage(null, payload, function (response) {
                    cb(response || null);
                });
                return;
            }
        } catch (e) { console.error('[arcade-shell] deck cmd failed:', e); }
        cb(null);
    }

    function setDeckStatus(text, isError) {
        var el = document.getElementById('arcade-deck-status');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-error', !!isError);
    }

    function deckSessionMasked() {
        return deckSessionId ? '••••••••••' : '—';
    }

    function buildDeckSettingsPanel() {
        var panel = document.createElement('section');
        panel.className = 'arcade-settings';
        panel.setAttribute('aria-label', 'Deck Settings');
        panel.innerHTML =
            '<div class="arcade-panel-head">' +
            '<span class="arcade-panel-title">DECK SETTINGS</span>' +
            '<span class="arcade-spacer"></span>' +
            '<span class="arcade-alerts-status" id="arcade-deck-status"></span>' +
            '</div>' +
            '<div class="arcade-alerts-body">' +
            '<div class="arcade-evt-list-col">' +
            '<div class="arcade-evt-list" id="arcade-deck-list" role="listbox" aria-label="Deck Settings sections"></div>' +
            '<div id="arcade-deck-diag-sub" class="arcade-deck-diag-sub" hidden></div>' +
            '</div>' +
            '<div class="arcade-alerts-stage arcade-deck-stage" id="arcade-deck-stage"></div>' +
            '</div>';
        document.body.appendChild(panel);

        // H18-A listbox contract via the shared S50 helper.
        var list = panel.querySelector('#arcade-deck-list');
        attachArcadeListboxNav(
            list,
            '[data-arcade-deck-key]',
            function () { return deckSelectedSection; },
            function (id) { selectDeckSection(id, false); },
            function (row) { return row.dataset.arcadeDeckKey; }
        );
    }

    function buildDeckListRow(opts) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'arcade-evt-item';
        row.dataset.arcadeDeckKey = opts.key;
        row.setAttribute('role', 'option');
        var selected = deckSelectedSection === opts.key;
        row.classList.toggle('is-on', selected);
        row.setAttribute('aria-selected', String(selected));
        var label = document.createElement('span');
        label.className = 'arcade-evt-item__label';
        label.textContent = (opts.icon ? opts.icon + ' ' : '') + opts.label;
        row.appendChild(label);
        if (opts.stateText) {
            var state = document.createElement('span');
            state.className = 'arcade-evt-state ' + (opts.stateOn ? 'arcade-evt-state--on' : 'arcade-evt-state--off');
            state.textContent = opts.stateText;
            if (opts.stateTitle) state.title = opts.stateTitle;
            row.appendChild(state);
        }
        row.addEventListener('click', function () { selectDeckSection(opts.key, true); });
        return row;
    }

    function renderDeckList() {
        var list = document.getElementById('arcade-deck-list');
        if (!list) return;
        list.innerHTML = '';
        DECK_SECTIONS.forEach(function (section) {
            var stateText = null;
            var stateOn = false;
            var stateTitle = null;
            if (section.id === 'points') {
                stateText = deckPointsState.enabled ? 'on' : 'off';
                stateOn = deckPointsState.enabled === true;
                stateTitle = stateOn ? 'The points system is on' : 'The points system is off';
            } else if (section.id === 'surfaces' && deckSurfaces.length) {
                stateText = String(deckSurfaces.length);
                stateOn = true;
                stateTitle = deckSurfaces.length + ' control surface' + (deckSurfaces.length === 1 ? '' : 's') + ' configured';
            }
            list.appendChild(buildDeckListRow({ key: section.id, label: section.label, stateText: stateText, stateOn: stateOn, stateTitle: stateTitle }));
        });
        var divider = document.createElement('div');
        divider.className = 'arcade-game-list__divider';
        list.appendChild(divider);
        var libRow = buildDeckListRow({
            key: DECK_STOCKLIB_KEY,
            label: 'Full stock settings',
            stateText: 'transition',
            stateOn: false,
            stateTitle: 'The unfiltered stock settings page — retires as add-on interiors absorb their groups'
        });
        list.appendChild(libRow);
    }

    function selectDeckSection(key, moveFocus) {
        deckSelectedSection = key;
        renderDeckList();
        renderDeckStage();
        if (moveFocus) {
            // H17-B — after a left-list pick, focus lands IN the destination.
            requestAnimationFrame(function () {
                var stage = document.getElementById('arcade-deck-stage');
                var sub = document.getElementById('arcade-deck-diag-sub');
                if (key === 'diagnostics' && sub && !sub.hidden) {
                    focusFirstInteractiveIn(sub, sub);
                } else if (deckIsStockStageKey(key)) {
                    deckFocusStockStage(key);
                } else {
                    focusFirstInteractiveIn(stage, stage);
                }
            });
        }
    }

    // External door (the Games hub "Points & unlocks" cross-link, the rail's
    // add-source, S48's earn door): navigate to the tab, then select.
    window.arcadeDeckSelect = function (sectionId) {
        deckPendingSection = sectionId;
        if (deckSettingsLive) {
            deckPendingSection = null;
            selectDeckSection(sectionId, false);
        }
    };

    function deckIsStockStageKey(key) {
        return key === 'diagnostics' || key === DECK_STOCKLIB_KEY;
    }

    // The stock-stage: for Diagnostics and the Full-stock-library door the
    // panel shrinks to its left column and the REAL stock page (frame2's
    // dashboard, the sessions page, or the streams page) shows beside it —
    // driven through the same hidden stock-nav anchors the stock UI uses.
    function deckSetStockStage(stockPage) {
        var panel = document.querySelector('.arcade-settings');
        if (!panel) return;
        var on = !!stockPage;
        panel.classList.toggle('is-stock-stage', on);
        document.body.classList.toggle('arcade-deck-stock-stage', on);
        if (on) clickStockNav(stockPage);
    }

    function deckFocusStockStage(key) {
        setTimeout(function () {
            if (key === 'diagnostics' && deckDiagnosticsView === 'dashboard') {
                var frame2 = document.getElementById('frame2');
                if (frame2) frame2.focus();
                return;
            }
            if (key === 'diagnostics' && deckDiagnosticsView === 'sessions') {
                var sessions = document.getElementById('sessions-page');
                if (sessions && focusFirstInteractiveIn(sessions, null)) return;
            }
            var frame1 = document.getElementById('frame1');
            if (frame1) frame1.focus();
        }, 350); // let the stock page's own display flip settle first
    }

    function renderDeckStage() {
        var stage = document.getElementById('arcade-deck-stage');
        if (!stage) return;
        var sub = document.getElementById('arcade-deck-diag-sub');
        stage.innerHTML = '';
        if (sub) { sub.hidden = true; sub.innerHTML = ''; }

        if (deckSelectedSection === 'diagnostics') {
            renderDeckDiagnosticsSubNav();
            if (deckDiagnosticsView === 'interface') {
                deckSetStockStage(null);
                renderDeckInterface(stage);
            } else if (deckDiagnosticsView === 'build') {
                deckSetStockStage(null);
                renderDeckBuild(stage);
            } else {
                deckSetStockStage(deckDiagnosticsView);
            }
            return;
        }
        if (deckSelectedSection === DECK_STOCKLIB_KEY) {
            deckSetStockStage('streams');
            return;
        }
        deckSetStockStage(null);

        if (deckSelectedSection === 'session') renderDeckSession(stage);
        else if (deckSelectedSection === 'surfaces') renderDeckSurfaces(stage);
        else if (deckSelectedSection === 'connections') renderDeckConnections(stage);
        else if (deckSelectedSection === 'speech') renderDeckSpeech(stage);
        else if (deckSelectedSection === 'points') renderDeckPoints(stage);
        else if (deckSelectedSection === 'backups') renderDeckBackups(stage);
    }

    function renderDeckDiagnosticsSubNav() {
        var sub = document.getElementById('arcade-deck-diag-sub');
        if (!sub) return;
        sub.hidden = false;
        sub.innerHTML = '';
        [
            { id: 'dashboard', label: 'Status and Logs' },
            { id: 'sessions', label: 'Sessions' },
            { id: 'interface', label: 'Interface' },
            { id: 'build', label: 'Build' }
        ].forEach(function (view) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'arcade-btn arcade-btn--sm arcade-deck-diag-sub__btn';
            btn.textContent = view.label;
            btn.setAttribute('aria-pressed', String(deckDiagnosticsView === view.id));
            btn.addEventListener('click', function () {
                deckDiagnosticsView = view.id;
                renderDeckDiagnosticsSubNav();
                if (view.id === 'interface' || view.id === 'build') {
                    deckSetStockStage(null);
                    var stage = document.getElementById('arcade-deck-stage');
                    if (stage) {
                        stage.innerHTML = '';
                        if (view.id === 'interface') renderDeckInterface(stage);
                        else renderDeckBuild(stage);
                        focusFirstInteractiveIn(stage, stage); // H17-B — focus lands IN the destination
                    }
                } else {
                    deckSetStockStage(deckDiagnosticsView);
                    deckFocusStockStage('diagnostics');
                }
            });
            sub.appendChild(btn);
        });
    }

    // --------------------------------------------------------------------
    // TASK-66 (H22 ruled) — the Interface row. Arcade is the DEFAULT shell;
    // this is the honest door back to Steve's original. The mechanism: the
    // shell engages at BOOT (index.html's body.arcade-shell switch), so a
    // switch persists a boot-read flag — canonical saveSetting for the
    // record + a localStorage mirror the synchronous boot script can read
    // without IPC — then reloads the window (the whole app re-boots, the
    // same gesture as a relaunch). Byte-identity law: the switched-stock
    // path is cmp-proven identical to base stock, exactly like SSN_SHELL=stock.
    // --------------------------------------------------------------------
    // TASK-68 (WALK 2A, ruled semantics) — switching to Stock is THIS
    // SESSION ONLY: the flag never persists stock, and it is consumed at
    // boot (index.html removes it after reading), so closing/reloading
    // ALWAYS boots the arcade again. SSN_SHELL=stock stays the persistent
    // stock lane. The session flag also beats an exported SSN_SHELL=arcade —
    // the in-app switch must work even where a launcher exports the var
    // (that pin was why the confirm→reload "did nothing": the click saved
    // a flag the boot then ignored).
    var SHELL_INTERFACE_KEY = 'arcadeShellInterface'; // canonical record: only ever 'arcade' now (stock is never persisted)
    var SHELL_INTERFACE_LS = 'ssnShellInterface';     // session stock flag — consume-once at boot (index.html)

    function currentShellInterface() {
        try {
            var envShell = '';
            if (typeof process !== 'undefined' && process && process.env && process.env.SSN_SHELL) {
                envShell = String(process.env.SSN_SHELL).toLowerCase();
            }
            if (envShell === 'stock') return { mode: 'stock', source: 'env' };
        } catch (e) { /* noop */ }
        var ls = '';
        try { ls = String(localStorage.getItem(SHELL_INTERFACE_LS) || '').toLowerCase(); } catch (e) { /* noop */ }
        if (ls === 'stock') return { mode: 'stock', source: 'switch' }; // this boot only — the boot script has consumed it for next time
        return { mode: 'arcade', source: 'default' };
    }

    function renderDeckInterface(stage) {
        var cur = currentShellInterface();
        var card = document.createElement('article');
        card.className = 'arcade-alert-card';
        var head = document.createElement('div');
        head.className = 'arcade-alert-card__head';
        var name = document.createElement('h3');
        name.className = 'arcade-alert-card__name';
        name.textContent = 'Interface';
        head.appendChild(name);
        card.appendChild(head);
        var body = document.createElement('div');
        body.className = 'arcade-alert-card__body';

        var line = document.createElement('p');
        line.className = 'arcade-evt-blurb';
        line.textContent = 'Arcade is this fork’s default chrome — an additive layer over the same app. Stock is Steve’s original UI, byte-for-byte unchanged. Switching reloads the window: everything re-boots in the other interface. Stock is a this-window-only visit — close or reload and you boot right back into the Arcade. (Launching with SSN_SHELL=stock is the persistent stock lane.)';
        body.appendChild(line);

        var group = document.createElement('div');
        group.className = 'arcade-frames-presets';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', 'Interface choice');
        [
            { id: 'arcade', label: 'Arcade (default)' },
            { id: 'stock', label: 'Stock (Steve’s original)' }
        ].forEach(function (opt) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'arcade-btn arcade-btn--sm';
            btn.textContent = opt.label;
            btn.setAttribute('aria-pressed', String(cur.mode === opt.id));
            btn.addEventListener('click', function () { deckSwitchInterface(opt.id, btn); });
            group.appendChild(btn);
        });
        body.appendChild(group);

        var state = document.createElement('div');
        state.className = 'arcade-evt-cond__hint';
        state.textContent = cur.source === 'env'
            ? 'Currently: stock — pinned by SSN_SHELL=stock at launch (the persistent stock lane).'
            : 'Currently: arcade — the fork default. A stock visit from here never sticks: the next boot is always arcade.';
        body.appendChild(state);

        var confirmLine = document.createElement('div');
        confirmLine.className = 'arcade-evt-cond__hint';
        confirmLine.id = 'arcade-interface-confirm';
        body.appendChild(confirmLine);

        card.appendChild(body);
        stage.appendChild(card);

        // TASK-67 (Lane 5) — UI size: the BOOT-DEFAULT zoom. Ctrl+wheel is
        // the live per-session zoom (Chromium's own); this card picks what a
        // fresh launch boots at — index.html's boot script forces exactly
        // 100% unless this setting says otherwise, so a drifted live zoom
        // never survives a relaunch. Canonical key arcadeUiZoom + the
        // localStorage mirror the synchronous boot script reads (the
        // interface flag's own doctrine). Applies immediately on pick, too.
        var zoomCard = document.createElement('article');
        zoomCard.className = 'arcade-alert-card';
        var zoomHead = document.createElement('div');
        zoomHead.className = 'arcade-alert-card__head';
        var zoomName = document.createElement('h3');
        zoomName.className = 'arcade-alert-card__name';
        zoomName.textContent = 'UI size';
        zoomHead.appendChild(zoomName);
        zoomCard.appendChild(zoomHead);
        var zoomBody = document.createElement('div');
        zoomBody.className = 'arcade-alert-card__body';

        function currentUiZoom() {
            var saved = NaN;
            try { saved = parseFloat(localStorage.getItem('arcadeUiZoom') || ''); } catch (e) { /* noop */ }
            return (isFinite(saved) && saved >= 0.5 && saved <= 2) ? saved : 1;
        }
        function applyUiZoom(factor) {
            try {
                var wf = require('electron').webFrame;
                if (wf && typeof wf.setZoomFactor === 'function') wf.setZoomFactor(factor);
            } catch (e) { /* noop */ }
        }

        var zoomGroup = document.createElement('div');
        zoomGroup.className = 'arcade-frames-presets';
        zoomGroup.setAttribute('role', 'group');
        zoomGroup.setAttribute('aria-label', 'UI size (boot default zoom)');
        var zoomState = document.createElement('div');
        zoomState.className = 'arcade-evt-cond__hint';
        function syncUiZoomButtons() {
            var cur = currentUiZoom();
            Array.prototype.forEach.call(zoomGroup.children, function (b) {
                b.setAttribute('aria-pressed', String(parseFloat(b.dataset.zoomPct) / 100 === cur));
            });
            zoomState.textContent = 'Boot default: ' + Math.round(cur * 100) + '%' + (cur === 1 ? ' (the house default — a fresh launch is always 100% unless you pick otherwise)' : '');
        }
        [90, 100, 110, 125].forEach(function (pct) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'arcade-btn arcade-btn--sm';
            b.dataset.zoomPct = String(pct);
            b.textContent = pct + '%';
            b.addEventListener('click', function () {
                var factor = pct / 100;
                saveDeckSetting('textparam1', 'arcadeUiZoom', String(factor));
                try { localStorage.setItem('arcadeUiZoom', String(factor)); } catch (e) { /* noop */ }
                applyUiZoom(factor);
                syncUiZoomButtons();
                setDeckStatus('UI size: ' + pct + '% — applied now, and the boot default');
            });
            zoomGroup.appendChild(b);
        });
        zoomBody.appendChild(zoomGroup);

        var resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'arcade-btn arcade-btn--sm';
        resetBtn.textContent = 'Reset to 100%';
        resetBtn.addEventListener('click', function () {
            saveDeckSetting('textparam1', 'arcadeUiZoom', '');
            try { localStorage.removeItem('arcadeUiZoom'); } catch (e) { /* noop */ }
            applyUiZoom(1);
            syncUiZoomButtons();
            setDeckStatus('UI size reset — launches boot at 100%');
        });
        zoomBody.appendChild(resetBtn);

        var zoomHint = document.createElement('div');
        zoomHint.className = 'arcade-evt-cond__hint';
        zoomHint.textContent = 'Ctrl + mouse wheel zooms live; this setting is the boot default.';
        zoomBody.appendChild(zoomHint);
        zoomBody.appendChild(zoomState);
        zoomCard.appendChild(zoomBody);
        stage.appendChild(zoomCard);
        syncUiZoomButtons();
    }

    // --------------------------------------------------------------------
    // TASK-71 (item 1, H24-A ruled) — Diagnostics → Build: the version
    // stamp. scripts/updateSocialStreamFallback.js writes build-info.json
    // into the bundle at refresh/stamp time (fork short commit + BFT build
    // date + every TRACKED bundle file's git blob id); this view reads it
    // back through the ssappFallback bridge and RE-PROVES the live bundle
    // against the tracked one — drift names the files, clean reads "bundle
    // matches build". The Admiral matches the fork hash against the GitHub
    // commit list at a glance.
    // --------------------------------------------------------------------
    // Git blob ids are sha1("blob <byteLen>\0" + bytes) — a compact SHA-1
    // over the file's UTF-8 bytes reproduces them exactly, no IPC needed.
    function arcadeGitBlobSha1(text) {
        var bytes = new TextEncoder().encode(text);
        var header = new TextEncoder().encode('blob ' + bytes.length + '\0');
        var contentLen = header.length + bytes.length;
        // pad: 0x80, zeros to 56 mod 64, then the 64-bit big-endian bit length
        var msg = new Uint8Array(contentLen + 1 + ((56 - ((contentLen + 1) % 64) + 64) % 64) + 8);
        msg.set(header); msg.set(bytes, header.length);
        var bitLen = contentLen * 8;
        var i = contentLen;
        msg[i] = 0x80;
        // tail: 64-bit big-endian bit length (sha1 over < 2^32 bits here)
        var dv = new DataView(msg.buffer);
        dv.setUint32(msg.length - 4, bitLen >>> 0);
        dv.setUint32(msg.length - 8, Math.floor(bitLen / 4294967296));
        var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
        var w = new Int32Array(80);
        var rotl = function (x, n) { return (x << n) | (x >>> (32 - n)); };
        for (var block = 0; block < msg.length; block += 64) {
            for (i = 0; i < 16; i++) w[i] = dv.getInt32(block + i * 4);
            for (i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
            var a = h0, b = h1, c = h2, d = h3, e = h4, f, k, tmp;
            for (i = 0; i < 80; i++) {
                if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
                else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
                else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
                else { f = b ^ c ^ d; k = 0xCA62C1D6; }
                tmp = (rotl(a, 5) + f + e + k + w[i]) | 0;
                e = d; d = c; c = rotl(b, 30); b = a; a = tmp;
            }
            h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
        }
        var hex = function (n) { return ('00000000' + (n >>> 0).toString(16)).slice(-8); };
        return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4);
    }

    function renderDeckBuild(stage) {
        var card = document.createElement('article');
        card.className = 'arcade-alert-card';
        var head = document.createElement('div');
        head.className = 'arcade-alert-card__head';
        var name = document.createElement('h3');
        name.className = 'arcade-alert-card__name';
        name.textContent = 'Build';
        head.appendChild(name);
        card.appendChild(head);
        var body = document.createElement('div');
        body.className = 'arcade-alert-card__body';

        var blurb = document.createElement('p');
        blurb.className = 'arcade-evt-blurb';
        blurb.textContent = 'What this app is running: the fork commit the bundle was stamped against, the Bitcoin Federated Time date of that stamp, and a live proof that the bundle on disk still matches the tracked bundle. Match the fork hash against the fork’s commit list on GitHub.';
        body.appendChild(blurb);

        function addRow(label, valueText, mono, titleText) {
            var row = document.createElement('div');
            row.className = 'arcade-build-row';
            var k = document.createElement('span');
            k.className = 'arcade-k';
            k.textContent = label;
            row.appendChild(k);
            var v = document.createElement('span');
            v.className = 'arcade-build-row__value' + (mono ? ' arcade-build-row__value--mono' : '');
            v.textContent = valueText;
            if (titleText) v.title = titleText;
            row.appendChild(v);
            body.appendChild(row);
            return v;
        }

        var freshness = addRow('Bundle freshness', 'checking…', false);
        freshness.id = 'arcade-build-freshness';
        freshness.setAttribute('role', 'status');
        freshness.setAttribute('aria-live', 'polite');

        var recheckBtn = document.createElement('button');
        recheckBtn.type = 'button';
        recheckBtn.className = 'arcade-btn arcade-btn--sm';
        recheckBtn.textContent = 'Re-check bundle';
        recheckBtn.title = 'Re-run the live-vs-tracked comparison now';
        recheckBtn.addEventListener('click', function () { fillBuildRows(); });
        body.appendChild(recheckBtn);

        card.appendChild(body);
        stage.appendChild(card);

        function fillBuildRows() {
            freshness.textContent = 'checking…';
            freshness.classList.remove('arcade-build-ok', 'arcade-build-drift');
            var fb = window.ssappFallback;
            if (!fb || typeof fb.readJson !== 'function' || typeof fb.readFile !== 'function') {
                addRow('Fork build', 'unavailable', true);
                freshness.textContent = 'the bundle bridge is unavailable in this context';
                freshness.classList.add('arcade-build-drift');
                return;
            }
            // Rebuild the static rows on re-check (drop prior ones, keep the
            // freshness row + button).
            Array.prototype.slice.call(body.querySelectorAll('.arcade-build-row')).forEach(function (r) {
                if (r.contains(freshness)) return;
                r.parentNode.removeChild(r);
            });
            fb.readJson('build-info.json').then(function (info) {
                if (!info || !info.forkCommit) {
                    addRow('Fork build', 'no build stamp', true);
                    freshness.textContent = 'no build-info.json in the bundle — run npm run update:fallback (or --stamp-only) to stamp this build';
                    freshness.classList.add('arcade-build-drift');
                    return;
                }
                addRow('Fork build', info.forkCommit, true,
                    (info.forkCommitFull || info.forkCommit) + ' — branch ' + (info.forkBranch || '?') + '. Match me: github.com/AdminPacman/social_stream_ninja commits');
                addRow('Built (BFT)', (info.bftDate || 'BFT —') + (info.bftHeight ? ' · block ' + info.bftHeight : ''), false,
                    'Stamped ' + (info.refreshedAt || 'unknown') + (info.stampMode === 'refresh' ? ' by a full bundle refresh' : ' by a stamp-only run'));
                if (info.upstreamCommit) {
                    addRow('Upstream social_stream', info.upstreamCommit + '@' + (info.upstreamBranch || 'main'), true, info.upstreamCommitFull || info.upstreamCommit);
                }
                // The freshness proof: re-hash every tracked bundle file as
                // a git blob and compare against the stamp's fingerprints.
                var tracked = info.trackedFiles || {};
                var names = Object.keys(tracked);
                if (!names.length) {
                    freshness.textContent = 'the stamp carries no file fingerprints — re-stamp to enable this check';
                    freshness.classList.add('arcade-build-drift');
                    return;
                }
                var drifted = [];
                var step = function (idx) {
                    if (idx >= names.length) {
                        if (!drifted.length) {
                            freshness.textContent = 'bundle matches build — ' + names.length + ' tracked file' + (names.length === 1 ? '' : 's') + ' verified';
                            freshness.classList.add('arcade-build-ok');
                        } else {
                            freshness.textContent = 'DRIFTED — live bundle differs from the tracked build: ' + drifted.slice(0, 6).join(', ') + (drifted.length > 6 ? ' (+' + (drifted.length - 6) + ' more)' : '');
                            freshness.classList.add('arcade-build-drift');
                        }
                        return;
                    }
                    var rel = names[idx];
                    fb.readFile(rel).then(function (text) {
                        if (text === null || text === undefined) {
                            drifted.push(rel + ' (missing)');
                        } else if (arcadeGitBlobSha1(text) !== tracked[rel]) {
                            drifted.push(rel);
                        }
                    }).catch(function () { drifted.push(rel + ' (unreadable)'); })
                        .finally(function () { step(idx + 1); });
                };
                step(0);
            }).catch(function (e) {
                console.error('[arcade-shell] build-info read failed:', e);
                freshness.textContent = 'build stamp unreadable — see console';
                freshness.classList.add('arcade-build-drift');
            });
        }
        fillBuildRows();
    }

    function deckSwitchInterface(mode, btn) {
        var cur = currentShellInterface();
        var note = document.getElementById('arcade-interface-confirm');
        if (cur.mode === mode) {
            if (note) note.textContent = 'Already running ' + mode + '.';
            return;
        }
        if (btn.dataset.confirm !== '1') { // two-click confirm, S47 idiom
            btn.dataset.confirm = '1';
            btn.textContent = mode === 'stock' ? 'Switch to Stock — reload now?' : 'Switch to Arcade — reload now?';
            if (note) note.textContent = mode === 'stock'
                ? 'The window reloads into Steve’s original interface — for THIS window only. Close it or reload and you boot back into the Arcade; nothing is persisted. Same app, other chrome — settings, sources and flows are untouched.'
                : 'The window reloads into the arcade interface. Same app, other chrome — settings, sources and flows are untouched.';
            return;
        }
        // Stock is session-only (TASK-68 ruled semantics): the localStorage
        // flag is the one-shot token index.html's boot script reads AND
        // consumes — it is never written to the canonical settings, so no
        // launch ever boots stock because of a past visit. The arcade pick
        // keeps its canonical record + mirror (the env-less default anyway).
        if (mode === 'arcade') {
            saveDeckSetting('textparam1', SHELL_INTERFACE_KEY, mode);
            try { localStorage.setItem(SHELL_INTERFACE_LS, mode); } catch (e) { /* noop */ }
        } else {
            try { localStorage.setItem(SHELL_INTERFACE_LS, 'stock'); } catch (e) { /* noop */ }
        }
        if (note) note.textContent = 'Reloading into ' + mode + '…';
        setTimeout(function () { window.location.reload(); }, 250);
    }

    // --------------------------------------------------------------------
    // S51 — the popup EMBED driver. One private popup.html iframe per
    // embed section, filtered to ONLY that section's berthed groups: each
    // berthed collapsible triplet (input.collapsible-input + label + div
    // .collapsible-text) MOVES into a fresh root div; every other body
    // child hides. Same stock page, same handlers, same keys — zero stock
    // JS touched, zero duplicate homes (frame1's popup stays covered). The
    // frame is dressed with the same DRESS_POPUP_CSS the shell already
    // injects into frame1, and any session-ID text inside is blurred by
    // default (the house mask law) with hover/focus reveal.
    // --------------------------------------------------------------------
    function buildDeckPopupEmbed(stage, sectionId, noteText) {
        var wrap = document.createElement('div');
        wrap.className = 'arcade-deck-embed';
        if (noteText) {
            var note = document.createElement('p');
            note.className = 'arcade-style-hint arcade-deck-embed__note';
            note.textContent = noteText;
            wrap.appendChild(note);
        }
        var frame = document.createElement('iframe');
        frame.className = 'arcade-deck-embed__frame';
        frame.title = 'Stock settings — ' + sectionId + ' groups';
        frame.setAttribute('aria-label', 'Stock settings — ' + sectionId + ' groups');
        wrap.appendChild(frame);
        stage.appendChild(wrap);

        var resolver = window.resolveSocialStreamPage;
        if (typeof resolver !== 'function') return;
        var langParams = (typeof window.getLanguageExtraParams === 'function') ? window.getLanguageExtraParams() : [];
        resolver('popup.html', { versionParam: 'v=2', extraParams: langParams }).then(function (resolved) {
            if (!resolved || !resolved.url) return;
            frame.dataset.ssappOrigin = resolved.origin || '';
            frame.addEventListener('load', function () {
                try {
                    deckFilterPopupFrame(frame, DECK_POPUP_SECTIONS[sectionId] || []);
                } catch (err) {
                    console.error('[arcade-shell] deck popup filter failed:', err);
                }
                // TASK-69 (WALK 2B sweep 2) — the embed FILLS the pane: size
                // the frame to its content (re-measured on resize, the
                // TASK-68 camera-frame idiom) so the PANE owns scrolling and
                // the frame never grows a scrollbar-within-scrollbar (the
                // Admiral's Speech TTS frame). Cross-origin/hosted frames
                // keep the 520px CSS fallback honestly.
                fitArcadeFrameToContent(frame);
                // TASK-68 — first-paint mask law fallback: if the filter
                // couldn't run (hosted frame, cross-origin), don't hold the
                // pane hidden forever — reveal at 6s regardless.
                setTimeout(function () { frame.classList.add('is-live'); }, 6000);
            });
            frame.src = resolved.url;
        }).catch(function (e) { console.error('[arcade-shell] deck popup embed resolve failed:', e); });
    }

    function deckFilterPopupFrame(frame, groupIds) {
        var origin = frame.dataset.ssappOrigin || '';
        if (!LOCAL_ORIGIN_FAMILY[origin]) return; // hosted fallback — can't filter cross-origin; show as-is
        var doc;
        try { doc = frame.contentDocument; } catch (e) { return; }
        if (!doc || !doc.body) return;

        // Dress first (same CSS the shell injects into frame1 — the var is
        // a pre-joined string, same as injectDressIntoFrame consumes). The
        // mask-class rules ride inside DRESS_POPUP_CSS itself (TASK-66).
        var style = doc.createElement('style');
        style.id = 'arcade-deck-embed-css';
        style.textContent = DRESS_POPUP_CSS;
        doc.head.appendChild(style);

        var root = doc.createElement('div');
        root.id = 'arcade-deck-popup-root';
        var moved = [];
        groupIds.forEach(function (id) {
            var input = doc.getElementById(id);
            if (!input) return;
            var label = input.nextElementSibling;
            var text = label && label.nextElementSibling;
            if (!label || !text) return;
            moved.push([input, label, text]);
        });
        moved.forEach(function (trip) {
            root.appendChild(trip[0]);
            root.appendChild(trip[1]);
            root.appendChild(trip[2]);
        });
        doc.body.appendChild(root);
        Array.prototype.slice.call(doc.body.children).forEach(function (el) {
            if (el !== root) el.style.display = 'none';
        });
        // popup.js keeps injecting chrome (toasts, dialogs, file inputs)
        // AND un-hiding late containers after load — anything that isn't
        // the berthed root (or inside it) stays hidden for the life of
        // the embed document.
        try {
            new doc.defaultView.MutationObserver(function (mutations) {
                mutations.forEach(function (m) {
                    Array.prototype.slice.call(m.addedNodes || []).forEach(function (el) {
                        if (el && el.nodeType === 1 && el !== root && el.style) el.style.display = 'none';
                    });
                    if (m.type === 'attributes' && m.target && m.target.nodeType === 1) {
                        var t = m.target;
                        if (t !== root && t !== doc.body && t !== doc.documentElement && !(root.contains && root.contains(t)) && t.style && t.style.display !== 'none') {
                            t.style.display = 'none';
                        }
                    }
                });
            }).observe(doc.body, { childList: true, attributes: true, attributeFilter: ['style', 'class'], subtree: true });
        } catch (e) { /* observer is best-effort; the static pass above already ran */ }
        // Berthed groups arrive expanded.
        groupIds.forEach(function (id) {
            var input = doc.getElementById(id);
            if (input) input.checked = true;
        });

        // Session-ID mask law (TASK-66 shared pass): blur any text node /
        // input value carrying the id, reveal on hover/focus, click-to-copy
        // the real id. Re-runs catch popup.js's async value fills.
        maskSessionIdSurfaces(doc, root);
        setTimeout(function () { maskSessionIdSurfaces(doc, root); }, 1200);
        setTimeout(function () { maskSessionIdSurfaces(doc, root); }, 3000);
        // TASK-68 — the embed stayed visibility:hidden until THIS point
        // (dress + first mask pass done): no unmasked frame ever paints.
        frame.classList.add('is-live');
    }

    // --------------------------------------------------------------------
    // S51 — SECTION: Session & rooms. The session ID masked-by-default
    // (blur law), a rotate door (runbook pointer — rotation is a runbook,
    // never a button), plus the stock Session Options group embedded.
    // --------------------------------------------------------------------
    function renderDeckSession(stage) {
        var card = document.createElement('article');
        card.className = 'arcade-alert-card';
        var head = document.createElement('div');
        head.className = 'arcade-alert-card__head';
        var name = document.createElement('h3');
        name.className = 'arcade-alert-card__name';
        name.textContent = 'Your session';
        head.appendChild(name);
        card.appendChild(head);
        var body = document.createElement('div');
        body.className = 'arcade-alert-card__body';

        var idRow = document.createElement('div');
        idRow.className = 'arcade-alert-row';
        var idLabel = document.createElement('label');
        idLabel.textContent = 'Session ID';
        idRow.appendChild(idLabel);
        var idValue = document.createElement('span');
        idValue.className = 'arcade-deck-masked arcade-deck-sessionid';
        idValue.tabIndex = 0;
        idValue.textContent = deckSessionId || '—';
        idValue.setAttribute('aria-label', 'Session ID — hidden, focus or hover to reveal, click to copy');
        idValue.title = 'Click to copy';
        idValue.addEventListener('click', function () {
            if (!deckSessionId) return;
            copyToClipboard(deckSessionId).then(function () { setDeckStatus('Session ID copied ✓'); });
        });
        idRow.appendChild(idValue);
        body.appendChild(idRow);

        var btnRow = document.createElement('div');
        btnRow.className = 'arcade-evt-doors';
        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'arcade-btn arcade-btn--sm';
        copyBtn.textContent = 'Copy session ID';
        copyBtn.addEventListener('click', function () {
            if (!deckSessionId) { flashButton(copyBtn, 'No session', 2200); return; }
            copyToClipboard(deckSessionId).then(function () { flashButton(copyBtn, 'Copied ✓'); });
        });
        btnRow.appendChild(copyBtn);
        body.appendChild(btnRow);

        var maskNote = document.createElement('div');
        maskNote.className = 'arcade-evt-cond__hint';
        maskNote.textContent = 'Masked by default — hover or keyboard-focus the value to peek. Masked beats rotated: keep it out of screenshots and the ID keeps working.';
        body.appendChild(maskNote);

        // Rotate — a REAL action since TASK-66, gated behind the REQUIRED
        // notice. The mechanism is the stock one (the same canonical
        // sidUpdated message popup.js sends from #sessionid,
        // background.js:6255): mint a fresh id, hand it to the background
        // page via the S48 async idiom (no sendSync during iframe churn).
        // What automation CAN'T do stays a runbook door: sweeping the old id
        // out of OBS scene JSONs and webhook dashboards is the operator's act.
        var rotateBtn = document.createElement('button');
        rotateBtn.type = 'button';
        rotateBtn.className = 'arcade-btn arcade-btn--sm';
        rotateBtn.textContent = 'Rotate session ID…';
        rotateBtn.setAttribute('aria-expanded', 'false');
        btnRow.appendChild(rotateBtn);
        var rotateCard = document.createElement('div');
        rotateCard.className = 'arcade-deck-rotate';
        rotateCard.hidden = true;
        body.appendChild(rotateCard);
        rotateBtn.addEventListener('click', function () {
            rotateCard.hidden = !rotateCard.hidden;
            rotateBtn.setAttribute('aria-expanded', String(!rotateCard.hidden));
            if (!rotateCard.hidden) renderDeckRotateCard(rotateCard);
        });

        card.appendChild(body);
        stage.appendChild(card);

        buildDeckPopupEmbed(stage, 'session', 'Stock session options — password and link obscuring, berthed in place.');
    }

    // Mint a fresh session id in the stock shape (background.js:592
    // generateStreamID: 10 chars, ambiguity-stripped alphabet, the "AD"
    // adblocker dodge) — same format the app mints on first run.
    function mintSessionId() {
        var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
        var text = '';
        try {
            var buf = new Uint8Array(10);
            (window.crypto || {}).getRandomValues(buf);
            for (var i = 0; i < 10; i++) text += alphabet.charAt(buf[i] % alphabet.length);
        } catch (e) {
            for (var j = 0; j < 10; j++) text += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        }
        return text.replace(/AD|Ad|ad|aD/g, 'vdAv');
    }

    function renderDeckRotateCard(host) {
        host.innerHTML = '';
        var notice = document.createElement('p');
        notice.className = 'arcade-deck-rotate__notice';
        notice.textContent = '⚠️ Rotating changes your overlay URLs — every OBS source using the old session must be updated (each browser source’s ?session=, plus any webhook URLs). The runbook: pacsarcade/rtfm/ssn-session-rotation.md.';
        host.appendChild(notice);
        var row = document.createElement('div');
        row.className = 'arcade-evt-doors';
        var confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--danger';
        confirmBtn.textContent = 'I understand — rotate now';
        row.appendChild(confirmBtn);
        var collapseBtn = document.createElement('button');
        collapseBtn.type = 'button';
        collapseBtn.className = 'arcade-btn arcade-btn--sm';
        collapseBtn.textContent = 'Keep my current session';
        collapseBtn.addEventListener('click', function () {
            host.hidden = true;
            var btn = null;
            // collapse back behind the door
            var doors = host.parentElement ? host.parentElement.querySelectorAll('button') : [];
            Array.prototype.forEach.call(doors, function (b) { if (b.textContent === 'Rotate session ID…') btn = b; });
            if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
        });
        row.appendChild(collapseBtn);
        host.appendChild(row);
        confirmBtn.addEventListener('click', function () { deckRotateSession(host); });
    }

    function deckRotateSession(host) {
        if (!deckSessionId) { setDeckStatus('No session yet — the app is still booting', true); return; }
        var oldId = deckSessionId;
        var newId = mintSessionId();
        if (!newId || newId === oldId) { setDeckStatus('Mint failed — nothing changed', true); return; }
        setDeckStatus('Rotating…');
        host.innerHTML = '';
        var working = document.createElement('p');
        working.className = 'arcade-evt-cond__hint';
        working.textContent = 'Handing the new session to the app…';
        host.appendChild(working);
        // Canonical stock rotation message — the same one popup.js sends
        // (background.js:6255 validates, persists, and re-arms the bridge).
        // S48 async idiom: no callback + one idempotent retry.
        try {
            if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                var payload = { cmd: 'sidUpdated', target: null, streamID: newId };
                window.ninjafy.sendMessage(null, payload);
                setTimeout(function () {
                    try { window.ninjafy.sendMessage(null, payload); } catch (e) { /* noop */ }
                }, 600);
            }
        } catch (e) { console.error('[arcade-shell] rotate send failed:', e); }
        // Re-read the app's truth after the write settles — the surface only
        // shows what the app actually reports, never the wish.
        setTimeout(function () {
            shellSessionIdCache = ''; // the mask pass cache must follow the rotation
            try {
                Promise.resolve(window.getChatDockSessionId ? window.getChatDockSessionId() : '').then(function (fresh) {
                    fresh = String(fresh || '');
                    if (fresh && fresh !== oldId) {
                        deckSessionId = fresh;
                        renderDeckRotateSuccess(host, fresh);
                        renderDeckStageSessionValue();
                        setDeckStatus('Session rotated ✓');
                    } else {
                        working.textContent = 'The app still reports the old session — the rotation did not land. Nothing else changed; the runbook covers the manual path (pacsarcade/rtfm/ssn-session-rotation.md).';
                        setDeckStatus('Rotate did not land — see the card', true);
                    }
                }, function () {
                    working.textContent = 'Could not re-read the session — check Deck Settings → Session & rooms after a moment.';
                });
            } catch (e) {
                working.textContent = 'Could not re-read the session — check Deck Settings → Session & rooms after a moment.';
            }
        }, 1600);
    }

    function renderDeckRotateSuccess(host, freshId) {
        host.innerHTML = '';
        var done = document.createElement('p');
        done.className = 'arcade-deck-rotate__done';
        done.textContent = 'Rotated ✓ — the old session is dead. Now update every OBS source and webhook that carried it (runbook: pacsarcade/rtfm/ssn-session-rotation.md).';
        host.appendChild(done);
        var idRow = document.createElement('div');
        idRow.className = 'arcade-alert-row';
        var lbl = document.createElement('label');
        lbl.textContent = 'New session ID';
        idRow.appendChild(lbl);
        var val = document.createElement('span');
        val.className = 'arcade-deck-masked arcade-deck-sessionid';
        val.tabIndex = 0;
        val.textContent = freshId;
        val.setAttribute('aria-label', 'New session ID — hidden, focus or hover to reveal, click to copy');
        val.title = 'Click to copy';
        val.addEventListener('click', function () {
            copyToClipboard(freshId).then(function () { setDeckStatus('New session ID copied ✓'); });
        });
        idRow.appendChild(val);
        host.appendChild(idRow);
        var doors = document.createElement('div');
        doors.className = 'arcade-evt-doors';
        var copyIdBtn = document.createElement('button');
        copyIdBtn.type = 'button';
        copyIdBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        copyIdBtn.textContent = 'Copy new session ID';
        copyIdBtn.addEventListener('click', function () {
            copyToClipboard(freshId).then(function () { flashButton(copyIdBtn, 'Copied ✓'); });
        });
        doors.appendChild(copyIdBtn);
        var copyDockBtn = document.createElement('button');
        copyDockBtn.type = 'button';
        copyDockBtn.className = 'arcade-btn arcade-btn--sm';
        copyDockBtn.textContent = 'Copy new dock URL';
        copyDockBtn.title = 'The combined-chat overlay URL with the fresh session — every other overlay URL re-mints from its own Copy button';
        copyDockBtn.addEventListener('click', function () {
            var resolver = window.resolveSocialStreamPage;
            if (typeof resolver !== 'function') { flashButton(copyDockBtn, 'Unavailable', 2200); return; }
            resolver('dock.html', { extraParams: ['session=' + encodeURIComponent(freshId)] }).then(function (resolved) {
                if (!resolved || !resolved.url) throw new Error('no url');
                return copyToClipboard(resolved.url).then(function () { flashButton(copyDockBtn, 'Copied ✓'); });
            }).catch(function () { flashButton(copyDockBtn, 'Copy failed', 2200); });
        });
        doors.appendChild(copyDockBtn);
        host.appendChild(doors);
        copyIdBtn.focus(); // H17-B — the flow lands on the re-copy path
    }

    // Keep the session card's masked value honest after a rotation without a
    // full panel re-render.
    function renderDeckStageSessionValue() {
        var vals = document.querySelectorAll('.arcade-settings .arcade-deck-sessionid');
        Array.prototype.forEach.call(vals, function (v) {
            v.textContent = deckSessionId || '—';
        });
    }

    // --------------------------------------------------------------------
    // S51 — SECTION: Connections. Platform sources admin (the sources live
    // on Main's rail — cross-link, no duplicate) + the OBS-websocket fields
    // (obsws/obspw — NAMES only ever in docs) + optional chat services +
    // the experimental transport toggle, all embedded in place.
    // --------------------------------------------------------------------
    function renderDeckConnections(stage) {
        var card = document.createElement('article');
        card.className = 'arcade-alert-card';
        var head = document.createElement('div');
        head.className = 'arcade-alert-card__head';
        var name = document.createElement('h3');
        name.className = 'arcade-alert-card__name';
        name.textContent = 'Platform sources';
        head.appendChild(name);
        card.appendChild(head);
        var body = document.createElement('div');
        body.className = 'arcade-alert-card__body';
        var line = document.createElement('p');
        line.className = 'arcade-evt-blurb';
        line.textContent = 'Chat sources (Twitch, Kick, YouTube and the rest) are added, started and stopped on Main’s sources rail — one home, no duplicate admin here.';
        body.appendChild(line);
        var doors = document.createElement('div');
        doors.className = 'arcade-evt-doors';
        var mainBtn = document.createElement('button');
        mainBtn.type = 'button';
        mainBtn.className = 'arcade-btn arcade-btn--sm';
        mainBtn.textContent = 'Open Main';
        mainBtn.addEventListener('click', function () { navigateArcadeTab('main'); });
        doors.appendChild(mainBtn);
        body.appendChild(doors);
        var obsNote = document.createElement('div');
        obsNote.className = 'arcade-evt-cond__hint';
        obsNote.textContent = 'OBS WebSocket (obsws / obspw) is configured in the embedded stock group below — values stay in the fields, names only ever leave this app.';
        body.appendChild(obsNote);
        card.appendChild(body);
        stage.appendChild(card);

        // TASK-66 — the VDO instance is a choice (Lane 3). The house repoint
        // is the DEFAULT value of this setting, not the only value: composed
        // guest/device links (Frames & Cameras) and the embedded vdo page
        // (&base=) all read it.
        var vdoCard = document.createElement('article');
        vdoCard.className = 'arcade-alert-card';
        var vdoHead = document.createElement('div');
        vdoHead.className = 'arcade-alert-card__head';
        var vdoName = document.createElement('h3');
        vdoName.className = 'arcade-alert-card__name';
        vdoName.textContent = 'VDO instance';
        vdoHead.appendChild(vdoName);
        vdoCard.appendChild(vdoHead);
        var vdoBody = document.createElement('div');
        vdoBody.className = 'arcade-alert-card__body';
        var vdoLine = document.createElement('p');
        vdoLine.className = 'arcade-evt-blurb';
        vdoLine.textContent = 'Camera/guest links (Frames & Cameras) ride this VDO.Ninja instance. Pac’s Arcade is the default; Steve’s hosted vdo.ninja always works; your own clone needs its full https URL.';
        vdoBody.appendChild(vdoLine);
        var vdoGroup = document.createElement('div');
        vdoGroup.className = 'arcade-frames-presets';
        vdoGroup.setAttribute('role', 'group');
        vdoGroup.setAttribute('aria-label', 'VDO instance choice');
        var vdoChoices = [
            { id: 'house', label: 'Pac’s Arcade (default)', value: '' },
            { id: 'stock', label: 'vdo.ninja (Steve’s)', value: STOCK_VDO_BASE },
            { id: 'custom', label: 'Your own clone', value: null }
        ];
        var customRow = document.createElement('div');
        customRow.className = 'arcade-frames-linkrow';
        var customInput = document.createElement('input');
        customInput.type = 'text';
        customInput.id = 'arcade-vdo-custom';
        customInput.autocomplete = 'off';
        customInput.placeholder = 'https://vdo.example.com/';
        customInput.setAttribute('aria-label', 'Custom VDO instance URL');
        var isCustom = framesVdoBaseSetting !== '' && framesVdoBaseSetting !== STOCK_VDO_BASE;
        if (isCustom) customInput.value = framesVdoBaseSetting;
        customRow.appendChild(customInput);
        var customSave = document.createElement('button');
        customSave.type = 'button';
        customSave.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        customSave.textContent = 'Use this instance';
        customRow.appendChild(customSave);
        function vdoPressed() {
            var pressedId = framesVdoBaseSetting === '' ? 'house' : (framesVdoBaseSetting === STOCK_VDO_BASE ? 'stock' : 'custom');
            Array.prototype.forEach.call(vdoGroup.children, function (b) {
                b.setAttribute('aria-pressed', String(b.dataset.vdoChoice === pressedId));
            });
            customRow.hidden = pressedId !== 'custom';
        }
        vdoChoices.forEach(function (opt) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'arcade-btn arcade-btn--sm';
            b.dataset.vdoChoice = opt.id;
            b.textContent = opt.label;
            b.addEventListener('click', function () {
                if (opt.value === null) { // custom — reveal the row; nothing saves until "Use this instance"
                    Array.prototype.forEach.call(vdoGroup.children, function (x) { x.setAttribute('aria-pressed', 'false'); });
                    b.setAttribute('aria-pressed', 'true');
                    customRow.hidden = false;
                    customInput.focus();
                    return;
                }
                framesVdoBaseSetting = opt.value;
                saveDeckSetting('textparam1', VDO_BASE_KEY, framesVdoBaseSetting);
                vdoPressed();
                setDeckStatus(opt.value === '' ? 'VDO instance: Pac’s Arcade (default)' : 'VDO instance: vdo.ninja (Steve’s)');
            });
            vdoGroup.appendChild(b);
        });
        vdoBody.appendChild(vdoGroup);
        customSave.addEventListener('click', function () {
            var valid = validateVdoBase(customInput.value);
            if (valid === null || valid === '') {
                setDeckStatus('That URL doesn’t parse — shape: https://host/ (no paths, no query)', true);
                customInput.focus();
                return;
            }
            framesVdoBaseSetting = valid;
            saveDeckSetting('textparam1', VDO_BASE_KEY, framesVdoBaseSetting);
            vdoPressed();
            setDeckStatus('VDO instance: ' + valid);
        });
        vdoBody.appendChild(customRow);
        var vdoNote = document.createElement('div');
        vdoNote.className = 'arcade-evt-cond__hint';
        vdoNote.textContent = 'Honest note: self-hosting VDO.Ninja is its own project (the static files plus a signaling handshake) — docs.vdo.ninja/servers. The choice only changes which deployment the composed links point at.';
        vdoBody.appendChild(vdoNote);
        vdoCard.appendChild(vdoBody);
        stage.appendChild(vdoCard);
        vdoPressed();

        buildDeckPopupEmbed(stage, 'connections', 'Connection-level stock groups — OBS WebSocket, opt-in chat services, experimental transport.');
    }

    // --------------------------------------------------------------------
    // S51 — SECTION: Speech (TTS). App-wide text-to-speech: the dock's
    // message TTS, the featured-overlay TTS, flow-action TTS, and the chat
    // bot's TTS — one speech home.
    // --------------------------------------------------------------------
    function renderDeckSpeech(stage) {
        var card = document.createElement('article');
        card.className = 'arcade-alert-card';
        var head = document.createElement('div');
        head.className = 'arcade-alert-card__head';
        var name = document.createElement('h3');
        name.className = 'arcade-alert-card__name';
        name.textContent = 'Text to speech';
        head.appendChild(name);
        card.appendChild(head);
        var body = document.createElement('div');
        body.className = 'arcade-alert-card__body';
        var line = document.createElement('p');
        line.className = 'arcade-evt-blurb';
        line.textContent = 'Every text-to-speech surface in one place: chat messages (dock), the featured-message overlay, event-flow actions, and the chat bot. Providers and voices are the stock fields below — including the local Kokoro voice set.';
        body.appendChild(line);
        card.appendChild(body);
        stage.appendChild(card);

        buildDeckPopupEmbed(stage, 'speech', 'All four stock TTS groups, berthed in place.');
    }

    // --------------------------------------------------------------------
    // S51 — SECTION: Backups & storage. Settings profiles, message export
    // (file/Excel), and the storage mechanics (local DB toggles), plus a
    // door to the points backup that lives in Points system.
    // --------------------------------------------------------------------
    function renderDeckBackups(stage) {
        var card = document.createElement('article');
        card.className = 'arcade-alert-card';
        var head = document.createElement('div');
        head.className = 'arcade-alert-card__head';
        var name = document.createElement('h3');
        name.className = 'arcade-alert-card__name';
        name.textContent = 'Backups & storage';
        head.appendChild(name);
        card.appendChild(head);
        var body = document.createElement('div');
        body.className = 'arcade-alert-card__body';
        var line = document.createElement('p');
        line.className = 'arcade-evt-blurb';
        line.textContent = 'Settings profiles, message-history export, and local-storage mechanics. Points data has its own backup lane — it lives with the rest of the community points area.';
        body.appendChild(line);
        var doors = document.createElement('div');
        doors.className = 'arcade-evt-doors';
        var pointsBtn = document.createElement('button');
        pointsBtn.type = 'button';
        pointsBtn.className = 'arcade-btn arcade-btn--sm';
        pointsBtn.textContent = 'Points backup → Points system';
        pointsBtn.addEventListener('click', function () { selectDeckSection('points', true); });
        doors.appendChild(pointsBtn);
        body.appendChild(doors);
        card.appendChild(body);
        stage.appendChild(card);

        buildDeckPopupEmbed(stage, 'backups', 'Stock backup & storage groups — settings profiles, message export, storage mechanics.');
    }

    // --------------------------------------------------------------------
    // S51 — settings loader. ONE getSettings read hydrates every deck
    // section, sequenced BEFORE any iframe src is set (the S50 sendSync
    // discipline — embeds and stock-stage frames come after). Re-entry
    // re-reads (S47B doctrine): edits made elsewhere since the last visit
    // show honestly.
    // --------------------------------------------------------------------
    function ensureDeckSettingsLive() {
        loadDeckSettings().then(function () {
            deckSettingsLive = true;
            if (deckPendingSection) {
                deckSelectedSection = deckPendingSection;
                deckPendingSection = null;
            }
            renderDeckList();
            renderDeckStage();
        });
    }

    function loadDeckSettings() {
        return new Promise(function (resolve) {
            function applySettings(settings) {
                try {
                    var enabledEntry = settings.enablePointsSystem;
                    deckPointsState.enabled = !!(enabledEntry && enabledEntry.setting);
                    var perEntry = settings.pointsPerEngagement;
                    var per = perEntry && Number(perEntry.numbersetting);
                    deckPointsState.per = (isFinite(per) && per > 0) ? per : 1;
                    var winEntry = settings.engagementWindow;
                    var winMin = winEntry && Number(winEntry.numbersetting);
                    deckPointsState.windowMin = (isFinite(winMin) && winMin > 0) ? winMin : 15;
                    deckPointsState.cmdPoints = !!(settings.enablePointsCommand && settings.enablePointsCommand.setting);
                    deckPointsState.cmdLeaderboard = !!(settings.enableLeaderboardCommand && settings.enableLeaderboardCommand.setting);
                    deckPointsState.cmdRewards = !!(settings.enableRewardsCommand && settings.enableRewardsCommand.setting);

                    var unlocksEntry = settings[POINTS_UNLOCKS_KEY];
                    var unlocks = null;
                    try { unlocks = JSON.parse((unlocksEntry && typeof unlocksEntry.textparam1 === 'string') ? unlocksEntry.textparam1 : ''); } catch (e) { unlocks = null; }
                    pointsUnlocks = Array.isArray(unlocks) ? unlocks.filter(function (u) {
                        return u && typeof u === 'object' && isFinite(Number(u.threshold)) && typeof u.name === 'string';
                    }).map(function (u) { return { threshold: Math.max(1, Math.round(Number(u.threshold))), name: u.name }; }) : [];

                    // Tier NAMES — the S47 key stays a plain string[] forever
                    // (S47 re-seeds the default if the shape ever breaks).
                    var tiersEntry = settings[ALERT_TIERS_KEY];
                    var tiers = null;
                    try {
                        var t = JSON.parse((tiersEntry && typeof tiersEntry.textparam1 === 'string') ? tiersEntry.textparam1 : '');
                        if (Array.isArray(t) && t.length && t.every(function (x) { return typeof x === 'string' && x; })) tiers = t;
                    } catch (e) { tiers = null; }
                    deckTiers = tiers || ALERT_TIERS_DEFAULT.slice();

                    var rulesEntry = settings[ALERT_TIER_RULES_KEY];
                    var rules = null;
                    try { rules = JSON.parse((rulesEntry && typeof rulesEntry.textparam1 === 'string') ? rulesEntry.textparam1 : ''); } catch (e) { rules = null; }
                    deckTierRules = Array.isArray(rules) ? rules.filter(function (r) {
                        return r && typeof r === 'object' && typeof r.tier === 'string' && Array.isArray(r.conditions);
                    }) : [];

                    var surfEntry = settings[CONTROL_SURFACES_KEY];
                    var surfaces = null;
                    try { surfaces = JSON.parse((surfEntry && typeof surfEntry.textparam1 === 'string') ? surfEntry.textparam1 : ''); } catch (e) { surfaces = null; }
                    deckSurfaces = Array.isArray(surfaces) ? surfaces.filter(function (s) {
                        return s && typeof s === 'object' && typeof s.type === 'string';
                    }) : [];

                    // TASK-66 — the VDO instance choice (Connections card +
                    // Frames & Cameras read the same canonical key).
                    var vdoEntry = settings[VDO_BASE_KEY];
                    var vdoRaw = (vdoEntry && typeof vdoEntry.textparam1 === 'string') ? vdoEntry.textparam1 : '';
                    var vdoValid = validateVdoBase(vdoRaw);
                    framesVdoBaseSetting = (vdoValid === null) ? '' : vdoValid;
                } catch (e) { console.error('[arcade-shell] deck settings parse failed:', e); }
            }
            try {
                if (window.ninjafy && typeof window.ninjafy.sendMessage === 'function') {
                    window.ninjafy.sendMessage(null, { getSettings: true }, function (response) {
                        applySettings((response && response.settings) || {});
                        // The session id comes off the app's own helper (a
                        // getSettings read itself) — still before any frame.
                        if (typeof window.getChatDockSessionId === 'function') {
                            Promise.resolve(window.getChatDockSessionId()).then(function (id) {
                                deckSessionId = id || '';
                                resolve();
                            }, function () { resolve(); });
                            return;
                        }
                        resolve();
                    });
                    return;
                }
            } catch (e) { console.error('[arcade-shell] deck settings load failed:', e); }
            setDeckStatus('settings bridge unavailable — edits will not persist', true);
            resolve();
        });
    }

    // --------------------------------------------------------------------
    // S51 — SECTION: Control surfaces. A CHOOSER, not three side-by-side
    // lanes (ruled round 6): the section asks "do you have a Touch Portal
    // or a Stream Deck?" — one or the other per device; "+ Add another
    // device" runs a second surface after setup. Lanes: Touch Portal
    // (guided setup against the control API — no official TP plugin
    // exists, the API is the door), Stream Deck (official plugin lane —
    // js/streamdeck-remote-control.js is the app side of its protocol —
    // plus the LOCAL setup page, since the stock setup frame is remote-
    // only and blank offline), or Neither (the deck's own UI covers it).
    // --------------------------------------------------------------------
    function deckSaveSurfaces() {
        saveDeckSetting('textparam1', CONTROL_SURFACES_KEY, JSON.stringify(deckSurfaces));
    }

    function deckAddSurface(type, name) {
        deckSurfaces.push({
            id: 's51-' + type + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
            type: type,
            name: name,
            at: Date.now()
        });
        deckSaveSurfaces();
    }

    function renderDeckSurfaces(stage) {
        var intro = document.createElement('p');
        intro.className = 'arcade-evt-blurb';
        intro.textContent = 'Physical control surfaces — a Touch Portal tablet or a Stream Deck — drive the deck through SSN’s control API. One device per setup; add another once the first is running.';
        stage.appendChild(intro);

        if (!deckSurfaces.length) {
            renderDeckSurfaceChooser(stage, null);
            return;
        }

        deckSurfaces.forEach(function (device) {
            if (device.type === 'touchportal') renderDeckTouchPortal(stage, device);
            else if (device.type === 'streamdeck') renderDeckStreamDeck(stage, device);
            else renderDeckNeither(stage, device);
        });

        var addDoors = document.createElement('div');
        addDoors.className = 'arcade-evt-doors';
        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'arcade-btn arcade-btn--sm';
        addBtn.textContent = '+ Add another device';
        addBtn.setAttribute('aria-expanded', 'false');
        addDoors.appendChild(addBtn);
        stage.appendChild(addDoors);
        var chooserHost = document.createElement('div');
        stage.appendChild(chooserHost);
        addBtn.addEventListener('click', function () {
            var open = chooserHost.childNodes.length === 0;
            if (open) {
                renderDeckSurfaceChooser(chooserHost, addBtn);
                addBtn.setAttribute('aria-expanded', 'true');
            } else {
                chooserHost.innerHTML = '';
                addBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function renderDeckSurfaceChooser(host, addBtnTrigger) {
        var ask = document.createElement('div');
        ask.className = 'arcade-evt-cond__title';
        ask.textContent = 'Do you have a Touch Portal or a Stream Deck?';
        host.appendChild(ask);

        var grid = document.createElement('div');
        grid.className = 'arcade-deck-chooser';
        [
            {
                type: 'touchportal', name: 'Touch Portal', icon: '📱',
                blurb: 'A phone/tablet running Touch Portal. No official SSN plugin exists — the guided setup wires TP against SSN’s control API with copy-paste action strings.'
            },
            {
                type: 'streamdeck', name: 'Stream Deck', icon: '🎛️',
                blurb: 'An Elgato Stream Deck. The official SSN plugin does the heavy lifting — a local setup page (works offline) walks the pairing.'
            },
            {
                type: 'neither', name: 'Neither', icon: '🖥️',
                blurb: 'No extra hardware — the deck’s own UI (sources rail, start/stop, event flows) covers the same ground.'
            }
        ].forEach(function (lane) {
            var card = document.createElement('article');
            card.className = 'arcade-el-card arcade-deck-chooser__card';
            var head = document.createElement('div');
            head.className = 'arcade-el-card__head';
            var nm = document.createElement('h3');
            nm.className = 'arcade-el-card__name';
            nm.textContent = lane.icon + ' ' + lane.name;
            head.appendChild(nm);
            card.appendChild(head);
            var blurb = document.createElement('p');
            blurb.className = 'arcade-el-card__blurb';
            blurb.textContent = lane.blurb;
            card.appendChild(blurb);
            var actions = document.createElement('div');
            actions.className = 'arcade-el-card__actions';
            var pick = document.createElement('button');
            pick.type = 'button';
            pick.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
            pick.textContent = lane.type === 'neither' ? 'Use the built-in controls' : 'Set up ' + lane.name;
            pick.addEventListener('click', function () {
                deckAddSurface(lane.type, lane.name);
                renderDeckList();
                renderDeckStage();
            });
            actions.appendChild(pick);
            card.appendChild(actions);
            grid.appendChild(card);
        });
        host.appendChild(grid);
        if (addBtnTrigger) {
            var cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'arcade-btn arcade-btn--sm';
            cancel.textContent = 'Cancel';
            cancel.addEventListener('click', function () {
                host.innerHTML = '';
                addBtnTrigger.setAttribute('aria-expanded', 'false');
                addBtnTrigger.focus();
            });
            host.appendChild(cancel);
        }
    }

    function deckSurfaceCard(stage, device, titleText) {
        var card = document.createElement('article');
        card.className = 'arcade-alert-card';
        var head = document.createElement('div');
        head.className = 'arcade-alert-card__head';
        var name = document.createElement('h3');
        name.className = 'arcade-alert-card__name';
        name.textContent = titleText;
        head.appendChild(name);
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'arcade-btn arcade-btn--sm';
        remove.textContent = 'Remove';
        remove.title = 'Remove this device';
        remove.addEventListener('click', function () {
            if (remove.dataset.confirm !== '1') {
                remove.dataset.confirm = '1';
                remove.textContent = 'Remove — sure?';
                return;
            }
            deckSurfaces = deckSurfaces.filter(function (d) { return d.id !== device.id; });
            deckSaveSurfaces();
            renderDeckList();
            renderDeckStage();
        });
        head.appendChild(remove);
        card.appendChild(head);
        var body = document.createElement('div');
        body.className = 'arcade-alert-card__body';
        card.appendChild(body);
        stage.appendChild(card);
        return body;
    }

    function deckCopyRow(body, label, displayText, copyText) {
        var row = document.createElement('div');
        row.className = 'arcade-alert-row arcade-deck-copyrow';
        var lbl = document.createElement('label');
        lbl.textContent = label;
        row.appendChild(lbl);
        var val = document.createElement('code');
        val.className = 'arcade-deck-copyrow__val';
        val.textContent = displayText;
        row.appendChild(val);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'arcade-btn arcade-btn--sm';
        btn.textContent = 'Copy';
        btn.setAttribute('aria-label', 'Copy ' + label);
        btn.addEventListener('click', function () {
            copyToClipboard(copyText).then(function () { flashButton(btn, 'Copied ✓'); });
        });
        row.appendChild(btn);
        body.appendChild(row);
    }

    // The Touch Portal lane — guided setup against SSN's control API
    // (api.md). Two transports, both honest:
    //   HOSTED relay — any TP HTTP action, no plugin, needs internet:
    //     GET https://io.socialstream.ninja/<session>/<action>/<target>/<value>
    //   LOCAL relay — offline, same machine: the app's local server
    //     (app menu → Enable Local Server) + a TP websocket-capable action
    //     at ws://127.0.0.1:3000/join/<session>/<in>/<out> — in=2/out=1 so
    //     TP hears the app's answers (background.js joins in=1/out=2).
    // The TP-side import is DOCUMENTED, not bundled: no official TP plugin
    // exists and TP's button-set format isn't shipped here — the strings
    // below paste straight into TP's HTTP/websocket actions.
    function renderDeckTouchPortal(stage, device) {
        var body = deckSurfaceCard(stage, device, '📱 Touch Portal — guided setup');

        var step1 = document.createElement('p');
        step1.className = 'arcade-evt-blurb';
        step1.textContent = '1 · Pick a transport. HOSTED works from any device with internet (TP’s built-in HTTP actions are enough). LOCAL works offline on this machine — enable the app’s local server (app menu → Enable Local Server) and the API/websocket toggle (Deck Settings → Backups & storage → ⚙️ Mechanics — the “allows external apps to control SSN” switch); TP needs a websocket-capable action.';
        body.appendChild(step1);

        var sid = deckSessionId || '';
        var hostedTitle = document.createElement('div');
        hostedTitle.className = 'arcade-evt-cond__title';
        hostedTitle.textContent = 'Hosted relay — HTTP actions (session masked)';
        body.appendChild(hostedTitle);
        deckCopyRow(body, 'Next featured message', 'https://io.socialstream.ninja/' + deckSessionMasked() + '/nextInQueue', 'https://io.socialstream.ninja/' + sid + '/nextInQueue');
        deckCopyRow(body, 'Toggle draw mode', 'https://io.socialstream.ninja/' + deckSessionMasked() + '/drawmode/null/toggle', 'https://io.socialstream.ninja/' + sid + '/drawmode/null/toggle');
        deckCopyRow(body, 'Clear overlay', 'https://io.socialstream.ninja/' + deckSessionMasked() + '/clearOverlay', 'https://io.socialstream.ninja/' + sid + '/clearOverlay');

        var localTitle = document.createElement('div');
        localTitle.className = 'arcade-evt-cond__title';
        localTitle.textContent = 'Local relay — websocket actions (offline; session masked)';
        body.appendChild(localTitle);
        deckCopyRow(body, 'Join URL (in=2, out=1)', 'ws://127.0.0.1:3000/join/' + deckSessionMasked() + '/2/1', 'ws://127.0.0.1:3000/join/' + sid + '/2/1');
        deckCopyRow(body, 'Handshake test', '{"action":"getCapabilities"}', '{"action":"getCapabilities"}');
        deckCopyRow(body, 'Next featured message', '{"action":"nextInQueue"}', '{"action":"nextInQueue"}');
        deckCopyRow(body, 'Toggle draw mode', '{"action":"drawmode","value":"toggle"}', '{"action":"drawmode","value":"toggle"}');
        var relayNote = document.createElement('div');
        relayNote.className = 'arcade-evt-cond__hint';
        relayNote.textContent = 'The local relay answers the handshake with a raw capabilities broadcast (it does not relay callback-tagged responses — send actions without a "get" token and read the broadcast).';
        body.appendChild(relayNote);

        var step2 = document.createElement('p');
        step2.className = 'arcade-evt-blurb';
        step2.textContent = '2 · In Touch Portal: add a button, give it an HTTP-request action (hosted URL) or a websocket send (join URL first, then the JSON action strings). The full action vocabulary is the bundle’s api.md — the strings above are the verified starters.';
        body.appendChild(step2);

        var testRow = document.createElement('div');
        testRow.className = 'arcade-evt-doors';
        var testBtn = document.createElement('button');
        testBtn.type = 'button';
        testBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--primary';
        testBtn.textContent = 'Test the local API';
        testRow.appendChild(testBtn);
        body.appendChild(testRow);
        var testStatus = document.createElement('div');
        testStatus.className = 'arcade-evt-cond__hint';
        testStatus.setAttribute('role', 'status');
        testStatus.setAttribute('aria-live', 'polite');
        testStatus.textContent = 'Probes ws://127.0.0.1:3000 exactly like a TP client would — join, send the handshake, await the answer.';
        body.appendChild(testStatus);
        testBtn.addEventListener('click', function () { deckTestLocalApi(testStatus); });
    }

    // The API-side TP proof, in-app: join the local relay as an external
    // client (in=2/out=1), send the capability handshake, await the app's
    // answer. Honest states at every failure point — never throws.
    function deckTestLocalApi(statusEl) {
        if (!deckSessionId) {
            statusEl.textContent = 'No session ID yet — the app hasn’t finished booting; try again in a moment.';
            return;
        }
        statusEl.textContent = 'Probing ws://127.0.0.1:3000 …';
        var ws;
        try {
            ws = new WebSocket('ws://127.0.0.1:3000/join/' + deckSessionId + '/2/1');
        } catch (e) {
            statusEl.textContent = 'Could not open a websocket at all — ' + (e && e.message ? e.message : 'unknown error') + '.';
            return;
        }
        var done = false;
        var timer = setTimeout(function () {
            if (done) return;
            done = true;
            try { ws.close(); } catch (e) { /* noop */ }
            statusEl.textContent = 'No answer within 5s. Either the local server is off (app menu → Enable Local Server) or the API/websocket toggle is off (Backups & storage → ⚙️ Mechanics) — or use the hosted relay strings above.';
        }, 5000);
        ws.onopen = function () {
            // No "get" token — the local relay eats callback-tagged
            // responses (measured: its callback-registry branch returns
            // before broadcasting); the answer arrives as a raw
            // {type:'capabilities'} broadcast instead.
            try { ws.send(JSON.stringify({ action: 'getCapabilities' })); } catch (e) { /* noop */ }
        };
        ws.onmessage = function (ev) {
            var msg = null;
            try { msg = JSON.parse(ev.data); } catch (e) { return; }
            if (!msg || msg.type !== 'capabilities') return;
            if (done) return;
            done = true;
            clearTimeout(timer);
            var appSide = msg.ssapp && msg.ssapp.available;
            statusEl.textContent = 'The API answered — capabilities received (' +
                (appSide ? 'the app bridge is live' : 'the SSN action set is live') +
                '). This is the exact round-trip a Touch Portal client makes.';
            try { ws.close(); } catch (e) { /* noop */ }
        };
        ws.onerror = function () {
            if (done) return;
            done = true;
            clearTimeout(timer);
            statusEl.textContent = 'Connection failed — the local server is off. Enable it (app menu → Enable Local Server), or use the hosted relay strings above.';
        };
    }

    // The Stream Deck lane — the official plugin (the app speaks its
    // protocol via js/streamdeck-remote-control.js) + the LOCAL setup page
    // embedded below. The stock setup frame is remote-only and renders
    // blank offline (S42 census); the local page ships in the bundle and
    // rides the same ssapp-streamdeck-* postMessage handshake.
    function renderDeckStreamDeck(stage, device) {
        var body = deckSurfaceCard(stage, device, '🎛️ Stream Deck — official plugin + local setup');

        var line = document.createElement('p');
        line.className = 'arcade-evt-blurb';
        line.textContent = 'The official Social Stream Ninja plugin (Elgato Marketplace) pairs with this app — the app answers its capability/action protocol. The setup page below is the LOCAL copy: it works offline and shows the live handshake state.';
        body.appendChild(line);

        var frame = document.createElement('iframe');
        frame.className = 'arcade-deck-embed__frame arcade-deck-streamdeck__frame';
        frame.title = 'Stream Deck local setup';
        frame.setAttribute('aria-label', 'Stream Deck local setup');
        body.appendChild(frame);

        var resolver = window.resolveSocialStreamPage;
        if (typeof resolver !== 'function') return;
        resolver('streamdeck/index.html', { versionParam: 'v=1' }).then(function (resolved) {
            if (!resolved || !resolved.url) return;
            frame.dataset.ssappOrigin = resolved.origin || '';
            frame.src = resolved.url;
        }).catch(function (e) { console.error('[arcade-shell] streamdeck local page resolve failed:', e); });

        // The handshake: the page announces ssapp-streamdeck-ready; answer
        // with the same ssapp-streamdeck-setup payload index.html sends the
        // stock frame (session id + capabilities off the app bridge).
        window.addEventListener('message', function onDeckSdMessage(event) {
            if (!document.body.contains(frame)) {
                window.removeEventListener('message', onDeckSdMessage);
                return;
            }
            if (event.source !== frame.contentWindow) return;
            if (!event.data || event.data.type !== 'ssapp-streamdeck-ready') return;
            deckBuildStreamDeckPayload().then(function (payload) {
                try {
                    var origin = frame.dataset.ssappOrigin || '';
                    frame.contentWindow.postMessage({ type: 'ssapp-streamdeck-setup', payload: payload }, /^https?:\/\//i.test(origin) ? origin : '*');
                } catch (e) { /* noop */ }
            });
        });
    }

    function deckBuildStreamDeckPayload() {
        return new Promise(function (resolve) {
            var payload = { sessionId: deckSessionId || '', capabilities: {} };
            try {
                if (window.SSAppStreamDeckBridge && typeof window.SSAppStreamDeckBridge.handleCommand === 'function') {
                    window.SSAppStreamDeckBridge.handleCommand({ action: 'getCapabilities' }).then(function (capResp) {
                        payload.capabilities = (capResp && capResp.payload) || {};
                        payload.bridgeVersion = payload.capabilities.bridgeVersion || (capResp && capResp.ok ? '1' : '');
                        payload.apiVersion = payload.capabilities.apiVersion || '';
                        resolve(payload);
                    }, function () { resolve(payload); });
                    return;
                }
            } catch (e) { /* fall through */ }
            resolve(payload);
        });
    }

    function renderDeckNeither(stage, device) {
        var body = deckSurfaceCard(stage, device, '🖥️ Built-in controls');
        var line = document.createElement('p');
        line.className = 'arcade-evt-blurb';
        line.textContent = 'No extra hardware needed — the deck’s own UI covers it: the sources rail starts and stops chats, event flows automate what happens on stream, and every overlay URL copies straight into OBS.';
        body.appendChild(line);
        var doors = document.createElement('div');
        doors.className = 'arcade-evt-doors';
        var mainBtn = document.createElement('button');
        mainBtn.type = 'button';
        mainBtn.className = 'arcade-btn arcade-btn--sm';
        mainBtn.textContent = 'Open Main';
        mainBtn.addEventListener('click', function () { navigateArcadeTab('main'); });
        doors.appendChild(mainBtn);
        var flowsBtn = document.createElement('button');
        flowsBtn.type = 'button';
        flowsBtn.className = 'arcade-btn arcade-btn--sm';
        flowsBtn.textContent = 'Open Flows';
        flowsBtn.addEventListener('click', function () { navigateArcadeTab('eventflow'); });
        doors.appendChild(flowsBtn);
        body.appendChild(doors);
    }

    // --------------------------------------------------------------------
    // S51 — SECTION: Points system (Rider 3 — THE one home for the
    // community points area). Every points/engagement surface is reachable
    // from this one section: earn rates, the unlocks table, alert priority
    // tiers, points backup + the Botrix / StreamElements import lanes, the
    // leaderboard door, and the engagement-analytics door. Framed for the
    // community (the streamer showing chatters what their engagement
    // builds), not as operator plumbing. The Games hub "Points & unlocks"
    // row cross-links HERE (same destination, no duplicate config).
    // Watch-time copy law (S52's measurement hasn't landed): this section
    // says points are message-engagement based and makes NO watch-time
    // accrual claim either way.
    // --------------------------------------------------------------------
    function renderDeckPoints(stage) {
        var intro = document.createElement('p');
        intro.className = 'arcade-evt-blurb';
        intro.textContent = 'Your community’s points — what chatters earn for being part of the stream, what it unlocks, and the leaderboard they climb. Everything points & engagement lives in this one section.';
        stage.appendChild(intro);
        renderDeckPointsEarn(stage);
        renderDeckPointsUnlocks(stage);
        renderDeckPointsTiers(stage);
        renderDeckPointsData(stage);
        renderDeckPointsLeaderboard(stage);
    }

    function deckPointsCard(stage, titleText) {
        var card = document.createElement('article');
        card.className = 'arcade-alert-card';
        var head = document.createElement('div');
        head.className = 'arcade-alert-card__head';
        var name = document.createElement('h3');
        name.className = 'arcade-alert-card__name';
        name.textContent = titleText;
        head.appendChild(name);
        card.appendChild(head);
        var body = document.createElement('div');
        body.className = 'arcade-alert-card__body';
        card.appendChild(body);
        stage.appendChild(card);
        return body;
    }

    function renderDeckPointsEarn(stage) {
        var body = deckPointsCard(stage, 'Earn');

        // TASK-68 — the shared .arcade-toggle (item 8 sweep): label +
        // switch adjacent, no label-left/control-far-right gap.
        body.appendChild(buildArcadeToggle({
            id: 'arcade-deck-points-toggle',
            label: 'Points system',
            checked: deckPointsState.enabled,
            onChange: function (checked) {
                deckPointsState.enabled = checked;
                saveDeckSetting('setting', 'enablePointsSystem', checked);
                renderDeckList();
            }
        }));

        function rateRow(id, label, value, key) {
            var row = document.createElement('div');
            row.className = 'arcade-alert-row arcade-alert-row--wide';
            var lbl = document.createElement('label');
            lbl.textContent = label;
            lbl.setAttribute('for', id);
            row.appendChild(lbl);
            var input = document.createElement('input');
            input.type = 'number';
            input.id = id;
            input.min = '1';
            input.max = key === 'engagementWindow' ? '60' : '100';
            input.step = '1';
            input.value = String(value);
            input.addEventListener('change', function () {
                var v = Math.max(1, Math.round(Number(input.value) || 0));
                input.value = String(v);
                saveDeckSetting('numbersetting', key, v);
                if (key === 'pointsPerEngagement') deckPointsState.per = v;
                else deckPointsState.windowMin = v;
            });
            row.appendChild(input);
            body.appendChild(row);
        }
        rateRow('arcade-deck-points-per', 'Points per engagement', deckPointsState.per, 'pointsPerEngagement');
        rateRow('arcade-deck-points-window', 'Engagement window (minutes)', deckPointsState.windowMin, 'engagementWindow');

        var ratesNote = document.createElement('div');
        ratesNote.className = 'arcade-evt-cond__hint';
        ratesNote.textContent = 'Points are message engagement — being in chat. Streak bonus: +10% per consecutive hour, capped at 2× (stock rules).';
        body.appendChild(ratesNote);

        var cmdTitle = document.createElement('div');
        cmdTitle.className = 'arcade-evt-cond__title';
        cmdTitle.textContent = 'Chat commands';
        body.appendChild(cmdTitle);
        [
            { key: 'enablePointsCommand', label: '!points — check a balance', stateKey: 'cmdPoints' },
            { key: 'enableLeaderboardCommand', label: '!leaderboard — link the board', stateKey: 'cmdLeaderboard' },
            { key: 'enableRewardsCommand', label: '!rewards — list redemptions', stateKey: 'cmdRewards' }
        ].forEach(function (cmd) {
            body.appendChild(buildArcadeToggle({ // TASK-68 — shared .arcade-toggle (item 8 sweep)
                label: cmd.label,
                ariaLabel: cmd.label,
                checked: deckPointsState[cmd.stateKey],
                onChange: function (checked) {
                    deckPointsState[cmd.stateKey] = checked;
                    saveDeckSetting('setting', cmd.key, checked);
                }
            }));
        });
    }

    function renderDeckPointsUnlocks(stage) {
        var body = deckPointsCard(stage, 'Unlocks');
        var line = document.createElement('p');
        line.className = 'arcade-evt-blurb';
        line.textContent = 'Threshold → effect name. When a chatter’s points cross a threshold, the named effect is what they’ve unlocked.';
        body.appendChild(line);

        var listEl = document.createElement('div');
        listEl.className = 'arcade-game-unlocks';
        body.appendChild(listEl);

        function renderRows() {
            listEl.innerHTML = '';
            pointsUnlocks.forEach(function (unlock, idx) {
                listEl.appendChild(buildUnlockRow(unlock, idx, pointsUnlocks, renderRows));
            });
            if (!pointsUnlocks.length) {
                var empty = document.createElement('div');
                empty.className = 'arcade-evt-cond__hint';
                empty.textContent = 'No unlocks yet — set a points threshold and name what it means.';
                listEl.appendChild(empty);
            }
        }
        renderRows();

        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'arcade-btn arcade-btn--sm';
        addBtn.textContent = '+ Add unlock';
        addBtn.addEventListener('click', function () {
            var nextThreshold = pointsUnlocks.length ? (Math.max.apply(null, pointsUnlocks.map(function (u) { return u.threshold; })) * 2) : 100;
            pointsUnlocks.push({ threshold: nextThreshold, name: '' });
            savePointsUnlocks();
            renderRows();
        });
        body.appendChild(addBtn);

        var hint = document.createElement('div');
        hint.className = 'arcade-evt-cond__hint';
        hint.textContent = 'Names only for now — unlocks fire via event flows; the execution wiring is a follow-up task. Flows and overlays can already read this table through the settings chain (arcadePointsUnlocks).';
        body.appendChild(hint);
        var doors = document.createElement('div');
        doors.className = 'arcade-evt-doors';
        var flowsBtn = document.createElement('button');
        flowsBtn.type = 'button';
        flowsBtn.className = 'arcade-btn arcade-btn--sm';
        flowsBtn.textContent = 'Open Flows';
        flowsBtn.addEventListener('click', function () { navigateArcadeTab('eventflow'); });
        doors.appendChild(flowsBtn);
        body.appendChild(doors);
    }

    // Alert priority tiers — the list S47's alert chips read (names) PLUS
    // the promotion-condition policy (ruled round 7). Conditions use ONLY
    // what EventFlow already evaluates — each kind cites the real
    // evaluator in actions/EventFlowSystem.js; NO new evaluators:
    //   platform        → event-trigger config.sources filter (:2240-2305)
    //   firsttime       → messageProperties requiredProperties ['firsttime'] (:2841-2880)
    //   returningDays   → messageProperties lastActivityFilter, mode 'older' (:2884+)
    //   raidViewers     → eventRaid config.minViewers (:2281-2292)
    //   donationAmount  → eventDonation config.minAmount (:2266-2279)
    //   bitsMin         → eventCheer config.minBits (:2294-2305)
    var DECK_TIER_CONDITION_KINDS = [
        { kind: 'platform', label: 'Platform is…', value: 'sources' },
        { kind: 'firsttime', label: 'First-time chatter', value: null },
        { kind: 'returningDays', label: 'Returning after N quiet days', value: 'days' },
        { kind: 'raidViewers', label: 'Raid with at least N viewers', value: 'min' },
        { kind: 'donationAmount', label: 'Donation of at least N', value: 'min' },
        { kind: 'bitsMin', label: 'Bits cheer of at least N', value: 'min' }
    ];

    function deckSaveTiers() {
        saveDeckSetting('textparam1', ALERT_TIERS_KEY, JSON.stringify(deckTiers));
    }
    function deckSaveTierRules() {
        saveDeckSetting('textparam1', ALERT_TIER_RULES_KEY, JSON.stringify(deckTierRules));
    }

    // Renaming a tier cascades into arcadeAlertVariants (S47's doc carries
    // tier names on every event/custom record + the All-types default), so
    // the Alerts surface's chips follow the new name instead of orphaning.
    function deckCascadeTierRename(oldName, newName) {
        if (!oldName || !newName || oldName === newName) return;
        deckCmd({ getSettings: true }, function (response) {
            try {
                var entry = response && response.settings && response.settings[ALERT_VARIANTS_KEY];
                var raw = (entry && typeof entry.textparam1 === 'string') ? entry.textparam1 : '';
                if (!raw) return;
                var doc = JSON.parse(raw);
                var changed = false;
                (function walk(node) {
                    if (!node || typeof node !== 'object') return;
                    if (node.tier === oldName) { node.tier = newName; changed = true; }
                    Object.keys(node).forEach(function (k) { walk(node[k]); });
                })(doc);
                if (changed) saveDeckSetting('textparam1', ALERT_VARIANTS_KEY, JSON.stringify(doc));
            } catch (e) { console.error('[arcade-shell] tier rename cascade failed:', e); }
        });
    }

    function renderDeckPointsTiers(stage) {
        var body = deckPointsCard(stage, 'Alert priority tiers');
        var line = document.createElement('p');
        line.className = 'arcade-evt-blurb';
        line.textContent = 'The priority list the Alerts surface’s chips read. Tier names, and the conditions that promote an event into each tier — conditions limited to what Event Flow already evaluates; nothing here invents an evaluator.';
        body.appendChild(line);

        var listEl = document.createElement('div');
        body.appendChild(listEl);

        function renderTiers() {
            listEl.innerHTML = '';
            deckTiers.forEach(function (tierName, idx) {
                var tierBlock = document.createElement('div');
                tierBlock.className = 'arcade-deck-tier';

                var row = document.createElement('div');
                row.className = 'arcade-alert-row';
                var nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.autocomplete = 'off';
                nameInput.value = tierName;
                nameInput.setAttribute('aria-label', 'Tier ' + (idx + 1) + ' name');
                nameInput.addEventListener('change', function () {
                    var v = nameInput.value.trim();
                    if (!v || deckTiers.indexOf(v) !== -1) { nameInput.value = deckTiers[idx]; return; }
                    var old = deckTiers[idx];
                    deckTiers[idx] = v;
                    deckTierRules.forEach(function (r) { if (r.tier === old) r.tier = v; });
                    deckSaveTiers();
                    deckSaveTierRules();
                    deckCascadeTierRename(old, v);
                    renderTiers();
                });
                row.appendChild(nameInput);
                var remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'arcade-btn arcade-btn--sm';
                remove.textContent = '×';
                remove.title = 'Remove this tier';
                remove.setAttribute('aria-label', 'Remove tier ' + tierName);
                remove.addEventListener('click', function () {
                    if (deckTiers.length <= 1) { setDeckStatus('at least one tier must stay', true); return; }
                    var removed = deckTiers.splice(idx, 1)[0];
                    deckTierRules = deckTierRules.filter(function (r) { return r.tier !== removed; });
                    deckSaveTiers();
                    deckSaveTierRules();
                    setDeckStatus('tier "' + removed + '" removed — alert variants keep their last tier name until re-picked');
                    renderTiers();
                });
                row.appendChild(remove);
                tierBlock.appendChild(row);

                // Promotion conditions for this tier.
                var condHost = document.createElement('div');
                condHost.className = 'arcade-deck-tier__conds';
                tierBlock.appendChild(condHost);
                renderConditions(condHost, tierName);
                listEl.appendChild(tierBlock);
            });
        }

        function renderConditions(condHost, tierName) {
            condHost.innerHTML = '';
            var rule = null;
            deckTierRules.forEach(function (r) { if (r.tier === tierName) rule = r; });
            var conditions = rule ? rule.conditions : [];
            conditions.forEach(function (cond, cidx) {
                condHost.appendChild(buildConditionRow(tierName, cond, cidx, function () { renderConditions(condHost, tierName); }));
            });
            var addRow = document.createElement('div');
            addRow.className = 'arcade-evt-doors';
            var addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'arcade-btn arcade-btn--sm';
            addBtn.textContent = '+ Add condition';
            addBtn.setAttribute('aria-label', 'Add a promotion condition to ' + tierName);
            addBtn.addEventListener('click', function () {
                if (!rule) {
                    rule = { tier: tierName, conditions: [] };
                    deckTierRules.push(rule);
                }
                rule.conditions.push({ kind: 'firsttime' });
                deckSaveTierRules();
                renderConditions(condHost, tierName);
            });
            addRow.appendChild(addBtn);
            condHost.appendChild(addRow);
            if (!conditions.length) {
                var none = document.createElement('div');
                none.className = 'arcade-evt-cond__hint';
                none.textContent = 'No promotion conditions — events take this tier only by manual pick on the Alerts surface.';
                condHost.appendChild(none);
            }
        }

        function buildConditionRow(tierName, cond, cidx, onChanged) {
            var row = document.createElement('div');
            row.className = 'arcade-alert-row arcade-deck-cond';
            var select = document.createElement('select');
            select.setAttribute('aria-label', 'Condition type');
            DECK_TIER_CONDITION_KINDS.forEach(function (k) {
                var opt = document.createElement('option');
                opt.value = k.kind;
                opt.textContent = k.label;
                select.appendChild(opt);
            });
            select.value = cond.kind;
            row.appendChild(select);

            var valueInput = document.createElement('input');
            row.appendChild(valueInput);

            function syncValueField() {
                var kindMeta = null;
                DECK_TIER_CONDITION_KINDS.forEach(function (k) { if (k.kind === select.value) kindMeta = k; });
                if (kindMeta && kindMeta.value === 'sources') {
                    valueInput.type = 'text';
                    valueInput.placeholder = 'twitch, kick, youtube';
                    valueInput.value = Array.isArray(cond.sources) ? cond.sources.join(', ') : '';
                    valueInput.setAttribute('aria-label', 'Platforms (comma-separated)');
                } else if (kindMeta && kindMeta.value) {
                    valueInput.type = 'number';
                    valueInput.min = '1';
                    valueInput.step = '1';
                    valueInput.value = String(Number(cond[kindMeta.value]) || (kindMeta.value === 'days' ? 7 : 10));
                    valueInput.setAttribute('aria-label', 'Condition value');
                } else {
                    valueInput.type = 'text';
                    valueInput.value = '';
                    valueInput.placeholder = '—';
                    valueInput.disabled = true;
                    valueInput.setAttribute('aria-label', 'No value needed');
                    return;
                }
                valueInput.disabled = false;
            }
            syncValueField();

            select.addEventListener('change', function () {
                var fresh = { kind: select.value };
                cond.kind = fresh.kind;
                delete cond.sources;
                delete cond.days;
                delete cond.min;
                syncValueField();
                pushCond();
            });
            valueInput.addEventListener('change', function () {
                if (select.value === 'platform') {
                    cond.sources = valueInput.value.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
                    delete cond.days; delete cond.min;
                } else if (select.value === 'returningDays') {
                    cond.days = Math.max(1, Math.round(Number(valueInput.value) || 1));
                    delete cond.sources; delete cond.min;
                } else if (select.value !== 'firsttime') {
                    cond.min = Math.max(1, Math.round(Number(valueInput.value) || 1));
                    delete cond.sources; delete cond.days;
                }
                pushCond();
            });
            function pushCond() {
                var rule = null;
                deckTierRules.forEach(function (r) { if (r.tier === tierName) rule = r; });
                if (rule) { rule.conditions[cidx] = cond; deckSaveTierRules(); }
            }

            var remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'arcade-btn arcade-btn--sm';
            remove.textContent = '×';
            remove.title = 'Remove this condition';
            remove.setAttribute('aria-label', 'Remove this condition');
            remove.addEventListener('click', function () {
                var rule = null;
                deckTierRules.forEach(function (r) { if (r.tier === tierName) rule = r; });
                if (rule) {
                    rule.conditions.splice(cidx, 1);
                    if (!rule.conditions.length) deckTierRules = deckTierRules.filter(function (r) { return r !== rule; });
                    deckSaveTierRules();
                }
                onChanged();
            });
            row.appendChild(remove);
            return row;
        }

        renderTiers();

        var addTierBtn = document.createElement('button');
        addTierBtn.type = 'button';
        addTierBtn.className = 'arcade-btn arcade-btn--sm';
        addTierBtn.textContent = '+ Add tier';
        addTierBtn.addEventListener('click', function () {
            var n = deckTiers.length + 1;
            var name = 'TIER ' + n;
            while (deckTiers.indexOf(name) !== -1) { n++; name = 'TIER ' + n; }
            deckTiers.push(name);
            deckSaveTiers();
            renderTiers();
        });
        body.appendChild(addTierBtn);

        var hint = document.createElement('div');
        hint.className = 'arcade-evt-cond__hint';
        hint.textContent = 'First-time conditions need the stock first-timers setting on (the Alerts surface says the same). The Alerts surface’s priority-condition box wires these through real Event Flow triggers; this table is the policy home.';
        body.appendChild(hint);
    }

    // Data import/export — Botrix (the EXISTING GUI path's plumbing: the
    // same exportPointsData/importPointsData commands the stock popup
    // buttons ride, ALWAYS Merge, berthed not rebuilt) + the NEW
    // StreamElements loyalty lane (same shape as Botrix; SE values land in
    // separate se* fields, never overwriting SSN points).
    //
    // SE export format — VERIFIED LIVE against SE's API 0018.06.04 (there
    // is NO one-click dashboard export; the public loyalty endpoints ARE
    // the export, the same ones community exporters use):
    //   GET https://api.streamelements.com/kappa/v2/channels/<name>   → _id
    //   GET …/kappa/v2/points/<_id>/top?limit=100&offset=0
    //     → {"_total":N,"users":[{"username":"…","points":N}, …]}
    //   GET …/points/<_id>/alltime?…   → same users[].points shape
    //   GET …/points/<_id>/watchtime?… → users[].minutes (may be null)
    // The lane accepts any of those JSON payloads (or a raw users array,
    // or several merged into one file) and spec's exactly that for the
    // operator in the UI copy.
    // The points data plumbing is the background page's pointsSystem — the
    // SAME object the stock popup's export/import/reset command handlers
    // call (background.js:6005-6060). The shell reaches it directly through
    // frame2 (the analytics-bridge pattern) instead of relaying a command:
    // the relay's response to these cmds from the index context is not the
    // handler's sendResponse (measured: the settings doc comes back), so
    // direct calls are how the result lines stay HONEST. Zero new plumbing,
    // zero IPC — the sendSync trap class doesn't apply here at all.
    function deckPointsSystem() {
        try {
            var frame2 = document.getElementById('frame2');
            var bg = frame2 && frame2.contentWindow;
            if (bg && bg.pointsSystem) {
                return Promise.resolve(typeof bg.pointsSystemReady === 'function' ? bg.pointsSystemReady() : null).then(function () {
                    return bg.pointsSystem;
                });
            }
        } catch (e) { console.error('[arcade-shell] points system reach failed:', e); }
        return Promise.resolve(null);
    }

    function renderDeckPointsData(stage) {
        var body = deckPointsCard(stage, 'Data — backup, Botrix, StreamElements');

        var resultLine = document.createElement('div');
        resultLine.className = 'arcade-evt-cond__hint';
        resultLine.setAttribute('role', 'status');
        resultLine.setAttribute('aria-live', 'polite');

        // Export — the same exportAllPoints() the stock Export Points
        // button's handler calls, blob-downloaded shell-side (the S30
        // Blob + anchor idiom).
        var exportRow = document.createElement('div');
        exportRow.className = 'arcade-evt-doors';
        var exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'arcade-btn arcade-btn--sm';
        exportBtn.textContent = 'Export points backup';
        exportBtn.addEventListener('click', function () {
            exportBtn.disabled = true;
            deckPointsSystem().then(function (sys) {
                exportBtn.disabled = false;
                if (!sys) { resultLine.textContent = 'The points system is not reachable yet — try again in a moment.'; return; }
                return sys.exportAllPoints().then(function (jsonData) {
                    try {
                        var blob = new Blob([jsonData], { type: 'application/json' });
                        var url = URL.createObjectURL(blob);
                        var a = document.createElement('a');
                        a.href = url;
                        a.download = 'points-backup-' + new Date().toISOString().split('T')[0] + '.json';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        var parsed = JSON.parse(jsonData);
                        resultLine.textContent = 'Exported ' + (parsed.userCount || 0) + ' users.';
                    } catch (e) {
                        console.error('[arcade-shell] points export failed:', e);
                        resultLine.textContent = 'Export failed — ' + e.message + '.';
                    }
                });
            });
        });
        exportRow.appendChild(exportBtn);
        body.appendChild(exportRow);

        // Import — the same importPoints(json, 'merge') the stock Import
        // Points button's handler calls. Converted Botrix exports arrive in
        // this same SSN-backup shape (the Botrix converter's output), so
        // both ride this one door; the merge ALWAYS keeps higher points and
        // preserves reference fields (botrix*/se*), never mixing them into
        // SSN points. Counts come off the real result object.
        var importTitle = document.createElement('div');
        importTitle.className = 'arcade-evt-cond__title';
        importTitle.textContent = 'Import — SSN backup or converted Botrix export (always merges)';
        body.appendChild(importTitle);
        var importFile = document.createElement('input');
        importFile.type = 'file';
        importFile.accept = '.json';
        importFile.id = 'arcade-deck-points-import-file';
        importFile.setAttribute('aria-label', 'Choose a points backup or converted Botrix export (.json)');
        body.appendChild(importFile);
        var importBtn = document.createElement('button');
        importBtn.type = 'button';
        importBtn.className = 'arcade-btn arcade-btn--sm';
        importBtn.textContent = 'Import points';
        importBtn.addEventListener('click', function () {
            var file = importFile.files && importFile.files[0];
            if (!file) { resultLine.textContent = 'Choose a .json file first.'; return; }
            var reader = new FileReader();
            reader.onload = function () {
                deckPointsSystem().then(function (sys) {
                    if (!sys) { resultLine.textContent = 'The points system is not reachable yet — try again in a moment.'; return; }
                    return sys.importPoints(String(reader.result || ''), 'merge').then(function (result) {
                        if (result && result.success !== false) {
                            resultLine.textContent = 'Imported: ' + (result.imported || 0) + ', Skipped: ' + (result.skipped || 0) +
                                ' (a skip still merges reference fields — that’s expected).';
                        } else {
                            resultLine.textContent = 'Import failed — ' + ((result && (result.error || result.message)) || 'unknown error') + '.';
                        }
                    });
                });
            };
            reader.onerror = function () { resultLine.textContent = 'Could not read that file.'; };
            reader.readAsText(file);
        });
        body.appendChild(importBtn);

        // StreamElements lane.
        var seTitle = document.createElement('div');
        seTitle.className = 'arcade-evt-cond__title';
        seTitle.textContent = 'Import — StreamElements loyalty (always merges, lands in se* fields)';
        body.appendChild(seTitle);
        var seSpec = document.createElement('div');
        seSpec.className = 'arcade-evt-cond__hint';
        seSpec.textContent = 'SE has no one-click export — save the JSON from the public loyalty endpoints instead: resolve your channel id at api.streamelements.com/kappa/v2/channels/<channel>, then download …/kappa/v2/points/<id>/top (and /alltime, /watchtime) with ?limit=100&offset=0 pages. Feed any of those JSON files here — usernames with points and/or minutes are picked up. SE values land in separate se* fields and NEVER overwrite SSN points.';
        body.appendChild(seSpec);
        var seRow = document.createElement('div');
        seRow.className = 'arcade-alert-row arcade-alert-row--wide'; // TASK-69 sweep 3 — same 68px crush as the moderation row
        var sePlatLabel = document.createElement('label');
        sePlatLabel.textContent = 'Platform the export belongs to';
        sePlatLabel.setAttribute('for', 'arcade-deck-se-platform');
        seRow.appendChild(sePlatLabel);
        var sePlat = document.createElement('select');
        sePlat.id = 'arcade-deck-se-platform';
        ['twitch', 'kick', 'youtube'].forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            sePlat.appendChild(opt);
        });
        seRow.appendChild(sePlat);
        body.appendChild(seRow);
        var seFile = document.createElement('input');
        seFile.type = 'file';
        seFile.accept = '.json';
        seFile.id = 'arcade-deck-se-import-file';
        seFile.setAttribute('aria-label', 'Choose a StreamElements loyalty export (.json)');
        body.appendChild(seFile);
        var seBtn = document.createElement('button');
        seBtn.type = 'button';
        seBtn.className = 'arcade-btn arcade-btn--sm';
        seBtn.textContent = 'Import StreamElements';
        seBtn.addEventListener('click', function () {
            var file = seFile.files && seFile.files[0];
            if (!file) { resultLine.textContent = 'Choose a StreamElements .json file first.'; return; }
            var reader = new FileReader();
            reader.onload = function () {
                var converted = null;
                try {
                    converted = deckConvertSeExport(JSON.parse(String(reader.result || '')), sePlat.value);
                } catch (e) { converted = null; }
                if (!converted || !converted.users.length) {
                    resultLine.textContent = 'That file doesn’t look like an SE loyalty export — expected a users array with username + points/minutes.';
                    return;
                }
                deckPointsSystem().then(function (sys) {
                    if (!sys) { resultLine.textContent = 'The points system is not reachable yet — try again in a moment.'; return; }
                    return sys.importPoints(JSON.stringify(converted), 'merge').then(function (result) {
                        if (result && result.success !== false) {
                            resultLine.textContent = 'StreamElements: ' + converted.users.length + ' viewers read — imported: ' +
                                (result.imported || 0) + ', skipped: ' + (result.skipped || 0) + ' (se* fields only; SSN points untouched).';
                        } else {
                            resultLine.textContent = 'StreamElements import failed — ' + ((result && (result.error || result.message)) || 'unknown error') + '.';
                        }
                    });
                });
            };
            reader.onerror = function () { resultLine.textContent = 'Could not read that file.'; };
            reader.readAsText(file);
        });
        body.appendChild(seBtn);

        // Reset — the same resetAllPoints() the stock button's handler
        // calls, two-click confirm (the S47 idiom; no window.confirm here).
        var resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'arcade-btn arcade-btn--sm arcade-btn--danger';
        resetBtn.textContent = 'Reset all points';
        resetBtn.addEventListener('click', function () {
            if (resetBtn.dataset.confirm !== '1') {
                resetBtn.dataset.confirm = '1';
                resetBtn.textContent = 'Reset ALL points — sure?';
                return;
            }
            resetBtn.dataset.confirm = '';
            resetBtn.textContent = 'Reset all points';
            deckPointsSystem().then(function (sys) {
                if (!sys) { resultLine.textContent = 'The points system is not reachable yet — try again in a moment.'; return; }
                return sys.resetAllPoints().then(function () {
                    resultLine.textContent = 'All user points have been reset.';
                });
            });
        });
        body.appendChild(resetBtn);

        body.appendChild(resultLine);
    }

    // SE export → SSN backup shape. The merge in points.js treats se*
    // fields as reference-only snapshots (latest export wins), so the
    // converted records carry points:0 — SSN points are never overwritten.
    // userKey matches PointsSystem.getUserKey: `${username}:${type}`.
    function deckConvertSeExport(data, platform) {
        var arr = Array.isArray(data) ? data : (data && Array.isArray(data.users) ? data.users : null);
        if (!arr) return null;
        var users = [];
        arr.forEach(function (u) {
            if (!u || !u.username) return;
            var username = String(u.username);
            var rec = {
                username: username,
                userKey: username + ':' + platform,
                type: platform,
                points: 0,
                pointsSpent: 0
            };
            if (u.points !== undefined && u.points !== null && isFinite(Number(u.points))) rec.sePoints = Number(u.points);
            if (u.pointsAlltime !== undefined && u.pointsAlltime !== null && isFinite(Number(u.pointsAlltime))) rec.sePointsAlltime = Number(u.pointsAlltime);
            var minutes = (u.minutes !== undefined && u.minutes !== null) ? u.minutes : u.watchtimeMinutes;
            if (minutes !== undefined && minutes !== null && isFinite(Number(minutes))) rec.seWatchtimeMinutes = Number(minutes);
            users.push(rec);
        });
        return {
            version: 1,
            exported: Date.now(),
            exportedDate: new Date().toISOString(),
            userCount: users.length,
            users: users
        };
    }

    function renderDeckPointsLeaderboard(stage) {
        var body = deckPointsCard(stage, 'Leaderboard & analytics');
        var line = document.createElement('p');
        line.className = 'arcade-evt-blurb';
        line.textContent = 'The community sees their climb on the leaderboard overlay; you see the shape of it on Main’s analytics rail (top earners today).';
        body.appendChild(line);
        var doors = document.createElement('div');
        doors.className = 'arcade-evt-doors';
        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'arcade-btn arcade-btn--sm';
        copyBtn.textContent = 'Copy leaderboard URL';
        copyBtn.addEventListener('click', function () {
            var resolver = window.resolveSocialStreamPage;
            if (typeof resolver !== 'function') { flashButton(copyBtn, 'Unavailable', 2200); return; }
            var params = [];
            if (deckSessionId) params.push('session=' + encodeURIComponent(deckSessionId));
            resolver('leaderboard.html', { extraParams: params }).then(function (resolved) {
                if (!resolved || !resolved.url) throw new Error('no url');
                return copyToClipboard(resolved.url).then(function () { flashButton(copyBtn, 'Copied ✓'); });
            }).catch(function () { flashButton(copyBtn, 'Copy failed', 2200); });
        });
        doors.appendChild(copyBtn);
        var mainBtn = document.createElement('button');
        mainBtn.type = 'button';
        mainBtn.className = 'arcade-btn arcade-btn--sm';
        mainBtn.textContent = 'Engagement analytics → Main';
        mainBtn.addEventListener('click', function () { navigateArcadeTab('main'); });
        doors.appendChild(mainBtn);
        var gamesBtn = document.createElement('button');
        gamesBtn.type = 'button';
        gamesBtn.className = 'arcade-btn arcade-btn--sm';
        gamesBtn.textContent = 'Games hub';
        gamesBtn.title = 'The Games hub “Points & unlocks” row cross-links right back here — same destination, no duplicate config';
        gamesBtn.addEventListener('click', function () { navigateArcadeTab('games'); });
        doors.appendChild(gamesBtn);
        body.appendChild(doors);
    }

    // --------------------------------------------------------------------
    // Boot
    // --------------------------------------------------------------------
    function init() {
        // TASK-64 delock: the AI tab is a first-class berth for EVERY seat —
        // no signer pre-check, no gate, no 🔒. Unconditionally spliced into
        // TABS (between Style and Deck Settings, its long-standing seat) and
        // CUSTOM_TABS; its panel DOM is built like every other custom tab.
        var settingsIdx = -1;
        TABS.forEach(function (t, i) { if (t.id === 'settings') settingsIdx = i; });
        TABS.splice(settingsIdx === -1 ? TABS.length : settingsIdx, 0, { id: 'ai', label: 'AI' });
        CUSTOM_TABS.ai = true;

        buildTopbar();
        buildRailAndSide();
        buildEditChatChip(); // TASK-67 — the Main chat pane's "Edit chat" door
        buildAddonsPanel();
        buildStylePanel();
        buildAlertsPanel();
        buildGamesPanel(); // S48 — the hub panel exists from boot; contents lazy (ensureGamesPanelLive on first visit)
        buildCommandsPanel(); // S49 — commands + timers; contents lazy (ensureCommandsPanelLive on first visit)
        buildGoalsPanel();    // S49 — goal bars; contents lazy (ensureGoalsPanelLive on first visit)
        buildFramesPanel();   // S50 — Frames & Cameras; contents lazy (ensureFramesPanelLive on first visit)
        buildTipjarPanel();   // S50 — the Tip Jar interior (payment rails); contents lazy (ensureTipjarPanelLive on first visit)
        buildFeaturedPanel(); // TASK-70 (Lane 1) — Featured Chat; contents lazy
        buildMusicPanel();    // TASK-70 (Lane 3) — Now Playing; contents lazy
        buildHypePanel();     // TASK-70 (Lane 3) — Hype Train; contents lazy
        buildMapPanel();      // TASK-70 (Lane 3) — Fren Map; contents lazy
        buildOverlaysPanel(); // TASK-70 (Lane 4) — Overlay templates gallery; contents lazy
        buildDeckSettingsPanel(); // S51 — Deck Settings; contents lazy (ensureDeckSettingsLive on first visit)
        buildAiPanel();           // TASK-64 — the AI console; contents lazy (ensureAiPanelLive on first visit)
        installAddonsCrumbs();    // TASK-68 — the breadcrumb trail at the top of every door interior's left list
        installArcadeColumnToggles(); // TASK-67 — one shared collapse mechanism on every interior's left column
        installStockFrameDressing(); // S32 — dress the stock pages the nav still hosts
        installFoldObservers();    // S46B — measured hamburger fold + add-ons types drawer

        var restored = 'main';
        try { restored = localStorage.getItem('arcadeTab') || 'main'; } catch (e) { /* noop */ }
        // Door tabs (DOOR_PARENT) restore too — a reload while inside a
        // gallery door lands back inside that door, not on Main.
        if (!TABS.some(function (t) { return t.id === restored; }) && !DOOR_PARENT[restored]) restored = 'main';

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
