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
    // Element registry — the ONE source of truth for selectable overlay
    // ELEMENTS (music / tip jar / hype / map). Adding an element is one entry
    // here (plus its overlay page, when built). See pacsarcade design-briefs/
    // ssn-ui-overhaul/element-registry-spec.md. status 'ready' = the overlay
    // page ships and the card is live (Copy overlay URL); 'planned' = an
    // honest SOON stub with no actions. Music and Hype Train ship ready
    // (watchtime-loyalty-elements-spec.md item 3 — hype.html is stock SSN,
    // verified as a standalone session overlay, no new page built). Fren Map
    // stays planned — no geo data source exists.
    // --------------------------------------------------------------------
    var ELEMENTS = [
        {
            id: 'music', name: 'Now Playing', category: 'music', status: 'ready',
            overlayPage: 'music-widget.html',
            params: ['layout=horizontal'],
            blurb: 'Spotify now-playing overlay — transparent, Tuna-grade.'
        },
        {
            id: 'tipjar', name: 'Tip Jar', category: 'tips', status: 'planned',
            blurb: 'Lightning / zap tip jar with a configurable goal.'
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

        var bft = document.createElement('span');
        bft.className = 'arcade-bft';
        bft.innerHTML =
            '<span class="date">----.--.--</span><span class="ab">a₿</span>' +
            '<span class="time">--:--</span>' +
            '<span class="height"><span class="arcade-starbox">★</span><span class="h">---,---</span></span>';
        header.appendChild(bft);

        document.body.appendChild(header);
        startBftClock(bft);
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
    // BFT clock chip — honest dash-faces until a REAL beacon answers, ~
    // only on a genuine estimate (fleet law). Two live sources tried in
    // order every tick: the arcade's own beacon (time.pacsarcade.org, a
    // shim over the fleet's bitcoind) first, mempool.space as fallback.
    // The synthetic local estimate is a LAST resort — only when both
    // network reads fail — and always wears the ~ when used. Dash-faces
    // (set in the topbar markup) are never overwritten with an estimate
    // before the first real network answer lands.
    // --------------------------------------------------------------------
    function startBftClock(bftEl) {
        var BPD = 144, BPM = 4032, BPY = 52416;
        var ANCHOR = { ms: Date.UTC(2026, 7, 17, 14, 33), height: 962901 };

        function pad(n, w) { return String(n).padStart(w, '0'); }

        function render(h, est) {
            var rem = ((h % BPY) + BPY) % BPY;
            var y = Math.floor(h / BPY);
            var m = Math.floor(rem / BPM) + 1;
            var d = Math.floor((rem % BPM) / BPD) + 1;
            var bid = ((h % BPD) + BPD) % BPD;
            var t = pad(Math.floor(bid / 6), 2) + ':' + pad((bid % 6) * 10, 2);
            var date = pad(y, 4) + '.' + pad(m, 2) + '.' + pad(d, 2);
            var tilde = est ? '~' : '';
            var dEl = bftEl.querySelector('.date'), tEl = bftEl.querySelector('.time'), hEl = bftEl.querySelector('.h');
            if (dEl) dEl.textContent = tilde + date;
            if (tEl) tEl.textContent = tilde + t;
            if (hEl) hEl.textContent = tilde + h.toLocaleString('en-US');
        }

        function estimate() {
            return Math.max(0, Math.round(ANCHOR.height + (Date.now() - ANCHOR.ms) / 600000));
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

        function tick() {
            fetchArcadeBeacon()
                .then(function (h) { render(h, false); })
                .catch(function () {
                    fetchMempoolFallback()
                        .then(function (h) { render(h, false); })
                        .catch(function () { render(estimate(), true); });
                });
        }

        // No synchronous render here — the chip keeps its markup dash-faces
        // (----.--.--  --:--  ---,---) until this first tick actually
        // resolves, honest-time law's "dash-face on first paint".
        tick();
        setInterval(tick, 60000);
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
    var CUSTOM_TABS = { elements: true };
    var bootGraceUntil = 0; // set on init(); see installBootGuard() below

    function clickStockNav(pageId) {
        var link = document.querySelector('#main-navigation a[data-page="' + pageId + '"]');
        if (link) link.click();
    }

    function navigateArcadeTab(tabId) {
        if (CUSTOM_TABS[tabId]) {
            // Custom in-shell panel (e.g. Elements): no stock page to drive —
            // remember the tab we're leaving and flip the tab state; CSS
            // reveals the panel and covers #content-pane. No clickStockNav.
            savePopupScroll(document.body.dataset.arcadeTab);
            setArcadeTab(tabId);
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
            '<div class="arcade-period-row">' +
            '<span class="arcade-k">PERIOD</span>' +
            '<div class="arcade-seg" role="group" aria-label="Analytics period" id="arcade-period-seg">' +
            '<button type="button" class="is-on" data-arcade-period="today" aria-pressed="true">Today</button>' +
            '<button type="button" data-arcade-period="7d" aria-pressed="false">7d</button>' +
            '<button type="button" data-arcade-period="30d" aria-pressed="false">30d</button>' +
            '</div></div>' +
            '<div class="arcade-statgrid">' +
            '<div class="arcade-stat"><span class="arcade-stat__label">HOURS WATCHED</span>' +
            '<span class="arcade-stat__value is-dash" id="arcade-stat-watch-value">—</span><span class="arcade-stat__sub" id="arcade-stat-watch-sub">connecting…</span></div>' +
            '<div class="arcade-stat"><span class="arcade-stat__label">PEAK VIEWERS</span>' +
            '<span class="arcade-stat__value is-dash" id="arcade-stat-peak-value">—</span><span class="arcade-stat__sub" id="arcade-stat-live-sub">now — · 0 live</span></div>' +
            '<div class="arcade-stat"><span class="arcade-stat__label">FIRST-TIME CHATTERS</span>' +
            '<span class="arcade-stat__value is-dash" id="arcade-stat-firsttime-value">—</span><span class="arcade-stat__sub" id="arcade-stat-firsttime-sub">connecting…</span></div>' +
            '<div class="arcade-stat"><span class="arcade-stat__label">RAIDS RECEIVED</span>' +
            '<span class="arcade-stat__value is-dash" id="arcade-stat-raids-value">—</span><span class="arcade-stat__sub" id="arcade-stat-raids-sub">last: —</span></div>' +
            '</div>' +
            '<div class="arcade-field"><label>FOLLOWER DELTA</label><span class="arcade-field__hint">Δ since this session started — no historical archive yet</span></div>' +
            '<ul class="arcade-frow-list" id="arcade-follower-rows"></ul>' +
            '<div class="arcade-field"><label>RECENT NOTIFICATIONS</label><span class="arcade-field__hint">latest from chat history, any period</span></div>' +
            '<div id="arcade-notifications"><div class="arcade-nrow-empty" id="arcade-nrow-empty">Waiting on the background bridge — raids, follows, and ' +
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
            empty.className = 'arcade-src-empty';
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
                '<span class="arcade-frow__total">—</span>' +
                '<span class="arcade-frow__delta">—</span>';
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

    function renderWatchTime() {
        var valEl = document.getElementById('arcade-stat-watch-value');
        var subEl = document.getElementById('arcade-stat-watch-sub');
        if (!valEl) return;
        if (!arcadeAnalytics.watchReady) return; // honest dash / "connecting…" until first sample
        valEl.textContent = formatViewerHours(arcadeAnalytics.watchViewerMs / 3600000);
        valEl.classList.remove('is-dash');
        if (subEl) subEl.textContent = 'since boot · est';
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
            firstValueEl.textContent = '—';
            firstValueEl.classList.add('is-dash');
            firstSubEl.textContent = 'chat-history store is off';
        } else if (!firsttimersOn) {
            firstValueEl.textContent = '—';
            firstValueEl.classList.add('is-dash');
            firstSubEl.textContent = 'first-timers setting is off';
        } else {
            var firstCount = 0;
            for (var i = 0; i < messages.length; i++) {
                if (messages[i].firsttime === true && messages[i].timestamp >= cutoff) firstCount++;
            }
            firstValueEl.textContent = String(firstCount);
            firstValueEl.classList.remove('is-dash');
            firstSubEl.textContent = periodLabel + ' · from chat history';
        }

        var raids = [];
        if (dbOn) {
            for (var j = 0; j < messages.length; j++) {
                if (messages[j].event === 'raid' && messages[j].timestamp >= cutoff) raids.push(messages[j]);
            }
        }
        raidsValueEl.textContent = dbOn ? String(raids.length) : '—';
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
            peakEl.textContent = String(arcadeAnalytics.peakViewers);
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
                totalEl.textContent = '—';
                deltaEl.textContent = '—';
                return;
            }
            var total = arcadeAnalytics.followerCounts[target];
            var baseline = arcadeAnalytics.followerBaseline[target];
            var delta = (typeof baseline === 'number') ? (total - baseline) : 0;
            totalEl.textContent = String(total);
            deltaEl.textContent = (delta > 0 ? '+' : '') + String(delta);
            deltaEl.classList.toggle('arcade-frow__delta--up', delta > 0);
            deltaEl.classList.toggle('arcade-frow__delta--down', delta < 0);
        });
    }

    function pollArcadeAnalytics() {
        var bg = getBackgroundWindow();
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
            empty.className = 'arcade-src-empty';
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
    // Boot
    // --------------------------------------------------------------------
    function init() {
        buildTopbar();
        buildRailAndSide();
        buildElementsPanel();

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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
