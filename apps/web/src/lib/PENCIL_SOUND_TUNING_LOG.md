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

## Round 11 — Variant 3: AudioWorklet resynthesis from scratch (#153)

After round 10 shipped, Ilya's verdict on the result was "в целом норм, но хочу идеальный" — so
this round doesn't tune the node graph further, it replaces the whole synthesis architecture for a
new third setting (`lib/pencilSoundV3/`, Settings → Pencil sound → Variant 3). variant1/variant2
are untouched.

Structural changes over the node-graph design (full rationale in `Variant3Synth.ts`'s header):
- **Distance-driven grains**: excitation is one heavy-tailed noise burst per paper asperity
  crossed (integrated px of stroke, spacing per paper type), not a time-based grain rate — grain
  density scales with speed automatically, and slow strokes crackle while fast ones blend to hiss,
  which is the physically correct behavior the old `grainRateHz(speed)` curve hand-approximated.
- **Modal resonator bank** (4 modes, 430/1300/2800/5600 Hz): grains ping it, giving the sound a
  body/coloration. All node-graph variants were pure filtered noise — zero resonance.
- **Touchdown/lift transients** on strokeStart/strokeEnd, playing through their own gain path
  (the speed-driven master gain is ~0 at exactly those moments).
- **Stereo**: decorrelated L/R bed noise + per-grain amplitude panning (measured corr ≈ 0.6).
- **Patchiness by construction**: sample-and-hold + glide loudness patching (3-36 Hz region, the
  band round 3 found in real recordings), with exact depth — immune to the round-2/3
  lowpassed-noise amplitude bug class. Grain amplitude ties to the same patch signal (patch² —
  local tooth density affects both).
- **Round-8 immunity**: brightness sweeps a *non-resonant* one-pole cascade, so the wind/siren
  failure mode is structurally impossible.

Measured offline (`Variant3Synth.test.ts` drives the same class the worklet runs, 48 kHz,
constant speed 3 px/ms, pressure 0.6 — note constant drive understates CV/crest vs. real hand
motion): rms 0.061, macro CV 0.445, envelope crest 3.8, centroid **6547 Hz** (real recordings:
5.7-6.7 kHz — the round-3 brightness gap is finally closed), corr(L,R) 0.61.

**Result:** Ilya's read: "вообще неплохо, но всё ещё не идеально" — no specific complaint singled
out yet, so round 12 works from the offline metrics instead (see below) rather than guessing blind.

## Round 12 — bed vs. grain balance and patch depth

Round 11's offline numbers (constant-speed drive, so understated per the test's own caveat) sit
well under target on the two "texture" stats: **envelope crest 3.8 vs ≈11**, **macro CV 0.445 vs
≈0.75** — centroid was already on target (6547 Hz). Working hypothesis: `bedMix 0.75` is a
continuous, always-on noise floor competing with the real distance-triggered grains for attention,
the reverse of round 6's lesson (there, added grain was the extra thing fighting a good floor; here
the floor may be what's diluting good grain). Candidates vary bed/grain balance and `patchDepth`
(new field, replaces the `0.6` literal in `patchTarget`'s exponent) to see which axis actually moves
the needle, isolating them per the usual one-step-at-a-time approach:

| key | label | bedMix | grainMix | patchDepth |
|-----|-------|--------|----------|------------|
| A | control (current V3 defaults) | 0.75 | 1.8 | 0.6 |
| B | quieter bed | 0.45 | 1.8 | 0.6 |
| C | quieter bed + louder grain | 0.45 | 2.3 | 0.6 |
| D | quieter bed + deeper patchiness | 0.45 | 1.8 | 0.9 (range ≈0.41–2.46×, was 0.55–1.82×) |

Live A/B/C/D switching via a new `pencilSoundV3Tuning` debug flag (bottom-right panel, Settings →
Pencil sound must be Variant 3) — posts a `'tune'` message straight to the running worklet
(`Variant3Synth.handleMessage`), no graph rebuild, same pattern as round 9's live variant switching.
Also fixed along the way: **Variant 3 was unreachable in the running app** — `Room/index.tsx` never
actually constructed `PencilSoundV3` when the setting was `'variant3'` (only variant1/2 were wired),
apparently lost in the round-11 session's unstaged WIP. Fixed by branching construction on the
setting and giving `PencilSound`/`PencilSoundV3` a shared `PencilSoundAPI` interface so one ref in
`Room/index.tsx` can hold either.

**Result:** _pending — awaiting Ilya's listening pass._

**Addendum — "no sound at all" on the tablet, traced and fixed:** the round-11→12 construction fix
above (branching on `'variant3'`) actually made things *worse*-looking at first listen: before it,
selecting "Variant 3" silently fell into the `!== 'off'` branch and played **Variant 2** through the
plain node graph (mislabeled, but audible) — that's what "Variant 3 worked" before this round
actually was. Once construction correctly routes to real `PencilSoundV3` (`AudioWorklet`-based), it
hit a browser platform wall: `AudioWorklet` only loads on a *secure context* (https, or literally
`localhost`/`127.0.0.1`) — a plain-http LAN origin (`http://192.168.x.x:5173`, the tablet's usual
address per CLAUDE.md's "vite --host always on") doesn't qualify, so `ctx.audioWorklet` is `undefined`
there and `pencilSoundV3/index.ts`'s `ensureGraph()` throws synchronously reaching for
`.addModule()` on it — silently, since nothing in that path had a `.catch()` or a visible fallback.
Variant 1/2 never hit this because they're a plain `GainNode`/`BiquadFilterNode` graph, no worklet.

Fix: `apps/web/vite.config.ts` now runs the dev server on https via `vite-plugin-mkcert`
(auto-generates + trusts a local CA on this machine) and proxies `/api` and `/socket.io` to
`apps/server` (still plain http) so the browser only ever talks to the one https origin — a direct
`http://` request from an `https://` page is blocked as mixed content regardless of CORS, which is
why the backend got proxied rather than given its own cert. `lib/api.ts` and `Room/index.tsx`'s
socket connection switched from a hardcoded `http://${hostname}:4000` to same-origin/relative to
go through that proxy. One-time device-side step: the tablet needs the CA at
`C:\Users\Ilya\.vite-plugin-mkcert\rootCA.pem` installed as a trusted CA cert (Chrome respects the
OS/user cert store on Android) — otherwise it'll just see the usual self-signed-cert warning on
`https://192.168.x.x:5173`, click-through-able but not silently trusted. New origin (`https://`
instead of `http://`) also means the "Pencil sound" setting and the identity cookie start fresh
there — reselect Variant 3 in Settings after the first visit.

## Round 13 — first real listening pass, four specific complaints

With the LAN/https blocker gone, Ilya's first actual listen to real `PencilSoundV3` (as opposed to
the round-12-and-earlier mislabeled Variant 2) surfaced four issues, all traced to specific code
rather than just "needs a different number":

1. **Touchdown tap too strong and too low-pitched.** `tapEnv = 0.35 + 0.65*pressure` had a high
   floor (35% loudness at zero pressure); `kTapLp = freqCoef(280)` made the tap's own noise burst a
   280Hz-lowpassed *thud*, not a click. Fixed: floor down to 0.1 with a `pressure^1.4` curve (more
   perceptible force-dependence, see #4), `kTapLp` raised to 900Hz, `tapImpulsePending`'s coefficient
   1.5→0.8 (softer resonator-bank kick, less bass), and the `tap` term's `*6` gain →`*3`.
2. **Reads as "plastic bag rustling," weak apparent speed-dependence, doesn't sell hatching.**
   This is round 12's own working hypothesis, now confirmed by ear: `bedMix 0.75`'s continuous
   noise floor was masking the actual distance-triggered (hence speed-correlated) grain excitation.
   Round 12's candidate C (bedMix 0.45 / grainMix 2.3) is promoted from tuning-panel option to the
   shipped default; the panel's A/B/C/D (see `Room/index.tsx`'s `V3_TUNE_CANDIDATES`) now explores
   *from* that new baseline instead of re-litigating the old one.
3. **A single stationary dot (no drag) still produces a "shhh" rustle — where's that even coming
   from?** From the tap itself: `tap = tapLpState * tapEnv * 6` is literally lowpassed noise, not a
   clean impulse — by construction it *is* a short noise burst, which is exactly what read as
   "rustle" riding along with the thud. The brighter/shorter/quieter tap from fix #1 should read
   more like a distinct tick and less like noise, but this is structural (the transient is noise-
   based on purpose, see the file header's transient rationale) — worth a specific listen on its own,
   independent of the speed-driven bed/grain question.
4. **Tap barely depends on touch force, always loud.** Same root cause as #1's floor — a light
   touch and a hard touch differed by at most 65% of tapEnv's range on top of a 35% floor. The new
   `0.1 + 0.9*pressure^1.4` floor/curve should make light taps read as clearly lighter.

**Result:** first pass (parameter-only: floor/curve/gain/cutoff nudges, bedMix/grainMix defaults) did
*not* fix it — Ilya reported the exact same four symptoms after listening again. That ruled out "just
needs different numbers" and pointed at something structural, so compared directly against Variant
1/2 (`PencilSound.ts`) — the reference Ilya actually likes — instead of guessing more constants:

- **Variant 1/2 have no touchdown sound at all.** `masterGainTarget` returns `0` outright whenever
  `speedNorm(speed) <= 0`, and there's no separate transient path — a stylus that never moves makes
  no sound, period. V3 was the only variant with a touchdown concept in the first place, and it was
  built from raw filtered noise (`tapLpState`) summed straight into the output — that noise burst
  *was* the rustle-on-a-dot people were hearing, not a side effect of some other parameter.
- **Variant 1/2's brightness sweep uses a real resonant `BiquadFilterNode` bandpass** (Q 0.7-1.9,
  rising with pressure), swept a narrow 1200-5000Hz. V3's bed used two cascaded *non-resonant*
  one-pole lowpasses specifically to avoid round 8's "howling wind" bug — but that bug came from a
  *wide, fast resonant* sweep, not resonance itself. A resonant peak gives the ear an actual pitch to
  track sliding with speed; a moving lowpass cutoff on non-resonant noise doesn't have one, which is
  most of why the old bed read as flat "shshsh" that didn't seem to track speed even though its
  cutoff genuinely moved.

Rewrote both, still self-contained per the file's own serialization constraint:

- `bedLpL/bedLp2L/bedHpL` (and R) two-cascaded-LP-minus-HP → a proper resonant bandpass biquad (RBJ
  cookbook, constant 0dB peak gain), coefficients recomputed at block rate from `bedCut` (now swept
  1200-4500Hz, matching Variant 1/2's range) and a pressure-dependent Q (`0.8 + pressure*1.0`, same
  idea as Variant 1/2's `bandpassQ`). Direct-form-II-transposed per channel, decorrelated L/R inputs
  unchanged.
- The noise-burst `tap` term is gone entirely. Touchdown is now a single one-sample impulse
  (`tapImpulsePending`, pressure^1.6 curve — steep, near-zero floor) ringing a small **dedicated**
  2-pole resonator (1700Hz, ~9ms tau — a tonal tick, not noise) whose output bypasses `gain` the same
  way `lift` already did. This had to be a separate resonator from the grain/modal bank: that bank's
  output is scaled by `gain`, which is ~0 exactly when speed is ~0 — i.e. exactly the
  stationary-touchdown moment — so an earlier attempt at routing the click through the shared bank
  measured *silent* on a standstill tap in the offline test (`Variant3Synth.test.ts`) before this fix.
  The shared bank still gets a small fraction of the kick (`tapKick * 0.3`) for body/continuity while
  a stroke is already ringing it, but the audible click itself lives in the new resonator.
- `Variant3Synth.test.ts`'s "touchdown tap is audible from standstill" threshold was recalibrated
  down (0.003→0.0015) — it was tuned against the old, deliberately-too-loud burst; the 5×-over-silence
  relative check is unchanged and still the more meaningful assertion.

Offline steady-stroke metrics after the rewrite: rms 0.088, macroCV 0.423, crest 4.08, centroid
6898Hz, corrLR 0.853 — still in the same ballpark as round 11's numbers (crest 3.8, CV 0.445,
centroid 6547Hz vs. real ≈5.7-6.7kHz/≈11/≈0.75), not a regression on the measured axes.

**Result:** the resonant-bandpass rewrite still didn't land — Ilya's read: the tap now reads as
basically gone, a stationary dot still "crunches like walking on snow" (quieter than before but
still clearly noise, not silence), and the resonant bandpass itself came out too harsh/sharp overall.
Three rounds into retuning `PencilSoundV3` from scratch (rounds 11-13) without closing the gap to
Variant 1/2 was the signal to stop iterating on the from-scratch design and go empirical instead.

## Round 13, take 2 — abandon the from-scratch synth, extend Variant 1 instead

Ilya's call: stop trying to make the AudioWorklet/distance-grain/modal-resonator design (rounds
1-13) sound as good as Variant 1/2 from first principles, and instead start from Variant 1's actual
recipe — the one that already sounds right — and add exactly two things on top of it: a light,
touch-force-scaled touchdown tap, and grain-peak loudness that scales down at low speed (not just
grain *rate*, which Variant 1/2 already do via `grainRateHz`).

