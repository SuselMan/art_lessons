#792 — native Samsung end-to-end

Engine f6a27f98; backend ac892525. Adreno650, DPR2.125, budget300MiB, both diagnostic flags OFF. Two real Node sockets share one peer identity; observer is a separate native Samsung identity.

One live M70 packet (12dabs), normal UP, no durable operation. Before disconnect, compositor screenshot ROI shows1444/1444 chromatic pixels and engine retains12dabs/preview buffer. Disconnect only socketA: cancelled:true delivered to observer, preview streams empty, socketB still connected, no peer_left. Both post-cancel screenshots (two natural frames and750ms later) contain zero chromatic pixels. Canonical base SHA remains30e14955ebf1352266dc2ff8067e68104607e750abb9d3b36582b8af909fcb58, alpha0; local/API journal0; GL0; no errors. No oracle or forced display.

Original strict UI-background assertion FAILED3285 grayscale channels: paper texture differs slightly (red-channel mean246.394→246.380, same242..253 range). Therefore exact compositor-background equality is INCONCLUSIVE; visual removal of the red film is supported by screenshots, chroma0 and released preview metadata. The original failure is retained in report.json. No rerun or application change.

Cleanup: own room DELETE200; both author sockets and isolated browser context closed; private state files removed; original tab restored. Own local19335 SSH forward stopped; QA-owned remote9235/user Chrome untouched. Raw cache registered792-samsung-ended-disconnect-20261017; guarded finish requested separately.
