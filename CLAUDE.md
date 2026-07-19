# Art Lessons — Project Rules

Monorepo for a collaborative academic drawing app. Teacher hosts a room, students join remotely over the internet (not LAN-only — participants are not assumed to share a network). Shared canvas content and layers, local per-user viewport (pan/zoom/rotate).

Production hosting is live: a VPS (time4vps) runs `apps/server` + Postgres via Docker Compose behind nginx+certbot, at `https://5ryx.l.time4vps.cloud`, with GitHub Actions auto-deploying on push to `main` after typecheck/lint/test pass (see `deploy/README.md`). Still no Redis — single process is enough at current scale. Day-to-day development/iteration still happens locally (`vite --host` on Ilya's own machine/LAN, tested against his own devices) — the VPS is the deploy target, not the dev loop.

## Stack

- **Monorepo**: npm workspaces (`apps/web`, `apps/server`, `packages/shared`)
- **Frontend**: React 19 + TypeScript 5 + Vite 8, CSS Modules + CSS variables (no Tailwind)
- **Routing**: `react-router-dom` v7
- **State**: one global store (Zustand, `apps/web/src/stores/roomStore.ts`) for all app state, including the editor's own — layers, viewport, tool/preset/color, room data — not just cross-page/account state. The editor-state migration (#19→20→21→22→23→24) is complete; most of the editor now reads/writes the store, not local `useState`. The one thing that never moves into the store: the WebGL engine's own internals (`engineRef`, pixel buffers, the imperative pointer/dab pipeline) — store state is always a *reflection* of what's already been applied to the engine via an imperative call (e.g. `engine.setTool(tool)`), never the engine's source of truth (#25, still open, is an audit pass confirming that boundary holds).
- **Rendering**: WebGL1, dab-based pencil engine with Catmull-Rom spline
- **Icons**: Material Symbols Outlined, thin variant (`wght: 200`)
- **Backend**: Fastify + Socket.io, fully wired to the UI — room join/reconnect, Operation Log relay, undo/redo, and periodic client-baked snapshots for fast rejoin on long rooms (epic #149)
- **DB/Cache**: PostgreSQL + Prisma; no Redis (single server process is enough at current scale — see `.claude/rules.md`)
- **Mobile**: Capacitor later; start with PWA-ready responsive UI

## Monorepo Structure

```
art-lessons/
├── apps/
│   ├── web/                # React app
│   │   src/
│   │   ├── components/     # reusable UI + feature components
│   │   │   ├── Icon.tsx
│   │   │   ├── LayerPanel/
│   │   │   └── PaperPreview/
│   │   ├── engine/         # WebGL pencil engine
│   │   ├── lib/            # small shared helpers (layers)
│   │   ├── pages/
│   │   │   ├── CreateRoom/
│   │   │   └── Room/
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
  3. `@art-lessons/shared`
  4. Project `components/`, `lib/`, `engine/`
  5. Local `./` files
  6. CSS Modules last
- **Helpers**:
  - `components/Icon.tsx` for all Material Symbols icons.
  - `lib/layers.ts` for layer-state helpers (`computeCompositeOrder`).
- **Types**: import shared types from `@art-lessons/shared`. Avoid redefining them locally. Avoid `as any` and `as` casts when a type guard or narrowing works.
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
