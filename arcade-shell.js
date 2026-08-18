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
        { id: 'vdo', label: 'VDO' },
        { id: 'eventflow', label: 'Event Flow' },
        { id: 'settings', label: 'Settings' }
    ];

    var MORE_ITEMS = [
        { page: 'dashboard', label: 'Status and Logs' },
        { page: 'streamdeck', label: 'Stream Deck Setup' },
        { page: 'sessions', label: 'Sessions' }
    ];

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
    var bootGraceUntil = 0; // set on init(); see installBootGuard() below

    function clickStockNav(pageId) {
        var link = document.querySelector('#main-navigation a[data-page="' + pageId + '"]');
        if (link) link.click();
    }

    function navigateArcadeTab(tabId) {
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
        side.setAttribute('aria-label', 'Analytics and games (coming soon)');
        side.innerHTML =
            '<div class="arcade-panel-head"><span class="arcade-panel-title">DOCK</span></div>' +
            '<div class="arcade-panel-body">' +
            '<div class="arcade-coming"><b>COMING</b>analytics · games preview</div>' +
            '</div>';
        document.body.appendChild(side);
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
        navigateArcadeTab(restored);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
