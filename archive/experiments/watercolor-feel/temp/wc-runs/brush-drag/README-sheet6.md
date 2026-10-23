# Sheet 6 experiments, 2026-10-03

Saved originals: sheet6-{index,shaders,flow,marker}-original.*. Working variants
mix/contact/flow/reach/causal/sweep/sweep-idle/exchange/pool are diagnostic PNGs.
Incomplete sweep export is rejected: appendOperation count included queued ops.
The renderer now waits for settle/op queue/rebuild jobs before and after drying.

Canonical source: temp/strokes-app/ops_ejYs3bTr.json. A fresh production read
sheet6-fresh-ops.json matches all 41 operations. Clean replay, fresh A2 room.
Laptop AMD Vega (headed Chrome), no cached room checkpoints.

Samsung shader oracle and salted link diagnostics: samsung-sweep-oracle.json,
samsung-cold-link.json. Temporary dev TLS bypass in smoke is reset in finally.

Chosen mechanism: bounded corner surplus, independent pigment pooling in ribbon
contact.z, contact-weighted mean velocity, ordered local wet sweeps. Coverage
and standing water are not driven by pigment-pool channel. No new FBOs or op fields.

Limit: sweep happens after the chunk's film is laid, not a full chronological
fluid/deposit simulation; brush silhouette remains regular. Do not claim photo parity.
