# Surface: early first-water initialization comparator

Actual Surface Chrome154, hosted code00ce885e, original400 packed tape unchanged.
Sequential exclusive device control; owned pages closed after each pair.
No intermediate source/stage readbacks, extra GPU snapshot copies, compute clear,
paired/grouped/progressive or optimizer caches enabled.

The narrow first-water QA initializes actual scratch resources for expected
first gesture BEFORE replay, then uses unchanged packed-operation replay.
`submit` does not wait; `complete` additionally awaits queue completion. Neither
advances CPU delivery/gesture. This is guarded to recorded water100/pigment0.

Order: submit pair → complete pair → submit repeat pair. All six fresh owners
matched known clean layer SHA256
`3b2a6e53f014439c701315b5722e4ab75ec3a72ac7d5f5daf29954e4c83c626e`.
Every final role was byte-identical within its pair; validation/errors0/lostfalse.
Compact raw summaries are in the adjacent JSON; full raw files remain untracked
under temp/device-runs. Private hosted links are intentionally excluded.

This small series supports a chronology-sensitive resource preparation seam.
It does NOT establish a general fix or driver cause. Splitting initialization
inside first source previously failed without intermediate stage captures;
preparation before replay is a different intervention and must not be conflated.
Completion is not shown necessary: submit-only passed four fresh owners.
Replay timing excludes initialization completion and is not a performance claim.

Next localization: ordered source allocation/clear/copy/submit/queue.writeBuffer
trace between early prime and first-source split, including initialized resource
identity. No physical model/default changes were made.
