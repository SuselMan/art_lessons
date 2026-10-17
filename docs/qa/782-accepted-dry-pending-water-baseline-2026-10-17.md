# Accepted Dry before optimistic local water — material-state baseline

Public engine baseline: localA watercolor DOWN/MOVE/UP remains pending; remoteB layerDry is accepted seq1; confirmAseq2; start a new water-only gesture. Compare an independent fresh engine applying accepted-only Dryseq1→sameAseq2→samewatergesture. Actualscratch.pigmentInputsKnownZero=true, authoritativeoracle=false. The local pigment was incorrectly committed dry and cannot participate in the next water, though its recorded stroke follows Dry. MockGL does not prove pixels; it does prove the real CPU material-source lifecycle and input provenance flag.

The failing regression is committed with it.fails so the known defect is explicit. This is separate from #781's100s legacywashhold: paperDry is omitted entirely from pixelWriteLayerIds, so _noteOvertaken returns without recording any material-order repair. Shared pixel dependency categories should stay unchanged; a private materialwriteclosure in accepted-order handling is the narrow candidate. Layer/globalDry, hide and held-owner guards need coverage before promoting. No integration runtime/source changes or GPU probe yet.

## Candidate

Private materialWrites in _noteOvertaken now supplements the existing pixel writers with layer/globalDry and hide for layers containing done recordedM70strokes. It is used symmetrically for the incoming operation and already-applied entries which sort after it. Shared PixelOperation/pixelWriteLayerIds remain unchanged; purely legacy layers retain their previous behavior. The set is computed only when overtaken entries exist.

The original failing case now passes after actual async rebuild completion. Eight material/lifecycle cases cover both accepted order directions for layerDry/globalDry/hide, held first-chunk ownership (no destruction/rebuild before UP), and purely legacy negative. Independent accepted-only engines prove the next water-only source retains pigment exactly when appropriate via pigmentInputsKnownZero. Full scoped suite5files26testsPASS, webtypecheck/scopedlintPASS. This is CPU metadata/lifecycle evidence; native pixels and real transport recovery remain a separate gate.
