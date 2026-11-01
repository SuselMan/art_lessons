# Unpublished indexed continuation previews

This unit changes only initial indexed restoration of a candidate layer that is
not yet published. It does not change full/live FOLLOW, local authoring, healthy
physical recovery, material evaluation, stable commits or GL state restoration.

The engine peeks at two adjacent original operations already retained by the
SAME nonterminal page. Both must be canonical strokes for the same user, stroke
and layer, with consecutive frame ordinals and original sequences. The next
ordinal must also match the current visible root's actual material-prefix state.
Recovery and suffix replay never select this mode. The peek grants no authority:
the existing delivery, snapshot, material-prefix and source admission run before
the next frame is accepted.

Only creation of a NEW derived preview is deferred. A started presentation owns
physical plans, remains execution-pending and finishes normally. Deposition,
physical preparation, partial commits, stable ordering and ownership release use
the existing paths. Dirty bounds remain pending; presentation/checkpoint readiness
and cut publication are not relaxed. Ended roots, metadata, another root and page
boundaries use the ordinary complete drain. No queue or history cache is added.

The recorded coordinator fixture executes genuine original delivery, native auto
coverage generation and the actual deposition/commit services. Its ordinary and
deferred runs compare all mask deposition operations and stable commit operations;
the deferred run performs fewer preview passes. Other tests cover a genuinely
started multi-part preview and cancellation with dirty deferred work.

The engine fixture uses the real socket-ingress page/evidence/cut issuers and
actual restore job, coordinator, executor and resource owners. It verifies four
nonempty original frames, fewer previews only with a same-page continuation,
ordinary readiness at the actual next-page RPC, END/new-root boundaries, normal
physical recovery, hidden-root metadata without source preparation, and stale or
canceled ownership after actual deferred deposition without a published cut.
Existing terminal-ACK parking, 64-transition/4ms slicing and cleanup tests remain
in the regression gate.

The exact f196dd1194a5b0b587616a9b79533677bad91fe3 production overlay fails the new
same-page engine regression because it never selects deferral. This baseline is
loaded through a test-only Vite loader; the working production sources are never
replaced. Logs and source manifests are under fixes-v52/deferred-preview-*.

recordingGL does not rasterize pixels. These checks establish source ownership,
operation equivalence, readiness and reduced discarded work, not GPU pixel
identity, physical pen latency or measured device speedup. Actual Samsung cold
restore pixel equality and timing remain a separate ROOT gate after immutable
build activation.
