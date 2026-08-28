const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_URL = process.env.SSN_SOCIALSTREAM_REPO || 'https://github.com/steveseguin/social_stream.git';
const BRANCH = process.env.SSN_SOCIALSTREAM_BRANCH || 'main';
const INCLUDE_TTS = /^true$/i.test(process.env.SSN_INCLUDE_TTS || '');
// TASK-71 (item 1/2) — --stamp-only: no clone, no wipe. Re-stamps
// build-info.json for the CURRENT bundle and prints the drift report.
// The everyday hygiene lane; the full refresh remains the default.
const STAMP_ONLY = process.argv.includes('--stamp-only');
const EXTRA_PATTERNS = (process.env.SSN_FALLBACK_EXTRA || '')
    .split(/[,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);

const BASE_PATTERNS = [
    '/*.html',
    '/*.js',
    '/*.json',
    '/*.ico',
    '/*.png',
    '/*.svg',
    '/*.css',
    '/*.md',
    '/*.txt',
    '/actions/**',
    '/audio/**',
    '/games/**',
    '/icons/**',
    '/js/**',
    '/libs/**',
    '/media/**',
    '/docs/**',
    '/providers/**',
    '/settings/**',
    '/shared/**',
    '/sources/**',
    '/translations/**',
    '/thirdparty/**',
    '/thirdparty/webmidi3.js',
    '/thirdparty/sentiment.js',
    '/thirdparty/lunr.js',
    '/thirdparty/xlsx.full.min.js',
    '/thirdparty/d3.min.js',
    '/thirdparty/obs-websocket.min.js',
    '/thirdparty/StreamSaver.js',
    '/thirdparty/vdoninja-sdk.js',
    '/thirdparty/pubnub.min.js',
    '/thirdparty/animate.css',
    '/thirdparty/buttons.js',
    '/thirdparty/index.umd.min.js',
    '/thirdparty/marked.umd.min.js',
    '/thirdparty/mitm.html'
];

const TTS_PATTERNS = [
    '/thirdparty/espeak-ng-real.js',
    '/thirdparty/espeakng-simple.js',
    '/thirdparty/espeakng.worker.js',
    '/thirdparty/espeakng.worker.data',
    '/thirdparty/group*',
    '/thirdparty/kitten-tts/**',
    '/thirdparty/kitten_tts_nano_v0_1.onnx',
    '/thirdparty/kokoro-bundle.es.js',
    '/thirdparty/kokoro-bundle.es.ext.js',
    '/thirdparty/kokoro-ort-wasm.wasm',
    '/thirdparty/kokoro-ort-wasm-simd.wasm',
    '/thirdparty/kokoro-ort-wasm-simd-threaded.jsep.wasm',
    '/thirdparty/onnxruntime-web.js',
    '/thirdparty/ort.min.js',
    '/thirdparty/ort-wasm.wasm',
    '/thirdparty/ort-wasm-simd.wasm',
    '/thirdparty/ort-wasm-simd-threaded.jsep.mjs',
    '/thirdparty/ort-wasm-simd-threaded.jsep.wasm',
    '/thirdparty/piper/**',
    '/thirdparty/tf.min.js'
];

function runGit(args) {
    execFileSync('git', args, { stdio: 'inherit' });
}

function normalizePatterns(basePatterns, extraPatterns) {
    const normalized = [...basePatterns];
    for (const pattern of extraPatterns) {
        if (!pattern) continue;
        normalized.push(pattern.startsWith('/') ? pattern : `/${pattern}`);
    }
    return normalized;
}

// --------------------------------------------------------------------
// TASK-71 — housekeeping machinery (items 1/2/3).
// --------------------------------------------------------------------

// Item 3 — CRLF retirement, the permanent fence: the overrides copy
// normalizes text files to LF as they land, so a CRLF master can never
// again dirty the worktree with EOL-only "modified" noise (the retired
// 7-themes ritual). Binary extensions pass through byte-for-byte.
const TEXT_EXTENSIONS = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.md', '.txt', '.svg', '.xml', '.yml', '.yaml', '.sh', '.csv', '.map']);

function copyOverridesNormalized(overridesDir, targetRoot) {
    const applied = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const src = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(src); continue; }
            if (!entry.isFile()) continue;
            const rel = path.relative(overridesDir, src);
            const dest = path.join(targetRoot, rel);
            fs.ensureDirSync(path.dirname(dest));
            if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
                const text = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                fs.writeFileSync(dest, text);
            } else {
                fs.copyFileSync(src, dest);
            }
            applied.push(rel);
        }
    };
    walk(overridesDir);
    return applied;
}

