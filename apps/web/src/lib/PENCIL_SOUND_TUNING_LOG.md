# Pencil sound grain tuning log

Tracks the A/B/C/D tournament over `GrainVariant` (see `PencilSound.ts`),
started from the complaint: current sound reads as "пщщщщщщ" (smooth hiss,
spray-can-like) and should read more like "гкххххкхкх" — not a pitch change,
a granularity/texture change, so paper texture comes through more.

Tournament rule: current champion vs. one or more challengers each round;
whichever the ear prefers becomes (or stays) champion; losers get replaced
by new challengers mutated toward whatever made the winner win. Switching
happens live in the running app via the bottom-right grain panel
(`pencilSound` feature flag) — no reload needed between variants.

Variant axes (see `GrainVariant` in `PencilSound.ts`):
- `floor` — constant noise floor under the grain envelope (lower = more
  silence between grains)
- `depth` — how hard each grain hits above the floor
- `curvePower` — grain envelope shape; 1 = smooth triangle wave ("shhh"),
  higher = sharp brief spikes with mostly silence between ("kh")
- `minHz` / `maxHz` — grain rate range from near-still to full speed
  (density/coarseness of the texture)

## Round 1

| key | label | floor | depth | curvePower | minHz | maxHz |
|-----|-------|-------|-------|------------|-------|-------|
| A | smooth (original baseline) | 0.12 | 1.4 | 1.0 | 8 | 220 |
| B | sharp, quiet floor | 0.05 | 2.1 | 1.8 | 8 | 220 |
| C | sharper + denser grain | 0.03 | 2.6 | 2.6 | 10 | 260 |
| D | sharp, coarser grain (lower ceiling) | 0.05 | 2.1 | 1.8 | 5 | 140 |

A is the pre-tuning control (what prompted the complaint). B is the first
fix attempt (raised `curvePower` from 1 to sharpen the grain envelope,
lowered `floor`/raised `depth` to cut the constant hiss bed). C pushes the
same direction further plus a denser/faster grain rate. D isolates rate: same
sharpness as B but a lower `maxHz` ceiling, to see whether "гк" wants sharper
grain shape or slower/coarser grain rate at speed.

**Result:** D won. A confirmed worst ("too sharp/harsh" — reads as the original hiss/spray-can
character the whole tuning effort started from). Overall note across *all* of round 1: still too
dense/even — "шум слишком ровный... не отражает бумагу" (the noise is too uniform, doesn't read as
paper). That's not something floor/depth/curvePower/rate can fix individually — those all control a
single, constant-rate grain stream, so any combination still sounds like one steady texture. Needed
a structural change, not another point on the same four axes.

## Round 2

Added a new axis: `clumpDepth`. A second, independent noise-driven envelope running at ~1/6th the
fine-grain rate (`CLUMP_RATE_DIVISOR`) now multiplies the fine-grain amplitude up and down over
time — real paper has patches of more/less tooth, not one constant roughness. `clumpDepth` scales
how deep those quiet valleys get (0 = round 1 behavior exactly; higher = bigger swings between
dense and sparse). All four candidates below fix round 1's winning params (D) and only vary this
one axis, to isolate whether clumping actually fixes the "too even" complaint before mixing it with
anything else.

| key | label | floor | depth | curvePower | minHz | maxHz | clumpDepth |
|-----|-------|-------|-------|------------|-------|-------|------------|
| A | D, no clumping (control) | 0.05 | 2.1 | 1.8 | 5 | 140 | 0 |
| B | D + mild clumping | 0.05 | 2.1 | 1.8 | 5 | 140 | 0.4 |
| C | D + strong clumping | 0.05 | 2.1 | 1.8 | 5 | 140 | 0.7 |
| D | D + heavy clumping | 0.05 | 2.1 | 1.8 | 5 | 140 | 0.9 |

**Result:** _superseded before a listening pass — see round 3. Measuring the actual audio (not just
listening) turned up a structural bug that made clumpDepth's effect negligible regardless of its
value, so round 2's numbers don't mean much on their own._

## Round 3 — measured against real recordings

