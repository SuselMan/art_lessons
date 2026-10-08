# Surface: split first source initialization is not sufficient

2026-10-08. Actual Surface Chrome 154.0.8037.98, one owned CDP page,
sequential fresh backend owners. Hosted code `59e8845ce8d5bf93b3a418a3339ba83735916213`.
Packed original 400 tape SHA256:
`9b905b07f19a61634aa636002e1d17f285f322c4a27ab86c59f77e88dbcd187e`.

Both arms: `controlRepeat:true`, `diagnosticSplitFirstSourceInit:true`,
`hardwareLinear:true`, progressive/grouped/paired OFF; perOperationStages,
firstOpSolventStages, early target/solvent copies and compute clear OFF.
Root-controlled optimization caches remain OFF. No intermediate readback intervention.

Result: **FAIL** internal native OFF/OFF repeat. No GPU errors or device loss.
First layer SHA256 matches known clean output:
`3b2a6e53f014439c701315b5722e4ab75ec3a72ac7d5f5daf29954e4c83c626e`.
Second layer SHA256:
`4c88a5238e76b00e4949bb48d696d84a55ed8a5bfc1b56cf935b8b1be7916b31`.
Layer differs in 364706 bytes, maximum 118, total absolute difference 2184059.
Wall times 3614 / 3188.6 ms are observations, not a speed improvement claim.

Previous split-init gate with per-operation snapshots passed; this unperturbed
repeat disproves that split submission alone resolves native nondeterminism.
The capture/submission intervention must be kept separate from an actual fix.
Paired400 was not run because the prerequisite baseline stability failed.
No default was enabled, and no driver cause is proven.

Raw evidence remains untracked on disk:
`temp/device-runs/native-split-unperturbed400-surface-1791428630954.json`.
The private hosted URL is intentionally omitted. Owned page was closed; other
Chrome tabs/processes and device settings were not changed.
