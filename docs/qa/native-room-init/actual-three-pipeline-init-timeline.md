# Actual Surface initialization — serial source d5e9709a

| Interval | Wall ms |
|---|---:|
| Document navigation → runtime begin (unattributed dev/browser/controller interval) | 18947.7 |
| Paper cached lookup + LA expansion | 20.1 |
| Backend creation incl adapter/device/resources | 477.7 |
| Observed front/diffuse async compile pair + hashes | 442.0 |
| Pressure async compile + hash | 1390.1 |
| Detached first live warmup | 4182.0 |
| Runtime returned → controller readiness gate | 394.8 |
| Other marker boundary gaps | 1.4 |

The document readiness value25,855.8ms is not compilation duration. Native runtime starts at18,947.7ms and takes6,513.3ms; observed+pressure pipeline preparation takes1,832.1ms, while detached first-live warmup takes4,182.0ms. The preceding18,947.7ms has no recorded resource breakdown and includes browser/dev-module/controller intervals. It cannot be attributed solely to shader compilation or presented as production room-load performance.

Front and diffuse compile concurrently: use442ms pair wall, not441+366ms. Adapter support169.7ms, device request199.2ms, backend material/paper/noise setup28.4ms are nested inside backend creation and must not be added twice.

Only existing raw evidence was analyzed. No new device run. Epoch markers were normalized using the first-live-warm marker’s explicit performance timestamp; approximately1ms instrumentation uncertainty remains. The later parallel3 patch has not been measured on hardware.