`lib/pencilSoundV3/` (`Variant3Synth.ts`, `index.ts`, the AudioWorklet wrapper, `Variant3Synth.test.ts`)
is now fully unwired — nothing imports it — but left on disk rather than deleted, since it's real,
documented engineering work (rounds 1-13) that might be worth revisiting later with a completely
different approach; ask Ilya before deleting it outright.

Implementation, entirely inside `PencilSound.ts`'s existing node-graph engine (no new engine, no
AudioWorklet, no secure-context requirement — the https/mkcert dev-server setup from earlier in
round 13 is no longer *required* for pencil sound, though it's harmless to keep):

- `GrainVariant` gained two new optional fields — `tap` and `grainPeakSpeedFloor` — both `undefined`
  by default, so `PENCIL_SOUND_VARIANT_1`/`_2` are byte-for-byte unchanged in behavior.
- **Tap**: a small always-running bandpassed-noise source (own `BiquadFilterNode` bandpass, ~1800Hz)
  feeds a dedicated `tapGain`, silent except for a quick attack/decay envelope triggered on
  `strokeStart` (`PencilSound.triggerTap()`) — peak scaled linearly between `tap.minGain`/`maxGain`
  by pressure. Connects to a new `outputSum` node placed *after* `masterGain` (not through it) —
  `masterGain` is speed-driven and sits at ~0 exactly at the touchdown instant, the same reason the
  abandoned AudioWorklet version needed a ungated path for its own click.
