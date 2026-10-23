# Live pointer → redo mismatch: read-only hypotheses

Not classified pre-existing without matched7ca test. Original and redo exports must be taken after no settle/rebuild/reveal and explicit dry; changes during undo expected, compare original vs completed redo.

Confirmed paths: _applyPixelOp stroke4436 decodes strokeDabs once then _paintDabs recorded wet; append remote path can use _paintOpOverFrames4267; author live passes real scratch. wet sampling6050 is quantized BEFORE live paint, so generic live wet float vs recorded nibble divergence is not an adequate explanation.

brushTravel persists on Scratch.snapshot/apply; newFilm385 clears travel and increments gesture. Live chunkflush6377 and replay operation6686 both call newFilm. Live settle may still land while later film begins; its finish has merge/copyback ownership logic absent in wholly synchronous redo. Need operation chunk boundary exact matches and all settle completion, not infer from visible cursor.

Dabs serialization: packDabs at5892/6332 stores ten fields Float32. No Math.fround found in index live paint path. Shader input float32 is not sufficient to prove CPU invariance: kept quantum, turn angular curvature, contact grouping and sourcebounds are calculated in JS using original live doubles, redo uses float32. Inspect actual captured live vs decoded values, count/hashes of retained dabs and brush contacts and initial source fields. A tiny numeric delta can change threshold branch; no assertion this is the observed cause until measured.

Minimal localization: first differing stage sourceP/C/cov BEFORE diffusion; then paired prebrush, postbrush, finaltide/composite. If source equal and prebrush equal but postbrush differs, compare contact tape/Bbytes/radius/h/gain. If all physical equal but final PNG differs inspect colour prior/finishContext/paper orientation/uniform/readout. Checkpoint snapshots in the SAME engine have headroom encodedunits; don't accuse oldunits unless loading cache actually created by a different engine version. Cached-room render is not clean replay.

## Rejoin concrete multicolour-state branch

Selected redo/rejoin PNG differs mainly blue/green overlap, not separate water/pigment stroke or wholebluegeometry. WatercolorSettlePlan438 uses scratch.paints.size>1 to enable coupled C transport; otherwise716 reconstructs C=physical mass×oneTau. If restored scratch/seed paints list differs despite mixed C existing, overlap hue is overwritten. Painter751 adds paint string; Scratch.snapshot/apply preserves list, so inspect actual seed snapshot/prefix coverage and per-second-stroke list rather than presume snapshotbug. Need log paints/colourBool/singleTau and actual priorC/prephysical c/b on append vs rebuild. A confirmed metadata loss should be fixed at seed/restore ownership; not arbitrary shader gain or blanket always-colour without measurement.

Selected mode18 ordering is statically paired: colour operation samples original physicalMobile c and physicalFixed b via extra samplers c/e, outputs temporary a; colour copybacks occur before physical18 but do not overwrite physical c/b. Physical result then copied back. No evident framebufferalias in this sequence. Difference can originate in prior fixed/mobile split, coverage dome or physical capacity inputs. Capturing those inputs is necessary to distinguish state-loss from math change.

restoreRoomState uses suspended history replay with undoneInBatch, so rejoin must compare checkpoint coveredseq/tail operations and finalstates (not merely original stroke JSON). Rebuild uses layerPixelOps directly. Current #681 remains a timing/path investigation until matched state/stage proof.