Ilya provided 3 real pencil-on-paper recordings (`temp/*.wav`, gitignored, not committed). Analyzed
them (Python/scipy: STFT spectral centroid & flatness, Hilbert-transform envelope crest factor,
50ms-window RMS coefficient of variation, envelope modulation spectrum) instead of tuning by ear
only. Measured targets (avg across the 3 clips): **envelope crest factor ≈ 11**, **macro RMS CV
(50ms) ≈ 0.75**, **spectral flatness ≈ 0.83** (confirms: broadband noise, not tonal — matches the
"not pitch" framing from the start), **spectral centroid ≈ 5700-6700 Hz** (our synthesis runs a bit
darker than this at moderate speed — a brightness-axis gap, not a granularity one; not addressed
this round). Dominant envelope-modulation energy sits mostly in the **3-36 Hz** band (bursty/patchy
at a human-hand-motion timescale), not narrowly at one rate.

**The round-2 bug:** built an offline DSP simulation (numpy/scipy, reproducing PencilSound.ts's
exact biquad-filter/WaveShaper graph via the standard RBJ cookbook coefficient formulas) to render
each candidate and measure it the same way as the real clips. Round 2's synthesized output measured
macro CV ≈ **0.03-0.05** — 15-20x lower than real — regardless of clumpDepth (0, 0.4, 0.7, 0.9 all
scored about the same). Root cause: a BiquadFilterNode lowpass only passes a narrow band of a
broadband noise source, so its output amplitude is tiny and scales with cutoff frequency (measured:
std ≈ 0.005·√freq — e.g. ~0.014 at a 12Hz cutoff, ~0.06 at 140Hz). The `rectify`/`clumpRectify`
WaveShaper curves are built assuming a healthy ±1 input domain, so this tiny signal was landing deep
in the curve's near-flat center — `curvePower` and `clumpDepth` were shaping/scaling a value that
barely moved, no matter what they were set to. Fixed with `normGain()`: a frequency-dependent
compensation gain (`grainNormGain`/`clumpNormGain` nodes) inserted before each rectify stage,
rescaling the lowpassed noise back to a consistent range first. After the fix, the *same* clumpDepth
values that measured ~0.03-0.05 now measure ~0.28-0.32 (round 2's floor/depth/curvePower, unfixed
otherwise) — clumpDepth finally does what it was designed to do.

With the fix in place, grid-searched floor/depth/curvePower/clumpDepth (small sweep, ~300 combos)
against the measured targets above:

| key | label | floor | depth | curvePower | minHz | maxHz | clumpDepth |
|-----|-------|-------|-------|------------|-------|-------|------------|
| A | measured match (calibrated) | 0.01 | 3.5 | 1.5 | 5 | 140 | 0.98 |
| B | lighter clumping | 0.01 | 3.5 | 1.5 | 5 | 140 | 0.9 |
| C | sharper grain shape | 0.01 | 3.5 | 2.0 | 5 | 140 | 0.98 |
| D | louder overall | 0.02 | 4.5 | 1.5 | 5 | 140 | 0.98 |

A (the fitted point) measured envelope crest 11.8 (target 11), macro CV 0.70 (target 0.75),
flatness 0.85 (target 0.83) — close across the board, and holds up reasonably across the full
speed range (checked at speed 0.5-6.0 px/ms, not just the mid-speed point it was fit at). Note
`curvePower` dropped from round 1/2's 1.8 to 1.5 here — with the amplitude fix, less extra shaping
is needed to get a spiky-enough envelope, since the signal now actually reaches the curve's sharp
region instead of living in its flat center.

**Caveat:** numeric match to a few statistics doesn't guarantee "sounds right" — it's a much better
starting point than round 2's blind clumpDepth, but still needs an actual listening pass. clumpDepth
0.9-0.98 is a big swing (valleys drop to ~2-10% of peak amplitude) — worth listening for whether
it "pumps"/cuts out too abruptly rather than reading as texture.

**Result:** Ilya's read after the listening pass: "moved in the right direction but stepped too
far" — didn't pick a specific letter, felt the jump from round 1/2's favorite to the calibrated
point A was too big to evaluate as one step.

## Round 4 — straight-line ladder between the old favorite and the calibrated point

Rather than throw more independent guesses, interpolate directly between the two known reference
points and let the tournament find where on that line sounds best:

- **old favorite** = round 1/2's winning params, with `clumpDepth: 0` rather than the `0.9` it was
  originally labeled with — round 2's bug (see above) made clumping inaudible regardless of value,
  so "0.9-with-the-bug" is acoustically identical to 0 now that the bug is fixed. Reusing 0.9 as-is
  would sound nothing like what Ilya actually heard and liked; 0 does.
- **calibrated** = round 3's fitted point (key A there, now the D endpoint here).

