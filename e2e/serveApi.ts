import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

import { ensureDatabase, packageFile, repoRoot, requireBakedPaper } from './support/database'
import { DATABASE_URL, JWT_SECRET, SERVER_PORT } from './support/stack'

/** (#491) The API server, with its database brought up first.
 *
 *  This wrapper exists because of an ordering fact that is easy to get wrong
 *  and expensive to diagnose: **Playwright launches `webServer` before it runs
 *  `globalSetup`.** Putting the database bring-up in globalSetup — the obvious
 *  place, and where it lived first — means the server starts against nothing,
 *  `/api/health` answers 503 for two minutes (it checks the database on
 *  purpose, #178), the webServer wait times out, and globalSetup never runs at
 *  all. The symptom is a health check failing forever while the setup that
 *  would have fixed it sits behind the very wait it is blocking.
 *
 *  So the order is stated where it cannot be reordered: this process owns both
 *  steps, and the server is not spawned until the database is migrated.
 *
 *  Stays in the foreground for the server's whole life — Playwright kills this
 *  process tree when the run ends, and the child goes with it. */
async function main(): Promise<void> {
  requireBakedPaper()
  await ensureDatabase(msg => console.log(msg))

  // tsx's own entry point, run by this node — not `npm run dev`. The reason is
  // load-bearing: `npm run dev` passes `--env-file-if-exists=.env`, and
  // apps/server/.env is where the developer's own DATABASE_URL lives. A
  // harness that inherited it would run its scenarios against the database
  // somebody is working in. Here the environment is only what is set below.
  // (`packageFile` covers the second reason — see its own comment.)
  const child = spawn(
    process.execPath,
    [packageFile('apps/server', 'tsx', 'dist/cli.mjs'), 'src/index.ts'],
    {
      cwd: resolve(repoRoot, 'apps/server'),
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: String(SERVER_PORT),
        DATABASE_URL,
        JWT_SECRET,
      },
    },
  )

  child.on('exit', code => process.exit(code ?? 1))
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
