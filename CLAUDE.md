# Art Lessons — Project Rules

Monorepo for a collaborative academic drawing app. Teacher hosts a room, students join via LAN. Shared canvas content and layers, local per-user viewport (pan/zoom/rotate).

## Stack

- **Monorepo**: npm workspaces (`apps/web`, `apps/server`, `packages/shared`)
- **Frontend**: React 19 + TypeScript 5 + Vite 8, CSS Modules + CSS variables (no Tailwind)
- **Routing**: `react-router-dom` v7
- **State**: local React state + refs for engine; no global state library
- **Rendering**: WebGL1, dab-based pencil engine with Catmull-Rom spline
- **Icons**: Material Symbols Outlined, thin variant (`wght: 200`)
- **Backend**: Fastify + Socket.io skeleton (not wired to UI yet)
- **DB/Cache**: PostgreSQL + Prisma + Redis (planned)
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
- **LAN hosting**: `vite --host` always on for tablet testing.

## Rules for Claude

Operational rules for Claude — coding conventions, quality gates, Git workflow, and issue tracking — live in `.claude/rules.md`.