// Item 1 — the build stamp. BFT date is pure integer block math (the
// bitcoin-federated-time calendar: 144 blocks/day, 28-day months, 13-month
// years from genesis), ported 1:1 so the script stays plain node.
function bftDateFromHeight(height) {
    const h = Number(height);
    if (!Number.isFinite(h) || h < 0) return null;
    const BLOCKS_PER_DAY = 144, DAYS_PER_MONTH = 28, DAYS_PER_YEAR = 364;
    const dayOfEpoch = Math.floor(h / BLOCKS_PER_DAY);
    const year = Math.floor(dayOfEpoch / DAYS_PER_YEAR);
    const dayOfYear = dayOfEpoch % DAYS_PER_YEAR;
    const month = Math.floor(dayOfYear / DAYS_PER_MONTH) + 1;
    const day = (dayOfYear % DAYS_PER_MONTH) + 1;
    const pad = (n, w) => String(n).padStart(w, '0');
    return `${pad(year, 4)}.${pad(month, 2)}.${pad(day, 2)} a₿`;
}

async function fetchTipHeight() {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch('https://mempool.space/api/blocks/tip/height', { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return null;
        const height = parseInt(await res.text(), 10);
        return Number.isFinite(height) ? height : null;
    } catch (_) {
        return null; // offline / API down — the stamp degrades, never blocks a refresh
    }
}

function gitOut(args, cwd) {
    return execFileSync('git', args, { cwd: cwd || path.join(__dirname, '..'), encoding: 'utf8' }).trim();
}

const BUILD_INFO_NAME = 'build-info.json';

// Writes resources/social_stream_fallback/<branch>/build-info.json — the
// stamp the arcade shell's Diagnostics → Build row reads. forkCommit is
// the app repo's HEAD at stamp time (the Admiral matches it against the
// GitHub commit list at a glance); trackedFiles maps every TRACKED bundle
// file (git ls-tree HEAD blob ids) so the shell can prove the live bundle
// on disk still matches the tracked bundle — drift names the files.
async function writeBuildInfo(fallbackRoot, cloneDir) {
    const relBase = path.join('resources', 'social_stream_fallback', BRANCH);
    let tracked = {};
    try {
        const tree = gitOut(['ls-tree', '-r', '--format=%(objectname) %(path)', 'HEAD', '--', relBase]);
        for (const line of tree.split('\n')) {
            if (!line) continue;
            const sp = line.indexOf(' ');
            const blob = line.slice(0, sp);
            const full = line.slice(sp + 1);
            if (full === relBase + '/' + BUILD_INFO_NAME) continue; // never self-reference
            tracked[path.relative(relBase, full)] = blob;
        }
    } catch (error) {
        console.warn('[fallback] Could not enumerate tracked bundle files:', error && error.message ? error.message : error);
    }
    let prior = {};
    try { prior = JSON.parse(fs.readFileSync(path.join(fallbackRoot, BUILD_INFO_NAME), 'utf8')); } catch (_) { prior = {}; }
    const height = await fetchTipHeight();
    const info = {
        schema: 'ssn-build-info/1',
        forkCommit: gitOut(['rev-parse', '--short', 'HEAD']),
        forkCommitFull: gitOut(['rev-parse', 'HEAD']),
        forkBranch: gitOut(['rev-parse', '--abbrev-ref', 'HEAD']),
        upstreamRepo: REPO_URL,
        upstreamBranch: BRANCH,
        // A full refresh knows the clone's exact commit; --stamp-only
        // carries the prior stamp's value forward (it stamped THAT bundle).
        upstreamCommit: cloneDir ? gitOut(['rev-parse', '--short', 'HEAD'], cloneDir) : (prior.upstreamCommit || null),
        upstreamCommitFull: cloneDir ? gitOut(['rev-parse', 'HEAD'], cloneDir) : (prior.upstreamCommitFull || null),
        stampMode: cloneDir ? 'refresh' : 'stamp-only',
        refreshedAt: new Date().toISOString(),
        bftHeight: height,
        bftDate: bftDateFromHeight(height),
        trackedFiles: tracked
    };
    const infoPath = path.join(fallbackRoot, BUILD_INFO_NAME);
    fs.writeFileSync(infoPath, JSON.stringify(info, null, 2) + '\n');
    console.log(`[fallback] Build stamp written: ${info.forkCommit} · ${info.bftDate || 'BFT —'}${info.bftHeight ? ' (block ' + info.bftHeight + ')' : ''} · ${Object.keys(tracked).length} tracked bundle file(s) fingerprinted`);
    return info;
}

// Item 2 — the drift report: every mirror-mastered file cmp'd live-bundle
// vs the overrides master. Prints OK or names the drifted/missing files.
// Byte-exact (the mirror law is byte-identity); text files were LF-
// normalized on the way IN, so a CRLF master reads as drift until the
// master itself is normalized — by design, that's the retirement fence.
function driftReport(overridesDir, fallbackRoot) {
    const drifted = [];
    let checked = 0;
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const src = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(src); continue; }
            if (!entry.isFile()) continue;
            const rel = path.relative(overridesDir, src);
            // overrides/main/x lands at social_stream_fallback/main/x —
            // fallbackRoot IS the <branch> dir, so the live twin of rel is
            // one level up from it.
            const live = path.join(path.dirname(fallbackRoot), rel);
            checked++;
            if (!fs.existsSync(live)) { drifted.push(rel + ' (missing in bundle)'); continue; }
            const a = fs.readFileSync(src);
            const b = fs.readFileSync(live);
            if (!a.equals(b)) drifted.push(rel);
        }
    };
    walk(overridesDir);
    if (drifted.length === 0) {
        console.log(`[fallback] Drift check: OK — ${checked} mirror-mastered file(s), live bundle matches master.`);
    } else {
        console.warn(`[fallback] Drift check: ${drifted.length} of ${checked} mirror-mastered file(s) DRIFTED (live bundle != master):`);
        for (const name of drifted) console.warn(`  - ${name}`);
    }
    return drifted;
}

