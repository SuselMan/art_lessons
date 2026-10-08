# First actual Room early preview: transport submitted, visibility FAILED

Raw `temp/device-runs/owner-water-dab-early-preview-surface.json`, room4OgkeNFm.
Actual early flag=true, extra physical ledger13762560bytes. Source water400,
pigment70, DOWNboth allocation0/drain0. Seal2=19279.1, first transport submission
19365 (+85.9ms),109steps before predecessor land21580.4. These are CPU submission
markers, not scanned-out pixels. Canonical pending in all6post-UP frames.

**Visibility FAIL:** all6frames MAXRGBdelta1, pixels>5=0. Images0/5 visually
stationary faintdot, same as previous no-preview observation. No artist readiness.
Cause located: `LayerCompositor.drawLayer` async preview branch161–175 directly
samples supplied preview buffer, unlike resident tile branch231 which consults
reveals. Installer returned immutable `owner.source.presentation`; transport
changed held.pending/before, but those fields were not selected by this display
path. Next patch routes ONLYopt-in async previews to `morph.visibleField(owner)`.
Source/canonical fields are not replaced or written by that display selection.

Final1024target before=redoSHA
`90243f0b4f50bafb0f802768895f39b3f3397ac474d89b779b14f161700ac40a`,
meaningful transparent undo, GL0/context alive. Same new packed tape vsoriginal
is still a separate required comparator; this is only history consistency.
No actualRoom source8SHA claim (read-budget); corrected primitive8SHA separate.

PreRAM2228/min970/postclose2083MiB, own page CLOSED/Surface RELEASE.
Filmstrip display/readback perturbs RAF/GPU; no clean touch latency claim.
Max3preview admissions per session remains explicit QA limitation.
