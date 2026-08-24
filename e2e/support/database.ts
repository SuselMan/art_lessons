import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { DATABASE_URL, DB_CONTAINER, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER } from './stack'

/** Walks up from the working directory to the workspace root.
 *
 *  Deliberately not `import.meta.url`, which is the obvious way to write this
 *  and breaks half of the callers: Playwright loads `globalTeardown` as
 *  CommonJS, where `import.meta` does not exist, while serveApi.ts runs under
 *  tsx as a real module. One module is imported from both, so it has to be
 *  written in the dialect they share. */
function findRepoRoot(): string {
  let dir = process.cwd()
  for (;;) {
    if (existsSync(resolve(dir, 'playwright.config.ts'))) return dir
    const parent = dirname(dir)
    if (parent === dir) throw new Error('e2e: could not find the workspace root from ' + process.cwd())
    dir = parent
  }
}

export const repoRoot = findRepoRoot()

/** Where a package really is, from the workspace that depends on it.
 *
 *  Needed because these are npm workspaces: `tsx` is hoisted to the root
 *  `node_modules` while `prisma` sits in `apps/server/node_modules`, and which
 *  of the two happens is an npm decision that can change with an unrelated
 *  dependency bump. Hardcoding either path is a harness that breaks on
 *  somebody else's install.
 *
 *  We resolve to files and run them with this same node rather than calling
 *  the `.bin` entries, because on Windows those are `.cmd` shims and Node 20
 *  refuses to launch one without a shell (CVE-2024-27980): the bare name is
 *  ENOENT, the `.cmd` name is EINVAL. Going at the file sidesteps the shim,
 *  the shell, and the argument quoting that would come with it. */
export function packageFile(anchorDir: string, pkg: string, relative: string): string {
  const req = createRequire(resolve(repoRoot, anchorDir, 'package.json'))
  return resolve(dirname(req.resolve(`${pkg}/package.json`)), relative)
}

function run(file: string, args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync(file, args, {
    encoding: 'utf8',
    cwd: repoRoot,
    env: env ? { ...process.env, ...env } : process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/** (#491) Fails before anything is started, with the fix in the message.
 *
 *  Deliberately checks rather than bakes. `prebuild` regenerates the paper
 *  textures in about three and a half minutes and empties `public/paper` while
 *  it works — a harness that kicked that off per run would spend most of its
 *  time waiting, and anything racing it would be testing an app whose paper
 *  failed to load, which the room reports as its own kind of failure
 *  (PaperFailedOverlay) and which has nothing to do with the scenario. */
export function requireBakedPaper(): void {
  if (existsSync(resolve(repoRoot, 'apps/web/public/paper/manifest.json'))) return
  throw new Error(
    'e2e: paper textures are not baked, so every room would open on the "paper failed" '
    + 'overlay instead of a canvas.\n'
    + '     Run `npm run bake:paper --workspace=apps/web` once (~3.5 min) and try again.',
  )
}

/** Brings up this run's own Postgres and migrates it.
 *
 *  Recreated, never reused: a container left behind by an interrupted run
 *  still holds that run's rooms, and a test asserting on what a fresh room
 *  contains is exactly the kind that passes for the wrong reason against dirty
 *  state.
 *
 *  `migrate deploy` rather than `db push` — the point of a real database here
 *  is that the schema is the one production runs, arrived at the same way. */
export async function ensureDatabase(log: (msg: string) => void = () => {}): Promise<void> {
  try {
    run('docker', ['version', '--format', '{{.Server.Version}}'])
  } catch {
    throw new Error('e2e: docker is not available, and the harness needs it for a throwaway Postgres.')
  }

  log(`e2e: recreating ${DB_CONTAINER} on port ${DB_PORT}`)
  try { run('docker', ['rm', '-f', DB_CONTAINER]) } catch { /* nothing to remove */ }
  run('docker', [
    'run', '-d', '--name', DB_CONTAINER,
    '-e', `POSTGRES_USER=${DB_USER}`,
    '-e', `POSTGRES_PASSWORD=${DB_PASSWORD}`,
    '-e', `POSTGRES_DB=${DB_NAME}`,
    '-p', `${DB_PORT}:5432`,
    'postgres:16-alpine',
  ])

  const deadline = Date.now() + 60_000
  for (;;) {
    try {
      run('docker', ['exec', DB_CONTAINER, 'pg_isready', '-U', DB_USER])
      break
    } catch {
      if (Date.now() > deadline) throw new Error('e2e: Postgres did not become ready within 60s')
      await new Promise(r => setTimeout(r, 500))
    }
  }

  log('e2e: applying migrations')
  run(process.execPath, [
    packageFile('apps/server', 'prisma', 'build/index.js'),
    'migrate', 'deploy', '--schema', 'apps/server/prisma/schema.prisma',
  ], { DATABASE_URL })
}

export function removeDatabase(): void {
  try {
    execFileSync('docker', ['rm', '-f', DB_CONTAINER], { stdio: 'ignore' })
  } catch {
    // Nothing to remove, or docker went away underneath us. Neither is worth
    // turning a green run red over.
  }
}
