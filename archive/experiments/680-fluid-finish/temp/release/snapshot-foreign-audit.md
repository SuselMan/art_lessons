# Snapshot / still-wet donor audit (read-only)

Code confirms a gap; no genuine StoredSnapshot/browser fixture has run yet.

## Causal chain

1. engine/index.ts:_snapshotQuiet permits bake once _openWashes(layer operations).open is empty.
2. _openWashes tracks latestOf per author; any subsequent non-watercolor stroke without washId closes that author's older watercolor wash immediately. The older donor remains physically wet for WET_DRY_MS; closure of joinable wash is not expiry of water.
3. snapshotSync bakes permitted dirty layers exactly at seq100 and uploads per-layer coverage. Server getRoomState/isCoveredBySnapshot withholds covered watercolor operations; trimResidentOperations removes their resident payloads.
4. SnapshotIO.restore uploads pixel tiles and seeds a pixel checkpoint; network snapshot contains no solvent/paper-wetness payload.
5. Room declares join restored before asynchronous best-effort history backfill. absorbHistorical prepends log entries only, never repaints/deposits PaperWetness or rebuilds independent V. Even successful backfill does not rehydrate wet contact.
6. selectedForeignWaterSources (engine index ~6640) requires current recorded wetPeak>0 and prior donor log chunks. A fresh third participant sees dry contact after snapshot; original participants retain PaperWetness and donor payload/scratch. New dry pigment can therefore diverge.

## Minimal genuine StoredSnapshot fixture

Fresh isolated room, authors A/B, C joins only later; same layer L. Fill to seq97 with inexpensive confirmed nonwet operations. A clear-water stroke at seq98, distinct gesture/wash, normal:100:0. A then pencil stroke at seq99 on L, ensuring _openWashes(L).open is empty despite clear water age<60s. B confirms a cheap operation to cross exact seq100. Wait for authenticated snapshot index and blob; assert StoredSnapshot coverage for L reaches100 (current faulty behavior). Record actual room_state tail to C: donor98 absent. C joins immediately while A donor is still wet; record C PaperWetness/source selection, then draw identical dry pigment normal:0:15. Compare with A/B matched fresh control and canonical export. Do not replace stored snapshot with internal checkpoint or forced restore helper.

Negative control: no subsequent A pencil => open wash gate should refuse L bake; snapshot structure may upload but L coverage must not cross98 and donor must remain in C tail. paper_dry prior to boundary => donor legitimately expired and bake allowed. Old donor >=WET_DRY_MS => allowed.

## Minimal proposed fix (not implemented)

Extend network quiet gate independently of joinable-wash classification: refuse layer bake while it contains an effective done watercolor donor with water>=.5, timestamp within WET_DRY_MS, after last paper_dry/layer_clear. Retain original open-wash guard. Coverage remains old, server tail preserves donor, fresh join replays real water and V. Consider all water>0 for PaperWetness preservation, not merely foreign importer threshold .5; guarding .5 alone fixes V donor but leaves shallow live wetness omission. No new network contract required. Conservative timestamp skew handling should follow existing wet replay policy.

Limitations: no GPU or actual stored-snapshot execution; actual bake may also be refused by ledger/pending/reveal gates until quiet. Fixture waits for canonical quiet then crosses100 inside wet window; must verify real index and tail, not infer from intent.
