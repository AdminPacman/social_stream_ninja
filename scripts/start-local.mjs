#!/usr/bin/env node
// TASK-66 — the "just run it" launcher (H22: arcade is the default shell).
// Spawns Electron against the bundled fallback content with zero env vars
// required. Flags:
//   --stock          run Steve's original UI, byte-for-byte (sets SSN_SHELL=stock)
//   --channel <dir>  bundle channel under resources/social_stream_fallback/ (default: main)
// Anything after `--` passes straight through to Electron.
// No dependencies; Node >= 18.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);

let channel = 'main';
const electronArgs = [];
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--stock') {
        process.env.SSN_SHELL = 'stock'; // the explicit opt-out; unset = arcade default
    } else if (a === '--channel' && args[i + 1]) {
        channel = args[++i];
    } else {
        electronArgs.push(a);
    }
}

const bundle = join(root, 'resources', 'social_stream_fallback', channel);
if (!existsSync(bundle)) {
    console.error(`start-local: bundle channel '${channel}' not found at ${bundle}`);
    process.exit(1);
}

const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
const child = spawn(
    bin,
    ['.', '--running-from-source', '--filesource', bundle, ...electronArgs],
    { cwd: root, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' }
);
child.on('exit', (code) => process.exit(code ?? 0));
