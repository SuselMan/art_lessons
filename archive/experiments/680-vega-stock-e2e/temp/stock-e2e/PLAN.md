# Stock rebuildSpill on real Vega

Frozen source f99d43eafc4ef077300eb46ab89b9b43606a605f. Test body and stock timeouts unchanged. Isolated DB grafetto_pg_e2e_81, web5572/server4572/DB55572. No developer DB4536.

CPU setup first; no Chrome until root grant. Command after grant: E2E_GPU_SLOT=granted E2E_PORT_OFFSET=81 DISPLAY=:0 npx playwright test e2e/specs/rebuildSpill.spec.ts --config playwright.vega.config.ts --headed --workers=1. Global setup asserts AMD/Radeon/Vega and rejects software renderer, closes preflight browser before actual test. Retain failure trace/video.
