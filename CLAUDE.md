# Grafetto — Project Rules

Monorepo for a collaborative academic drawing app. Teacher hosts a room, students join remotely over the internet (not LAN-only — participants are not assumed to share a network). Shared canvas content and layers, local per-user viewport (pan/zoom/rotate).

Production hosting is live: a VPS (time4vps) runs `apps/server` + Postgres via Docker Compose behind nginx+certbot, at `https://5ryx.l.time4vps.cloud`, with GitHub Actions auto-deploying on push to `main` after typecheck/lint/test pass (see `deploy/README.md`). Still no Redis — single process is enough at current scale. Day-to-day development/iteration still happens locally (`vite --host` on Ilya's own machine/LAN, tested against his own devices) — the VPS is the deploy target, not the dev loop.

## Stack

- **Monorepo**: npm workspaces (`apps/web`, `apps/server`, `packages/shared`)
- **Frontend**: React 19 + TypeScript 5 + Vite 8, CSS Modules + CSS variables (no Tailwind)
- **Routing**: `react-router-dom` v7
- **i18n**: own minimal layer, `apps/web/src/i18n/` — no library (see `docs/adr/006-i18n.md`). Flat typed keys, English is the source of truth for the key set, every other locale is typed as `Dictionary` so a missing translation is a typecheck error. Use `useT()` in components; data registries (tool schemas, hotkeys) store a `TranslationKey`, never a finished label. Dev-only panels (feature flags, tuning, debug overlays) stay English on purpose.
- **State**: one global store (Zustand, `apps/web/src/stores/roomStore.ts`) for all app state, including the editor's own — layers, viewport, tool/preset/color, room data — not just cross-page/account state. The editor-state migration (#19→20→21→22→23→24) is complete; most of the editor now reads/writes the store, not local `useState`. The one exception on the "one store" rule is `stores/settingsStore.ts` (#208): app-level preferences (language, later theme) outlive any room, and `resetRoomStore()` wipes the room store on every Room mount. The other thing that never moves into the store: the WebGL engine's own internals (`engineRef`, pixel buffers, the imperative pointer/dab pipeline) — store state is always a *reflection* of what's already been applied to the engine via an imperative call (e.g. `engine.setTool(tool)`), never the engine's source of truth (#25, still open, is an audit pass confirming that boundary holds).
- **Rendering**: WebGL1, dab-based pencil engine with Catmull-Rom spline
- **Icons**: Material Symbols Outlined, thin variant (`wght: 200`), self-hosted as a 5 KB subset (#322). The app can only draw icons listed in `apps/web/src/icons/iconNames.ts` — `IconName` is a union type, so an unlisted name is a typecheck error rather than an invisible button. Adding one is: add the name to that list, then run `npm run bake:icon-font` (the baked woff2 and codepoint map are committed). Never widen an `icon` prop back to `string` — that list is what the shipped font is built from.
- **Backend**: Fastify + Socket.io, fully wired to the UI — room join/reconnect, Operation Log relay, undo/redo, and periodic client-baked snapshots for fast rejoin on long rooms (epic #149)
- **DB/Cache**: PostgreSQL + Prisma; no Redis (single server process is enough at current scale — see `.claude/rules.md`)
- **Mobile**: Capacitor later; start with PWA-ready responsive UI

## Monorepo Structure

```
grafetto/
├── apps/
│   ├── web/                # React app
│   │   src/
│   │   ├── components/     # reusable UI + feature components
│   │   │   ├── Icon.tsx
│   │   │   ├── LayerPanel/
│   │   │   └── PaperPreview/
│   │   ├── engine/         # WebGL pencil engine
│   │   ├── i18n/           # translation layer + per-locale dictionaries
│   │   ├── lib/            # small shared helpers (layers)
│   │   ├── pages/
│   │   │   ├── CreateRoom/
│   │   │   ├── Room/
│   │   │   └── Settings/   # app-wide settings (language), not the editor's
│   │   └── styles/
│   └── server/             # Fastify + Socket.io
├── packages/shared/        # shared types and constants
└── .claude/
    └── rules.md            # operational rules for Claude
```

## Coding Conventions

- **Components**: functional React, default export only when it is the single public symbol; otherwise named exports.
- **Imports order**:
  1. React / framework
  2. External libraries
  3. `@grafetto/shared`
  4. Project `components/`, `lib/`, `engine/`
  5. Local `./` files
  6. CSS Modules last
- **Helpers**:
  - `components/Icon.tsx` for all Material Symbols icons.
  - `lib/layers.ts` for layer-state helpers (`computeCompositeOrder`).
- **Types**: import shared types from `@grafetto/shared`. Avoid redefining them locally. Avoid `as any` and `as` casts when a type guard or narrowing works.
- **CSS**: CSS Modules + CSS variables from `styles/tokens.css`. Touch targets minimum 40–48 px on tablet.
- **Engine**: public API surface is `PencilEngineAPI` from `engine/index.ts`. Internal classes live in `engine/src/`.

## Key Architectural Decisions

- **Operation Log**: every drawing action is serializable from day one (`packages/shared/src/index.ts` defines `Operation`).
- **Layers**: flat map + separate order arrays; folders are one-level only. Background id is reserved and immovable.
- **Rendering**: client-side only; server retransmits operations, never renders.
- **Viewport**: local per-user `{cx, cy, zoom, angle}`. Pointer coordinates are transformed analytically in `PointerInput.setTransform()`.
- **WebGL1**: keep shaders WebGL1-compatible; no WebGL2-only features.
- **Dev-time LAN testing**: `vite --host` always on so tablets on the same wifi as the dev machine can reach the dev server — a development convenience, not the production hosting model (see project description above).

## Rules for Claude

Operational rules for Claude — coding conventions, quality gates, Git workflow, and issue tracking — live in `.claude/rules.md`.

**Release track:** issue #314 (pinned) is the single list of what must be covered before the first release. Before starting non-trivial work, check it against #314 and name the item it unblocks; if it maps to nothing there, say so to Ilya before doing it, and decide together whether it belongs in the track. Full rule in `.claude/rules.md` → "Release track".
