#!/usr/bin/env node
/**
 * Clean dev start.
 *
 * `Ctrl+C` on `nest start --watch` kills the watcher but frequently leaves the
 * compiled child (`node dist/main`) running. The orphan keeps listening on the
 * API port and — worse — keeps its Prisma connection pool open against the
 * Supabase pooler. Stack a few across restarts and the pooler starts refusing
 * connections (`EMAXCONNSESSION`), which surfaces as intermittent 500s.
 * Freeing the port kills the orphan before it can accumulate.
 *
 * Usage: pnpm start:dev:clean   (PORT=4001 pnpm start:dev:clean to target another port)
 */

import { execFileSync, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 4000);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** PIDs listening on `port`, or [] when nothing holds it. */
function pidsOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue |` +
            ` Select-Object -ExpandProperty OwningProcess`,
        ],
        { encoding: 'utf8' },
      );
      return [...new Set(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map(Number))];
    }
    const out = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' });
    return [...new Set(out.split('\n').map((s) => s.trim()).filter(Boolean).map(Number))];
  } catch {
    return [];
  }
}

const stale = pidsOnPort(PORT).filter((pid) => pid !== process.pid);
for (const pid of stale) {
  try {
    process.kill(pid, 'SIGKILL');
    console.log(`  freed port ${PORT} — killed orphaned backend ${pid}`);
  } catch (err) {
    console.warn(`  could not kill ${pid}: ${err.message}`);
  }
}
if (stale.length === 0) console.log(`  port ${PORT} already free`);

console.log(`\n→ starting nest start --watch on :${PORT}\n`);
// Run the Nest CLI's JS entrypoint under the current node binary. Spawning the
// `.cmd` shim instead fails with EINVAL on Node 20.12+/22+ on Windows.
const child = spawn(
  process.execPath,
  [join(ROOT, 'node_modules/@nestjs/cli/bin/nest.js'), 'start', '--watch'],
  { stdio: 'inherit', cwd: ROOT },
);
child.on('exit', (code) => process.exit(code ?? 0));
