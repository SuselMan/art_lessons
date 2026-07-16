# Claude Rules for Art Lessons

## Decision-making

- Discuss architecture before implementing non-trivial features.
- Do not add dependencies without a clear reason.
- Do not switch frameworks or major libraries without explicit approval.

## Code style

- Prefer small, focused files and explicit types over clever abstractions.
- Keep CSS in CSS Modules; do not introduce Tailwind or CSS-in-JS.

## Quality gates

- Before finishing a task run `npm run typecheck` and `npm run lint` and fix all issues.

## Cross-device pixel determinism

Anything that must render identically on every participant's device (paper grain, and any future value baked into what other users see on the shared canvas) must not depend on live, per-device GPU floating-point computation for its final value. WebGL/GLSL gives no cross-vendor bit-exactness guarantee: `precision highp float` in a fragment shader is a *request*, not a guarantee (many mobile GPUs silently fall back to `mediump`), and texture bilinear filtering isn't bit-exact across vendors either. This broke silently three separate times during the paper-grain redesign — a live per-GPU bake, a `sin()`-based hash, and a finite-difference normal amplified ~30x by gain all diverged between a desktop and a tablet despite 200+ passing unit tests each time (see the `project_paper_grain_redesign` memory for the full history). None of those failures were visible on a single device — each needed a real side-by-side comparison to catch.

Rules for any code in this category (currently: paper grain; treat anything else explicitly designed to look identical across participants the same way):

