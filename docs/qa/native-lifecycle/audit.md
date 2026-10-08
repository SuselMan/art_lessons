# Native owner lifetime audit

This bounded change preserves all watercolor shader expressions and command ordering.

Fixed: failed brush paired/single, ribbon, stamp, composite and paper encodes destroy allocations before returning ownership. Failed source phase execution destroys buffers returned by earlier commands. Standalone completion cleanup handles device-loss rejection. Whole-device teardown also destroys retired textures already removed from the owned-field set.

Verified: app TypeScript and allocation failure/success ownership tests. Actual GPU validation and hardware parity remain separate gates.

Remaining issue draft for #728 (быстрая акварель):

- Runner destroy rejects active/busy. Out-of-bounds move/end can leave an active gesture. Add retirement distinct from pen-up: detach input, mark retired, stop queued callbacks, await in-flight completion or retire the whole device, dispose planner/job and GPU owners. Never synthesize an operation or call gesture.end on cancellation.
- Planner job.dispose must run in finally if operations, finish or presentation throw.
- Standalone submit throwing synchronously can bypass transient completion cleanup.
- Scope release callbacks need explicit cancellation/retirement ownership; whole-device destruction frees GPU memory but an abandoned release closure may retain logical references.
- Partial tile scratch allocation can strand pool leases until pool destruction.

## Progressive preview seam

The existing generic planner already exposes the faithful seam: its preview callback receives tile, current transported pigment, current color and coverage. It is throttled to 150 ms and disabled by shouldPreview=false. The bounded runner currently disables that callback. Live compositing inkLoad during the gesture is already available, but does not expose evolving settle fields.

The next exact implementation should composite these supplied intermediate fields over the frozen original with the production composite formula, inside the current command scope before input buffers are released; yield between scheduling quanta and present that result. Then finish on the same dry endpoint. No alpha interpolation to a precomputed dry picture is required. Production reveal/morph scheduling is a distinct display owner and must not silently change physics or replay clocks.
