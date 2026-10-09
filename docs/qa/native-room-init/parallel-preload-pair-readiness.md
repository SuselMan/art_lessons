# Current parallel3 — same-packed endpoint pair readiness

Offline controller prepared; **not run on hardware**. The earlier `d5e9709a` serial three-pipeline Surface proof is separate.

Use `parallel-preload-pair.mjs` only after explicit Surface allocation. Register an empty disposable parent first, put `QA_PAIR_OUT` in its child directory, and supply current-source manifests/valid LAN entry/shared backend and owned CDP forwarding. The wrapper checks the parent registry nonce and marker before creating output. It creates one current-source four-stroke reference with real async preparation, then fresh owned OFF and ON replay contexts of those exact packed operations. Old-source references are rejected; no shader/pipeline replacement is injected into the actual ON arm.

`QA_ACTUAL_PRELOAD=0/1` selects actual runtime options on the replay controller. Both arms keep native execution, the same physical pressure sampler, and the same detached first-live warmup. ON records all three exact shader compile identities before readiness and requires one actual factory hit each afterward. OFF rejects diagnostic precompile markers and options. Original field/material dispatch remains unchanged.

The pair fails unless source and four browser-critical SHA records, decoded paper, logical-layer-only packed mapping, nonempty exported RGBA SHA/size/alpha, GL/context health and disposal ACK all match. Startup wall and packed replay wall are recorded separately; material export readbacks occur after replay timing. Exported RGBA equality is not equality of every GPU field or a live-input latency measurement.

One fixed OFF→ON pair follows a compiled reference and therefore has driver-cache/order bias. It establishes endpoint fidelity, not a causal speedup. A separate repeated/counterbalanced timing design would be needed for a performance claim.

Verification: node syntax checks pass; five helper tests pass, including rejected source/input/material changes, missing cleanup, shader mismatch and missing actual cache use. Application typecheck passed after parallel runtime wiring. No new processes, runtime clones, allocations or device runs were created while preparing this controller.
