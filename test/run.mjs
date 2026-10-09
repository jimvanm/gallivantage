// Runs every test in this folder:   node test/run.mjs
// Add a name to run only matching tests:   node test/run.mjs earth
// Files starting with _ are shared helpers, not tests. Each test runs in its
// own Node process, so what one fakes on the global object cannot leak.

import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv[2] || '';
const files = readdirSync(here)
  .filter((f) => f.endsWith('.mjs') && f !== 'run.mjs' && !f.startsWith('_') && f.includes(only))
  .sort();

const run = (file) => new Promise((resolve) => {
  const child = spawn(process.execPath, [join(here, file)], { cwd: dirname(here) });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const timer = setTimeout(() => { out += '\n(timed out)'; child.kill(); }, 60000);
  child.on('close', (code) => { clearTimeout(timer); resolve({ file, ok: code === 0, out }); });
});

let failed = 0;
for (const f of files) {
  const r = await run(f);
  console.log((r.ok ? 'pass  ' : 'FAIL  ') + f);
  if (!r.ok) { failed++; console.log(r.out.replace(/^/gm, '      ')); }
}
console.log(`\n${files.length - failed} of ${files.length} passed`);
process.exit(failed ? 1 : 0);
