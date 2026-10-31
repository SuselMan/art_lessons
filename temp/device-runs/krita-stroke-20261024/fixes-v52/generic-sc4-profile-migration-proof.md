# Explicit procedural V2 profile propagation and source binding

Six approved production paths, same snapshot/material/binding/BEGIN helpers. No UI/server activation, wire event/request fields, renderer, queue, cache, compiler or dependency added.

- SnapshotV2 procedural material carries old/new raster-profile union; PNG SnapshotV1 retains old literal. Receiver ReadScope and BEGIN lifetime optionally capture expected profile; only undefined defaultsold. Unknown/null/cross-profile rejects before data walking/material work/clone as appropriate. Probe version is selected from captured policy and supplied explicitly to trusted decoder, never inferred from frame/snapshot.
- Internal prepared read metadata retains required resolved rasterProfile from the captured scope, including explicit old for omitted policy. Not a wirefield; root f855b4639 carries it through Log/confirmed scope.
- Central canonicalSourceComposition selects native Over or explicit newwash4 law; erase/wet/burnt/Color/unknown/nonOverbuildup refuse. Existing extractors/resolver other material/effect gates remain. Default/Gauss optionalarg4 and soft optionalarg5(defaultslot0 staysarg4) reuse it; source-pin/material bytes unchanged.
- Honest Gaussian correction: source-data/primitive coverage7 remains, stock2 retains erase=true, directbindings and paint executor admit6 [5,6,7,10,11,22] and explicitly refuse2 under both profiles. Source-only codec tests retain all7 untoucheddata; no erase normalization.

Validation: **311 tests /19 files PASS** (210 focused/7 +101 regression/12, <=2workers), shared build, commonwebapp+SW TSC, targeted13TS lint and scoped diffcheck PASS. Root Log/scope propagation paths and latest Color shared consumers were included in common; old-author/material/server-transport/log/confirmed regressions pass. Baseline12 actual oldbinding/attachment/BEGIN failures +89passes saved before implementation.

Actual NEW6 optional diagnostic proof: exact input209659B/SHA721d0c7ca7245dd3b561a6fa4a0d5974035d196e4ab4f497c016072c19600c13, source-ready6, oldbinding [3], newbinding [3,60,61,62,63];59Color remainsclosed. Full binding/pin/material/decode succeeds for accepted cases. Existing library schema requires retainedfallbackLUTmetadata: supplied deterministic importer-sized128² metadata only; legacyCASbytes NOT verified/used, canonicalmaterialassets0. Script+compactreceipt retained, ignored input is NOT a unit/clean-checkout dependency or copiedfixture. No compiler reattestation/GPU/GUI/room permission is claimed.

No disposable processes, devices, browser child/forward, service, dependency download or new build directory in this unit. Earlier approved named Python Unicorn/Capstone remain; earlier wheels strictlyremoved.

Combined HEAD before owncommit: f855b4639e06ea699e3405fa2c3360f177d60d4e

Production hashes:

```json
{
  "packages/shared/src/canonicalStrokeOperation.ts": "67d939bd85de34444413aea6329c4a90ffe8c3548421982f4ac6dd84a763fffa",
  "packages/shared/src/canonicalRecordedAttachment.ts": "b22b58e448aecfb3e838141ac734286b50d6a1ae8cc315e2b0236c46cf41b492",
  "packages/shared/src/canonicalBrushCapability.ts": "89ce0c24127d156940efc026cd72b91789e7ee52e57251f7dfc459f219460d3a",
  "packages/shared/src/canonicalDefaultAutoMaterial.ts": "afe2dfde4275c1a6d71a405db708ecd9d7caca332c441aa34261c82f7c2f21f4",
  "packages/shared/src/canonicalSoftAutoMaterial.ts": "189ecc8396c91ab1a86a015d9ff2c4184471d953694f555fd05c7d055651b60a",
  "apps/web/src/pages/Room/net/sendCanonicalStrokeBegin.ts": "6db8b7399802fbd8a11614a0070c6db3b0d1693f2ee25d449808360f553b6302"
}
```