- Compute it **once, offline, deterministically** (a Node script, plain JS/TS, no GPU) and ship the result as a static asset every client loads identically — never recompute it live per-device if the result has to match.
- Avoid `sin()`/`cos()`/other transcendental functions in any hash or noise function whose result must be portable — use fract/floor/multiply-based hashes instead (see `paperNoise.ts`'s `hash()` for the pattern).
- Avoid amplifying a finite-difference/derivative by a large gain in a shader when the inputs come from a texture sample — texture-filtering precision differences get amplified right along with the signal.
- A change touching this system is not verified by unit tests alone (MockGL deliberately never rasterizes this kind of GPU-side math) and not verified by testing on one device. Before calling it done, get a real side-by-side comparison across at least two different GPUs/devices (export identical content from both, pixel-diff the files) — ask Ilya to do this if a second device isn't otherwise available.

## Starting the project (frontend + backend, tablet-reachable)

When Ilya asks to "start"/"run"/"spin up" the project (start it, "запусти проект", "заведи проект"), start **both** frontend and backend locally in the background, then give him both URLs so he can open the frontend one from a tablet on the same LAN. Use these exact commands — don't re-derive them each time:

1. LAN IP (once per session):
   `(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -ne 'WellKnown' -and $_.IPAddress -notlike '169.254.*' }).IPAddress`
   Fall back to `ipconfig` and read the IPv4 Address if this returns nothing/multiple.

2. Backend needs Postgres first (see `project_backend_dev_setup` memory):
   `docker start art_lessons_pg`
   then from repo root, in the background: `npm run dev:server` — Fastify listens on `0.0.0.0:4000`.

3. Frontend, from repo root, in the background: `npm run dev` — Vite already runs with `--host` + HTTPS (mkcert) on port 5173 (see `apps/web/vite.config.ts`).

4. Report both links to Ilya:
   - Frontend (open this on the tablet): `https://<LAN-IP>:5173`
   - Backend (direct, debugging only — the frontend proxies `/api` and `/socket.io` to it for actual app use): `http://<LAN-IP>:4000`

5. If the tablet shows a cert warning, its mkcert root CA isn't trusted yet — that's a one-time manual step on the tablet, not a bug to fix.

Follow "Dev server hygiene" below for backgrounding/killing these two processes.

## Dev server hygiene

- Before starting `npm run dev` in the background, check whether something is already listening on the port you're about to use (`Get-NetTCPConnection -State Listen`) — don't blindly stack a new instance on top of a stray one.
- Track the PID of any dev server you start in the background for the current task.
- Kill it explicitly (`taskkill //PID <pid> //F` or equivalent) once you're done testing with it — don't leave it running "just in case." A background `npm run dev` that outlives its task is the default failure mode to watch for here, since ports pile up across sessions/agents and the next session then binds to a different port and gets confused about which one is live.
- If you start a dev server for one worktree/branch, kill it before switching to test a different branch's dev server — don't let two instances of the same app fight over similar ports.

## Git workflow

- Do not commit unless explicitly asked; stage and report status instead.
- Exception: on `dev` and on isolated agent worktree branches (see "Multi-agent parallel workflow" below), atomic commits are pre-approved. This does not apply to `master`/`main` — commits and merges there always require explicit confirmation from Ilya.
- Commit message subject lines start with the GitHub issue they belong to, e.g. `#86: add full pencil grade range`. If a commit isn't tied to a tracked issue (ad-hoc fix, chore, infra tweak), just write a normal message — do not invent or attach a fake issue number to satisfy the format.

## Branch model: master / dev / agents

- `master` — stable, Ilya-controlled. The manager never commits or merges here without explicit per-merge approval.
- `dev` — the manager's own integration branch. The manager leads day-to-day work here: merging in finished, QA'd agent branches, making small manager-only changes (e.g. `packages/shared` contract updates), and generally living here between master syncs. Commits on `dev` are pre-approved, same as agent branches.
- `agents/<issue-number>-<slug>` — one per task, worktree-isolated (see below). Once a branch's QA pass is clean, the manager merges it into `dev`, not directly into `master`.
- Periodically, when Ilya says so, the manager merges `dev` into `master`. This is the only path anything reaches `master`. This is the current flow for the project and may evolve.

## Multi-agent parallel workflow

We parallelize work across isolated Claude Code sessions ("agents"), coordinated by the main session ("manager"). Agents do not talk to each other directly — all coordination goes through the manager.

- The manager assigns tasks from GitHub Issues, one task per agent session.
- Each task runs in its own git worktree on a dedicated branch: `agents/<issue-number>-<slug>`, branched from `dev` (not `master`).
- One agent session = one `area:*` label (e.g. `area:ui` → frontend agent, `area:server` → backend agent). Don't mix areas in one agent session.
- Changes to `packages/shared` (the contract between frontend and backend) are made by the manager only, on `dev`, *before* dependent frontend/backend tasks are handed out. Agents never edit `packages/shared` themselves.
- An agent must stop and report to the manager if a task requires touching files outside its declared area, instead of proceeding.
- Agents commit atomically after each logical step, with a clear commit message — not only once at the end. This makes interrupted work resumable (see below).
- If an agent session is interrupted (rate limit, crash, closed terminal), work is not restarted from scratch: a new session on the same branch reads the issue plus `git log`/`git diff` since the last commit and continues from there.
- Before merging an agent branch into `dev`, the manager runs `npm run typecheck` and `npm run lint` on that branch and fixes what it can, plus the QA pass described below.
- Merging an agent branch into `dev` does not require asking Ilya each time — that's the manager's call once QA is clean. Merging `dev` into `master` always does (see branch model above).
- After a branch is merged into `dev`, its worktree and branch are deleted.

### Resuming after a break (new manager session)

The manager cannot assume it remembers a prior conversation — a new session may start with no chat history. State must be reconstructed from durable sources, not recalled:

1. Run `git worktree list` and `git branch --list 'agents/*'` to see which agent branches currently exist.
2. For each one, check `git log` on that branch to see how far it got.
3. Cross-reference with GitHub Issues (open/closed, labels, comments) to see which issues those branches correspond to and what's still pending review or merge.
4. Only after this reconstruction, report status to Ilya and decide next steps — do not guess or ask Ilya to re-explain what was already recorded in git/GitHub.

### Testing (QA pass before showing Ilya)

Before a frontend/backend agent branch goes to Ilya for review, the manager (or a dedicated tester agent) runs a browser-driven QA pass so Ilya reviews working software, not something to debug:

1. Start the dev server for that worktree (`npm run dev`, LAN host already on per project config).
2. At the start of any session that will do browser testing, do one `navigate` to the local dev URL to confirm the claude-in-chrome extension has site access for that origin. If it's blocked asking for a one-time site permission, stop and ask Ilya to grant it in the extension once — this is a Chrome-extension-level permission, separate from Claude Code's own tool permissions, and it should persist after being granted once, so this should rarely trigger.
3. Drive the feature described in the issue end-to-end (happy path + one realistic edge case) using the `run`/`verify` skills rather than ad-hoc scripts. Check console messages for errors.
4. If a bug turns up, fix it on the agent branch before handing off — don't hand Ilya a broken build to discover.
5. Report to Ilya what was tested and how (steps + result), not just "looks good."

## Task & Issue Workflow

We track work in GitHub Issues. `tasks/*.md` was removed; historical task details live in migrated issues.

### Issue taxonomy (labels)

- `kind:feature` — new functionality or user-facing improvement.
- `kind:bug` — something is broken or behaves unexpectedly.
- `kind:refactor` — internal cleanup with no user-facing behavior change.
- `kind:chore` — build, deps, CI, tooling.
- `kind:docs` — documentation, README, ADRs.

- `area:engine` — WebGL pencil engine.
- `area:ui` — React components, CSS, user interactions.
- `area:server` — Fastify, Socket.io, backend logic.
- `area:shared` — `packages/shared` types and constants.
- `area:infra` — docker, deploy, npm workspaces, CI.
- `area:mobile` — Capacitor, touch/gesture logic.

Every issue must have exactly one `kind:*` and one `area:*`.

### Hierarchy

- **Epic** = large feature. Label `kind:feature` + `epic`.
- **Sub-issue** = concrete deliverable inside an epic. Use GitHub sub-issues.
- Bugs and refactors may be standalone or attached to an epic if they belong to the same feature.

### Title format (Russian)

- Epic: `[Epic] <Area>: <Feature name>`  
  Example: `[Epic] Engine: многослойная система`
- Feature: `[Feature] <Area>: <Action>`  
  Example: `[Feature] Engine: реализовать Operation Log append/replay/undo`
- Bug: `[Bug] <Area>: <What is broken>`  
  Example: `[Bug] UI: панель слоёв не сворачивается на планшете`
- Refactor: `[Refactor] <Area>: <What changes>`  
  Example: `[Refactor] Engine: убрать any-касты из PencilEngineAPI`

### Workflow rules

1. Before starting non-trivial work, ensure there is a GitHub issue. Create it if missing.
2. Use GitHub issue state and Project board columns for status. Do not create `status:*` labels.
3. Link PRs to issues with `Closes #N` or `Refs #N`.
4. Close issues only when the fix/feature is merged and verified.
5. Do not put full implementation plans in issue bodies — keep them short; long plans live in ADRs or design docs linked from the issue.
