# #728: bounded independent source owner and canonical FIFO

QA only, defaults unchanged. Existing review engine source is untouched.

Each gesture owns thirteen RGBA8 1024² textures: presentation, original,
coverage/coverageFilm, P load/base/film, C load/base/film, V load/base/film.
52 MiB per owner; three prewarmed owners require 156 MiB in addition to the
canonical target, solver fields, baked paper and ordinary engine resources.
All storage and the initial canonical tile are created before pointer admission.
Admission copies/clears already allocated fields; GPU command cost is still real.
Fourth admission receives an explicit visible backpressure reason before the
ordinary pointer callback. Pending cross-wash/layer changes are also explicitly
rejected. Other ordinary tools remain on their existing renderer when no owner
is pending. Initial supported scope is same-wash rapid gestures on one 1024 tile.

Prepared source commands consume existing delivery/maps/bands/halo arrays,
without repeating delivery or geometry. The immediate presentation is drawn
into independent fields using the actual prepared GL primitive binder and the
existing composite. Canonical execution rebinds scratch/base fields after the
preceding FIFO finish; it does not publish a snapshot of a stale full layer.
P/C/V continuation preserves the previous chunk's film. Newer presentation is
retained when older canonical jobs land. Cancellation has an explicit GPU-safe
retirement fence; storage cannot be reused while an active canonical owner lives.

CPU gates: 42 tests, including the actual original prepared-command corpus,
physical ledger/prewarm, continuation, fake integration rapid3/late bases,
old-land/new-overlay, pre-admission scope rejection and cancellation restoration.
The fake integration tests assert control/resource bindings, not GPU pixels.
The earlier Surface source-only primitive proof covers three real original vs
prepared GL pairs and a negative dose control; it does not prove this whole FIFO.
Browser bundle builds successfully; module HTTP checks succeed. Source passports
are computed from files, and command-tail extraction rejects an unreviewed SHA.

The bounded controller creates its own Fine1024 Room, uses real PointerInput
handlers for three rapid 400px gestures, checks actual queue ownership and
DOWN allocation/drain counters, and checks canonical target through Dry/Undo/Redo.
Readbacks happen after measured drawing. These are CPU submission/onset markers,
not physical stylus-to-scanout latency. Working scratch roles are not compared
across history rebuild; a target-history pass must not be described as all-field
parity. GPU/Room execution remains unproven until the controller actually runs.

Presentation morphing from owned source to canonical settled material has not
been integrated. This entry is a latency/ownership diagnostic, not complete
watercolor UX or a production migration. No Samsung access is authorized.

## Entry bootstrap correction

The first actual Surface Room attempt was invalid before pointer input:
condition timeout, zero scenario rows, memory remained above the abort guard.
The own page was closed; no renderer/correctness/performance result was produced.
The old controller did not preserve its failing stage, so that stage is unknown.
The corrected controller saves stage and bounded own DOM/engine status before close.

A concrete independent bootstrap gap was found: raw `/@fs` HTML does not receive
the React refresh preamble included in the normal Vite index. The actual served
App module throws when `window.$RefreshReg$` is missing. Entry now includes the
same hook initialization as the actual index. A bounded VPS browser check uses
real React/ReactDOM and that actual served guard, with explicit main/Room/owner
stubs: negative entry without the hook throws the preamble error, corrected
entry reaches its route and ready adapter without page errors. This proves the
narrow bootstrap seam, not full App initialization or GPU watercolor. An earlier
full-App stub run exceeded its budget and was stopped; it is not a positive gate.
The new full actual Room controller still must run on Surface after allocation.
