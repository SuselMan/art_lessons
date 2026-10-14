# Selected multiscale reconstruction, ongoing 15 Oct

Source engine 00b7ef58; default B unchanged. Runtime route adapters only.
Samsung verified Awake, powered, stayOn true (original setting7), keyguard showing=false/inputRestricted=false. Laptop Monitor On, timeout0. No power settings changed.
Exclusive GPU leases: Samsung ~/.cache/codex-qa/watercolor-samsung-night.lock; laptop ~/.cache/watercolor-night-gpu.lock plus ExitOnForwardFailure reverse15384.

First physical GPU-completion ABBA (read canonical tile before timer end; following rAF included):
- Samsung2 baseline3593/3526.2ms; modulated detail1399.8/1438.8ms. Baseline p95 frame gaps535–685ms, candidate201–217ms. Still visible stalls, not latency success.
- Laptop2 baseline1020.4/1027.9ms; detail298.1/303.7ms. Candidate maxgap55.6/133.3ms.
- 12 stroke arms ongoing.

First run filenames accidentally remained detail-v2, causing repeated arms to overwrite JSON per mode/count and replace earlier additive adapter files. Timing logs retain ordered arms; corrected script now stores each trial uniquely. This first pass must not claim per-arm pixel evidence. Repeat selected cases before archival.

Modulated detail restores white brush comb grooves better than additive detail/coarse-only; aesthetic approval pending. Stationary drop inside puddle must not retain frozen moving-brush stripes. Full room/history/peers not yet tested for this candidate. No production/push.
