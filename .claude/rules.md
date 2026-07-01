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

## Git workflow

- Do not commit unless explicitly asked; stage and report status instead.

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
