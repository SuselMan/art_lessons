# Grouped400 ordering audit, 2026-10-08

Hardware evidence supplied by root, not executed by this agent:
`native-solvent-surface-1791420449876.json` and
`native-solvent-old-surface-1791420467502.json`.
All solvent source/finish checkpoints match OFF/ON in both kernel versions.
Final solventLoad now matches. Final layer differs strongly in ON (max150/148),
while other retained fields match. OLD/NEW OFF layers and retained roles match.
Therefore the new scissor dispatch is excluded by this same-tape experiment;
the serial baseline is stable, and grouping must remain disabled. These captures
perturb submission boundaries, so they do not establish a timing improvement.

Read-only source audit:

* tileScratch.getOrCreate acquires original once and copies layer into it;
  original remains a tile-owned pool lease until scratch.destroy. No planner
  dispose path releases original. Temporary planner snapshots concern P/C.
* finishTile.encode selects entry.original, coverage and current P/C after
  job.finish. It passes the original canonical composite/scissor/scalars.
* render.CanonicalComposite.encode allocates a distinct 112-byte uniform for
  every invocation. No mutable shared uniform overwrite was found. Output is
  explicitly forbidden to alias any sampled texture.
* runSettleJob grouped records operations, finish, composite and disposal in
  the same encoder. finish internally disposes planner inputs before composite,
  as in serial. That disposal releases coverageFilm and temporary pool leases,
  not original or persistent P/C/cov.
* backend.encodeOwnerCommands retains staging and retired textures until queue
  completion; destruction additionally waits for all pending owner scopes.
  JavaScript completion callbacks cannot interrupt the synchronous encoder
  construction. Pool reuse does not destroy an active texture merely on release.

No source-level lifetime violation has yet been proven. Identical FINAL material
fields do not prove composite read identical fields at the earlier draw boundary.
The next falsifiable gate should copy original, selected P/C/cov and layer into
unique staging snapshots at each final composite boundary; record selected
resource identity, all uniform floats and scissor. Compare OFF/ON before and
immediately after that draw. Also capture the preceding live layer boundary:
scissored render loadOp=load retains pixels outside the final composite domain.
A final-only layer difference can originate in those earlier retained pixels.

Do not suppress solvent or layer comparisons. Do not enable grouping. Keep the
old/new dispatch gate separate from grouped ordering and from GL/native arithmetic.
