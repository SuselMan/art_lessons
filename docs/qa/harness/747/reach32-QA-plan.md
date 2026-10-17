# R32 candidate hardware gates (prepared; not executed)

Runtime API agreed with external candidate author: `PagedPuddleInspection.tightMaterialSupport32?:boolean` default OFF; `raw.materialSupport.noForeignStencil?:true`; `windowSupport(field,cores,{radius:32|612,noForeignStencil,kept})`. Unknown/no proof must retain radius612. Existing field/core geometry and global phases remain unchanged. This harness preparation does not install or enable the runtime candidate.

## First bounded proof: established compact input, Native vs Paged R32

Use existing `nonzero-origin-ab.cjs` (Android adapter uses its exact browser function):

- QA_COMPACT_SOURCE=1 selects established 2048×512 single pool center1000/r60 crossing core1024. Input hashes recorded; no new room or operations.
- QA_TIGHT_SUPPORT32=1 explicitly enables both fixed-window skip and candidate R32 option. Default absent/OFF is unchanged. QA_SKIP_EMPTY_FIXED_WINDOWS=1 alone is the separate radius612 skip control.
- Candidate output must match independent full-domain Native reference for P/C/coverage and every existing10 stage captures. No sampling/DITHER/shader overrides; shader-based Contrast getter should be OFF for this numeric gate.
- `windowSchedule` records full group count, actual kept preparations, skipped callback fields/cores, all decision radius/cert/kept data and immutable captured materialSupport. It asserts accounting and, when R32 requested, actual noForeignStencil=true plus observed radius32. An older runtime silently ignoring the option therefore fails diagnostic validation rather than giving a false R32 PASS.
- Proof must demonstrate actual skips for the compact fixture; verify kept+skipped==allGroups, at least one skipped. Metadata alone or CPU bounds tests do not replace GPU exact proof.

## Second bounded proof: two Paged arms, fixed geometry

`fixed-window-skip-ab.cjs` now accepts QA_TIGHT_SUPPORT32=1. In that mode BOTH arms enable existing fixed skip; baseline requests radius612, optimized requests radius32. It retains its established 2048² corner-pools fixture (different input from compactdefaultX, do not conflate hashes). Requires actual optimized scheduledWindows < baseline and radius32 certification, baseline decisions all612; output/stage exact checks remain. Without flag it retains previous all-windows versus radius612 skip comparison.

This second fixture is larger and allocates uncached diagnostic buffers: correctness only, not managed cache/memory or Room latency proof. Run only after the small compact case and operator/source allocation. Negative foreign/unknown certification and mid-revision change guards are mandatory CPU candidate tests; an actual foreign-water native fixture can be added only under a separate bounded gate.

No GPU runs were made during preparation; node --check passed for all changed QA scripts. Real device ownership remains with root's assigned operators; no app/source edits, no new rooms, no extra services. Intel own Chrome/profile/forward remain under KEEP pending handoff.
