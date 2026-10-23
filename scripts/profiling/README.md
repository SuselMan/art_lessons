---
layer: tooling
summary: профили и графы вызовов
issues: [728]
tags: [производительность, диагностика]
---
# Runtime call graphs

Opt-in diagnostics for an isolated dev room. Exact synchronous method counts
come from `pages/Room/diagnostics/callGraphProbe.ts`; sampled CPU stacks remain
a separate measurement. Never interpret CPU samples as invocation counts.

Keep raw captures, device/GPU/version/scenario metadata and controls in
`temp/call-graph/`. Probe summaries include inclusive and intercepted self time,
phases, a bounded duration histogram, and explicit coverage limitations.
