# CPU metadata wrapper for native bounded tile

Base c6ef4175. CanonicalStrokeScratchMetadata implements real SettlePlanScratch<CanonicalFieldBuffer> by composition with CanonicalTileScratch and the existing CPU CanonicalStrokeChunkState. There is no substitute GPU/log/Room API.

Production correspondence:

- RibbonStrokeScratch:113–155: running capture flag/default, callbacks, release reset, tri-state storage bounds (null empty / bounds proven / undefined unknown).
- :296–311: first finish constants retained; bounds union; dwell/radius/wetPeak maxima only. landedWet and first composite constants are not overwritten.
- :318–335: capture copies mutable CPU lists, paints, foreign chunks/dabs/color/seed and finish/dry scalar payloads; target resource identity preserved.
- :426–435: chronological materialGesture may lag logical gesture; no backward material activation.
- :471: newFilm increments gesture and clears brushTravel only. It does not reset wet contacts or depletion clocks.
- :501: beginStroke delegates the existing production CPU reset explicitly, increments gesture, clears foreign sources and finish, preserves wash paints/dryCtx/storage and composite caches. Owner callback must perform the original CPU reset, not leave old contacts/clocks alive.
- PencilEngine:7401: exact floor/ceil/clamp and GL-bottom-up reveal rect; nonzero tile origin supported.

Owner wiring:

`wrapper.tiles` is used by native source executor. `wrapper.delivery` is the single CPU prep state. The owner supplies actual finish/dry payloads from production preparation and planner completion, calls noteFinish/noteStorageBounds, and passes captureFinishMetadata to deferred requests. Arrays reference existing CPU state until captured, then become owned copies. The wrapper deliberately does not compute replacement radius, standing, fieldSeed or composite settings.

`recordRunningSource` stores an owner-provided exact source replay closure only when trackRunningSource is enabled. This does NOT itself wire sourcePhaseExecutor capture: an overlapping-settle owner must capture commands/copies using the CURRENT encoder when replayed; never retain an ended/submitted encoder. Until wired and parity tested, concurrent continuation is unsupported. The source executor currently accesses raw tiles and does not honor this wrapper's optional runningCoverage switch automatically.

Explicit boundaries: exactly one bounded tile; multi-tile fanout rejected. Native lost-device `forget=true` rejected: retire and rebuild the entire resource owner. Full parked-state restoration, context-loss recovery, asynchronous source replay/cancellation and hardware pixel parity are separate owner integration gates. No new solver or equations.

Tests: structural SettlePlanScratch assignment; exact reveal scissor, material chronology, reset callback, partial-film travel behavior, finish/storage unions, capture independence, flags/release and unsupported scopes.