Each param (floor, depth, curvePower, clumpDepth — minHz/maxHz unchanged throughout) is linearly
interpolated at t = 0, 1/3, 2/3, 1:

| key | label | t | floor | depth | curvePower | clumpDepth |
|-----|-------|---|-------|-------|------------|------------|
| A | old favorite (restored) | 0 | 0.050 | 2.10 | 1.80 | 0.00 |
| B | 1/3 toward calibrated | 1/3 | 0.037 | 2.57 | 1.70 | 0.33 |
| C | 2/3 toward calibrated | 2/3 | 0.023 | 3.03 | 1.60 | 0.65 |
| D | measured match (calibrated) | 1 | 0.010 | 3.50 | 1.50 | 0.98 |

Default variant is now A (the familiar anchor), not D, so the panel opens on known ground.

**Result:** _pending — awaiting Ilya's listening pass._

## Round 5 — fractal noise (added alongside, not instead of, the round 4 ladder)

Before finishing round 4, Ilya asked to look up prior research on procedural friction sound. Found
[FoleyAutomatic](http://persianney.com/kvdoelcsubc/publications/foleyautomatic.pdf) (van den Doel,
Kry, Pai — SIGGRAPH 2001), the foundational paper most later scraping/contact-sound work cites.
Their scraping model: drive the noise source with **fractal noise** (power spectrum `S(ω) ∝ 1/ω^β`,
β = a surface-roughness parameter, related to fractal dimension `D = β/2 + 2`) through a resonant
filter whose center frequency tracks contact velocity — structurally the same idea as our
carrier→bandpass(speed), but critically the *source noise itself* is fractal/colored, not flat
white noise. Their friction-force loudness law, `∝ √(v·F_normal)`, also matches our
`masterGainTarget`'s `sqrt(speedNorm)` scaling independently.

Why this matters for our specific complaint: fractal noise has genuine multi-scale "clumpiness"
built into its own time structure (self-similar at every scale), unlike our fine+clump setup, which
only has two arbitrary, discrete rates. This lines up with what round 3's real-recording analysis
found — envelope-modulation energy spread continuously across ~2-36 Hz, not concentrated at one or
two specific rates.

**Implementation** (no AudioWorklet — approximated cheaply with what we already had): replaced the
single fine-grain lowpass tier with 4 octave-spaced tiers (`FRACTAL_DIVISORS = [1,2,4,8]`, i.e.
grainRate, /2, /4, /8), each independently amplitude-normalized (`normGain`, same fix as round 3)
and summed — a Voss-McCartney-style pink-noise approximation. `GrainVariant.fractal` gates it:
`false` (all of A-D) collapses back to exactly one tier (today's old single-lowpass behavior,
bit-for-bit unchanged) — this is additive, not a replacement, per Ilya's request to compare before
picking a family. Two new variants, both starting from the *old favorite*'s floor/depth/curvePower
(clumpDepth 0) so fractal-vs-not is the only thing being isolated:

| key | label | fractal | fractalTilt |
|-----|-------|---------|-------------|
| E | old favorite + fractal noise (pink) | true | 1.0 |
| F | old favorite + fractal noise (browner/patchier) | true | 1.6 |

`fractalTilt` weights slower/coarser tiers by `tilt^i` — 1.0 gives roughly equal per-tier variance
(what makes the sum approximate a 1/f "pink" spectrum in the first place, given each tier is already
normalized regardless of rate); higher tilts shift weight to the slower tiers for a browner, more
patchy result.

Quick numeric check (offline sim, speed=3.0px/ms) comparing A (old favorite, fractal off) against
E/F — same recipe as round 3's real-recording analysis:

| variant | envelope crest | macro CV (50ms) | top modulation peaks (Hz) |
|---|---|---|---|
| A (fractal off) | 9.6 | 0.37 | 69, 35, 34, 69.5, 11 — one narrow band |
| E (fractal, tilt 1.0) | 9.5 | 0.44 | 8, 16, 19.5, 27, 18 — spread, shifted down |
| F (fractal, tilt 1.6) | 7.8 | 0.51 | 5.5, 6, 4, 11, 8 — spread further down |

Confirms the mechanism does what it's supposed to: broadens the modulation spectrum and raises
macro CV toward the real recordings' ~0.7-0.99 range, without touching floor/depth/curvePower/
clumpDepth. Tradeoff: envelope crest factor drops a bit as tilt increases (9.6→7.8) — summing
several partially-independent tiers smooths individual grain peaks somewhat even as it adds
longer-timescale patchiness, so E/F may read as *less individually crunchy* per grain even while
being *more patchy* overall. Worth listening for which of those two qualities matters more.

