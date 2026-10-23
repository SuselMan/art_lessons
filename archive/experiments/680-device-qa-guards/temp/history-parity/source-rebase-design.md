# Bounded source-film rebase prototype design

Confirmed: accepted segment source is per-dab coverage -> solvent -> pigment ->
colour. Numeric source inputs match; actual coverage sampler does not while
previous settle remains pending. Complete-before-source fixes the matched mini
oracle exactly; coverage-only late replay does not.

Ownership: material film buffers are separate from old settle field. Old land
updates inkBase/colorBase for a running film; it must not be overwritten by an
old inkLoad snapshot. Solvent is not altered by old settle, so solventBase is
already the appropriate previous-film total. Contacts run in the next solver,
not source rasterization.

Prototype lifecycle:
1. On first source touching a pending previous job, acquire one coverage baseline
   per affected tile before any new source writes. Record all immutable source
   raster commands, with buffer identity, copied vertices, numeric uniforms,
   explicit draw blend state and fieldOp rectangles. Include all tiles touched.
2. Immediately before old land: restore entire saved coverage baseline, so old
   copyback executes on its own source without next-film water/source. This
   requires a hook before land, not a hook merely after its return.
3. Let old land update old material bases and coverage as usual; suppress the
   partial RG command replay for this full-rebase path.
4. Before preparing next job, clear only new strokeInk/strokeColor/strokeSolvent.
   Rebuild loads from current inkBase/colorBase/solventBase. Replay exact recorded
   coverage -> V -> P -> C and base+film combines in chronological draw order.
5. Drop commands and baseline after replay; prepare next job from rebased inputs.

Do not replay painter.paint itself: it advances CPU clocks, landing state,
standing maps and contact metadata a second time. Record actual GPU commands.
Do not simply add corrected source draws: MAX-film and RGBA8 rounding still need
clear-and-replay, and base+film must not double-count material.

Capture/spill deny while this owner is unresolved; releaseFilm only matching
film; context loss drops stale names without GL calls before cancellation;
abort/destroy release alive buffers once. Default OFF. A budgeted asynchronous
replay stage before next prepare is preferable to synchronous replay inside
input handler. Original numeric source commands were bounded to one chunk.

Acceptance: whole coverage/P/C/V at next prepare and whole dry PNG native vs
checkpoint-free rebuild exact; multiple tiles, new spill/loss cancellation,
allocation count and actual native latency separately. The original Surface
fixture requires a subsequent paired native run; the mini fixture alone cannot
establish its complete cause.