- **Speed-scaled grain peaks**: `applyTarget()` now also automates each layer's existing
  `grainDepthGain` (previously set once at graph-build time and never touched again) toward
  `recipe.depth * peakScale`, where `peakScale` ranges from `grainPeakSpeedFloor` at zero speed up to
  `1` (full depth) at max speed — same `speedNorm()` curve `masterGainTarget` already uses.
- `PENCIL_SOUND_VARIANT_3 = { ...PENCIL_SOUND_VARIANT_1, tap: {...}, grainPeakSpeedFloor: 0.3 }` —
  deliberately light tap (`minGain 0.025, maxGain 0.16`) so a soft touch barely ticks.
- `Room/index.tsx`: `pencilSoundSetting === 'variant3'` now constructs `PencilSound` with this recipe
  (same class variant1/2 use) instead of `PencilSoundV3`. The round-12 A/B/C/D live-tuning panel,
  `pencilSoundV3Tuning` feature flag, and `PencilSoundV3` import/ref are all removed — they only made
  sense for the retired AudioWorklet engine.

**Result:** three specific notes back — tap too weak, a stationary dot *still* rustles, and slow-
stroke grain peaks still read as loud/sharp despite the new speed floor:

1. **Tap too weak.** Straightforward — raised `minGain`/`maxGain` (0.025/0.16 → 0.05/0.32, roughly
   doubled).