**Result:** _pending — awaiting Ilya's listening pass, alongside the rest of round 4's ladder._

## Round 6 — honest "before today" reference

Added variant **G**: the exact `PencilSound.ts` constants from before this tuning session touched
anything — `floor 0.12, depth 1.4, curvePower 1.0 (plain abs curve), minHz 8, maxHz 220,
clumpDepth 0` (this is round 1's "A", confirmed worst/too-hissy — see round 1's table above).

**Why it needed a new `useNormGain` flag rather than just adding those old numbers as a variant:**
`normGain()` (the round-3 fix) is baked into the graph structurally now — it runs for every variant,
always. If G's old numbers were replayed through today's graph as-is, they'd sound *louder and
grainier* than they ever actually did, because the original code never had this compensation; the
comparison would be dishonest. `useNormGain: false` (only set for G) bypasses the compensation
gain (forces it to 1) so G reproduces the literal pre-session sound, not "old numbers, new engine."
Every other variant (A-F) keeps `useNormGain: true`.

G is meant purely as a fixed reference point for the whole session — "did we actually move forward,
across all of it" — not a new contender to iterate on.

**Result:** Surprise — G won outright, beating every deliberately-tuned A-F candidate from rounds
1-5. All that work (sharper curvePower, clumping, fractal noise) chased *more* texture on the
theory that "too even/dense" meant "not enough grain" — turns out the floor-dominated, barely-
modulated original was already closer to right, and A-F were overshooting in the opposite
direction. Ilya's ask: keep G almost exactly as it is, just stir in a few faint, rare clicks — not
another grain redesign.

## Round 7 — G, barely diluted with faint clicks

G's grain contribution was accidentally tiny (`useNormGain: false` means the lowpassed noise never
gets rescaled, so it stays in the ~0.01-0.06 range noted back in round 3 — a rounding error turned
out to be most of why G sounded right). To add *deliberate* faint clicks rather than rely on that
accident, new variants keep G's exact `floor`/`minHz`/`maxHz` (0.12, 8, 220) but turn `useNormGain`
back on (needed for `curvePower` to have any real effect at all) paired with a **small depth** and
**high curvePower**, so added grain only pokes above the floor rarely and briefly instead of
constantly modulating it:

| key | label | depth | curvePower | peak/floor | % of time "clicking" (env > 10% of floor) |
|-----|-------|-------|------------|------------|---------------------------------------------|
| H | G + barely-there clicks | 0.02 | 4.0 | 1.17x | 0.75% |
| I | G + slightly more present clicks | 0.05 | 3.5 | 1.42x | 6.1% |