async function updateFallback() {
    const fallbackRoot = path.join(__dirname, '..', 'resources', 'social_stream_fallback', BRANCH);
    const overridesDir = process.env.SSN_LOCAL_OVERRIDES
        || path.join(os.homedir(), 'dev', 'pacsarcade', 'ssn-custom');

    // TASK-71 — --stamp-only: the hygiene lane. No clone, no wipe — re-stamp
    // the CURRENT bundle (build-info.json) and print the drift report.
    if (STAMP_ONLY) {
        console.log(`[fallback] Stamp-only run against ${fallbackRoot}`);
        if (!fs.existsSync(fallbackRoot)) {
            console.error('[fallback] No bundle to stamp. Run a full refresh first.');
            process.exit(1);
        }
        await writeBuildInfo(fallbackRoot, null);
        if (fs.existsSync(overridesDir)) {
            const drifted = driftReport(overridesDir, fallbackRoot);
            if (drifted.length) process.exitCode = 2; // drift is reported AND signalled
        } else {
            console.log('[fallback] No local overrides dir — drift check skipped.');
        }
        return;
    }

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ssn-socialstream-'));
    const cloneDir = path.join(tmpRoot, 'social_stream');

    const sparsePatterns = normalizePatterns(BASE_PATTERNS, EXTRA_PATTERNS);
    if (!sparsePatterns.length) {
        console.error('[fallback] No sparse-checkout patterns defined. Aborting.');
        process.exit(1);
    }
    if (INCLUDE_TTS) {
        sparsePatterns.push(...TTS_PATTERNS);
    }

    try {
        console.log(`[fallback] Cloning ${REPO_URL}#${BRANCH} with sparse checkout ...`);
        runGit(['clone', '--filter=blob:none', '--sparse', '--branch', BRANCH, REPO_URL, cloneDir]);

        console.log('[fallback] Configuring sparse-checkout allowlist...');
        runGit(['-C', cloneDir, 'sparse-checkout', 'init', '--no-cone']);
        runGit(['-C', cloneDir, 'sparse-checkout', 'set', ...sparsePatterns]);

        console.log('[fallback] Included patterns:');
        for (const pattern of sparsePatterns) {
            console.log(`  - ${pattern}`);
        }

        if (INCLUDE_TTS) {
            console.log('[fallback] TTS assets included (SSN_INCLUDE_TTS=true).');
        } else {
            console.log('[fallback] Skipping large TTS assets. Set SSN_INCLUDE_TTS=true to bundle them.');
        }
        if (EXTRA_PATTERNS.length) {
            console.log(`[fallback] Extra patterns requested: ${EXTRA_PATTERNS.join(', ')}`);
        }

        console.log(`[fallback] Updating bundle at ${fallbackRoot}`);
        fs.removeSync(fallbackRoot);
        fs.ensureDirSync(fallbackRoot);
        fs.copySync(cloneDir, fallbackRoot, {
            dereference: true,
            filter: (src) => {
                const rel = path.relative(cloneDir, src);
                if (!rel || rel === '') return true;
                return !rel.split(path.sep).includes('.git');
            }
        });
        console.log('[fallback] Bundle update complete.');

        // Re-apply local customizations after the refresh wipes the bundle.
        // Mirrors the bundle layout: <overrides>/main/... -> social_stream_fallback/main/...
        // TASK-71 (item 3) — text files are LF-normalized on the way in
        // (copyOverridesNormalized): a CRLF master can no longer dirty the
        // worktree with EOL-only noise (.gitattributes rules eol=lf).
        if (fs.existsSync(overridesDir)) {
            console.log(`[fallback] Applying local overrides from ${overridesDir}`);
            const applied = copyOverridesNormalized(overridesDir, path.join(__dirname, '..', 'resources', 'social_stream_fallback'));
            console.log(`[fallback] Local overrides applied (${applied.length} file(s), LF-normalized).`);
        }

        // TASK-71 (items 1+2) — stamp the build, then prove the mirror:
        // build-info.json (fork commit + BFT date + tracked-file
        // fingerprints) is what the shell's Diagnostics → Build row reads;
        // the drift report cmp's every mirror-mastered file live vs master.
        await writeBuildInfo(fallbackRoot, cloneDir);
        if (fs.existsSync(overridesDir)) {
            const drifted = driftReport(overridesDir, fallbackRoot);
            if (drifted.length) process.exitCode = 2;
        }
    } catch (error) {
        console.error('[fallback] Failed to update Social Stream fallback bundle:', error && error.message ? error.message : error);
        process.exit(1);
    } finally {
        try {
            fs.removeSync(tmpRoot);
        } catch (cleanupError) {
            console.warn('[fallback] Failed to clean temporary directory:', cleanupError && cleanupError.message ? cleanupError.message : cleanupError);
        }
    }
}

updateFallback();