2. **Dot still rustles.** Root cause, not a tuning issue: the tap's gain envelope was applied
   *after* `tapBandpass`, so the filter was processing the noise carrier 100% of the time regardless
   — the envelope only ever gated volume on already-continuous filtered noise, which is textured the
   same as a stationary dot's would-be bed noise (same failure shape as the abandoned AudioWorklet
   version's first attempt, just one level up the chain). Fixed by moving the gate *before* the
   filter (`tapExciteGain`) so the noise carrier only reaches `tapBandpass` for a few ms per tap —
   the filter then rings on its own high-Q resonance afterward instead of being continuously fed,
   which is what makes it read as a percussive tick rather than hiss. Also raised Q 3→24 (Q=3 was
   barely more than a broad tone-control on white noise, nowhere near resonant enough to "ring").
3. **Slow-stroke peaks still loud/sharp.** `grainPeakSpeedFloor` dropped further (0.3→0.08) and
   given its own curve (`speedT^1.4` instead of linear) so peaks stay soft through low-to-mid speed,
   not just right at the very bottom of the range.

**Result:** still not there — dot still rustles, slow line still rustles a lot, and the tap itself
now reads as "a wooden xylophone, too high" ("не особо лучше стало" overall):

1. **Dot still rustles, despite the excite-before-filter fix.** Q=24 wasn't actually enough to make
   `tapBandpass` "ring" cleanly once excited — the excitation itself (a gated *noise* burst, even a
   short one) is still audibly noisy for as long as it's feeding the filter, and 24 isn't sharp
   enough for the filter's own resonance to dominate over that. Concluded the live-gated-filter
   approach (both orderings tried) is fundamentally the wrong tool: replaced entirely with
   `createClickBuffer()`, which bakes an *exact* impulse response (single-sample kick into a 2-pole
   resonator, computed once into an `AudioBuffer`, blended with a brief separate noise transient for
   contact texture) rather than emerging from live gate timing. `triggerTap()` now just plays a fresh
   one-shot `AudioBufferSourceNode` from that buffer per tap — the waveform is authored exactly, no
   more guessing at how gate/filter interaction will sound.
2. **Tap reads as "wooden xylophone, too high."** That was Q=24 at 1800Hz doing exactly what asked
   (a clean, fairly pure ring) — just too clean and too high a pitch for a pencil tap. New buffer:
   500Hz (down from 1800), 20ms decay, and a deliberate 35% noise blend so it isn't a pure tone.
3. **Slow line still rustles a lot.** Root cause: round 13's speed-scaling only touched
   `grainDepthGain` (the sparse grain *spikes*), never `carrierGain`'s constant `floor` value — and
   `PENCIL_SOUND_VARIANT_1` (what Variant 3 is built on) has `depth: 0.02` vs `floor: 0.12`, i.e. the
   floor is ~6× the grain contribution and totally unaffected by the fix. Renamed
   `grainPeakSpeedFloor` → `speedPresenceFloor` and had it scale *both* `carrierGain.gain` (the
   floor) and `grainDepthGain` together — a slow stroke now thins out the whole texture, not just
   its rare spikes.

**Result:** direction confirmed right (click buffer + floor speed-scaling both accepted, no more
"rustle"/"xylophone" complaints), just needed two more turns of the same knobs — tap deeper/louder,
overall friction texture halved:

- Tap: `freqHz` 500→300 (deeper), `minGain`/`maxGain` 0.05/0.32→0.08/0.5 (louder).
- New `GrainVariant.outputGainScale` (flat multiplier on `masterGainTarget`'s output, applied only in
  `applyTarget()` — `undefined`/1 for Variant 1/2, unaffected) — `PENCIL_SOUND_VARIANT_3` set to 0.5,
  halving the friction texture (bed+grain) without touching the tap, which has its own independent
  gain.

**Result:** asked for more pressure-dependence specifically: a light touch should be quieter than it
currently is, a firm press should land about where it already does (not louder still). A linear
`minGain`-to-`maxGain` interpolation can't do that on its own — pulling `minGain` down also pulls
every pressure below 1.0 down by the same flat amount, including firm-but-not-maximal presses.
Added `pressureCurve` (`peak = minGain + (maxGain-minGain) * pressure^pressureCurve`, `pressureCurve`
2.2 for Variant 3): pressure=1 still lands exactly on `maxGain` (unchanged), but every pressure below
that now sits further down than the linear map would put it — a medium press (0.5) drops from ~0.29
to ~0.13, a light one (0.2) from ~0.16 to ~0.03. `minGain` itself also dropped 0.08→0.02 (was already
audible at literal zero pressure).

**Result:** two more notes — the friction texture reads as too sibilant ("щщщщ", a hissy "sh"),
wanted duller/breathier ("фффф", closer to a soft "f"); tap still not low enough.

- New `GrainVariant.brightnessScale`: multiplies the carrier bandpass's swept center frequency
  (`brightnessFreq()`, shared MIN_FREQ 1200/MAX_FREQ 5000Hz range) proportionally, shifting the whole
  sweep down without changing its shape. Variant 3: 0.45 → effective range ≈540-2250Hz (was
  1200-5000Hz) — well out of the sibilant "sh"/"s" band, into breathier "f"/"wind" territory.
  `undefined`/1 leaves Variant 1/2 exactly as before.
- Tap `freqHz` dropped again, 300→180.

**Result:** tap lower still, and "softer" noise — distinct from "quieter" (`outputGainScale` already
turned down two rounds ago), read as a texture/harshness note rather than a loudness one:

