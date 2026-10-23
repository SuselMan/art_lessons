QA 02.10, QA branch based on main8990c479 + local bugfixes, real Surface / Windows / Chrome154 / Intel Iris Xe D3D11, canvas1036×1076 DPR1.5. Fresh room4s7MGr88, 20 participants: AMD laptop + Surface and18 independent Socket.IO virtual guests. Nodes submit8-dab pencil operations simultaneously; both physical GPUs perform generated pen gestures with cyclic tools. Two virtual peers leave/rejoin after each round. This is a controlled input/load test, not a manual stylus session.

Every first5 rounds on Surface has multiple>100ms frame gaps: pencil max433ms, charcoal783ms, liner567ms, marker583ms, brushPen517ms. Laptop maxima78/72/89/111/144ms. Surface long-animation-frame entries include611/666/576ms, with only~60–100ms attributed to JS scripts; renderStart late in the frame. The page is visible/focused, on AC (battery80%, status2), free physical RAM~2.5GB, idle CPU4%, balanced power plan. No GL loss; operations acknowledged and deduplicated correctly; roster18→20 after reconnect.

Expected: ordinary short collaborative strokes remain interactive rather than stall for half a second. Root cause not established yet; Chrome trace underway. Artifacts `temp/device-runs/qa-2026-10-02/long-session.json/log`, `surface-health.log`, `surface-trace.json/log`, `__mtStalls`.

QA-011/003, release #314 §9. Samsung untouched. Long session continues while investigating.
