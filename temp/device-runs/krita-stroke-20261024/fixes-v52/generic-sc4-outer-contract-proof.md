# Explicit V2 GenericSC outer pipeline

Implemented six approved production paths in the same codec/encoder/composition/executor/coordinator/pass. No new renderer, shader, queue, outbox, source ownership policy or room/editor grant.

- Old version1/profile/Over envelope serialization and material bytes retained exactly; omitted trusted profile retains old policy.
- New version2 requires explicit pinned whole-pipeline profile `installed-arm64-scalar-fused-generic-sc-u8-fpcr0-v2`, independent of materialVersion2. New non-Over domain: wash-only multiply/lighten/colorDodge/overlay. Old/unknown/null/mismatched profile and non-Over buildup reject before resource/pixel work.
- Local deposition unchanged fused law. Same operation selector for exclusive wash, coordinator stable commit and derived fold; per-entry blend copied from first accepted input. Default/new-profile Over keeps old fused kernel.
- Existing pass preparation cap2→3, existing per-program CPU estimate+8192 bytes, shared scratch GPU charge unchanged; fourth operation refuses before allocation.

Validation: **202 tests /13 files PASS**, max2workers (129 own core tests +73 author/material/old-server/attachment regressions); shared build, common web app+SW TSC, targeted11TS oxlint and diffcheck PASS. Baseline9 real new-domain guard failures plus1 three-operation-budget failure recorded before implementation. New numerical tests cover nontransparent A0/B0/A1 concurrent different-mode folds, early sealed peer ordering, immutable input, preview/final equality, fused deposition, clipping/tiling/yields, cancellation release and early profile/buildup refusal. Existing fault injection now freezes the turn clock only around expected failure: under parallel TSC the original one-call assertion could legitimately yield before the injected draw. Final13-file rerun allPASS.

Kernel receipts remain 197a6cce1 SamsungGPU and d8a9315cd original installed ARM64; no claim of GUI/physicalARM/factory equivalence. Existing snapshot/attachment/resolver policy remains old-profile-only; this prerequisite does not activate any descriptor/room/editor path.

No disposable process, browser child, forward, service or build directory created by this code unit. Earlier named Unicorn2.1.4/Capstone5.0.6 dependencies remain in approved existing Python environment; download wheels were strictly removed.

Combined HEAD before own commit: e73a3f833e706496329b305c9f2daa9a3438074f

Production source hashes:

```json
{
  "packages/shared/src/canonicalStrokeFrame.ts": "3b677e7e7ab925e17dbec437b15afa7ec5c025ea4d78bec1fae2f660ebe10e84",
  "apps/web/src/engine/src/presets/sourcePrimaryComposition.ts": "fd3cbed9eb3bee53ed3892136e5f956aa9abb44717cf98453ebccec174787e97",
  "apps/web/src/engine/src/presets/sourceCanonicalFrameEncoder.ts": "a4564a2d0450408cc70133e8c03b398e772088a656d810eb8baa9ea7cce0589f",
  "apps/web/src/engine/src/dabs/CanonicalFrameExecutor.ts": "f9f57c4a0c79c038bfbbf7621812e693ff253affc97301bbea05f772206170b1",
  "apps/web/src/engine/src/dabs/CanonicalWashLayerCoordinator.ts": "849cc4fd11f93133cd609b7ffca03d63c4a3a611240488b39ef3f49a4243b875",
  "apps/web/src/engine/src/dabs/CanonicalRgba8CompositePass.ts": "a1155bf6acd80aec1f979f3756ba682a9db432573bee05ce50aa2c10d8e4ac44"
}
```