- Tap `freqHz` 180→120.
- New `GrainVariant.curvePower` override: Variant 3 was inheriting Variant 1's `curvePower: 4.0`
  (sharp, spiky grain envelope — most of each grain-modulator cycle near-silent with brief sharp
  spikes, see `createGrainCurve()`'s doc) unchanged. Dropped to 2.0 — rounder, less spiky.
- New `GrainVariant.qScale` (multiplies `bandpassQ()`): Variant 3 set to 0.6, broadening the carrier
  bandpass's resonant peak (less "peaky"/resonant-sounding). `undefined`/1 leaves Variant 1/2 as-is.

**Result:** asked whether tone tracks speed at all, and to strengthen it. It already did — the
carrier bandpass has always swept with `brightnessFreq()` — but `brightnessScale` (0.45, round 13
take 6) scales that *entire* sweep down uniformly, including how much ground it covers, so the
speed-dependence itself reads weaker even though the mechanism didn't change. New
`GrainVariant.brightnessRangeBoost`: adds extra spread on top, proportional to `speedT` so the
low-speed tone (already tuned right) is untouched but high speed reaches further up — at
`speedT=0` no change, at `speedT=1` roughly +1kHz beyond what `brightnessScale` alone gives (with
Variant 3's 1.6). `undefined`/1 leaves Variant 1/2 exactly as before.

**Result:** still too "щщщ" (sibilant hiss), and the tap still doesn't read as a table knock — too
high-pitched.

## Round 13, take 8 — measured against real recordings for the first time

Up to now every "щщщ ⇄ фффф" and tap-pitch call was by ear alone, no reference audio in the repo.
Wrote a standalone (no-deps) WAV analyzer — RIFF/PCM parser, FFT-based spectral centroid, spectral
flatness (Wiener entropy: 0 = pure tone/peaky, 1 = white noise), and per-band energy fractions — and
ran it against `temp/Write on Paper with Pencil 02.wav` and `03.wav` (real pencil-on-paper
recordings already sitting in the repo, previously unanalyzed):

| file | rms | macroCV | crest | centroid | flatness | strongest peak |
|---|---|---|---|---|---|---|
| 02.wav | 0.031 | 0.69 | 6.6 | 6078Hz | 0.546 | 156Hz |
| 03.wav | 0.025 | 0.99 | 10.3 | 7131Hz | 0.632 | 188Hz |

Band energy (03.wav): 56% in 0-500Hz, 8.7% in 500Hz-1k, only 1.3%/3.6%/4.7%/3.1% in 1-2k/2-4k/4-6k/
6-8k, then a second hump — 16.4% — at 8-12k. (02.wav: same shape, 57.7%/14.1% low, 1.9-4.1% through
1-8k, 14.5% at 8-12k.)

Two things this confirms, both already suspected from listening but not previously quantified:

1. **Spectral flatness 0.55-0.63 is fairly broadband, not peaky** — miles from a pure tone (≈0) but
   also clearly not flat white noise (1.0). The carrier bandpass's resonant peak (Q ≈0.5-1.1 after
   round-13-take-6's `qScale: 0.6`) is still narrow/tonal enough by comparison to read as a "color"
   or whistle riding the noise — consistent with "щ" persisting despite `brightnessScale`/`qScale`
   already having moved in the right direction. Real friction noise apparently doesn't have a strong
   single resonant color the ear can track as a pitch; it's diffuse.
2. **Both recordings' single strongest spectral peak sits at 156-275Hz** — squarely in "low thump"
   territory, not anywhere near round 13 take 6's already-lowered `tap.freqHz: 120`. Confirms "lower
   still" was the right call every time it's been made (500→300→180→120) and that 120 likely isn't
   the floor either.

(1-4kHz specifically being *weak* in the real recordings, not strong, also rules out one alternative
reading of "breathier" as "push more energy into 1-4kHz" — the opposite of what was tried. The actual
real-recording energy that isn't low-frequency handling noise sits broadband, weighted toward 8-12kHz,
which is a further-out, more diffuse hiss than our carrier's current 540Hz-3.3kHz sweep reaches at all
— a genuinely closer match would extend the whole sweep's *range* upward and broaden it rather than
just shifting it down; noted for a future round if shifting/broadening the current range further
doesn't fully close the gap, since widening the range outright is a bigger structural change than a
parameter nudge.)

Changes (see `PencilSound.ts`'s `PENCIL_SOUND_VARIANT_3` comment for the full per-field rationale):

- `brightnessScale` 0.45→0.35, `qScale` 0.6→0.45 — sweep shifted down further and the resonant peak
  broadened further, both continuing the already-validated direction rather than reversing it.
- `tap.freqHz` 120→85, `tap.decaySeconds` 0.02→0.03 (a couple more cycles to actually ring before
  decay), `tap.noiseMix` 0.35→0.18 (the baked "contact" blend is *raw, unfiltered* white noise for
  its first ~1.5ms — full-band and disproportionately bright next to an 85Hz fundamental, which is a
  plausible reason the click kept reading as "high" even as `freqHz` itself kept dropping across
  three prior rounds; cut back rather than zeroed, some contact transient is still wanted).

**Result:** "Все еще недостаточно" — still not there, right direction, too small a step.

## Round 13, take 9 — same direction, much bigger step

Take 8's deltas were modest (~25-30% moves on brightnessScale/qScale/freqHz) compared to every
earlier round that actually landed a confirmed improvement (freqHz alone moved 33-40%+ per step:
500→300→180→120). Rather than inch further, pushed harder on both already-validated axes at once:

- `brightnessScale` 0.35→0.22, `qScale` 0.45→0.28 — effective bandpass Q now ≈0.3-0.5 (was ≈0.5-1.1
  two rounds ago), close to "no audible pitch to track" rather than "still a bit narrow."
- `tap.freqHz` 85→50 (sub-bass thump, not just "low"), `decaySeconds` 0.03→0.045 (more ring time,
  reads as a boom rather than a tick), `noiseMix` 0.18→0.08 (cut the raw-white-noise contact blend
  again — even a small unfiltered fraction is disproportionately bright next to a 50Hz fundamental).

Both axes moved this round, so if the result overshoots (too dull/muffled, or the tap disappears
rather than deepens), the useful reply is *which* axis specifically (noise texture vs. tap pitch),
not another "still not enough" — that pins down whether the target sits between take 8 and take 9 on
that one axis, instead of restarting the search on both.

**Result:** two separate, specific notes — slow strokes sound unnaturally loud ("neестественно
шумит когда медленно ведешь карандаш"), and the tap "definitely" needs to go lower still. Noise
*texture* explicitly left unresolved/undiagnosed for now ("с шумом я пока не пойму в целом что не
так"), not touched this round.

## Round 13, take 10 — tap pitch again, plus speed→loudness curve (texture untouched)

Two independent fixes, neither touching brightnessScale/qScale/curvePower (timbre) since Ilya hasn't
pinned down what's still wrong there and both notes below are about loudness/pitch, not color:

- **Tap lower again**: `freqHz` 50→32 (proper sub-bass), `decaySeconds` 0.045→0.06 (more ring time),
  `noiseMix` 0.08→0.04. Worth naming *why* freqHz alone hasn't been enough despite four straight
  rounds of lowering it (120→85→50→32): a percussive attack's perceived pitch/brightness is carried
  mostly by the first few ms of transient, not the steady-state tone underneath it — the baked
  click's noiseMix component is raw unfiltered white noise for its first ~1.5ms, so even a small
  fraction of it can dominate what the ear reads as "how high is this," independent of how low
  `freqHz` itself goes. Cut again this round rather than left alone.
- **Speed→loudness curve flipped.** Root cause of "unnatural at slow speed" wasn't
  `speedPresenceFloor` (which only scales the grain layer's own floor/depth) — it was
  `masterGainTarget`'s `speedGain = Math.sqrt(t)`, a *sub-linear* curve that is loudest relative to
  its input right off the deadzone (`sqrt(0.1) ≈ 0.32` — 32% of ceiling at just 10% of the speed
  range) by original design ("fast rise off the deadzone — speed dominates loudness", round 11).
  That design goal is exactly backwards from what's wanted now. Flipped to `t^1.6` (super-linear:
  quiet near the deadzone, ramping up later, full ceiling unchanged at max speed).
  `speedPresenceFloor` also nudged down 0.08→0.05 as a smaller second-order assist in the same
  direction.

**Result:** Ilya asked for a live-tuning debug panel instead of continuing another blind by-ear
round (see below) — no verdict on take 10's specific numbers landed either way.

## Round 13, take 11 — debug panel built, takes 8-10 reverted

Built `Room/PencilSoundTuningPanel.tsx` (collapsible, gated behind a new `pencilSoundTuning` feature
flag + `pencilSoundSetting === 'variant3'`): a slider for every `GrainVariant` field (floor/depth/
curvePower/minHz/maxHz/useNormGain/brightnessScale/qScale/brightnessRangeBoost/speedPresenceFloor/
outputGainScale/tap.*) plus every module-level constant that used to be a plain `const`
(`PENCIL_SOUND_TUNING` — deadzone/speed-curve shape/global filter ranges/ramp times, now a mutable
exported singleton so the panel can nudge those too), a "copy config" button (clipboard JSON of both
blocks), and a "reset" button (back to whatever shipped at page load, snapshotted once at module
load before any slider touches it).

Then reverted takes 8-10 back to take 6's values — Ilya wants to explore from here himself with the
panel now that it exists, rather than have Claude keep guessing rounds by ear:

- `tap`: `freqHz` 32→120, `decaySeconds` 0.06→0.02, `noiseMix` 0.04→0.35 (take 6's values).
- `speedPresenceFloor` 0.05→0.08, `brightnessScale` 0.22→0.45, `qScale` 0.28→0.6 (take 6's values).
- `PENCIL_SOUND_TUNING.masterSpeedExponent` 1.6→0.5 (take 10's `masterGainTarget` change reverted).

Takes 8-10's reasoning (wav analysis, sub-linear-vs-super-linear speed curve, transient-vs-tone
pitch perception) stays in this log and in `PencilSound.ts`'s comments as a record of what was tried
and why, in case it's worth revisiting — none of it is live right now.

**Result:** widened `tap.freqHz`'s slider down to 1Hz (was 10) — but even at the lowest settings
across the whole range, the tap kept reading as a "чик-чик" (click-click), not a table knock:
"как не крути всё равно какой-то чик чик выходит." Structural, not a wrong number.

## Round 13, take 12 — tap redesigned as two modes instead of one

Root cause: `createClickBuffer()` excited a single 2-pole resonator per tap — a lone decaying
sinusoid always reads as a tone/click, however low its frequency, because there's only one pitch
for the ear to lock onto. A real knock excites *several* modes of the struck body at once (the same
reason the abandoned AudioWorklet engine used a 4-mode resonator bank for "body" — see round 11).

Changes to `createClickBuffer()` (`PencilSound.ts`), no new tunables — both new modes derive from
the existing `freqHz`/`decaySeconds`:
- Kept the original resonator as a "body" mode (`freqHz`/`decaySeconds`, the low tail).
- Added a "knock" mode at `freqHz * 3.2`, decaying at `decaySeconds * 0.18` (much faster) — gives the
  attack a percussive character distinct from the low boom, mixed in below the body mode (0.7/0.45).
- The "contact" noise burst switched from raw white noise to lowpassed noise (cutoff scales with
  `freqHz`, floor 400Hz) — unfiltered noise is bright/thin regardless of how low the tone underneath
  it is, plausibly still reading as part of the "chik" even at a small `noiseMix`.

**Result:** _pending — awaiting Ilya's listening pass on the two-mode redesign._

## Round 13, take 13 — deep analysis of the reference recordings

Ilya, unable to land the noise texture by ear via the panel alone ("не выходит у меня крутить шум
похоже"): asked for a proper deep analysis of `temp/Write on Paper with Pencil 03.wav`. Extended the
earlier coarse analyzer (round 13 take 8 — centroid/flatness/8 linear bands) with: 1/3-octave-ish
band energy (24 bands, a real spectral envelope shape instead of 8 coarse buckets), time-varying
RMS/centroid (100ms frames), the amplitude envelope's own modulation spectrum (the rate the "grain"
texture actually fluctuates at — maps directly onto `minHz`/`maxHz`), and onset/grain detection
(inter-onset-interval + amplitude stats on envelope peaks).

Key findings (02.wav and 03.wav agree on both):

1. **~35%+ of real energy sits at 100-250Hz specifically** (13.7%/18.1% alone at the 160Hz band),
   not spread evenly across 0-500Hz as the coarser round-8 analysis suggested — this is a consistent
   feature across both independent recordings, not mic/handling noise. **The carrier's fixed 180Hz
   highpass filter was discarding almost exactly this range.**
2. Onset/grain detection: mean inter-onset interval 2.71-7.92ms → an effective grain rate of
   **~126-368 grains/sec**, well above our synth's `maxHz: 220` ceiling (already tunable in the panel
   — worth trying higher, e.g. 300+).
3. Time-varying centroid swings 2071-9033Hz *within a single continuous recording* — brightness
   genuinely varies a lot stroke-to-stroke, not just a fixed target value.
4. 100ms-frame RMS CV 0.43-0.74 — same ballpark as round 3's original ≈0.75 target, not new
   information, but confirms it's still the right order of magnitude.

Change: `carrierHighpassHz` (was a fixed `180` inside `buildLayer()`, invisible to the panel) is now
part of `PENCIL_SOUND_TUNING` and exposed as a slider (20-500Hz) — defaults to the same 180 (no
behavior change yet), but finding #1 above suggests lowering it is worth trying, since real signal
lives right where it currently cuts.

**Result:** Ilya asked Claude to apply the findings directly instead of leaving them as slider
suggestions ("накрути под новый анализ, я подкручу дальше сам, скажу норм или нет").

## Round 13, take 14 — applied take 13's findings directly

- `PENCIL_SOUND_TUNING.minFreq` 1200→250: at `brightnessScale: 0.45`, 1200 put the carrier's lowest
  reachable center (slow strokes) at 540Hz — nowhere near the 100-250Hz real-energy hump take 13
  found. 250×0.45≈112Hz lands slow-stroke brightness right at that hump instead; `maxFreq` (fast
  strokes' top end) untouched.
- `PENCIL_SOUND_TUNING.carrierHighpassHz` 180→70: was cutting most of that same 100-250Hz hump
  outright; 70 still clears near-DC/handling rumble.
- `PENCIL_SOUND_VARIANT_3.maxHz` 220→300 (new explicit override, was inherited from BASE/Variant 1):
  take 13's onset detection measured real grain rate at ~126-368/s, above the old 220 ceiling.

`brightnessScale`/`qScale`/`curvePower` (the timbre-shaping knobs from earlier rounds) left as-is —
take 13's evidence was about frequency *reachability* (minFreq/highpass) and grain *rate* (maxHz),
a different axis, not about re-litigating those.

**Result:** still doesn't sound like the reference file to Ilya. Asked for the actual generated
sound to be recorded and compared directly against `Write on Paper with Pencil 03.wav`, rather than
inferring from the recording alone — and floated that the *approach* itself might be wrong ("может
подход менять надо, не знаю").

## Round 13, take 15 — recorded and compared our own synth against the reference: inverted spectrum

For the first time, rendered `PencilSound`'s actual output to a file and ran it through the same
analyzer as the reference recordings. No Web Audio in Node, so this used a real `OfflineAudioContext`
in the browser — a faithful port of `PencilSound.ts`'s current graph (same `BiquadFilterNode`/
`WaveShaperNode` math, not an approximation), driven by a simulated multi-stroke "signature" (4
strokes, pen-lift gaps, varying speed/pressure over ~2.3s), encoded to WAV client-side and POSTed to
a throwaway local save server so the Node analyzer could read it as a plain file.

1/3-octave band energy, our render vs. `03.wav`:

| band | our synth | 03.wav |
|---|---|---|
| 100-250Hz combined | ~6.2% | ~42% |
| 1000-4000Hz combined | ~56% | ~3.4% |
| 8000-12500Hz combined | ~6.8% | ~18.4% |

**The two spectra are close to inverted.** Real pencil-scratch energy sits in two humps — a low body
hum (100-250Hz) and a high hiss (8-12kHz) — with almost nothing in between. Our synth puts the vast
majority of its energy in exactly that empty middle (1-4kHz), because that's where the single
speed-swept carrier bandpass spends most of its time once a stroke has any real speed to it (the
low end, ~112Hz at `brightnessScale 0.45`, is only reached in the brief moments speed is near the
deadzone — it's structurally tied to *slow*, not *always-on* the way the real recording's low hum
clearly is, present throughout regardless of instantaneous speed). Mean spectral centroid: ours
4151Hz vs. real recordings' 5988-7394Hz — confirms the same gap in aggregate, not just per-band.

This is a structural finding, not a parameter miss: **one swept bandpass covering the whole
audible range can't produce two independent, mostly speed-independent humps at the opposite ends of
the spectrum with a gap in the middle.** Matches Ilya's own suspicion that the approach, not just the
numbers, might need to change. Candidate direction for a future session (not attempted yet — this
is a bigger structural change than a parameter nudge, worth discussing first per this repo's own
"discuss architecture before implementing non-trivial features" rule, and Ilya was done tuning for
the day): split into two more independent components instead of one swept carrier —
  - a low "body" component around 100-250Hz, present at roughly constant level regardless of speed
    (pressure/paper-dependent instead, closer to how the real hum seems to behave);
  - a high "hiss/grit" component, broadband around 6-12kHz — likely *this*, not the current mid-band
    carrier, is what should actually carry the perceptual "grain" texture;
  - the current swept bandpass (or something like it) demoted to a much smaller contribution, since
    real recordings carry so little energy where it currently lives.

**Result:** no code changes this round beyond the analysis + recording tooling — Ilya said he's done
tuning for today; committed and pushed the round 11-14 state as-is per his instruction ("запуши все
равно"). This finding is the open item for the next session.

## Round 13, take 16 — split into three independent bands

Next session, Ilya: "давай, переделай на два источника" — go ahead with the restructuring take 15
flagged. Each grain layer is now three independent noise sources instead of one (`PencilSound.ts`'s
`buildLayer()`/`applyTarget()`, new `GrainVariant.midMix`/`bodyMix`/`hissMix` and
`PENCIL_SOUND_TUNING.bodyFreqHz`/`bodyQ`/`bodyPresenceFloor`/`hissLowHz`/`hissHighHz`, all exposed in
the tuning panel too):

- **mid**: the original swept carrier, demoted (`midMix: 0.35`) — real recordings carry almost no
  energy where it spends most of an active stroke.
- **body**: new low-frequency band, `floor * bodyMix * bodyPresence` through a *lowpass* (not
  bandpass — see below) at `bodyFreqHz`. Its own presence curve (`bodyPresenceFloor`, default 0.6)
  fades far less at low speed than mid/hiss's `speedPresenceFloor` (default 0.08), matching the real
  hum's presence through most of a stroke regardless of instantaneous speed. No grain AM — a steady
  hum, not gritty.
- **hiss**: new high-frequency band (highpass `hissLowHz` → lowpass `hissHighHz`), same
  `presenceScale` as before. The grain modulator (rate/curvePower/normGain, all unchanged) now
  connects here instead of to the mid carrier's gain — a broadband high texture is a more plausible
  physical home for discrete grain "ticks" than a mid-range tonal sweep.

Calibrated by **re-running take 15's render-and-compare loop**, not by ear — each iteration: apply
mix/filter changes, re-render via the same `OfflineAudioContext` harness, re-run the 1/3-octave
analyzer against `03.wav`, adjust:

1. First pass (`bodyMix 0.8`/bandpass-170Hz-Q1.1, `hissMix 1.0`): mid gap fixed (1-4kHz dropped from
   ~56% to ~9%, close to real's ~3%) but the new hiss band massively overshot (~81% of all energy vs.
   real's ~25%) and body undershot (~6% vs. real's ~58% — narrow bandpass wasn't wide enough to
   cover the real hump, which turned out to span a broad ~60-800Hz shelf, not a narrow 100-250Hz
   peak).
2. Second pass (`bodyMix 4.0`/**lowpass** 500Hz Q0.7, `hissMix 0.12`): overcorrected — body now ~100%
   of everything, hiss silenced to near-zero.
3. Third pass (`bodyMix 1.6`, `hissMix 0.35`, same lowpass): landed close — low band ~89% (real ~78%),
   mid ~7% (real ~9%), high ~13% (real ~27%, lower than real but present and in the right shape,
   unlike the 0%/81% extremes above). Kept as the shipped default.

**Result:** "Вот так получше звучит" — Ilya tuned it himself via the panel from the take-16 starting
point and confirmed the result sounds better. "Мы стали ближе... кажется как минимум мы сдвинулись
с места."

## Round 13, take 17 — Ilya's own panel session, promoted to defaults

Sent back via "copy config": `bodyMix` 1.6→0.84, `hissMix` 0.35→0.65 (more hiss, less body than
take 16's render-calibrated starting point), `midMix` 0.35→0.36 (negligible), `bodyFreqHz` 500→330
(lower lowpass cutoff). Everything else unchanged from take 16. Applied directly to
`PENCIL_SOUND_VARIANT_3`/`PENCIL_SOUND_TUNING` as the new shipped defaults.

**Result:** confirmed better by ear — current shipped state. Further tuning continues via the panel.

## How to log a result

After each round, replace the pending line above with the winner and a short
note on *why* (what it lacked/had too much of), then add a new round table
for the next set of challengers mutated toward that reason. Keep old round
tables — the point of this file is spotting which axis (floor/depth/power/
rate) actually moves the "пщщщ → гкх" needle, which only shows up across
multiple rounds.
