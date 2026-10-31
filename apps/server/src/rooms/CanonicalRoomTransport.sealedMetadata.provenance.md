# Private metadata proof for indexed partial-close prefixes

Explicit mixed-v2 transport policy enables a private undo/redo prefix preparation path. It retains the actual actor/layer/current-owner checks, verifies the source anchor, flushes writes and uses the same bounded indexed gesture query including a real close row. The existing ROOM binder verifies both source prefix and seal with purpose undo-redo. Generic prefix/suffix reads remain closed; no full-room query or manufactured ended fence is used.

Board-content authorization receives the SAME trusted transport format only at transport-owned calls. All existing HTTP callers retain their legacy-only default. Actual DB block, membership, password and visibility checks remain mandatory, including reauthorization after the targeted query; a resident participant does not substitute for them.

An untracked existing metadata operation is first verified against its actual indexed row. Its prefix must end before that actual server sequence, so a later close cannot retroactively justify an earlier undo. Known same-ID durable repair semantics remain unchanged and no receipt is adopted for a cold row.

Host tests first failed for the missing sealed writer/read mode. Additional tests cover seal absence/tampering, failed write fences, actor/layer revocation, same-ID repair without seq2 and a later close failing to justify an earlier indexed undo. Actual Socket.IO tests check durable undo/redo relay over typed close under explicit mixed policy. Storage is mocked; this is neither physical database proof nor enabled client live undo. The client still needs its separately owned atomic rebuild/resync handling.
