# Actual native Room pointer40 controller

Offline enhancement, no hardware result for the enhanced scenarios yet.

Each run requires QA_APP (new frozen port5349/5350/5351), CDP_BASE, fresh QA_OUT,
QA_SOURCE, QA_RUNTIME, QA_MANIFEST and QA_PAPER_MANIFEST. Never change runtimea83
in place. Source HTTP and paper SHA are checked before owned target creation.
Use actual public dev CA in NODE_EXTRA_CA_CERTS. Private endpoints/raw are not Git.

QA_SCENARIO=first40 (default) tests one original failing pigment stroke,
`normal:100:100:PB29:round`, size40, world300→360. QA_SCENARIO=water-pigment40
creates a separate fresh Room: one water stroke then pigment through its centre.
Only run the second scenario when root has passed first40 on the corrected freeze.

Real PointerInput produces actual packed operations. Native enabled/ready,
errors/loss, recorded stroke count1/2, source/settle/publish CPU markers,
actual default-framebuffer live and final views, final PNG nonempty alpha and
screenshot are recorded. Live frame reports meaningfulPigmentVisible explicitly;
final must contain more purple pixels than the initial baseline. Pure water must
change its framebuffer. A live=false observation is not hidden by final=true.
These synchronous diagnostic readbacks change cadence: they provide visibility,
not physical pen latency, wall performance or parity with WebGL.

RAM preflight1700/abort500MiB and INIT120s remain. Console markers persist
immediately; errors stop further pointer events/second strokes. Only own target
is closed. No hardware run is authorized by this README; root assigns a slot.

Offline syntax check: `node --check docs/qa/harness/728-room-native-first/controller.mjs`.
Shared event-parser tests live under `728-room-native-init`.
