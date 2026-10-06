# #680 — native/packed watercolor input precision

The operation codec stores ten Dab fields as float32. Native watercolor previously entered CPU ribbon geometry/profile/delivery with JavaScript doubles; decoded replay used codec floats. A paired actual PointerInput experiment demonstrates a small canonical discrepancy at this boundary without changing shader, op format, water policy or pigment dose.

CPU tape controls:5PASS. Existing pageLib actual PointerInput stroke: normal:100:100:PB29:round, size80, pressure0.8, 1000ms, two coalesced samples/rAF, three screen points(.4,.4),(.48,.43),(.56,.4). One captured gesture is repeated using the same native64 input batches, previous dabs, wet profiles, seed and final tip values on fresh engines. Recorded codec payload and standing occupancy match across64/F32 arms. Capture64/fresh64 full1754×2480 PNG exact0; both native→own packed UndoRedo differ173pixels/maxRGBA8/alphaMax3/premultRGB6.274509803921575. Rounding only early _paintDabs inputs and prev to codec float32 makes nativeF32→own packed PNG exact0, and nativeF32→original captured64 packed PNG exact0. All arms contain49021 painted pixels,38delivery batches,debugfalse,GL0/no context loss,remapFailures0. This proves the cause for that173-pixel gesture, not automatically every earlier Samsung250/Vega214 residual.

The source fix65fe45bb canonicalizes only watercolor calls with an incremental ribbon scratch before _paintRibbonDabs computes profile/geometry. It copies ten input fields and previous Dab to codec precision, preserves recorded Dab objects/wet/seed, and remaps retained standing keys to the caller's original Dab identities. Filtered-out dabs stay omitted. Other tools, operation format/schema and legacy unencoded replay remain unchanged; modern packed replay already has float32 inputs. Root's two integration tests pass: authoritative codec bytes/values/immutability/idempotence and actual engine dispatch boundary plus retained/dropped standing keys.

## Final source hardware gate

Root source index SHA256 c0fd96c0492b05408550ef8baf91a1b3e8389688a1b5375c38af763b16373408; helper23900d55731a8f4fbd830b4259f724fd5e333bd83af7b5709ddeab0c43e6c726; unchanged shadersd6928e5c49342a1ec16f47f4ee7fa9c4cbb9befd010e29fd7f833d975148bdd8. Only index/helper mirrored into ownedhome680-combined-stability5314; backend4537. One actual native PointerInput gesture with the same preset/path protocol runs against normal source with NO tape, quantizer or painter wrappers. Native→own packed UndoRedo entire1754×2480 PNG exact0,48732 painted pixels,debugfalse,paperready,GL0/no context loss. Owned Chrome finally closed.

Actual rAF helper sample: active1010ms/47intervals/max22ms,0>33ms; tailmax22ms. This is one candidate sample, not a paired performance improvement or cross-GPU claim. The controller's op.seq is local log order, not serverSeq; it does not establish server ACK and makes no network/peer parity claim. Samsung final-source validation is coordinated separately by root.

Artifacts: home680-combined-stability/temp/paired-precision-actual-pointer/report-with-nonempty.json and PNGs; final unwrapped gate temp/final-source-precision/report.json/PNGs. Local copies temp/snapshot/paired-precision-actual-pointer-report.json and final-source-precision-report.json. Earlier short15%-pigment exact0 case is a valid negative control; bootstrap and blanket standing-map-hit guard failures were fixture failures, excluded.

## Samsung: окончательный source

Root проверил тот же index c0fd96c0492b05408550ef8baf91a1b3e8389688a1b5375c38af763b16373408/helper23900d55731a8f4fbd830b4259f724fd5e333bd83af7b5709ddeab0c43e6c726 на SM-T970/Adreno650, own5314/backend4537. Собственная комната COSfBDvl, target1182 закрыт finally. Synthetic PointerInput handlers, normal100100PB29round,size80,pressure.8,1000ms/coalesced2/3точки. Hand/no-op guard отвергает заблокированное рисование. Actual authoritative entry pendingfalse/serverSeq!=null подтверждён до снимков.

PNG1754×2480 до Undo и после Redo полностью совпали:0различных пикселей/max0/alphaMax0, SHA d1f8153b674817fd3433e51272d8ff147904386111772adc8ace6deec469223f; Undo реально изменил PNG. GL0/contextLostfalse/pending0. Это положительный отдельный случай finalsource; предыдущие250пикселей на предыдущем source и причинные173Vega не являются одним и тем же записанным жестом.

Живой жест:59activeframes,1014ms,max33ms,1>33ms,0>100ms,tailmax67ms. Один sample, без заявления о приросте performance. Физическое перо человека не использовалось; это настоящий GPU с программно поданным pointer-вводом.

Артефакты root `temp/device-runs/samsung-precision-native-pixels.json`, samsung-precision-before/undo/redo.png. Полные unit3511PASS+16skip/284files, typecheck/lint/mapcheck/maprulesPASS.