(measured via the same offline sim as earlier rounds, speed=3.0px/ms — see
`peak/floor` = how much louder a click gets than G's constant floor at its peak, `%
time clicking` = fraction of samples where the added grain is at least 10% of the floor's
loudness, i.e. how rare the clicks actually are.) Both start conservative on purpose — easier to
turn clicks up from "barely there" than to walk back from "too much" a second time.

Default variant is now **G** (not A) — it's the current best result.

**Result:** Ilya's read: G/H/I barely distinguishable from each other (the click dosing isn't the
main issue right now) — but flagged a separate problem: the *brightness* (bandpass center frequency,
tracks speed) glides noticeably and reads as "howling wind" rather than paper. Also asked for a
combo variant: two full noises mixed simultaneously, e.g. G + A with A three times quieter.

## Round 8 — brightness glide read as "howling wind"

A narrow-ish resonant bandpass (`Q` ~0.7-1.9) sweeping across a wide frequency range in response to
speed is mechanically exactly what a wah-pedal/siren effect is: the wider the range and the faster
it chases every speed fluctuation (which is constant during normal drawing — curves, direction
changes), the more "wind"/"siren" it reads as instead of "paper brightening as you press harder or
move faster".

Two changes, both aimed at the same root cause:
- **Range narrowed** `MIN_FREQ`/`MAX_FREQ` from 500-6000 Hz (extremely spanning, ~3.5 octaves) to
  1200-5000 Hz (~2.1 octaves) — still brightens noticeably at speed, swings much less wildly.
- **Slower, dedicated ramp**: brightness now uses its own `BRIGHTNESS_RAMP` (0.18s) instead of the
  shared `RAMP_SLOW` (0.05s) — roughly 3.6x slower to chase a new target, so normal micro-variations
  in stroke speed glide instead of visibly/audibly "swooping".

Both are global (apply to every variant, not a new per-variant axis) since the problem wasn't
specific to any one variant's grain shape.

## Round 9 — two independent noises layered (G + A, A at 1/3 volume)

Requires a real architecture change: previously one `GrainVariant` → one noise+grain chain. To layer
two *genuinely independent* noises (not just a more complex envelope on one noise — see below for
why that distinction matters), refactored the internal graph into a `GrainLayer` abstraction
(`buildLayer()`): each layer gets its own carrier noise, its own brightness bandpass, its own fine-
grain (fractal-tier) and clump modulators, and a `mixGain` controlling its relative loudness in the
final sum. Every `PencilSound` now always builds **two** layers — primary (`grain` itself) and
secondary (`grain.secondary?.variant`, at `grain.secondary?.gain`) — with the secondary silenced
(`mixGain` 0, borrowing the primary's recipe just so its own rate math has a valid variant to read)
whenever the active variant has no `secondary`. That means switching between a combo and a solo
variant live is just a gain ramp, not a graph rebuild — same "always allocate, gate with 0" pattern
already used for the fractal tiers and clumpDepth.

Why not simply add a second envelope onto the *same* carrier noise instead of a whole second carrier?
Mathematically, `carrier(t) * (envA(t) + envB(t))` is indistinguishable from one combined envelope
`envA+envB` applied to one noise stream — no genuine "two things happening" quality, just a more
complex single texture. Two *independent* carrier noise sources, each shaped by their own envelope
and summed, is what actually produces a layered "two textures at once" quality rather than "one
texture with a fancier envelope."

**J** = G (primary, full volume) + A (round 4's "A" / the pre-round-3 favorite recipe, `secondary.gain`
= 1/3). Verified live (browser + real strokes) that switching among solo and combo variants works
with no audio errors and no graph-rebuild glitches.

**Result:** Ilya asked to halve J's secondary volume again — `secondary.gain` 1/3 → 1/6. Updated in
place (still key **J**, same idea, just quieter A layer underneath).

## Round 10 — finalized: H and J promoted to a real setting, everything else removed

Ilya decided: keep H and J, ship them as an actual user-facing choice (Off / Variant 1 / Variant 2)
via the gear-icon Settings panel, not the bottom-right debug A-J tournament panel. That panel and
the `pencilSound` boolean feature flag are gone — replaced by `getPencilSoundSetting()`/
`setPencilSoundSetting()` in `featureFlags.ts` (a dedicated 3-value setting, not shoehorned into the
boolean `FEATURE_FLAGS` list) and a `<select>` in `SettingsPanel`.

`PencilSound.ts` was cut down to only what H and J actually use — **both have `clumpDepth: 0` and
`fractal: false` in every recipe that ever shipped**, so the round 2 clump system and the round 5
fractal-tier system were dead weight for the final result and got deleted entirely (`GrainVariant`
lost `clumpDepth`/`fractal`/`fractalTilt`/`key`/`label`; `GrainLayer` lost every clump/fractal field;
`buildLayer` goes back to a single lowpass-noise grain modulator). The round 8 brightness fix
(narrower range + `BRIGHTNESS_RAMP`) and the round 9 layering system (`secondary`, `GrainLayer`,
`buildLayer`) are both still load-bearing for H and J respectively, so those stayed. Live variant
switching (`setGrainVariant`) also went away — nothing calls it once there's no debug panel; the
Settings panel's existing convention is a page reload on change anyway, same as every other flag.

Final shape:
- **Variant 1** (former **H**) = `BASE` (the original untouched sound) + `depth: 0.02, curvePower:
  4.0, useNormGain: true` — barely-there clicks.
- **Variant 2** (former **J**) = `BASE` + a second, independent, more distinctly-grained layer
  (former round-4 "A" recipe) mixed in at 1/6 volume.

This file stays as the historical record of how those two numbers were arrived at — the "why" behind
`PencilSound.ts`'s comments isn't re-derivable from the code alone once the debug scaffolding is gone.

## How to log a result

After each round, replace the pending line above with the winner and a short
note on *why* (what it lacked/had too much of), then add a new round table
for the next set of challengers mutated toward that reason. Keep old round
tables — the point of this file is spotting which axis (floor/depth/power/
rate) actually moves the "пщщщ → гкх" needle, which only shows up across
multiple rounds.
