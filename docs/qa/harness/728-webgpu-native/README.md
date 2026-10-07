
Native owner adapter: CanonicalFieldBuffer preserves GL-bottom-up copyRegionInto
argument order, while native storage is top-down. CanonicalScratchPool and
CanonicalTileScratch own GPU resources separately from production CPU delivery
state. Settle fields preserve source filters (mask/pressure LINEAR; other roles
NEAREST). encodeOwnerCommands runs one synchronous planner quantum in the caller
encoder; copy/clear/staging uploads preserve ordering, retirement is deferred.
Caller must submit and call release only after queue completion; on callback
failure discard the encoder. Unique staging payloads prevent later uploads from
rewriting earlier contacts. The pool uses 24 idle buffers per size and 64 MiB
free ceiling; it is a resource policy, not a claim of identical allocation order.

Software owner gates: upload A→copy A→upload B→copy B, bottom-up region copy,
lease reuse, source sampler metadata all pass with zero byte differences. After
correcting composite scratch sampling from LINEAR to production NEAREST the
software composite has zero differing bytes in the corrected origin-zero fixture;
previous exact result used an incorrect oracle filter. The nonzero tile origin
(512,768) fixture performs exact Float32 world-to-local localization once and
compares against unchanged GLSL: coverage 218 bytes/max 11, pigment 20/max 1,
color 2/max 1 differ on software. These raster differences remain unresolved. Known actual Samsung differences max 1 remain;
these tests do not establish hardware byte parity or full Room watercolor.

Brush encoder accepts an optional GL-bottom-up scissor; invocations outside it
perform no output writes. Caller retains output contents there. Software sentinel
check confirms zero changes outside the scissor for both paired P/C outputs.

The field itself now carries its filter, not just the buffer wrapper. Brush P/C
and water sampling follows that metadata; compact flow stays LINEAR. This is
especially important for midpoint water gates on a NEAREST coverage field.
Owner retirement also covers the interval after a scope returns but before its
encoder is submitted. A destroyed source remains physically alive until pending
scope releases after queue completion; a software copy/readback gate verifies
zero corruption and no validation errors. Release is idempotent.

CanonicalBrushContact.encodeSingle(ctx, {pigment,color,flow,water,out},
'pigment'|'color', stepUV, gain, flowRectUV, scissorGL?) uses one storage output.
Both old P and old C still participate in the shared per-channel capacity solve.
The WGSL is derived from the paired kernel's same math body and changes only the
final store, plus an output-selection uniform. No in-place or paired schedule
change is introduced. Software paired-vs-single fixtures cover nonzero Q8 fields,
1-byte donors/near-full receivers, NEAREST/LINEAR water, midpoint dry gates,
step1/2 and retained scissor exterior. Hardware parity remains unproven.
